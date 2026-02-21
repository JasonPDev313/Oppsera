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
