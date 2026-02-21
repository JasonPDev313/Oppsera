// ── Eval UI types ────────────────────────────────────────────────
// Mirrors @oppsera/module-semantic types but shaped for the admin frontend.

export type AdminVerdict = 'correct' | 'incorrect' | 'partial' | 'clarification_needed';
export type AdminAction = 'promoted_to_example' | 'flagged_for_review' | 'marked_regression';
export type QualityFlag =
  | 'empty_result'
  | 'timeout'
  | 'low_confidence'
  | 'hallucinated_slug'
  | 'high_null_rate'
  | 'excessive_rows'
  | 'very_slow';

export interface EvalTurnSummary {
  id: string;
  tenantId: string;
  sessionId: string;
  userId: string;
  userRole: string;
  turnNumber: number;
  userMessage: string;
  llmProvider: string;
  llmModel: string;
  llmConfidence: string | null;
  llmLatencyMs: number;
  executionTimeMs: number | null;
  rowCount: number | null;
  executionError: string | null;
  userRating: number | null;
  adminVerdict: AdminVerdict | null;
  adminScore: number | null;
  qualityFlags: QualityFlag[] | null;
  qualityScore: string | null;
  cacheStatus: 'HIT' | 'MISS' | 'SKIP' | null;
  wasClarification: boolean;
  compilationErrors: string[] | null;
  narrativeLensId: string | null;
  createdAt: string;
  adminReviewedAt: string | null;
}

export interface EvalTurnDetail extends EvalTurnSummary {
  contextSnapshot: Record<string, unknown>;
  llmPlan: Record<string, unknown> | null;
  llmRationale: Record<string, unknown> | null;
  llmTokensInput: number;
  llmTokensOutput: number;
  compiledSql: string | null;
  safetyFlags: string[] | null;
  tablesAccessed: string[] | null;
  resultSample: Record<string, unknown>[] | null;
  resultFingerprint: Record<string, unknown> | null;
  narrative: string | null;
  responseSections: string[] | null;
  playbooksFired: string[] | null;
  adminNotes: string | null;
  adminAction: AdminAction | null;
  userFeedbackText: string | null;
  userFeedbackTags: string[] | null;
  planHash: string | null;
  sqlHash: string | null;
}

export interface EvalSession {
  id: string;
  tenantId: string;
  userId: string;
  userRole: string;
  messageCount: number;
  status: string;
  startedAt: string;
  endedAt: string | null;
}

export interface EvalFeedResponse {
  turns: EvalTurnSummary[];
  cursor: string | null;
  hasMore: boolean;
}

export interface QualityDashboard {
  avgUserRating: number | null;
  avgAdminScore: number | null;
  avgQualityScore: number | null;
  totalTurns: number;
  reviewedTurns: number;
  clarificationRate: number;
  hallucinationRate: number;
  avgExecutionTimeMs: number | null;
  ratingDistribution: { rating: number; count: number }[];
  hallucinationTrend: { date: string; rate: number }[];
  clarificationTrend: { date: string; rate: number }[];
  execTimeTrend: { date: string; avgMs: number }[];
  byLens: { lensId: string | null; count: number; avgRating: number | null; topVerdict: string | null }[];
}

export interface ProblematicPattern {
  planHash: string;
  occurrenceCount: number;
  avgUserRating: number | null;
  commonVerdicts: string[];
  commonFlags: string[];
  exampleMessages: string[];
}

export interface EvalExample {
  id: string;
  tenantId: string;
  turnId: string | null;
  userMessage: string;
  contextSnapshot: Record<string, unknown>;
  expectedPlan: Record<string, unknown>;
  expectedSql: string | null;
  category: string | null;
  difficulty: string | null;
  tags: string[] | null;
  isActive: boolean;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface AdminReviewPayload {
  verdict: AdminVerdict;
  score: number;
  notes?: string;
  action?: AdminAction;
}

export interface PromoteExamplePayload {
  category?: string;
  difficulty?: string;
  tags?: string[];
}
