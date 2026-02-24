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
}

export interface TrainingPairStats {
  total: number;
  active: number;
  bySource: Record<string, number>;
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
  const result = await db.execute(
    sql`SELECT
          id,
          question,
          compiled_sql,
          plan,
          mode,
          quality_score,
          similarity(question, ${question}) AS sim
        FROM semantic_training_pairs
        WHERE (tenant_id = ${tenantId} OR tenant_id IS NULL)
          AND is_active = true
          AND similarity(question, ${question}) > 0.3
        ORDER BY sim DESC
        LIMIT ${limit}`,
  );

  const rows = Array.from(result as Iterable<Record<string, unknown>>);

  return rows.map((row) => ({
    id: row.id as string,
    question: row.question as string,
    compiledSql: (row.compiled_sql as string | null) ?? null,
    plan: (row.plan as Record<string, unknown> | null) ?? null,
    mode: row.mode as string,
    qualityScore: row.quality_score != null ? Number(row.quality_score) : null,
    similarity: Number(row.sim),
  }));
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
