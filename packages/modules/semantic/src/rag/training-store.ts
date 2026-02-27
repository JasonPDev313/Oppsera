// ── RAG Training Store ───────────────────────────────────────────
// CRUD operations + pg_trgm similarity search for semantic training pairs.
// Training pairs are validated question->SQL/plan mappings used for
// few-shot retrieval during LLM intent resolution.

import { db } from '@oppsera/db';
import { semanticTrainingPairs } from '@oppsera/db';
import { sql, eq } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';

// ── Types ─────────────────────────────────────────────────────────

export interface AddTrainingPairInput {
  tenantId?: string | null;
  question: string;
  compiledSql?: string | null;
  plan?: Record<string, unknown> | null;
  mode: 'metrics' | 'sql';
  qualityScore?: number | null;
  source: 'auto' | 'admin' | 'thumbs_up';
  sourceEvalTurnId?: string | null;
}

export interface SimilarTrainingPair {
  id: string;
  question: string;
  compiledSql: string | null;
  plan: Record<string, unknown> | null;
  mode: string;
  qualityScore: number | null;
  similarity: number;
  /** Composite score combining similarity, quality, and recency. */
  compositeScore: number;
  usageCount: number;
  createdAt: Date | null;
}

export interface TrainingPairStats {
  total: number;
  active: number;
  bySource: Record<string, number>;
}

// ── In-memory cache for findSimilar (30s TTL) ────────────────────

interface CachedSimilarResult {
  pairs: SimilarTrainingPair[];
  expiresAt: number;
}

const _similarCache = new Map<string, CachedSimilarResult>();
const SIMILAR_CACHE_TTL_MS = 30_000;
const SIMILAR_CACHE_MAX = 200;

function _similarCacheKey(question: string, tenantId: string, limit: number): string {
  // Use first 100 chars of question + tenant + limit as cache key
  return `${tenantId}:${limit}:${question.slice(0, 100).toLowerCase().trim()}`;
}

// ── Commands ────────────────────────────────────────────────────

/**
 * Insert a new training pair into the RAG store.
 * Returns the generated ID.
 */
