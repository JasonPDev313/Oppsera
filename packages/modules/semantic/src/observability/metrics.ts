// ── Semantic Observability Metrics ────────────────────────────────
// In-memory metrics tracker for the semantic layer.
// Tracks request counts, latencies, token usage, and cache performance.
// Stage 2+: emit to Datadog/Grafana via structured logs or OTLP.

// ── Types ─────────────────────────────────────────────────────────

export interface SemanticRequestRecord {
  tenantId: string;
  latencyMs: number;        // total pipeline latency
  llmLatencyMs: number;     // time spent in LLM call
  executionTimeMs: number;  // time spent in SQL execution
  tokensInput: number;
  tokensOutput: number;
  cacheStatus: 'HIT' | 'MISS' | 'SKIP';
  hadError: boolean;
  isClarification: boolean;
}

export interface TenantMetricsSummary {
  tenantId: string;
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;    // 0–1
  errorRate: number;       // 0–1
  p50LatencyMs: number;
  p95LatencyMs: number;
  totalTokensIn: number;
  totalTokensOut: number;
}

export interface GlobalMetricsSummary {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  errorRate: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  totalTokensIn: number;
  totalTokensOut: number;
  uniqueTenants: number;
  topTenants: TenantMetricsSummary[];
}

// ── Internal state ────────────────────────────────────────────────

// Keep last N latency samples per tenant for percentile computation
const MAX_LATENCY_SAMPLES = 500;

interface TenantBucket {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  errors: number;
  clarifications: number;
  latencies: number[];   // rolling window of last MAX_LATENCY_SAMPLES values
  totalTokensIn: number;
  totalTokensOut: number;
}

const _tenants = new Map<string, TenantBucket>();

function getOrCreateBucket(tenantId: string): TenantBucket {
  let bucket = _tenants.get(tenantId);
  if (!bucket) {
    bucket = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      clarifications: 0,
      latencies: [],
      totalTokensIn: 0,
      totalTokensOut: 0,
    };
    _tenants.set(tenantId, bucket);
  }
  return bucket;
}

// ── Percentile computation ────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

function computePercentiles(latencies: number[]): { p50: number; p95: number } {
  if (latencies.length === 0) return { p50: 0, p95: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  return { p50: percentile(sorted, 50), p95: percentile(sorted, 95) };
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Record a completed semantic pipeline request.
 * Called at the end of runPipeline (best-effort — never throws).
 */
export function recordSemanticRequest(record: SemanticRequestRecord): void {
  try {
    const bucket = getOrCreateBucket(record.tenantId);

    bucket.totalRequests++;
    if (record.cacheStatus === 'HIT') bucket.cacheHits++;
    else if (record.cacheStatus === 'MISS') bucket.cacheMisses++;
    if (record.hadError) bucket.errors++;
    if (record.isClarification) bucket.clarifications++;
    bucket.totalTokensIn += record.tokensInput;
    bucket.totalTokensOut += record.tokensOutput;

    // Rolling latency window
    bucket.latencies.push(record.latencyMs);
    if (bucket.latencies.length > MAX_LATENCY_SAMPLES) {
      bucket.latencies.shift();
    }
  } catch {
    // Never let metrics recording break the response
  }
}

/**
 * Get per-tenant metrics summary.
 */
export function getTenantMetrics(tenantId: string): TenantMetricsSummary | null {
  const bucket = _tenants.get(tenantId);
  if (!bucket) return null;

  const { p50, p95 } = computePercentiles(bucket.latencies);
  const total = bucket.totalRequests;

  return {
    tenantId,
    totalRequests: total,
    cacheHits: bucket.cacheHits,
    cacheMisses: bucket.cacheMisses,
    cacheHitRate: total > 0 ? bucket.cacheHits / total : 0,
    errorRate: total > 0 ? bucket.errors / total : 0,
    p50LatencyMs: p50,
    p95LatencyMs: p95,
    totalTokensIn: bucket.totalTokensIn,
    totalTokensOut: bucket.totalTokensOut,
  };
}

/**
 * Get global aggregate metrics + top tenants by usage.
 */
export function getGlobalMetrics(topN = 10): GlobalMetricsSummary {
  let totalRequests = 0;
  let totalCacheHits = 0;
  let totalCacheMisses = 0;
  let totalErrors = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  const allLatencies: number[] = [];

  const summaries: TenantMetricsSummary[] = [];

  for (const [tenantId, bucket] of _tenants.entries()) {
    totalRequests += bucket.totalRequests;
    totalCacheHits += bucket.cacheHits;
    totalCacheMisses += bucket.cacheMisses;
    totalErrors += bucket.errors;
    totalTokensIn += bucket.totalTokensIn;
    totalTokensOut += bucket.totalTokensOut;
    allLatencies.push(...bucket.latencies);

    const { p50, p95 } = computePercentiles(bucket.latencies);
    summaries.push({
      tenantId,
      totalRequests: bucket.totalRequests,
      cacheHits: bucket.cacheHits,
      cacheMisses: bucket.cacheMisses,
      cacheHitRate: bucket.totalRequests > 0 ? bucket.cacheHits / bucket.totalRequests : 0,
      errorRate: bucket.totalRequests > 0 ? bucket.errors / bucket.totalRequests : 0,
      p50LatencyMs: p50,
      p95LatencyMs: p95,
      totalTokensIn: bucket.totalTokensIn,
      totalTokensOut: bucket.totalTokensOut,
    });
  }

  const { p50, p95 } = computePercentiles(allLatencies);
  const topTenants = summaries
    .sort((a, b) => b.totalRequests - a.totalRequests)
    .slice(0, topN);

  return {
    totalRequests,
    cacheHits: totalCacheHits,
    cacheMisses: totalCacheMisses,
    cacheHitRate: totalRequests > 0 ? totalCacheHits / totalRequests : 0,
    errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
    p50LatencyMs: p50,
    p95LatencyMs: p95,
    totalTokensIn,
    totalTokensOut,
    uniqueTenants: _tenants.size,
    topTenants,
  };
}

/** Reset all metrics (for testing). */
export function resetSemanticMetrics(): void {
  _tenants.clear();
}
