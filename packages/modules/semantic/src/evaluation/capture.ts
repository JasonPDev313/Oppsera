import { createHash } from 'node:crypto';
import { db } from '@oppsera/db';
import { semanticEvalSessions, semanticEvalTurns } from '@oppsera/db';
import { sql, eq } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import type {
  EvalTurn,
  LLMPlanResponse,
  QualityFlag,
  ResultFingerprint,
  QualityScoreWeights,
} from './types';
import { DEFAULT_QUALITY_WEIGHTS } from './types';

// ── Plan hash ───────────────────────────────────────────────────
// Stable SHA-256 of normalized plan — sorted keys, stripped whitespace.
// Same plan with different key orderings → same hash.

export function computePlanHash(plan: Record<string, unknown> | null): string {
  if (!plan) return '';
  const normalized = JSON.stringify(plan, Object.keys(plan).sort());
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

export function computeSqlHash(sql: string | undefined): string {
  if (!sql) return '';
  const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

// ── Quality flag auto-detection ─────────────────────────────────

export function computeQualityFlags(turn: Partial<EvalTurn>): QualityFlag[] {
  const flags: QualityFlag[] = [];

  if (turn.rowCount === 0) {
    flags.push('empty_result');
  }
  if (turn.executionError && turn.executionError.toLowerCase().includes('timeout')) {
    flags.push('timeout');
  }
  if (
    turn.llmConfidence !== null &&
    turn.llmConfidence !== undefined &&
    turn.llmConfidence < 0.6
  ) {
    flags.push('low_confidence');
  }
  if (
    turn.compilationErrors &&
    turn.compilationErrors.length > 0 &&
    turn.compilationErrors.some(
      (e) =>
        e.toLowerCase().includes('unknown metric') ||
        e.toLowerCase().includes('unknown dimension'),
    )
  ) {
    flags.push('hallucinated_slug');
  }
  if (
    turn.resultFingerprint &&
    (turn.resultFingerprint as ResultFingerprint).nullRate > 0.5
  ) {
    flags.push('high_null_rate');
  }
  if (turn.rowCount !== null && turn.rowCount !== undefined && turn.rowCount > 5000) {
    flags.push('excessive_rows');
  }
  if (
    turn.executionTimeMs !== null &&
    turn.executionTimeMs !== undefined &&
    turn.executionTimeMs > 5000
  ) {
    flags.push('very_slow');
  }

  return flags;
}

// ── Quality score computation ───────────────────────────────────
// Composite: 40% admin score + 30% user rating + 30% heuristics
// Returns value in 0.00–1.00 range

export function computeQualityScore(
  turn: Partial<EvalTurn>,
  weights: QualityScoreWeights = DEFAULT_QUALITY_WEIGHTS,
): number | null {
  // Normalize admin/user scores to 0-100
  const adminScore =
    turn.adminScore !== null && turn.adminScore !== undefined
      ? (turn.adminScore / 5) * 100
      : null;
  const userScore =
    turn.userRating !== null && turn.userRating !== undefined
      ? (turn.userRating / 5) * 100
      : null;

  // Heuristic score: start at 100, deduct per flag
  const flags = turn.qualityFlags ?? computeQualityFlags(turn);
  const DEDUCTIONS: Record<QualityFlag, number> = {
    empty_result: 40,
    timeout: 50,
    low_confidence: 20,
    hallucinated_slug: 60,
    high_null_rate: 25,
    excessive_rows: 10,
    very_slow: 15,
  };
  let heuristicScore = 100;
  for (const flag of flags) {
    heuristicScore = Math.max(0, heuristicScore - DEDUCTIONS[flag]);
  }

  // qualityFlags !== null/undefined means heuristics were evaluated (even if no flags found)
  const heuristicProvided = turn.qualityFlags !== null && turn.qualityFlags !== undefined;
  const hasAnySignal = adminScore !== null || userScore !== null || heuristicProvided;
  if (!hasAnySignal) return null;

  let weightedSum = 0;
  let totalWeight = 0;

  if (adminScore !== null) {
    weightedSum += adminScore * weights.adminWeight;
    totalWeight += weights.adminWeight;
  }
  if (userScore !== null) {
    weightedSum += userScore * weights.userWeight;
    totalWeight += weights.userWeight;
  }
  // Heuristics always contribute when there's any signal
  weightedSum += heuristicScore * weights.heuristicWeight;
  totalWeight += weights.heuristicWeight;

  // Normalize: result is 0-100 range, convert to 0.00-1.00
  const raw = weightedSum / totalWeight / 100;
  return Math.round(raw * 100) / 100;
}

// ── RecordTurnInput ─────────────────────────────────────────────

export interface RecordTurnInput {
  id?: string; // pre-generated ULID; if omitted, one is generated
  tenantId: string;
  userId: string;
  userRole: string;
  sessionId: string;
  turnNumber: number;
  userMessage: string;
  context: Record<string, unknown>;
  llmResponse: LLMPlanResponse;
  llmProvider: string;
  llmModel: string;
  llmTokens: { input: number; output: number };
  llmLatencyMs: number;
  compiledSql?: string;
  compilationErrors?: string[];
  safetyFlags?: string[];
  tablesAccessed?: string[];
  executionTimeMs?: number;
  rowCount?: number;
  resultSample?: Record<string, unknown>[];
  resultFingerprint?: ResultFingerprint;
  executionError?: string;
  cacheStatus?: string;
  narrative?: string;
  lensId?: string;
  responseSections?: string[];
  playbooksFired?: string[];
}

// ── EvalCaptureService interface ────────────────────────────────

export interface EvalCaptureServiceInterface {
  recordTurn(input: RecordTurnInput): Promise<string>;
  computeQualityFlags(turn: Partial<EvalTurn>): QualityFlag[];
  computeQualityScore(turn: Partial<EvalTurn>): number | null;
}

// ── Default implementation ──────────────────────────────────────

class DefaultEvalCaptureService implements EvalCaptureServiceInterface {
  computeQualityFlags(turn: Partial<EvalTurn>): QualityFlag[] {
    return computeQualityFlags(turn);
  }

  computeQualityScore(turn: Partial<EvalTurn>): number | null {
    return computeQualityScore(turn);
  }

  async recordTurn(input: RecordTurnInput): Promise<string> {
    const {
      tenantId,
      userId,
      userRole,
      sessionId,
      turnNumber,
      userMessage,
      context,
      llmResponse,
      llmProvider,
      llmModel,
      llmTokens,
      llmLatencyMs,
      compiledSql,
      compilationErrors,
      safetyFlags: safetyFlagsInput,
      tablesAccessed,
      executionTimeMs,
      rowCount,
      resultSample,
      resultFingerprint,
      executionError,
      cacheStatus,
      narrative,
      lensId,
      responseSections,
      playbooksFired,
    } = input;

    const evalTurnId = input.id ?? generateUlid();
    const planHash = computePlanHash(llmResponse.plan as Record<string, unknown> | null);
    const sqlHash = computeSqlHash(compiledSql);

    const partialTurn: Partial<EvalTurn> = {
      rowCount: rowCount ?? null,
      executionError: executionError ?? null,
      llmConfidence: llmResponse.confidence,
      compilationErrors: compilationErrors ?? null,
      resultFingerprint: resultFingerprint ?? null,
      executionTimeMs: executionTimeMs ?? null,
    };

    const qualityFlags = computeQualityFlags(partialTurn);
    const qualityScore = computeQualityScore({ ...partialTurn, qualityFlags });

    // Ensure the eval session exists (upsert). The frontend generates session IDs
    // that may not yet exist in the DB — we auto-create them on first turn.
    await db
      .insert(semanticEvalSessions)
      .values({
        id: sessionId,
        tenantId,
        userId,
        sessionId,
        messageCount: 0,
        lensId: lensId ?? null,
        metadata: { userRole },
      })
      .onConflictDoNothing({ target: semanticEvalSessions.id });

    await db.insert(semanticEvalTurns).values({
      id: evalTurnId,
      tenantId,
      sessionId,
      userId,
      userRole,
      turnNumber,
      userMessage,
      contextSnapshot: context,
      llmProvider,
      llmModel,
      llmPlan: llmResponse.plan ?? null,
      llmRationale: llmResponse.rationale,
      llmConfidence: llmResponse.confidence.toString(),
      llmTokensInput: llmTokens.input,
      llmTokensOutput: llmTokens.output,
      llmLatencyMs,
      planHash: planHash || null,
      wasClarification: llmResponse.clarificationNeeded,
      clarificationMessage: llmResponse.clarificationMessage ?? null,
      compiledSql: compiledSql ?? null,
      sqlHash: sqlHash || null,
      compilationErrors: compilationErrors ?? null,
      safetyFlags: safetyFlagsInput ?? null,
      tablesAccessed: tablesAccessed ?? null,
      executionTimeMs: executionTimeMs ?? null,
      rowCount: rowCount ?? null,
      resultSample: resultSample ?? null,
      resultFingerprint: resultFingerprint ?? null,
      executionError: executionError ?? null,
      cacheStatus: (cacheStatus as 'HIT' | 'MISS' | 'SKIP') ?? null,
      narrative: narrative ?? null,
      narrativeLensId: lensId ?? null,
      responseSections: responseSections ?? null,
      playbooksFired: playbooksFired ?? null,
      qualityFlags: qualityFlags.length > 0 ? qualityFlags : null,
      qualityScore: qualityScore !== null ? qualityScore.toString() : null,
    });

    // Atomically increment message count on the eval session
    await db
      .update(semanticEvalSessions)
      .set({
        messageCount: sql`${semanticEvalSessions.messageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(semanticEvalSessions.id, sessionId));

    return evalTurnId;
  }
}

// ── Singleton ───────────────────────────────────────────────────

let _captureService: EvalCaptureServiceInterface | null = null;

export function getEvalCaptureService(): EvalCaptureServiceInterface {
  if (!_captureService) {
    _captureService = new DefaultEvalCaptureService();
  }
  return _captureService;
}

export function setEvalCaptureService(service: EvalCaptureServiceInterface): void {
  _captureService = service;
}
