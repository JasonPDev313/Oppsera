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

// ── Promote Correction Payload ──────────────────────────────────
// Uses adminCorrectedPlan (the fixed version) instead of llmPlan.

export interface PromoteCorrectionPayload {
  category: string;
  difficulty: string;
}

// ── Example CRUD ────────────────────────────────────────────────

export interface CreateExamplePayload {
  question: string;
  plan: Record<string, unknown>;
  rationale?: Record<string, unknown> | null;
  category: string;
  difficulty: string;
  tenantId?: string | null;
  tags?: string[];
  notes?: string;
}

export interface UpdateExamplePayload {
  question?: string;
  plan?: Record<string, unknown>;
  rationale?: Record<string, unknown> | null;
  category?: string;
  difficulty?: string;
  tags?: string[];
  notes?: string;
}

export interface BulkImportPayload {
  examples: {
    question: string;
    plan: Record<string, unknown>;
    rationale?: Record<string, unknown> | null;
    category: string;
    difficulty: string;
    tenantId?: string | null;
  }[];
}

export interface ExampleEffectiveness {
  usageCount: number;
  avgQualityWhenUsed: number | null;
  lastUsedAt: string | null;
  verificationStatus: 'verified' | 'unverified' | 'degraded';
}

// ── A/B Experiments ─────────────────────────────────────────────

