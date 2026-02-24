import { db } from '@oppsera/db';
import {
  semanticEvalTurns,
  semanticEvalExamples,
} from '@oppsera/db';
import { sql, eq, and, isNull, desc } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { NotFoundError, AppError } from '@oppsera/shared';
import type { EvalExample, ExampleCategory, ExampleDifficulty } from './types';

// ── Input types ──────────────────────────────────────────────────

export interface CreateExampleInput {
  question: string;
  plan: Record<string, unknown>;
  rationale?: Record<string, unknown> | null;
  category: ExampleCategory;
  difficulty: ExampleDifficulty;
  tenantId?: string | null; // null for system-wide example
  tags?: string[];          // stored in qualityScore metadata (future: dedicated column)
  notes?: string;           // stored via addedBy context (future: dedicated column)
}

export interface UpdateExampleInput {
  question?: string;
  plan?: Record<string, unknown>;
  rationale?: Record<string, unknown> | null;
  category?: ExampleCategory;
  difficulty?: ExampleDifficulty;
  tags?: string[];
  notes?: string;
}

export interface BulkImportExampleItem {
  question: string;
  plan: Record<string, unknown>;
  rationale?: Record<string, unknown> | null;
  category: ExampleCategory;
  difficulty: ExampleDifficulty;
  tenantId?: string | null;
}

export interface ExportExamplesFilters {
  category?: ExampleCategory;
  difficulty?: ExampleDifficulty;
  tenantId?: string | null;
  activeOnly?: boolean;
}

export interface ExampleEffectiveness {
  usageCount: number;
  avgQualityWhenUsed: number | null;
  lastUsedAt: string | null;
  verificationStatus: 'verified' | 'unverified' | 'degraded';
}

// ── createExample ────────────────────────────────────────────────
// Create a golden example from scratch (not promoted from a turn).
// Validates that plan is non-null.

export async function createExample(
  adminId: string,
  input: CreateExampleInput,
): Promise<string> {
  if (!input.plan || Object.keys(input.plan).length === 0) {
    throw new AppError('VALIDATION_ERROR', 'Plan is required and must be non-empty', 400);
  }

  const exampleId = generateUlid();

  await db.insert(semanticEvalExamples).values({
    id: exampleId,
    tenantId: input.tenantId ?? null,
    sourceEvalTurnId: null,
    question: input.question,
    plan: input.plan,
    rationale: input.rationale ?? null,
    category: input.category,
    difficulty: input.difficulty,
    qualityScore: null,
    isActive: true,
    addedBy: adminId,
  });

  return exampleId;
}

// ── updateExample ────────────────────────────────────────────────
// Edit an existing example. Updates only provided fields + updatedAt.

export async function updateExample(
  exampleId: string,
  adminId: string,
  input: UpdateExampleInput,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(semanticEvalExamples)
    .where(eq(semanticEvalExamples.id, exampleId))
    .limit(1);

  if (!existing) {
    throw new NotFoundError('Example', exampleId);
  }

  const now = new Date();

  const updates: Record<string, unknown> = {
    updatedAt: now,
  };

  if (input.question !== undefined) {
    updates.question = input.question;
  }
  if (input.plan !== undefined) {
    updates.plan = input.plan;
  }
  if (input.rationale !== undefined) {
    updates.rationale = input.rationale;
  }
  if (input.category !== undefined) {
    updates.category = input.category;
  }
  if (input.difficulty !== undefined) {
    updates.difficulty = input.difficulty;
  }

  await db
    .update(semanticEvalExamples)
    .set(updates)
    .where(eq(semanticEvalExamples.id, exampleId));
}

// ── bulkImportExamples ───────────────────────────────────────────
// Import multiple examples in a batch.

export async function bulkImportExamples(
  adminId: string,
  examples: BulkImportExampleItem[],
): Promise<{ imported: number; ids: string[] }> {
  if (examples.length === 0) {
    return { imported: 0, ids: [] };
  }

  const ids: string[] = [];
  const values = examples.map((ex) => {
    const id = generateUlid();
    ids.push(id);
    return {
      id,
      tenantId: ex.tenantId ?? null,
      sourceEvalTurnId: null,
      question: ex.question,
      plan: ex.plan,
      rationale: ex.rationale ?? null,
      category: ex.category,
      difficulty: ex.difficulty,
      qualityScore: null,
      isActive: true,
      addedBy: adminId,
    };
  });

  await db.insert(semanticEvalExamples).values(values);

  return { imported: ids.length, ids };
}

// ── exportExamples ───────────────────────────────────────────────
// Export examples as a JSON array, with optional filters.

export async function exportExamples(
  filters: ExportExamplesFilters = {},
): Promise<EvalExample[]> {
  const conditions: ReturnType<typeof eq>[] = [];

  if (filters.activeOnly !== false) {
    conditions.push(eq(semanticEvalExamples.isActive, true));
  }

  if (filters.category) {
    conditions.push(eq(semanticEvalExamples.category, filters.category));
  }

  if (filters.difficulty) {
    conditions.push(eq(semanticEvalExamples.difficulty, filters.difficulty));
  }

  if (filters.tenantId === null) {
    // System-wide examples only
    conditions.push(isNull(semanticEvalExamples.tenantId));
  } else if (filters.tenantId) {
    // Include both system-wide and tenant-specific
    conditions.push(
      sql`(${semanticEvalExamples.tenantId} IS NULL OR ${semanticEvalExamples.tenantId} = ${filters.tenantId})`,
    );
  }

  const rows = await db
    .select()
    .from(semanticEvalExamples)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(semanticEvalExamples.createdAt));

  return rows.map(mapExample);
}

