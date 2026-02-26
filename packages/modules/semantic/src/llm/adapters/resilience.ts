// ── LLM Resilience Layer ─────────────────────────────────────────
// Production-grade resilience for the Anthropic LLM adapter:
//
// 1. Circuit Breaker   — stops calling a failing API, auto-recovers
// 2. Concurrency Limiter — caps in-flight LLM calls (prevents Anthropic 429 floods)
// 3. Request Coalescing  — deduplicates identical concurrent requests
// 4. Prompt Size Guard   — prevents context overflow / wasted tokens
//
// All components are in-memory, stateless across cold starts (acceptable for
// serverless — each instance starts fresh and learns independently).

// ═══════════════════════════════════════════════════════════════════
// 1. CIRCUIT BREAKER
// ═══════════════════════════════════════════════════════════════════
// States: CLOSED (healthy) → OPEN (failing) → HALF_OPEN (probing)
//
// When error rate exceeds threshold within window, circuit opens and
// rejects all requests for `openDurationMs`. After that, it moves to
// HALF_OPEN and allows one probe request through. If the probe succeeds,
// the circuit closes. If it fails, the circuit re-opens.

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerConfig {
  /** Number of recent calls to track for error rate (default: 20) */
  windowSize: number;
  /** Error rate threshold to trip the circuit (0.0–1.0, default: 0.6) */
  errorThreshold: number;
  /** How long to keep circuit open before trying a probe (default: 30s) */
  openDurationMs: number;
  /** Minimum calls before evaluating error rate (default: 5) */
  minCallsBeforeEval: number;
}

const DEFAULT_CB_CONFIG: CircuitBreakerConfig = {
  windowSize: 20,
  errorThreshold: 0.6,       // 60% failure rate trips the breaker
  openDurationMs: 30_000,    // 30s open window
  minCallsBeforeEval: 5,     // need at least 5 calls to evaluate
};

interface CircuitBreakerState {
  state: CircuitState;
  /** Circular buffer of recent outcomes: true = success, false = failure */
  outcomes: boolean[];
  /** When the circuit was last opened (epoch ms) */
  openedAt: number;
  /** Total trips for observability */
  totalTrips: number;
  /** Total rejected requests for observability */
  totalRejected: number;
}

const _cbState: CircuitBreakerState = {
  state: 'CLOSED',
  outcomes: [],
  openedAt: 0,
  totalTrips: 0,
  totalRejected: 0,
};

let _cbConfig = DEFAULT_CB_CONFIG;

export function configureCircuitBreaker(config: Partial<CircuitBreakerConfig>): void {
  _cbConfig = { ...DEFAULT_CB_CONFIG, ...config };
}

