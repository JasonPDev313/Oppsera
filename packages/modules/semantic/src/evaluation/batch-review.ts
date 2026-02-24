import { db } from '@oppsera/db';
import { semanticEvalTurns } from '@oppsera/db';
import { sql, eq, and } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { NotFoundError } from '@oppsera/shared';
import { submitAdminReview } from './feedback';
import type { AdminVerdict, EvalTurn, QualityFlag } from './types';

// ── Types ────────────────────────────────────────────────────────

export type ReviewPriority = 'urgent' | 'high' | 'normal' | 'low';
export type ReviewAssignmentStatus = 'pending' | 'completed' | 'skipped';

export interface ReviewAssignment {
  id: string;
  turnId: string;
  assignedTo: string;
  assignedBy: string;
  priority: ReviewPriority;
  status: ReviewAssignmentStatus;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface ReviewQueueItem {
  assignment: ReviewAssignment;
  turn: EvalTurn;
}

export interface ReviewQueueFilters {
  priority?: ReviewPriority;
  status?: ReviewAssignmentStatus;
  limit?: number;
}

export interface AssignTurnsInput {
  turnIds: string[];
  assignedTo: string;
  priority?: ReviewPriority;
  dueAt?: string;
}

export interface AutoAssignConfig {
  adminIds: string[];
  maxPerAdmin: number;
  priorityRules?: {
    flagged: ReviewPriority;
    lowConfidence: ReviewPriority;
    lowRating: ReviewPriority;
  };
}

export interface ReviewStats {
  totalAssigned: number;
  completed: number;
  skipped: number;
  pending: number;
  avgReviewTimeMs: number | null;
  reviewsToday: number;
  reviewsThisWeek: number;
}

export interface BulkReviewItem {
  turnId: string;
  score: number;
  verdict: AdminVerdict;
  notes?: string;
}

export interface BulkReviewResult {
  reviewed: number;
  errors: { turnId: string; error: string }[];
}

// ── In-memory assignment store ───────────────────────────────────
// Review assignments are stored in-memory. In production, these would
// be backed by a dedicated DB table. The in-memory store is sufficient
// for the current evaluation workflow (admin panel, single-instance).

const _assignments: Map<string, ReviewAssignment> = new Map();

// ── getReviewQueue ──────────────────────────────────────────────

export async function getReviewQueue(
  adminId: string,
  filters: ReviewQueueFilters = {},
): Promise<ReviewQueueItem[]> {
  const { priority, status, limit = 50 } = filters;
  const pageSize = Math.min(limit, 100);

  // Filter assignments for this admin
  const myAssignments = Array.from(_assignments.values()).filter((a) => {
    if (a.assignedTo !== adminId) return false;
    if (priority && a.priority !== priority) return false;
    if (status && a.status !== status) return false;
    return true;
  });

  // Sort by priority (urgent first), then by age (oldest first)
  const priorityOrder: Record<ReviewPriority, number> = {
    urgent: 0,
    high: 1,
    normal: 2,
    low: 3,
  };

  myAssignments.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return a.createdAt.localeCompare(b.createdAt);
  });

  const pagedAssignments = myAssignments.slice(0, pageSize);

  if (pagedAssignments.length === 0) return [];

  // Fetch the associated turns
  const turnIds = pagedAssignments.map((a) => a.turnId);
  const turnRows = await db
    .select()
    .from(semanticEvalTurns)
    .where(sql`${semanticEvalTurns.id} IN (${sql.join(turnIds.map((id) => sql`${id}`), sql`, `)})`);

  const turnMap = new Map<string, typeof semanticEvalTurns.$inferSelect>();
  for (const row of turnRows) {
    turnMap.set(row.id, row);
  }

  return pagedAssignments
    .filter((a) => turnMap.has(a.turnId))
    .map((a) => ({
      assignment: a,
      turn: mapTurn(turnMap.get(a.turnId)!),
    }));
}

// ── getNextForReview ────────────────────────────────────────────