export interface Experiment {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'running' | 'completed' | 'canceled';
  hypothesis: string | null;
  controlName: string;
  controlSystemPrompt: string | null;
  controlModel: string | null;
  controlTemperature: number | null;
  treatmentName: string;
  treatmentSystemPrompt: string | null;
  treatmentModel: string | null;
  treatmentTemperature: number | null;
  trafficSplitPct: number;
  targetSampleSize: number | null;
  tenantId: string | null;
  controlTurns: number;
  treatmentTurns: number;
  controlAvgRating: number | null;
  treatmentAvgRating: number | null;
  controlAvgQuality: number | null;
  treatmentAvgQuality: number | null;
  controlAvgLatencyMs: number | null;
  treatmentAvgLatencyMs: number | null;
  controlTotalCostUsd: number | null;
  treatmentTotalCostUsd: number | null;
  winner: 'control' | 'treatment' | 'inconclusive' | null;
  conclusionNotes: string | null;
  createdBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExperimentPayload {
  name: string;
  description?: string;
  hypothesis?: string;
  controlName?: string;
  controlSystemPrompt?: string;
  controlModel?: string;
  controlTemperature?: number;
  treatmentName?: string;
  treatmentSystemPrompt?: string;
  treatmentModel?: string;
  treatmentTemperature?: number;
  trafficSplitPct?: number;
  targetSampleSize?: number;
  tenantId?: string;
}

export interface ExperimentListResponse {
  experiments: Experiment[];
  cursor: string | null;
  hasMore: boolean;
}

// ── Regression Testing ──────────────────────────────────────────

export interface RegressionRun {
  id: string;
  name: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  triggerType: 'manual' | 'scheduled' | 'pre_deploy';
  exampleCount: number;
  categoryFilter: string | null;
  totalExamples: number;
  passed: number;
  failed: number;
  errored: number;
  passRate: number | null;
  avgLatencyMs: number | null;
  totalCostUsd: number | null;
  modelConfig: Record<string, unknown> | null;
  promptSnapshot: string | null;
  createdBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface RegressionResult {
  id: string;
  runId: string;
  exampleId: string;
  status: 'passed' | 'failed' | 'errored';
  expectedPlan: Record<string, unknown> | null;
  actualPlan: Record<string, unknown> | null;
  planMatch: boolean | null;
  expectedSql: string | null;
  actualSql: string | null;
  sqlMatch: boolean | null;
  executionTimeMs: number | null;
  rowCount: number | null;
  executionError: string | null;
  costUsd: number | null;
  diffSummary: string | null;
  createdAt: string;
}

export interface RegressionRunDetail extends RegressionRun {
  results: RegressionResult[];
}

export interface RegressionTrend {
  runId: string;
  name: string | null;
  createdAt: string;
  passRate: number | null;
  totalExamples: number;
  avgLatencyMs: number | null;
}

export interface RegressionListResponse {
  runs: RegressionRun[];
  cursor: string | null;
  hasMore: boolean;
}

// ── Safety Rules ────────────────────────────────────────────────

export type SafetyRuleType = 'pii_detection' | 'injection_detection' | 'table_access' | 'row_limit' | 'custom_regex';
export type SafetySeverity = 'info' | 'warning' | 'critical';

export interface SafetyRule {
  id: string;
  name: string;
  description: string | null;
  ruleType: SafetyRuleType;
  isActive: boolean;
  severity: SafetySeverity;
  config: Record<string, unknown>;
  triggerCount: number;
  lastTriggeredAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSafetyRulePayload {
  name: string;
  description?: string;
  ruleType: SafetyRuleType;
  severity?: SafetySeverity;
  config: Record<string, unknown>;
}

export interface SafetyViolation {
  id: string;
  ruleId: string;
  evalTurnId: string | null;
  tenantId: string | null;
  severity: string;
  ruleType: string;
  details: Record<string, unknown> | null;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  ruleName?: string;
}

export interface SafetyViolationListResponse {
  violations: SafetyViolation[];
  cursor: string | null;
  hasMore: boolean;
}

// ── Cost Analytics ──────────────────────────────────────────────

export interface CostDaily {
  id: string;
  tenantId: string | null;
  businessDate: string;
  totalTurns: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  totalCostUsd: number;
  avgCostPerQuery: number | null;
  modelBreakdown: Record<string, unknown> | null;
  lensBreakdown: Record<string, unknown> | null;
  createdAt: string;
}

export interface CostTrend {
  date: string;
  totalTurns: number;
  totalCostUsd: number;
  avgCostPerQuery: number | null;
}

export interface CostSummary {
  totalCostUsd: number;
  totalTurns: number;
  avgCostPerQuery: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  dailyData: CostDaily[];
}

// ── Batch Review ────────────────────────────────────────────────

export interface ReviewAssignment {
  id: string;
  evalTurnId: string;
  assignedTo: string;
  assignedBy: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  // Enriched from turn
  turnUserMessage?: string;
  turnQualityScore?: number | null;
  turnQualityFlags?: string[] | null;
}

export interface BatchReviewQueue {
  assignments: ReviewAssignment[];
  cursor: string | null;
  hasMore: boolean;
  stats: {
    pending: number;
    inProgress: number;
    completed: number;
    skipped: number;
  };
}

export interface AssignReviewPayload {
  evalTurnIds: string[];
  assignedTo: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  dueAt?: string;
}

// ── Conversation Analysis ───────────────────────────────────────

export interface ConversationSummary {
  sessionId: string;
  tenantId: string;
  userId: string;
  userRole: string;
  messageCount: number;
  avgQualityScore: number | null;
  avgUserRating: number | null;
  clarificationCount: number;
  errorCount: number;
  totalCostUsd: number | null;
  startedAt: string;
  endedAt: string | null;
}

export interface ConversationDetail extends ConversationSummary {
  turns: EvalTurnSummary[];
  qualityTrend: { turnNumber: number; qualityScore: number | null }[];
}

export interface ConversationListResponse {
  conversations: ConversationSummary[];
  cursor: string | null;
  hasMore: boolean;
}

// ── Playground ──────────────────────────────────────────────────

export interface PlaygroundRequest {
  question: string;
  tenantId?: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface PlaygroundResult {
  intent: Record<string, unknown> | null;
  plan: Record<string, unknown> | null;
  compiledSql: string | null;
  executionResult: Record<string, unknown>[] | null;
  narrative: string | null;
  latencyMs: number;
  tokensUsed: { input: number; output: number };
  costUsd: number | null;
  qualityFlags: string[];
  error: string | null;
}

// ── Comparative Analysis ────────────────────────────────────────

export interface ComparativeMetric {
  key: string;
  count: number;
  avgRating: number | null;
  avgQuality: number | null;
  avgLatencyMs: number | null;
  errorRate: number;
}

export interface ComparativeAnalysis {
  byModel: ComparativeMetric[];
  byLens: ComparativeMetric[];
  byProvider: ComparativeMetric[];
}
