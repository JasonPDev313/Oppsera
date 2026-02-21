import { db } from '@oppsera/db';
import {
  semanticEvalTurns,
  semanticEvalSessions,
  semanticEvalExamples,
} from '@oppsera/db';
import { sql, eq, and } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { NotFoundError, AuthorizationError } from '@oppsera/shared';
import type {
  UserFeedbackInput,
  AdminReviewInput,
  PromoteExampleInput,
  FeedbackTag,
  QualityFlag,
} from './types';
import { computeQualityScore, computeQualityFlags } from './capture';

// ── submitUserRating ────────────────────────────────────────────
// Called from apps/web via the user feedback API.
// Upserts user feedback on an eval turn, recomputes qualityScore,
// and updates the session's rolling avg rating.

export async function submitUserRating(
  evalTurnId: string,
  tenantId: string,
  userId: string,
  input: UserFeedbackInput,
): Promise<void> {
  // Fetch the turn to validate ownership
  const [turn] = await db
    .select()
    .from(semanticEvalTurns)
    .where(and(eq(semanticEvalTurns.id, evalTurnId), eq(semanticEvalTurns.tenantId, tenantId)))
    .limit(1);

  if (!turn) {
    throw new NotFoundError('Eval turn not found');
  }

  // Users can only rate their own interactions
  if (turn.userId && turn.userId !== userId) {
    throw new AuthorizationError('You can only rate your own interactions');
  }

  const now = new Date();

  // Compute updated quality score with the new user rating
  const adminScore = turn.adminScore !== null ? turn.adminScore : undefined;
  const existingFlags = Array.isArray(turn.qualityFlags) ? turn.qualityFlags as QualityFlag[] : [];

  const updatedPartial = {
    userRating: input.rating ?? (turn.userRating !== null ? turn.userRating : undefined),
    adminScore: adminScore,
    qualityFlags: existingFlags as QualityFlag[],
    rowCount: turn.rowCount,
    executionError: turn.executionError,
    llmConfidence: turn.llmConfidence !== null ? Number(turn.llmConfidence) : null,
    compilationErrors: Array.isArray(turn.compilationErrors) ? turn.compilationErrors as string[] : null,
    resultFingerprint: turn.resultFingerprint as Record<string, unknown> | null,
    executionTimeMs: turn.executionTimeMs,
  };

  const recomputedFlags = computeQualityFlags(updatedPartial as Parameters<typeof computeQualityFlags>[0]);
  const newScore = computeQualityScore({
    ...updatedPartial,
    qualityFlags: recomputedFlags,
  } as Parameters<typeof computeQualityScore>[0]);

  await db
    .update(semanticEvalTurns)
    .set({
      userRating: input.rating ?? turn.userRating,
      userThumbsUp: input.thumbsUp ?? turn.userThumbsUp,
      userFeedbackText: input.text ?? turn.userFeedbackText,
      userFeedbackTags: input.tags ?? turn.userFeedbackTags as FeedbackTag[],
      userFeedbackAt: now,
      qualityFlags: recomputedFlags.length > 0 ? recomputedFlags : turn.qualityFlags as QualityFlag[],
      qualityScore: newScore !== null ? newScore.toString() : turn.qualityScore,
      updatedAt: now,
    })
    .where(eq(semanticEvalTurns.id, evalTurnId));

  // Update session rolling average for user rating
  await updateSessionAvgUserRating(turn.sessionId, tenantId);
}

// ── submitAdminReview ───────────────────────────────────────────
// Called from apps/admin only.
// Stores the admin's review, recomputes quality score,
// and updates the session's avg admin score.