export class CircuitOpenError extends Error {
  constructor(public retryAfterMs: number) {
    super(`Circuit breaker is OPEN — LLM API unavailable. Retry after ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = 'CircuitOpenError';
  }
}

/**
 * Check if a request is allowed through the circuit breaker.
 * Throws `CircuitOpenError` if the circuit is open.
 */
export function acquireCircuit(): void {
  const now = Date.now();

  if (_cbState.state === 'OPEN') {
    const elapsed = now - _cbState.openedAt;
    if (elapsed >= _cbConfig.openDurationMs) {
      // Transition to HALF_OPEN — allow one probe through
      _cbState.state = 'HALF_OPEN';
      console.log('[circuit-breaker] Transitioning to HALF_OPEN — allowing probe request');
      return;
    }
    _cbState.totalRejected++;
    throw new CircuitOpenError(_cbConfig.openDurationMs - elapsed);
  }

  // CLOSED or HALF_OPEN — allow through
}

/**
 * Record the outcome of a request.
 */
export function recordOutcome(success: boolean): void {
  if (_cbState.state === 'HALF_OPEN') {
    if (success) {
      _cbState.state = 'CLOSED';
      _cbState.outcomes = []; // reset window on recovery
      console.log('[circuit-breaker] Probe succeeded — circuit CLOSED');
    } else {
      _cbState.state = 'OPEN';
      _cbState.openedAt = Date.now();
      _cbState.totalTrips++;
      console.warn('[circuit-breaker] Probe failed — circuit re-OPENED');
    }
    return;
  }

  // CLOSED state — track outcomes and evaluate
  _cbState.outcomes.push(success);

  // Keep only the most recent `windowSize` outcomes
  if (_cbState.outcomes.length > _cbConfig.windowSize) {
    _cbState.outcomes = _cbState.outcomes.slice(-_cbConfig.windowSize);
  }

  // Evaluate error rate
  if (_cbState.outcomes.length >= _cbConfig.minCallsBeforeEval) {
    const failures = _cbState.outcomes.filter((o) => !o).length;
    const errorRate = failures / _cbState.outcomes.length;
    if (errorRate >= _cbConfig.errorThreshold) {
      _cbState.state = 'OPEN';
      _cbState.openedAt = Date.now();
      _cbState.totalTrips++;
      console.warn(`[circuit-breaker] Error rate ${(errorRate * 100).toFixed(0)}% >= ${(_cbConfig.errorThreshold * 100).toFixed(0)}% — circuit OPENED (trip #${_cbState.totalTrips})`);
    }
  }
}

export function getCircuitBreakerStatus(): {
  state: CircuitState;
  errorRate: number;
  totalTrips: number;
  totalRejected: number;
  retryAfterMs: number;
} {
  const failures = _cbState.outcomes.filter((o) => !o).length;
  const errorRate = _cbState.outcomes.length > 0 ? failures / _cbState.outcomes.length : 0;
  const retryAfterMs = _cbState.state === 'OPEN'
    ? Math.max(0, _cbConfig.openDurationMs - (Date.now() - _cbState.openedAt))
    : 0;
  return {
    state: _cbState.state,
    errorRate,
    totalTrips: _cbState.totalTrips,
    totalRejected: _cbState.totalRejected,
    retryAfterMs,
  };
}

/** Reset circuit breaker state (for testing). */
export function resetCircuitBreaker(): void {
  _cbState.state = 'CLOSED';
  _cbState.outcomes = [];
  _cbState.openedAt = 0;
  _cbState.totalTrips = 0;
  _cbState.totalRejected = 0;
}


// ═══════════════════════════════════════════════════════════════════
// 2. CONCURRENCY LIMITER (Semaphore)
// ═══════════════════════════════════════════════════════════════════
// Caps the number of concurrent LLM API calls per Vercel instance.
// When at capacity, new requests queue and wait (with timeout).
// This prevents flooding the Anthropic API when many users query
// simultaneously, which is the primary cause of 429 errors.

interface ConcurrencyConfig {
  /** Max concurrent LLM calls (default: 5 per Vercel instance) */
  maxConcurrent: number;
  /** Max time to wait in queue before rejecting (default: 30s) */
  queueTimeoutMs: number;
}

const DEFAULT_CONCURRENCY_CONFIG: ConcurrencyConfig = {
  maxConcurrent: 5,
  queueTimeoutMs: 30_000,
};

let _concurrencyConfig = DEFAULT_CONCURRENCY_CONFIG;
let _inFlight = 0;
const _waitQueue: Array<{ resolve: () => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }> = [];

export function configureConcurrencyLimiter(config: Partial<ConcurrencyConfig>): void {
  _concurrencyConfig = { ...DEFAULT_CONCURRENCY_CONFIG, ...config };
}

export class ConcurrencyLimitError extends Error {
  constructor() {
    super('LLM concurrency limit reached — too many simultaneous queries');
    this.name = 'ConcurrencyLimitError';
  }
}

/**
 * Acquire a concurrency slot. Resolves when a slot is available.
 * Rejects with `ConcurrencyLimitError` if the queue timeout expires.
 */
export function acquireConcurrencySlot(): Promise<void> {
  if (_inFlight < _concurrencyConfig.maxConcurrent) {
    _inFlight++;
    return Promise.resolve();
  }

  // Queue the request
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      // Remove from queue
      const idx = _waitQueue.findIndex((w) => w.resolve === resolve);
      if (idx !== -1) _waitQueue.splice(idx, 1);
      reject(new ConcurrencyLimitError());
    }, _concurrencyConfig.queueTimeoutMs);

    if (typeof timer === 'object' && 'unref' in timer) {
      (timer as NodeJS.Timeout).unref();
    }

    _waitQueue.push({ resolve, reject, timer });
  });
}

