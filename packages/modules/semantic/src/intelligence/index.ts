// ── Intelligence Services Barrel Export ──────────────────────────
// Tier 1 + Tier 2 proactive intelligence features for the semantic layer.

// Anomaly detection — statistical deviation scanning on rm_daily_sales
export {
  runAnomalyDetection,
  checkAlertRules,
} from './anomaly-detector';
export type {
  AnomalyResult,
  AnomalySensitivity,
  AnomalySignificance,
} from './anomaly-detector';

// Scheduled digest generation — periodic LLM-powered summaries
export {
  generateDigest,
  getDigestsDueNow,
} from './digest-generator';
export type {
  DigestConfig,
  DigestType,
  DigestKpis,
  DigestResult,
} from './digest-generator';

// Metric pacing / goal tracking — progress toward targets
export {
  calculatePacing,
  calculateAllPacing,
} from './pacing-calculator';
export type { PacingResult } from './pacing-calculator';

// Cross-session user preference tracking — personalized suggestions
export {
  trackUserInteraction,
  getUserPreferences,
  getPersonalizedSuggestions,
} from './preference-tracker';
export type {
  UserPreferences,
  FrequentQuestion,
} from './preference-tracker';

// Shareable insight links — snapshot + token-based sharing
export {
  createSharedInsight,
  getSharedInsight,
  listSharedInsights,
} from './shared-insights';
export type {
  SharedInsight,
  CreateSharedInsightInput,
} from './shared-insights';

// ── Tier 2 + Tier 3 ────────────────────────────────────────────

// Smart follow-up suggestions — heuristic-based, no LLM call
export { generateFollowUps } from './follow-up-generator';
export type { FollowUpContext } from './follow-up-generator';

// What-if scenario simulator — price/volume/cost modeling with LLM narrative
export {
  runSimulation,
  parseSimulationIntent,
} from './whatif-simulator';
export type {
  SimulationInput,
  SimulationResult,
  ScenarioInput,
  ScenarioAdjustment,
  ComputedScenario,
  ChangeType,
} from './whatif-simulator';

// Background analyst — agentic trend/correlation/goal scanning
export {
  runBackgroundAnalysis,
  getUnreadFindings,
  markFindingRead,
  dismissFinding,
} from './background-analyst';
export type {
  AnalysisFinding,
  FindingType,
  FindingPriority,
  SparklinePoint,
} from './background-analyst';

// Role-based insight feed — personalized KPIs and suggestions per role
export { getRoleInsightFeed } from './role-feed';
export type {
  RoleFeedResult,
  KpiCard,
  DigestSummary,
} from './role-feed';

// Voice input processing — transcript normalization for semantic pipeline
export { processVoiceTranscription } from './voice-input';
export type {
  VoiceResult,
  VoiceCommand,
} from './voice-input';

// Root cause analysis — "Why did X change?" decomposition
export { analyzeRootCause } from './root-cause-analyzer';
export type {
  RootCauseResult,
  RootCauseDateRange,
  RootCauseOptions,
  Contributor,
  ContributionDirection,
} from './root-cause-analyzer';

// Correlation engine — statistical correlation discovery across metrics
export { discoverCorrelations } from './correlation-engine';
export type {
  CorrelationResult,
  CorrelationOptions,
  MetricCorrelation,
  CorrelationStrength,
  CorrelationDirection,
} from './correlation-engine';

// Predictive forecaster — trend extrapolation with confidence intervals
export { generateForecast } from './predictive-forecaster';
export type {
  ForecastResult,
  ForecastOptions,
  ForecastMethod,
  ForecastPoint,
  DataPoint,
  TrendDirection,
} from './predictive-forecaster';

// Data quality scorer — per-response quality indicators (pure function)
export { scoreDataQuality } from './data-quality-scorer';
export type {
  DataQualityResult,
  DataQualityInput,
  QualityFactor,
  QualityGrade,
} from './data-quality-scorer';

// Agentic orchestrator — multi-step Think→Act→Observe analysis
export { runAgenticAnalysis } from './agentic-orchestrator';
export type {
  AgenticResult,
  AgenticContext,
  AnalysisStep,
} from './agentic-orchestrator';

// NL report builder — natural language → report definition via LLM
export { buildReportFromNL } from './nl-report-builder';
export type {
  NLReportResult,
  NLReportContext,
  DraftReportDef,
} from './nl-report-builder';

// Multi-language support — detection, prompt wrapping, keyword translation
export {
  detectLanguage,
  wrapPromptForLanguage,
  normalizeQueryForEnglish,
} from './multi-language';
export type {
  LanguageDetection,
  NormalizedQuery,
} from './multi-language';

// Scheduled delivery — recurring AI report generation and delivery
export {
  createSchedule,
  updateSchedule,
  deleteSchedule,
  listSchedules,
  getSchedule,
  getSchedulesDue,
  executeScheduledDelivery,
} from './scheduled-delivery';
export type {
  CreateScheduleInput,
  UpdateScheduleInput,
  ListSchedulesOptions,
  ScheduledReport,
} from './scheduled-delivery';