export async function submitAdminReview(
  evalTurnId: string,
  adminId: string,
  input: AdminReviewInput,
): Promise<void> {
  const [turn] = await db
    .select()
    .from(semanticEvalTurns)
    .where(eq(semanticEvalTurns.id, evalTurnId))
    .limit(1);

  if (!turn) {
    throw new NotFoundError('Eval turn not found');
  }

  const now = new Date();

  const updatedPartial = {
    adminScore: input.score,
    userRating: turn.userRating !== null ? turn.userRating : undefined,
    qualityFlags: Array.isArray(turn.qualityFlags) ? turn.qualityFlags as QualityFlag[] : [],
    rowCount: turn.rowCount,
    executionError: turn.executionError,
    llmConfidence: turn.llmConfidence !== null ? Number(turn.llmConfidence) : null,
    compilationErrors: Array.isArray(turn.compilationErrors) ? turn.compilationErrors as string[] : null,
    resultFingerprint: turn.resultFingerprint as Record<string, unknown> | null,
    executionTimeMs: turn.executionTimeMs,
  };

  const recomputedFlags = computeQualityFlags(updatedPartial as Parameters<typeof computeQualityFlags>[0]);
  const newScore = computeQualityScore({
    ...updatedPartial,
    qualityFlags: recomputedFlags,
  } as Parameters<typeof computeQualityScore>[0]);

  await db
    .update(semanticEvalTurns)
    .set({
      adminReviewerId: adminId,
      adminScore: input.score,
      adminVerdict: input.verdict,
      adminNotes: input.notes ?? null,
      adminCorrectedPlan: input.correctedPlan ?? null,
      adminCorrectedNarrative: input.correctedNarrative ?? null,
      adminReviewedAt: now,
      adminActionTaken: input.actionTaken,
      qualityFlags: recomputedFlags.length > 0 ? recomputedFlags : turn.qualityFlags as QualityFlag[],
      qualityScore: newScore !== null ? newScore.toString() : turn.qualityScore,
      updatedAt: now,
    })
    .where(eq(semanticEvalTurns.id, evalTurnId));

  // Update session avg admin score
  await updateSessionAvgAdminScore(turn.sessionId);
}

// ── promoteToExample ────────────────────────────────────────────
// Promotes a high-quality eval turn to a golden example for few-shot prompting.
// Sets adminActionTaken = 'added_to_examples' on the source turn.

export async function promoteToExample(
  evalTurnId: string,
  adminId: string,
  input: PromoteExampleInput,
): Promise<string> {
  const [turn] = await db
    .select()
    .from(semanticEvalTurns)
    .where(eq(semanticEvalTurns.id, evalTurnId))
    .limit(1);

  if (!turn) {
    throw new NotFoundError('Eval turn not found');
  }

  if (!turn.llmPlan) {
    throw new AuthorizationError('Cannot promote a turn without an LLM plan');
  }

  const exampleId = generateUlid();

  await db.insert(semanticEvalExamples).values({
    id: exampleId,
    tenantId: turn.tenantId,
    sourceEvalTurnId: evalTurnId,
    question: turn.userMessage,
    plan: turn.llmPlan as Record<string, unknown>,
    rationale: turn.llmRationale as Record<string, unknown> | null,
    category: input.category,
    difficulty: input.difficulty,
    qualityScore: turn.qualityScore,
    isActive: true,
    addedBy: adminId,
  });

  // Mark the source turn
  await db
    .update(semanticEvalTurns)
    .set({
      adminActionTaken: 'added_to_examples',
      updatedAt: new Date(),
    })
    .where(eq(semanticEvalTurns.id, evalTurnId));

  return exampleId;
}

// ── Session rolling averages ────────────────────────────────────

async function updateSessionAvgUserRating(sessionId: string, tenantId: string): Promise<void> {
  // Compute rolling average from all turns in session that have a user rating
  const result = await db.execute<{ avg_rating: string }>(
    sql`SELECT AVG(user_rating)::NUMERIC(3,2) as avg_rating
        FROM semantic_eval_turns
        WHERE session_id = ${sessionId}
          AND tenant_id = ${tenantId}
          AND user_rating IS NOT NULL`,
  );

  const rows = Array.from(result as Iterable<{ avg_rating: string }>);
  const avgRating = rows[0]?.avg_rating;

  await db
    .update(semanticEvalSessions)
    .set({
      avgUserRating: avgRating ?? null,
      updatedAt: new Date(),
    })
    .where(eq(semanticEvalSessions.id, sessionId));
}

async function updateSessionAvgAdminScore(sessionId: string): Promise<void> {
  const result = await db.execute<{ avg_score: string }>(
    sql`SELECT AVG(admin_score)::NUMERIC(3,2) as avg_score
        FROM semantic_eval_turns
        WHERE session_id = ${sessionId}
          AND admin_score IS NOT NULL`,
  );

  const rows = Array.from(result as Iterable<{ avg_score: string }>);
  const avgScore = rows[0]?.avg_score;

  await db
    .update(semanticEvalSessions)
    .set({
      avgAdminScore: avgScore ?? null,
      updatedAt: new Date(),
    })
    .where(eq(semanticEvalSessions.id, sessionId));
}