/**
 * Release a concurrency slot. Must be called in a finally block after
 * each LLM call completes (success or failure).
 */
export function releaseConcurrencySlot(): void {
  _inFlight = Math.max(0, _inFlight - 1);

  // Wake the next waiter
  if (_waitQueue.length > 0 && _inFlight < _concurrencyConfig.maxConcurrent) {
    const next = _waitQueue.shift()!;
    clearTimeout(next.timer);
    _inFlight++;
    next.resolve();
  }
}

export function getConcurrencyStatus(): { inFlight: number; queued: number; maxConcurrent: number } {
  return {
    inFlight: _inFlight,
    queued: _waitQueue.length,
    maxConcurrent: _concurrencyConfig.maxConcurrent,
  };
}

/** Reset concurrency limiter (for testing). */
export function resetConcurrencyLimiter(): void {
  _inFlight = 0;
  for (const w of _waitQueue) {
    clearTimeout(w.timer);
    w.reject(new Error('Concurrency limiter reset'));
  }
  _waitQueue.length = 0;
}


// ═══════════════════════════════════════════════════════════════════
// 3. REQUEST COALESCING (Deduplication)
// ═══════════════════════════════════════════════════════════════════
// When two users ask the exact same question within a short window,
// only one LLM call is made. The second request gets the same result.
// Key: tenant + message hash + history hash.

interface InFlightRequest<T> {
  promise: Promise<T>;
  createdAt: number;
}

const COALESCE_TTL_MS = 10_000; // coalesce identical requests within 10s
const _inFlightRequests = new Map<string, InFlightRequest<unknown>>();

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}

/**
 * Coalesce identical concurrent requests. If an identical request is
 * already in-flight, returns the existing promise. Otherwise, executes
 * the factory function and shares the result with any concurrent callers.
 *
 * @param key   Unique key for the request (tenant + message hash)
 * @param factory Function that makes the actual LLM call
 */
export function coalesceRequest<T>(key: string, factory: () => Promise<T>): Promise<T> {
  // Clean up stale entries
  const now = Date.now();
  for (const [k, v] of _inFlightRequests) {
    if (now - v.createdAt > COALESCE_TTL_MS) {
      _inFlightRequests.delete(k);
    }
  }

  const existing = _inFlightRequests.get(key) as InFlightRequest<T> | undefined;
  if (existing && now - existing.createdAt <= COALESCE_TTL_MS) {
    console.log(`[coalesce] Sharing in-flight request for key ${key.slice(0, 20)}...`);
    return existing.promise;
  }

  const promise = factory().finally(() => {
    _inFlightRequests.delete(key);
  });

  _inFlightRequests.set(key, { promise, createdAt: now });
  return promise;
}

/**
 * Build a coalescing key from tenant, message, and history.
 */
export function buildCoalesceKey(
  tenantId: string,
  message: string,
  history?: { role: string; content: string }[],
): string {
  const historyPart = history
    ? djb2(history.filter((m) => m.role === 'user').map((m) => m.content).join('|')).toString(16)
    : '0';
  return `${tenantId}:${djb2(message).toString(16)}:${historyPart}`;
}

/** Reset coalescing state (for testing). */
export function resetCoalescing(): void {
  _inFlightRequests.clear();
}


// ═══════════════════════════════════════════════════════════════════
// 4. PROMPT SIZE GUARD
// ═══════════════════════════════════════════════════════════════════
// Estimates token count and truncates the system prompt if it exceeds
// limits. Prevents context overflow errors and wasted API spend.
// Uses the 4-chars ≈ 1 token heuristic (conservative for English).

const MAX_SYSTEM_PROMPT_CHARS = 100_000;  // ~25K tokens (Haiku has 200K context, leave room for response + conversation)
const MAX_SCHEMA_CHARS = 40_000;          // ~10K tokens for schema catalog
const MAX_EXAMPLES_CHARS = 16_000;        // ~4K tokens for examples