export async function getNextForReview(
  adminId: string,
): Promise<{ item: ReviewQueueItem | null; remainingCount: number }> {
  // First: find highest-priority pending turn assigned to this admin
  const priorityOrder: Record<ReviewPriority, number> = {
    urgent: 0,
    high: 1,
    normal: 2,
    low: 3,
  };

  const myPending = Array.from(_assignments.values())
    .filter((a) => a.assignedTo === adminId && a.status === 'pending')
    .sort((a, b) => {
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return a.createdAt.localeCompare(b.createdAt);
    });

  const remainingCount = myPending.length;

  if (myPending.length > 0) {
    const assignment = myPending[0]!;
    const [turnRow] = await db
      .select()
      .from(semanticEvalTurns)
      .where(eq(semanticEvalTurns.id, assignment.turnId))
      .limit(1);

    if (turnRow) {
      return {
        item: { assignment, turn: mapTurn(turnRow) },
        remainingCount,
      };
    }
  }

  // Fallback: oldest unreviewed turn (any admin) not already assigned
  const assignedTurnIds = new Set(
    Array.from(_assignments.values())
      .filter((a) => a.status === 'pending')
      .map((a) => a.turnId),
  );

  const assignedFilter = assignedTurnIds.size > 0
    ? sql`AND ${semanticEvalTurns.id} NOT IN (${sql.join(
        Array.from(assignedTurnIds).map((id) => sql`${id}`),
        sql`, `,
      )})`
    : sql``;

  const fallbackRows = await db.execute<{
    id: string;
    tenant_id: string;
    session_id: string;
    user_id: string | null;
    user_role: string | null;
    turn_number: string;
    user_message: string;
    created_at: string;
  }>(
    sql`SELECT id, tenant_id, session_id, user_id, user_role,
            turn_number, user_message, created_at::TEXT
        FROM semantic_eval_turns
        WHERE admin_reviewed_at IS NULL
          ${assignedFilter}
        ORDER BY created_at ASC
        LIMIT 1`,
  );

  const fallbackItems = Array.from(fallbackRows as Iterable<{
    id: string;
    tenant_id: string;
    session_id: string;
    user_id: string | null;
    user_role: string | null;
    turn_number: string;
    user_message: string;
    created_at: string;
  }>);

  if (fallbackItems.length === 0) {
    return { item: null, remainingCount: 0 };
  }

  const fallbackId = fallbackItems[0]!.id;
  const [turnRow] = await db
    .select()
    .from(semanticEvalTurns)
    .where(eq(semanticEvalTurns.id, fallbackId))
    .limit(1);

  if (!turnRow) {
    return { item: null, remainingCount: 0 };
  }

  // Create an ad-hoc assignment for tracking
  const assignment: ReviewAssignment = {
    id: generateUlid(),
    turnId: fallbackId,
    assignedTo: adminId,
    assignedBy: 'system',
    priority: 'normal',
    status: 'pending',
    dueAt: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
  };
  _assignments.set(assignment.id, assignment);

  return {
    item: { assignment, turn: mapTurn(turnRow) },
    remainingCount: remainingCount + 1,
  };
}

// ── assignTurnsForReview ────────────────────────────────────────

export async function assignTurnsForReview(
  assignedBy: string,
  input: AssignTurnsInput,
): Promise<{ assigned: number }> {
  const { turnIds, assignedTo, priority = 'normal', dueAt } = input;
  const now = new Date().toISOString();
  let assigned = 0;

  for (const turnId of turnIds) {
    // Skip if already assigned to the same admin and pending
    const existing = Array.from(_assignments.values()).find(
      (a) => a.turnId === turnId && a.assignedTo === assignedTo && a.status === 'pending',
    );
    if (existing) continue;

    const assignment: ReviewAssignment = {
      id: generateUlid(),
      turnId,
      assignedTo,
      assignedBy,
      priority,
      status: 'pending',
      dueAt: dueAt ?? null,
      completedAt: null,
      createdAt: now,
    };
    _assignments.set(assignment.id, assignment);
    assigned++;
  }

  return { assigned };
}

// ── autoAssignUnreviewed ────────────────────────────────────────

