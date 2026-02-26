import type { LLMAdapter, LLMMessage, LLMResponse, LLMCompletionOptions } from '../types';
import { LLMError } from '../types';
import {
  acquireCircuit,
  recordOutcome,
  acquireConcurrencySlot,
  releaseConcurrencySlot,
  CircuitOpenError,
} from './resilience';

// ── Anthropic adapter ─────────────────────────────────────────────
// Uses the Anthropic Messages API directly via fetch (no SDK dependency).
// SDK is optional so it can be string-concatenated at require() if needed.
// See gotcha #55: optional deps use runtime string concatenation.

const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
const FAST_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_TIMEOUT_MS = 60_000; // 60s — generous for first-request compilation in dev
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_RETRIES = 2; // retry up to 2 times on transient errors (429, 529, 503)
const BASE_RETRY_DELAY_MS = 1_000; // 1s base delay, doubles each retry

/** The fast model ID for structured JSON output (intent resolution, SQL generation) */
export const SEMANTIC_FAST_MODEL = process.env.ANTHROPIC_FAST_MODEL ?? FAST_MODEL;

export class AnthropicAdapter implements LLMAdapter {
  readonly provider = 'anthropic';
  readonly model: string;

  private apiKey: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
    this.model = model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;

    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for AnthropicAdapter');
    }
  }

  async complete(messages: LLMMessage[], options: LLMCompletionOptions = {}): Promise<LLMResponse> {
    const startMs = Date.now();

    // ── Circuit breaker check (fast-fail when API is down) ──
    try {
      acquireCircuit();
    } catch (err) {
      if (err instanceof CircuitOpenError) {
        throw new LLMError(
          `LLM API circuit breaker is OPEN — retry after ${Math.ceil(err.retryAfterMs / 1000)}s`,
          'RATE_LIMIT',
          true,
        );
      }
      throw err;
    }

    // ── Concurrency limiter (backpressure when at capacity) ──
    await acquireConcurrencySlot();

    try {
      return await this._completeWithRetry(messages, options, startMs);
    } finally {
      releaseConcurrencySlot();
    }
  }

  private async _completeWithRetry(
    messages: LLMMessage[],
    options: LLMCompletionOptions,
    startMs: number,
  ): Promise<LLMResponse> {
    const {
      maxTokens = DEFAULT_MAX_TOKENS,
      temperature = 0,
      systemPrompt,
      model: modelOverride,
      timeoutMs,
    } = options;

    const effectiveModel = modelOverride ?? this.model;

    // Separate system message from conversation
    const systemMessages = messages.filter((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    const systemText = [
      systemPrompt,
      ...systemMessages.map((m) => m.content),
    ]
      .filter(Boolean)
      .join('\n\n');

    const bodyObj: Record<string, unknown> = {
      model: effectiveModel,
      max_tokens: maxTokens,
      temperature,
      messages: conversationMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    if (systemText) {
      bodyObj.system = systemText;
    }

    const bodyJson = JSON.stringify(bodyObj);
    const effectiveTimeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // ── Retry loop with exponential backoff for transient errors ──
    let lastError: LLMError | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // Respect overall timeout budget — don't start a retry if we're almost out of time
      const elapsedMs = Date.now() - startMs;
      if (attempt > 0 && elapsedMs > effectiveTimeout * 0.8) {
        break; // not enough time for another attempt
      }

      // Exponential backoff: 1s, 2s (with jitter)
      if (attempt > 0) {
        const baseDelay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 500;
        const delay = Math.min(baseDelay + jitter, 5_000);
        console.log(`[anthropic] Retry ${attempt}/${MAX_RETRIES} after ${Math.round(delay)}ms delay...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      let response: Response;
      const controller = new AbortController();
      const remainingMs = effectiveTimeout - (Date.now() - startMs);
      const attemptTimeout = setTimeout(() => controller.abort(), Math.max(remainingMs, 5_000));

      try {
        response = await fetch(ANTHROPIC_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
          },
          body: bodyJson,
          signal: controller.signal,
          // Opt out of Next.js fetch patching — we need raw Node fetch behavior
          cache: 'no-store',
        } as RequestInit);
      } catch (err) {
        clearTimeout(attemptTimeout);
        if (err instanceof Error && err.name === 'AbortError') {
          lastError = new LLMError(
            `Anthropic API timed out after ${effectiveTimeout}ms`,
            'PROVIDER_ERROR',
            true,
          );
          continue; // retry on timeout
        }
        lastError = new LLMError(
          `Network error calling Anthropic API: ${String(err)}`,
          'PROVIDER_ERROR',
          true,
        );
        continue; // retry on network errors
      } finally {
        clearTimeout(attemptTimeout);
      }

      // ── Retryable status codes: 429, 529, 503 ──
      if (response.status === 429 || response.status === 529 || response.status === 503) {
        const retryAfterHeader = response.headers.get('retry-after');
        const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 0;
        const code = response.status === 429 ? 'RATE_LIMIT' as const : 'PROVIDER_ERROR' as const;
        lastError = new LLMError(
          `Anthropic API ${response.status}${retryAfterSec ? ` (retry-after: ${retryAfterSec}s)` : ''}`,
          code,
          true,
        );
        console.warn(`[anthropic] ${response.status} on attempt ${attempt + 1}/${MAX_RETRIES + 1}`);

        // If server says retry-after and we have budget, wait that long instead
        if (retryAfterSec > 0 && attempt < MAX_RETRIES) {
          const serverDelay = Math.min(retryAfterSec * 1000, 10_000);
          if (Date.now() - startMs + serverDelay < effectiveTimeout * 0.9) {
            await new Promise((resolve) => setTimeout(resolve, serverDelay));
          }
        }
        continue;
      }

      const latencyMs = Date.now() - startMs;

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        // Non-retryable client errors (400, 401, 403, etc.) — throw immediately
        throw new LLMError(
          `Anthropic API error ${response.status}: ${errorText}`,
          'PROVIDER_ERROR',
          response.status >= 500,
        );
      }

      const data = await response.json() as {
        content: Array<{ type: string; text: string }>;
        usage: { input_tokens: number; output_tokens: number };
        model: string;
        stop_reason: string;
      };

      const textContent = data.content.find((c) => c.type === 'text');
      if (!textContent) {
        throw new LLMError('No text content in Anthropic response', 'PARSE_ERROR');
      }

      recordOutcome(true); // ← circuit breaker: success
      return {
        content: textContent.text,
        tokensInput: data.usage.input_tokens,
        tokensOutput: data.usage.output_tokens,
        model: data.model,
        provider: 'anthropic',
        latencyMs,
        stopReason: data.stop_reason,
      };
    }

    // All retries exhausted — record failure for circuit breaker
    recordOutcome(false);
    throw lastError ?? new LLMError('Anthropic API failed after all retries', 'PROVIDER_ERROR', true);
  }
}

// ── Singleton getter/setter ───────────────────────────────────────

let _adapter: LLMAdapter | null = null;

export function getLLMAdapter(): LLMAdapter {
  if (!_adapter) {
    _adapter = new AnthropicAdapter();
  }
  return _adapter;
}

export function setLLMAdapter(adapter: LLMAdapter): void {
  _adapter = adapter;
}