/**
 * Truncate a section of the system prompt if it exceeds the given limit.
 * Appends a "[truncated]" marker.
 */
function truncateSection(text: string, maxChars: number, label: string): string {
  if (text.length <= maxChars) return text;
  console.warn(`[prompt-guard] ${label} truncated from ${text.length} to ${maxChars} chars`);
  return text.slice(0, maxChars) + `\n\n... [${label} truncated — ${text.length - maxChars} chars removed for context safety]`;
}

/**
 * Guard the system prompt size. Truncates schema and examples sections
 * if the total prompt is too large.
 *
 * @returns The (possibly truncated) prompt parts
 */
export function guardPromptSize(parts: {
  basePrompt: string;
  schemaSection?: string | null;
  examplesSection?: string | null;
  ragSection?: string | null;
}): {
  basePrompt: string;
  schemaSection: string | null;
  examplesSection: string | null;
  ragSection: string | null;
  wasTruncated: boolean;
} {
  let wasTruncated = false;

  let schema = parts.schemaSection ?? null;
  let examples = parts.examplesSection ?? null;
  let rag = parts.ragSection ?? null;

  // Truncate individual sections first
  if (schema && schema.length > MAX_SCHEMA_CHARS) {
    schema = truncateSection(schema, MAX_SCHEMA_CHARS, 'Schema catalog');
    wasTruncated = true;
  }
  if (examples && examples.length > MAX_EXAMPLES_CHARS) {
    examples = truncateSection(examples, MAX_EXAMPLES_CHARS, 'Examples');
    wasTruncated = true;
  }
  if (rag && rag.length > MAX_EXAMPLES_CHARS) {
    rag = truncateSection(rag, MAX_EXAMPLES_CHARS, 'RAG examples');
    wasTruncated = true;
  }

  // Check total prompt size
  const totalChars =
    parts.basePrompt.length +
    (schema?.length ?? 0) +
    (examples?.length ?? 0) +
    (rag?.length ?? 0);

  if (totalChars > MAX_SYSTEM_PROMPT_CHARS) {
    // Progressive truncation: drop RAG first, then examples, then schema
    const overage = totalChars - MAX_SYSTEM_PROMPT_CHARS;
    let remaining = overage;

    if (rag && remaining > 0) {
      const ragCut = Math.min(remaining, rag.length);
      rag = rag.length - ragCut > 100 ? truncateSection(rag, rag.length - ragCut, 'RAG examples') : null;
      remaining -= ragCut;
      wasTruncated = true;
    }
    if (examples && remaining > 0) {
      const exCut = Math.min(remaining, examples.length);
      examples = examples.length - exCut > 100 ? truncateSection(examples, examples.length - exCut, 'Examples') : null;
      remaining -= exCut;
      wasTruncated = true;
    }
    if (schema && remaining > 0) {
      const schCut = Math.min(remaining, schema.length);
      schema = truncateSection(schema, schema.length - schCut, 'Schema catalog');
      wasTruncated = true;
    }

    console.warn(`[prompt-guard] Total prompt ${totalChars} chars exceeded ${MAX_SYSTEM_PROMPT_CHARS} limit — truncated ${overage} chars`);
  }

  return { basePrompt: parts.basePrompt, schemaSection: schema, examplesSection: examples, ragSection: rag, wasTruncated };
}

/**
 * Estimate token count from character count (4 chars ≈ 1 token, conservative).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}


// ═══════════════════════════════════════════════════════════════════
// 5. COMBINED RESILIENCE STATUS (for /admin/metrics endpoint)
// ═══════════════════════════════════════════════════════════════════

export function getResilienceStatus(): {
  circuitBreaker: ReturnType<typeof getCircuitBreakerStatus>;
  concurrency: ReturnType<typeof getConcurrencyStatus>;
  coalescing: { inFlightCount: number };
} {
  return {
    circuitBreaker: getCircuitBreakerStatus(),
    concurrency: getConcurrencyStatus(),
    coalescing: { inFlightCount: _inFlightRequests.size },
  };
}

/** Reset all resilience state (for testing). */
export function resetAllResilience(): void {
  resetCircuitBreaker();
  resetConcurrencyLimiter();
  resetCoalescing();
}