// ── getExampleEffectiveness ──────────────────────────────────────
// Get usage stats for an example by matching its question against
// eval turns (question match heuristic).

export async function getExampleEffectiveness(
  exampleId: string,
): Promise<ExampleEffectiveness> {
  const [example] = await db
    .select()
    .from(semanticEvalExamples)
    .where(eq(semanticEvalExamples.id, exampleId))
    .limit(1);

  if (!example) {
    throw new NotFoundError('Example', exampleId);
  }

  // Query eval turns where the user message matches the example question
  // This approximates "usage" — when the example's pattern was relevant
  const result = await db.execute<{
    usage_count: string;
    avg_quality: string | null;
    last_used_at: string | null;
  }>(
    sql`SELECT
      COUNT(*) as usage_count,
      AVG(quality_score)::NUMERIC(3,2) as avg_quality,
      MAX(created_at)::TEXT as last_used_at
    FROM semantic_eval_turns
    WHERE user_message ILIKE ${'%' + example.question + '%'}
      AND quality_score IS NOT NULL`,
  );

  const rows = Array.from(result as Iterable<{
    usage_count: string;
    avg_quality: string | null;
    last_used_at: string | null;
  }>);

  const row = rows[0];
  const usageCount = row ? parseInt(row.usage_count, 10) : 0;
  const avgQuality = row?.avg_quality ? Number(row.avg_quality) : null;
  const lastUsedAt = row?.last_used_at ?? null;

  // Determine verification status based on usage and quality
  let verificationStatus: 'verified' | 'unverified' | 'degraded' = 'unverified';
  if (usageCount >= 5 && avgQuality !== null && avgQuality >= 3.0) {
    verificationStatus = 'verified';
  } else if (usageCount >= 5 && avgQuality !== null && avgQuality < 3.0) {
    verificationStatus = 'degraded';
  }

  return {
    usageCount,
    avgQualityWhenUsed: avgQuality,
    lastUsedAt,
    verificationStatus,
  };
}

// ── incrementExampleUsage ────────────────────────────────────────
// Called when an example is used in few-shot prompting.
// Updates the example's updatedAt as a usage signal.
// NOTE: A dedicated usage_count + last_used_at column would be ideal
// (future migration). For now, updatedAt serves as last-used proxy.

export async function incrementExampleUsage(
  exampleId: string,
): Promise<void> {
  const now = new Date();

  const result = await db
    .update(semanticEvalExamples)
    .set({
      updatedAt: now,
    })
    .where(eq(semanticEvalExamples.id, exampleId))
    .returning({ id: semanticEvalExamples.id });

  if (result.length === 0) {
    throw new NotFoundError('Example', exampleId);
  }
}

// ── promoteCorrection ────────────────────────────────────────────
// Promote an admin-corrected plan (from a reviewed eval turn) to a
// golden example. Uses adminCorrectedPlan instead of llmPlan.
// Throws if no corrected plan exists on the turn.

export async function promoteCorrection(
  evalTurnId: string,
  adminId: string,
  input: { category: ExampleCategory; difficulty: ExampleDifficulty },
): Promise<string> {
  const [turn] = await db
    .select()
    .from(semanticEvalTurns)
    .where(eq(semanticEvalTurns.id, evalTurnId))
    .limit(1);

  if (!turn) {
    throw new NotFoundError('Eval turn', evalTurnId);
  }

  if (!turn.adminCorrectedPlan) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Cannot promote a turn without an admin-corrected plan',
      400,
    );
  }

  const exampleId = generateUlid();

  await db.insert(semanticEvalExamples).values({
    id: exampleId,
    tenantId: turn.tenantId,
    sourceEvalTurnId: evalTurnId,
    question: turn.userMessage,
    plan: turn.adminCorrectedPlan as Record<string, unknown>,
    rationale: turn.llmRationale as Record<string, unknown> | null,
    category: input.category,
    difficulty: input.difficulty,
    qualityScore: turn.qualityScore,
    isActive: true,
    addedBy: adminId,
  });

  // Mark the source turn as promoted
  await db
    .update(semanticEvalTurns)
    .set({
      adminActionTaken: 'added_to_examples',
      updatedAt: new Date(),
    })
    .where(eq(semanticEvalTurns.id, evalTurnId));

  return exampleId;
}

// ── Row mapper ──────────────────────────────────────────────────

function mapExample(row: typeof semanticEvalExamples.$inferSelect): EvalExample {
  return {
    id: row.id,
    tenantId: row.tenantId,
    sourceEvalTurnId: row.sourceEvalTurnId,
    question: row.question,
    plan: row.plan as Record<string, unknown>,
    rationale: row.rationale as Record<string, unknown> | null,
    category: row.category as EvalExample['category'],
    difficulty: row.difficulty as EvalExample['difficulty'],
    qualityScore: row.qualityScore !== null ? Number(row.qualityScore) : null,
    isActive: row.isActive,
    addedBy: row.addedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