export async function autoAssignUnreviewed(
  assignedBy: string,
  config: AutoAssignConfig,
): Promise<{ assigned: number }> {
  const { adminIds, maxPerAdmin, priorityRules } = config;
  const defaultRules = {
    flagged: 'high' as ReviewPriority,
    lowConfidence: 'high' as ReviewPriority,
    lowRating: 'normal' as ReviewPriority,
  };
  const rules = { ...defaultRules, ...priorityRules };

  if (adminIds.length === 0) return { assigned: 0 };

  // Count current pending assignments per admin
  const pendingCounts = new Map<string, number>();
  for (const adminId of adminIds) {
    const count = Array.from(_assignments.values()).filter(
      (a) => a.assignedTo === adminId && a.status === 'pending',
    ).length;
    pendingCounts.set(adminId, count);
  }

  // Get all currently assigned turn IDs (pending)
  const assignedTurnIds = new Set(
    Array.from(_assignments.values())
      .filter((a) => a.status === 'pending')
      .map((a) => a.turnId),
  );

  // Fetch unreviewed turns without pending assignments
  const assignedFilter = assignedTurnIds.size > 0
    ? sql`AND id NOT IN (${sql.join(
        Array.from(assignedTurnIds).map((id) => sql`${id}`),
        sql`, `,
      )})`
    : sql``;

  const totalSlots = adminIds.reduce(
    (sum, id) => sum + Math.max(0, maxPerAdmin - (pendingCounts.get(id) ?? 0)),
    0,
  );

  if (totalSlots <= 0) return { assigned: 0 };

  const unreviewedRows = await db.execute<{
    id: string;
    quality_flags: string | null;
    llm_confidence: string | null;
    user_rating: string | null;
  }>(
    sql`SELECT id, quality_flags::TEXT, llm_confidence, user_rating::TEXT
        FROM semantic_eval_turns
        WHERE admin_reviewed_at IS NULL
          ${assignedFilter}
        ORDER BY created_at ASC
        LIMIT ${totalSlots}`,
  );

  const unreviewed = Array.from(unreviewedRows as Iterable<{
    id: string;
    quality_flags: string | null;
    llm_confidence: string | null;
    user_rating: string | null;
  }>);

  if (unreviewed.length === 0) return { assigned: 0 };

  // Round-robin assignment
  let assigned = 0;
  let adminIndex = 0;
  const now = new Date().toISOString();

  for (const row of unreviewed) {
    // Find next admin with capacity
    let attempts = 0;
    while (attempts < adminIds.length) {
      const adminId = adminIds[adminIndex % adminIds.length]!;
      const current = pendingCounts.get(adminId) ?? 0;

      if (current < maxPerAdmin) {
        // Determine priority based on quality signals
        let priority: ReviewPriority = 'normal';
        const flags = row.quality_flags ? JSON.parse(row.quality_flags) as string[] : [];
        const confidence = row.llm_confidence ? Number(row.llm_confidence) : null;
        const rating = row.user_rating ? parseInt(row.user_rating, 10) : null;

        if (flags.length > 0) {
          priority = rules.flagged;
        } else if (confidence !== null && confidence < 0.6) {
          priority = rules.lowConfidence;
        } else if (rating !== null && rating <= 2) {
          priority = rules.lowRating;
        }

        const assignment: ReviewAssignment = {
          id: generateUlid(),
          turnId: row.id,
          assignedTo: adminId,
          assignedBy,
          priority,
          status: 'pending',
          dueAt: null,
          completedAt: null,
          createdAt: now,
        };
        _assignments.set(assignment.id, assignment);
        pendingCounts.set(adminId, current + 1);
        assigned++;
        adminIndex++;
        break;
      }

      adminIndex++;
      attempts++;
    }
  }

  return { assigned };
}

// ── skipReview ──────────────────────────────────────────────────

export async function skipReview(
  assignmentId: string,
  adminId: string,
): Promise<void> {
  const assignment = _assignments.get(assignmentId);
  if (!assignment) {
    throw new NotFoundError('Review assignment not found');
  }

  if (assignment.assignedTo !== adminId) {
    throw new NotFoundError('Review assignment not found');
  }

  assignment.status = 'skipped';
}

// ── completeReviewAssignment ────────────────────────────────────

export async function completeReviewAssignment(
  assignmentId: string,
): Promise<void> {
  const assignment = _assignments.get(assignmentId);
  if (!assignment) {
    throw new NotFoundError('Review assignment not found');
  }

  assignment.status = 'completed';
  assignment.completedAt = new Date().toISOString();
}

// ── getReviewStats ─────────────────────────────────────────────

export async function getReviewStats(
  adminId?: string,
): Promise<ReviewStats> {
  const assignments = Array.from(_assignments.values()).filter(
    (a) => !adminId || a.assignedTo === adminId,
  );

  const totalAssigned = assignments.length;
  const completed = assignments.filter((a) => a.status === 'completed').length;
  const skipped = assignments.filter((a) => a.status === 'skipped').length;
  const pending = assignments.filter((a) => a.status === 'pending').length;

  // Compute avg review time from completed assignments
  const completedAssignments = assignments.filter(
    (a) => a.status === 'completed' && a.completedAt,
  );

  let avgReviewTimeMs: number | null = null;
  if (completedAssignments.length > 0) {
    const totalMs = completedAssignments.reduce((sum, a) => {
      const created = new Date(a.createdAt).getTime();
      const completed = new Date(a.completedAt!).getTime();
      return sum + (completed - created);
    }, 0);
    avgReviewTimeMs = Math.round(totalMs / completedAssignments.length);
  }

  // Reviews today and this week
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - now.getDay(),
  ).toISOString();

  const reviewsToday = completedAssignments.filter(
    (a) => a.completedAt! >= todayStart,
  ).length;

  const reviewsThisWeek = completedAssignments.filter(
    (a) => a.completedAt! >= weekStart,
  ).length;

  return {
    totalAssigned,
    completed,
    skipped,
    pending,
    avgReviewTimeMs,
    reviewsToday,
    reviewsThisWeek,
  };
}

