// ── Evaluation Infrastructure — Barrel Export ──────────────────

// Types
export type {
  EvalSession,
  EvalSessionStatus,
  EvalTurn,
  EvalExample,
  QualityDaily,
  UserFeedbackInput,
  AdminReviewInput,
  PromoteExampleInput,
  QualityScoreWeights,
  ResultFingerprint,
  FeedbackTag,
  AdminVerdict,
  AdminAction,
  QualityFlag,
  ExampleCategory,
  ExampleDifficulty,
  CacheStatus,
  LLMPlanResponse,
} from './types';
export { DEFAULT_QUALITY_WEIGHTS, FEEDBACK_TAGS } from './types';

// Capture service
export {
  getEvalCaptureService,
  setEvalCaptureService,
  computeQualityFlags,
  computeQualityScore,
  computePlanHash,
  computeSqlHash,
} from './capture';
export type { EvalCaptureServiceInterface, RecordTurnInput } from './capture';

// Feedback commands
export { submitUserRating, submitAdminReview, promoteToExample } from './feedback';

// Queries
export {
  getEvalFeed,
  getEvalTurnDetail,
  getEvalSession,
  listEvalSessions,
  getQualityDashboard,
  getGoldenExamples,
  getProblematicPatterns,
  getComparativeAnalysis,
} from './queries';
export type {
  EvalFeedFilters,
  EvalFeedResult,
  EvalFeedSortBy,
  EvalFeedStatus,
  EvalSessionSummary,
  EvalSessionListResult,
  QualityDashboardData,
  ProblematicPattern,
  ComparativeAnalysis,
} from './queries';

// Aggregation
export { aggregateQualityDaily } from './aggregation';
export type { AggregationOptions, AggregationResult } from './aggregation';

// Example manager
export { getExampleManager, setExampleManager } from './example-manager';
export type { ExampleManagerInterface, GetExamplesForPromptOptions } from './example-manager';

// Validation schemas
export {
  userFeedbackSchema,
  adminReviewSchema,
  promoteExampleSchema,
  feedFilterSchema,
} from './validation';
export type {
  UserFeedbackBody,
  UserFeedbackParsed,
  AdminReviewBody,
  AdminReviewParsed,
  PromoteExampleBody,
  PromoteExampleParsed,
  FeedFilterBody,
  FeedFilterParsed,
} from './validation';

// Batch review
export {
  getReviewQueue,
  getNextForReview,
  assignTurnsForReview,
  autoAssignUnreviewed,
  skipReview,
  completeReviewAssignment,
  getReviewStats,
  bulkReview,
} from './batch-review';
export type {
  ReviewPriority,
  ReviewAssignmentStatus,
  ReviewAssignment,
  ReviewQueueItem,
  ReviewQueueFilters,
  AssignTurnsInput,
  AutoAssignConfig,
  ReviewStats,
  BulkReviewItem,
  BulkReviewResult,
} from './batch-review';

// Conversation analysis
export {
  getConversationDetail,
  getConversationMetrics,
  getTopicClusters,
  getAbandonedSessions,
  getMultiTurnCoherence,
  getSessionFlow,
} from './conversation-analysis';
export type {
  ConversationDetail,
  ConversationMetrics,
  TopicCluster,
  AbandonedSessionSummary,
  MultiTurnCoherence,
  SessionFlowTurn,
  SessionFlow,
} from './conversation-analysis';

// Example CRUD
export {
  createExample,
  updateExample,
  bulkImportExamples,
  exportExamples,
  getExampleEffectiveness,
  incrementExampleUsage,
  promoteCorrection,
} from './example-crud';
export type {
  CreateExampleInput,
  UpdateExampleInput,
  BulkImportExampleItem,
  ExportExamplesFilters,
  ExampleEffectiveness,
} from './example-crud';

// Regression runner
export {
  getRegressionPipeline,
  setRegressionPipeline,
  comparePlans,
  startRegressionRun,
  executeRegressionExample,
  completeRegressionRun,
  getRegressionRun,
  listRegressionRuns,
  getRegressionTrend,
} from './regression-runner';
export type {
  RegressionPipelineResult,
  RegressionPipelineInterface,
  StartRegressionRunInput,
  RegressionResult,
  RegressionRun,
  RegressionRunWithResults,
  ListRegressionRunsFilters,
  ListRegressionRunsResult,
  RegressionTrendPoint,
  PlanComparison,
} from './regression-runner';

// A/B Experiments
export {
  createExperiment,
  startExperiment,
  stopExperiment,
  cancelExperiment,
  getExperiment,
  listExperiments,
  routeToVariant,
  getActiveExperiment,
  updateExperimentStats,
} from './experiments';
export type {
  ExperimentStatus,
  ExperimentWinner,
  ExperimentVariant,
  ExperimentInput,
  ExperimentStats,
  Experiment,
  ListExperimentsFilters,
  ListExperimentsResult,
} from './experiments';

// Cost analytics
export {
  computeQueryCost,
  aggregateCostDaily,
  getCostDashboard,
  getCostByTenant,
  getCostProjection,
  MODEL_PRICING,
} from './cost-analytics';
export type {
  ModelPricing,
  CostDashboardData,
  TenantCostRow,
  CostProjection,
} from './cost-analytics';

// Safety engine
export {
  createSafetyRule,
  updateSafetyRule,
  toggleSafetyRule,
  listSafetyRules,
  getSafetyRule,
  evaluateSafety,
  recordSafetyViolation,
  getSafetyDashboard,
  resolveViolation,
  listViolations,
} from './safety-engine';
export type {
  SafetyRuleType,
  SafetySeverity,
  PiiDetectionConfig,
  InjectionDetectionConfig,
  TableAccessConfig,
  RowLimitConfig,
  CustomRegexConfig,
  SafetyRuleConfig,
  SafetyRuleInput,
  SafetyRule,
  SafetyViolation,
  SafetyEvaluationResult,
  SafetyTurnData,
  PersistedViolation,
  SafetyDashboardData,
  ListViolationsFilters,
  ListViolationsResult,
} from './safety-engine';
