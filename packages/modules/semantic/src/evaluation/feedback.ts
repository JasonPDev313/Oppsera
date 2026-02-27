import { db, withTenant } from '@oppsera/db';
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
import { addTrainingPair } from '../rag/training-store';

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
  // Wrap all DB operations in withTenant so RLS policies can validate
  // the tenant_id via current_setting('app.current_tenant_id').
  // Without this, RLS silently blocks all reads/writes.
  const { turn, newScore } = await withTenant(tenantId, async (tx) => {
    // Fetch the turn to validate ownership
    const [t] = await tx
      .select()
      .from(semanticEvalTurns)
      .where(and(eq(semanticEvalTurns.id, evalTurnId), eq(semanticEvalTurns.tenantId, tenantId)))
      .limit(1);

    if (!t) {
      throw new NotFoundError('Eval turn not found');
    }

    // Users can only rate their own interactions
    if (t.userId && t.userId !== userId) {
      throw new AuthorizationError('You can only rate your own interactions');
    }

    const now = new Date();

    // Compute updated quality score with the new user rating
    const adminScore = t.adminScore !== null ? t.adminScore : undefined;
    const existingFlags = Array.isArray(t.qualityFlags) ? t.qualityFlags as QualityFlag[] : [];

    const updatedPartial = {
      userRating: input.rating ?? (t.userRating !== null ? t.userRating : undefined),
      adminScore: adminScore,
      qualityFlags: existingFlags as QualityFlag[],
      rowCount: t.rowCount,
      executionError: t.executionError,
      llmConfidence: t.llmConfidence !== null ? Number(t.llmConfidence) : null,
      compilationErrors: Array.isArray(t.compilationErrors) ? t.compilationErrors as string[] : null,
      resultFingerprint: t.resultFingerprint as Record<string, unknown> | null,
      executionTimeMs: t.executionTimeMs,
    };

    const recomputedFlags = computeQualityFlags(updatedPartial as Parameters<typeof computeQualityFlags>[0]);
    const score = computeQualityScore({
      ...updatedPartial,
      qualityFlags: recomputedFlags,
    } as Parameters<typeof computeQualityScore>[0]);

    await tx
      .update(semanticEvalTurns)
      .set({
        userRating: input.rating ?? t.userRating,
        userThumbsUp: input.thumbsUp ?? t.userThumbsUp,
        userFeedbackText: input.text ?? t.userFeedbackText,
        userFeedbackTags: input.tags ?? t.userFeedbackTags as FeedbackTag[],
        userFeedbackAt: now,
        qualityFlags: recomputedFlags.length > 0 ? recomputedFlags : t.qualityFlags as QualityFlag[],
        qualityScore: score !== null ? score.toString() : t.qualityScore,
        updatedAt: now,
      })
      .where(eq(semanticEvalTurns.id, evalTurnId));

    // Update session rolling average for user rating (inline, same transaction)
    const result = await tx.execute<{ avg_rating: string }>(
      sql`SELECT AVG(user_rating)::NUMERIC(3,2) as avg_rating
          FROM semantic_eval_turns
          WHERE session_id = ${t.sessionId}
            AND tenant_id = ${tenantId}
            AND user_rating IS NOT NULL`,
    );
    const rows = Array.from(result as Iterable<{ avg_rating: string }>);
    const avgRating = rows[0]?.avg_rating;

    await tx
      .update(semanticEvalSessions)
      .set({
        avgUserRating: avgRating ?? null,
        updatedAt: now,
      })
      .where(eq(semanticEvalSessions.id, t.sessionId));

    return { turn: t, newScore: score };
  });

  // ── Auto-promote to RAG training store on thumbs-up ──────────
  // When a user gives a high rating (>=4) and the turn produced valid data,
  // auto-insert into the training pairs table for future few-shot retrieval.
  const effectiveRating = input.rating ?? turn.userRating;
  const effectiveThumbsUp = input.thumbsUp ?? turn.userThumbsUp;
  const hasValidData = turn.rowCount != null && Number(turn.rowCount) > 0;
  const noExecError = !turn.executionError;
  const hasCompiledSql = !!turn.compiledSql;
  const shouldPromote =
    ((effectiveRating != null && effectiveRating >= 4) || effectiveThumbsUp === true) &&
    hasValidData &&
    noExecError &&
    hasCompiledSql;

  if (shouldPromote) {
    // Fire-and-forget — never block the feedback response
    addTrainingPair({
      tenantId,
      question: turn.userMessage,
      compiledSql: turn.compiledSql,
      plan: turn.llmPlan as Record<string, unknown> | null,
      mode: inferModeFromTurn(turn),
      qualityScore: newScore !== null ? newScore : undefined,
      source: 'thumbs_up',
      sourceEvalTurnId: evalTurnId,
    }).catch((err) => {
      console.warn('[semantic] Auto-promotion to RAG store failed (non-blocking):', err);
    });
  }
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

  // ── SEM-05: Auto-promote to RAG on admin 5-star approval ──────
  // When an admin gives a perfect score with "approved" verdict and
  // the turn produced valid data, auto-insert into the training store.
  const adminShouldPromote =
    input.score === 5 &&
    input.verdict === 'correct' &&
    turn.rowCount != null && Number(turn.rowCount) > 0 &&
    !turn.executionError &&
    !!turn.compiledSql;

  if (adminShouldPromote) {
    addTrainingPair({
      tenantId: turn.tenantId,
      question: turn.userMessage,
      compiledSql: turn.compiledSql,
      plan: turn.llmPlan as Record<string, unknown> | null,
      mode: inferModeFromTurn(turn),
      qualityScore: newScore !== null ? newScore : undefined,
      source: 'admin',
      sourceEvalTurnId: evalTurnId,
    }).catch((err) => {
      console.warn('[semantic] Admin auto-promotion to RAG store failed (non-blocking):', err);
    });
  }
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

// ── Helpers ─────────────────────────────────────────────────────

/** Infer pipeline mode from the eval turn's LLM plan JSON. */
function inferModeFromTurn(turn: { llmPlan: unknown }): 'metrics' | 'sql' {
  if (turn.llmPlan && typeof turn.llmPlan === 'object') {
    const plan = turn.llmPlan as Record<string, unknown>;
    if (plan.mode === 'sql') return 'sql';
  }
  return 'metrics';
}

// ── Session rolling averages ────────────────────────────────────

async function _updateSessionAvgUserRating(sessionId: string, tenantId: string): Promise<void> {
  // Wrap in withTenant so RLS context is set for the eval tables.
  await withTenant(tenantId, async (tx) => {
    // Compute rolling average from all turns in session that have a user rating
    const result = await tx.execute<{ avg_rating: string }>(
      sql`SELECT AVG(user_rating)::NUMERIC(3,2) as avg_rating
          FROM semantic_eval_turns
          WHERE session_id = ${sessionId}
            AND tenant_id = ${tenantId}
            AND user_rating IS NOT NULL`,
    );

    const rows = Array.from(result as Iterable<{ avg_rating: string }>);
    const avgRating = rows[0]?.avg_rating;

    await tx
      .update(semanticEvalSessions)
      .set({
        avgUserRating: avgRating ?? null,
        updatedAt: new Date(),
      })
      .where(eq(semanticEvalSessions.id, sessionId));
  });
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