export async function addTrainingPair(input: AddTrainingPairInput): Promise<string> {
  const id = generateUlid();
  const now = new Date();

  await db.insert(semanticTrainingPairs).values({
    id,
    tenantId: input.tenantId ?? null,
    question: input.question,
    compiledSql: input.compiledSql ?? null,
    plan: input.plan ?? null,
    mode: input.mode,
    qualityScore: input.qualityScore != null ? input.qualityScore.toString() : null,
    source: input.source,
    sourceEvalTurnId: input.sourceEvalTurnId ?? null,
    isActive: true,
    usageCount: 0,
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return id;
}

/**
 * Find the top-N most similar training pairs to the given question
 * using pg_trgm `similarity()`. Matches system-wide pairs (tenant_id IS NULL)
 * and tenant-specific pairs for the given tenant.
 *
 * Requires the `pg_trgm` extension and a GIN index on `question`.
 * Minimum similarity threshold: 0.3 (configurable via the query).
 */
export async function findSimilar(
  question: string,
  tenantId: string,
  limit: number = 5,
): Promise<SimilarTrainingPair[]> {
  // Check in-memory cache first (30s TTL)
  const cacheKey = _similarCacheKey(question, tenantId, limit);
  const cached = _similarCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.pairs;
  }

  const result = await db.execute(
    sql`SELECT
          id,
          question,
          compiled_sql,
          plan,
          mode,
          quality_score,
          usage_count,
          created_at,
          similarity(question, ${question}) AS sim
        FROM semantic_training_pairs
        WHERE (tenant_id = ${tenantId} OR tenant_id IS NULL)
          AND is_active = true
          AND similarity(question, ${question}) > 0.3
        ORDER BY sim DESC
        LIMIT ${limit}`,
  );

  const rows = Array.from(result as Iterable<Record<string, unknown>>);
  const now = Date.now();

  const pairs = rows.map((row) => {
    const sim = Number(row.sim);
    const qs = row.quality_score != null ? Number(row.quality_score) : null;
    const createdAt = row.created_at ? new Date(row.created_at as string) : null;
    return {
      id: row.id as string,
      question: row.question as string,
      compiledSql: (row.compiled_sql as string | null) ?? null,
      plan: (row.plan as Record<string, unknown> | null) ?? null,
      mode: row.mode as string,
      qualityScore: qs,
      similarity: sim,
      compositeScore: computeCompositeScore(sim, qs, createdAt, now),
      usageCount: Number(row.usage_count ?? 0),
      createdAt,
    };
  });

  // Evict oldest if at capacity
  if (_similarCache.size >= SIMILAR_CACHE_MAX) {
    const firstKey = _similarCache.keys().next().value;
    if (firstKey) _similarCache.delete(firstKey);
  }
  _similarCache.set(cacheKey, { pairs, expiresAt: Date.now() + SIMILAR_CACHE_TTL_MS });

  return pairs;
}

/**
 * Increment the usage count and update last_used_at for a training pair.
 * Called after a pair is successfully used as a few-shot example.
 */
export async function incrementUsageCount(id: string): Promise<void> {
  await db
    .update(semanticTrainingPairs)
    .set({
      usageCount: sql`${semanticTrainingPairs.usageCount} + 1`,
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(semanticTrainingPairs.id, id));
}

/**
 * Batch-increment usage counts for multiple training pairs in a single query.
 * More efficient than calling incrementUsageCount N times.
 */
export async function incrementUsageCounts(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const now = new Date();
  await db.execute(
    sql`UPDATE semantic_training_pairs
        SET usage_count = usage_count + 1,
            last_used_at = ${now},
            updated_at = ${now}
        WHERE id IN ${sql`(${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`}`,
  );
}

/**
 * Soft-deactivate a training pair. Deactivated pairs are excluded
 * from similarity search results.
 */
export async function deactivateTrainingPair(id: string): Promise<void> {
  await db
    .update(semanticTrainingPairs)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(eq(semanticTrainingPairs.id, id));
}

/**
 * Get aggregate statistics for training pairs.
 * When tenantId is provided, includes both tenant-specific and system-wide pairs.
 * When omitted, returns stats for all pairs across all tenants.
 */
export async function getTrainingPairStats(tenantId?: string): Promise<TrainingPairStats> {
  const tenantFilter = tenantId != null
    ? sql`WHERE (tenant_id = ${tenantId} OR tenant_id IS NULL)`
    : sql``;

  const result = await db.execute(
    sql`SELECT
          source,
          COUNT(*)::TEXT AS cnt,
          COUNT(*) FILTER (WHERE is_active = true)::TEXT AS active_cnt
        FROM semantic_training_pairs
        ${tenantFilter}
        GROUP BY source`,
  );

  const rows = Array.from(result as Iterable<Record<string, unknown>>);

  let total = 0;
  let active = 0;
  const bySource: Record<string, number> = {};

  for (const row of rows) {
    const count = Number(row.cnt as string);
    const activeCount = Number(row.active_cnt as string);
    total += count;
    active += activeCount;
    bySource[row.source as string] = count;
  }

  return { total, active, bySource };
}

// ── Composite Score ──────────────────────────────────────────────

/** Weight constants for composite scoring. */
const SIMILARITY_WEIGHT = 0.70;
const QUALITY_WEIGHT = 0.20;
const RECENCY_WEIGHT = 0.10;

/** Days over which recency decays from 1.0 to ~0.37. */
const RECENCY_DECAY_DAYS = 30;

/**
 * Compute a composite score combining trigram similarity,
 * quality score, and recency. Higher is better.
 *
 *   composite = similarity * 0.70 + qualityNorm * 0.20 + recency * 0.10
 *
 * - qualityNorm: quality_score (0-1) or 0.5 when unknown
 * - recency: exponential decay over 30 days (1.0 = just created, ~0.37 at 30d)
 */
export function computeCompositeScore(
  similarity: number,
  qualityScore: number | null,
  createdAt: Date | null,
  nowMs: number,
): number {
  const qualityNorm = qualityScore ?? 0.5;

  let recency = 0.5; // default when date unknown
  if (createdAt) {
    const ageDays = Math.max(0, (nowMs - createdAt.getTime()) / 86_400_000);
    recency = Math.exp(-ageDays / RECENCY_DECAY_DAYS);
  }

  return similarity * SIMILARITY_WEIGHT + qualityNorm * QUALITY_WEIGHT + recency * RECENCY_WEIGHT;
}
