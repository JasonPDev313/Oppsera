// ── Evaluation Infrastructure Types ────────────────────────────
// Used by capture service, feedback commands, queries, and admin panel

export interface EvalSession {
  id: string;
  tenantId: string;
  userId: string | null;
  sessionId: string | null;
  startedAt: string;
  endedAt: string | null;
  messageCount: number;
  avgUserRating: number | null;
  avgAdminScore: number | null;
  status: EvalSessionStatus;
  lensId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export type EvalSessionStatus = 'active' | 'completed' | 'flagged' | 'reviewed';

export interface EvalTurn {
  id: string;
  tenantId: string;
  sessionId: string;
  userId: string | null;
  userRole: string | null;
  turnNumber: number;

  // Input
  userMessage: string;
  contextSnapshot: Record<string, unknown> | null;

  // LLM plan
  llmProvider: string | null;
  llmModel: string | null;
  llmPlan: Record<string, unknown> | null;
  llmRationale: Record<string, unknown> | null;
  llmConfidence: number | null;
  llmTokensInput: number | null;
  llmTokensOutput: number | null;
  llmLatencyMs: number | null;
  planHash: string | null;
  wasClarification: boolean;
  clarificationMessage: string | null;

  // Compilation
  compiledSql: string | null;
  sqlHash: string | null;
  compilationErrors: string[] | null;
  safetyFlags: string[] | null;
  tablesAccessed: string[] | null;

  // Execution
  executionTimeMs: number | null;
  rowCount: number | null;
  resultSample: Record<string, unknown>[] | null;
  resultFingerprint: ResultFingerprint | null;
  executionError: string | null;
  cacheStatus: CacheStatus | null;

  // Response
  narrative: string | null;
  narrativeLensId: string | null;
  responseSections: string[] | null;
  playbooksFired: string[] | null;

  // User feedback
  userRating: number | null;
  userThumbsUp: boolean | null;
  userFeedbackText: string | null;
  userFeedbackTags: FeedbackTag[] | null;
  userFeedbackAt: string | null;

  // Admin review
  adminReviewerId: string | null;
  adminScore: number | null;
  adminVerdict: AdminVerdict | null;
  adminNotes: string | null;
  adminCorrectedPlan: Record<string, unknown> | null;
  adminCorrectedNarrative: string | null;
  adminReviewedAt: string | null;
  adminActionTaken: AdminAction | null;

  // Quality
  qualityScore: number | null;
  qualityFlags: QualityFlag[] | null;

  createdAt: string;
  updatedAt: string;
}

export interface EvalExample {
  id: string;
  tenantId: string | null;
  sourceEvalTurnId: string | null;
  question: string;
  plan: Record<string, unknown>;
  rationale: Record<string, unknown> | null;
  category: ExampleCategory;
  difficulty: ExampleDifficulty;
  qualityScore: number | null;
  isActive: boolean;
  addedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QualityDaily {
  id: string;
  tenantId: string;
  businessDate: string;
  totalTurns: number;
  avgUserRating: number | null;
  avgAdminScore: number | null;
  avgConfidence: number | null;
  avgExecutionTimeMs: number | null;
  clarificationRate: number | null;
  errorRate: number | null;
  hallucinationRate: number | null;
  cacheHitRate: number | null;
  topFailureReasons: { reason: string; count: number }[] | null;
  ratingDistribution: Record<string, number> | null;
  createdAt: string;
}

// ── Feedback & Review Inputs ────────────────────────────────────

export interface UserFeedbackInput {
  rating?: number; // 1-5
  thumbsUp?: boolean;
  text?: string;
  tags?: FeedbackTag[];
}

export interface AdminReviewInput {
  score: number; // 1-5
  verdict: AdminVerdict;
  notes?: string;
  correctedPlan?: Record<string, unknown>;
  correctedNarrative?: string;
  actionTaken: AdminAction;
}

export interface PromoteExampleInput {
  category: ExampleCategory;
  difficulty: ExampleDifficulty;
}

// ── Quality Score Configuration ─────────────────────────────────

export interface QualityScoreWeights {
  adminWeight: number;   // default 0.4
  userWeight: number;    // default 0.3
  heuristicWeight: number; // default 0.3
}

export const DEFAULT_QUALITY_WEIGHTS: QualityScoreWeights = {
  adminWeight: 0.4,
  userWeight: 0.3,
  heuristicWeight: 0.3,
};

// ── Result Fingerprint ──────────────────────────────────────────

export interface ResultFingerprint {
  rowCount: number;
  minDate: string | null;
  maxDate: string | null;
  nullRate: number; // 0.0 – 1.0
  columnCount: number;
}

// ── Enums ───────────────────────────────────────────────────────

export type FeedbackTag =
  | 'wrong_data'
  | 'slow'
  | 'confusing'
  | 'great_insight'
  | 'wrong_metric'
  | 'missing_context'
  | 'hallucination'
  | 'irrelevant'
  | 'too_verbose'
  | 'perfect';

export const FEEDBACK_TAGS: FeedbackTag[] = [
  'wrong_data',
  'slow',
  'confusing',
  'great_insight',
  'wrong_metric',
  'missing_context',
  'hallucination',
  'irrelevant',
  'too_verbose',
  'perfect',
];

export type AdminVerdict =
  | 'correct'
  | 'partially_correct'
  | 'incorrect'
  | 'hallucination'
  | 'needs_improvement';

export type AdminAction =
  | 'none'
  | 'added_to_examples'
  | 'adjusted_metric'
  | 'filed_bug'
  | 'updated_lens';

export type QualityFlag =
  | 'empty_result'
  | 'timeout'
  | 'low_confidence'
  | 'hallucinated_slug'
  | 'high_null_rate'
  | 'excessive_rows'
  | 'very_slow';

export type ExampleCategory =
  | 'sales'
  | 'golf'
  | 'inventory'
  | 'customer'
  | 'comparison'
  | 'trend'
  | 'anomaly';

export type ExampleDifficulty = 'simple' | 'medium' | 'complex';

export type CacheStatus = 'HIT' | 'MISS' | 'SKIP';

// ── LLM Plan Response (minimal interface for capture) ───────────
// Full interface defined in llm/types.ts; this is used by capture.ts

export interface LLMPlanResponse {
  plan: Record<string, unknown> | null;
  rationale: Record<string, unknown>;
  clarificationNeeded: boolean;
  clarificationMessage?: string;
  confidence: number;
}