// ── bulkReview ─────────────────────────────────────────────────

export async function bulkReview(
  adminId: string,
  reviews: BulkReviewItem[],
): Promise<BulkReviewResult> {
  let reviewed = 0;
  const errors: { turnId: string; error: string }[] = [];

  for (const review of reviews) {
    try {
      await submitAdminReview(review.turnId, adminId, {
        score: review.score,
        verdict: review.verdict,
        notes: review.notes,
        actionTaken: 'none',
      });
      reviewed++;

      // If there is a pending assignment for this turn + admin, complete it
      const assignment = Array.from(_assignments.values()).find(
        (a) =>
          a.turnId === review.turnId &&
          a.assignedTo === adminId &&
          a.status === 'pending',
      );
      if (assignment) {
        assignment.status = 'completed';
        assignment.completedAt = new Date().toISOString();
      }
    } catch (err) {
      errors.push({
        turnId: review.turnId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return { reviewed, errors };
}

// ── Row mapper (matches queries.ts pattern) ─────────────────────

function mapTurn(row: typeof semanticEvalTurns.$inferSelect): EvalTurn {
  return {
    id: row.id,
    tenantId: row.tenantId,
    sessionId: row.sessionId,
    userId: row.userId,
    userRole: row.userRole,
    turnNumber: row.turnNumber,
    userMessage: row.userMessage,
    contextSnapshot: row.contextSnapshot as Record<string, unknown> | null,
    llmProvider: row.llmProvider,
    llmModel: row.llmModel,
    llmPlan: row.llmPlan as Record<string, unknown> | null,
    llmRationale: row.llmRationale as Record<string, unknown> | null,
    llmConfidence: row.llmConfidence !== null ? Number(row.llmConfidence) : null,
    llmTokensInput: row.llmTokensInput,
    llmTokensOutput: row.llmTokensOutput,
    llmLatencyMs: row.llmLatencyMs,
    planHash: row.planHash,
    wasClarification: row.wasClarification,
    clarificationMessage: row.clarificationMessage,
    compiledSql: row.compiledSql,
    sqlHash: row.sqlHash,
    compilationErrors: row.compilationErrors as string[] | null,
    safetyFlags: row.safetyFlags as string[] | null,
    tablesAccessed: row.tablesAccessed as string[] | null,
    executionTimeMs: row.executionTimeMs,
    rowCount: row.rowCount,
    resultSample: row.resultSample as Record<string, unknown>[] | null,
    resultFingerprint: row.resultFingerprint as {
      rowCount: number;
      minDate: string | null;
      maxDate: string | null;
      nullRate: number;
      columnCount: number;
    } | null,
    executionError: row.executionError,
    cacheStatus: row.cacheStatus as 'HIT' | 'MISS' | 'SKIP' | null,
    narrative: row.narrative,
    narrativeLensId: row.narrativeLensId,
    responseSections: row.responseSections as string[] | null,
    playbooksFired: row.playbooksFired as string[] | null,
    userRating: row.userRating,
    userThumbsUp: row.userThumbsUp,
    userFeedbackText: row.userFeedbackText,
    userFeedbackTags: row.userFeedbackTags as EvalTurn['userFeedbackTags'],
    userFeedbackAt: row.userFeedbackAt?.toISOString() ?? null,
    adminReviewerId: row.adminReviewerId,
    adminScore: row.adminScore,
    adminVerdict: row.adminVerdict as EvalTurn['adminVerdict'],
    adminNotes: row.adminNotes,
    adminCorrectedPlan: row.adminCorrectedPlan as Record<string, unknown> | null,
    adminCorrectedNarrative: row.adminCorrectedNarrative,
    adminReviewedAt: row.adminReviewedAt?.toISOString() ?? null,
    adminActionTaken: row.adminActionTaken as EvalTurn['adminActionTaken'],
    qualityScore: row.qualityScore !== null ? Number(row.qualityScore) : null,
    qualityFlags: row.qualityFlags as QualityFlag[] | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
