export const MODULE_KEY = 'semantic' as const;
export const MODULE_NAME = 'AI Insights / Semantic Layer';
export const MODULE_VERSION = '0.1.0';

/** SQL tables owned by this module — used by extraction tooling */
export const MODULE_TABLES = [
  'semantic_metrics',
  'semantic_dimensions',
  'semantic_metric_dimensions',
  'semantic_table_sources',
  'semantic_lenses',
  'semantic_narrative_config',
  'semantic_query_cache',
  'semantic_eval_sessions',
  'semantic_eval_turns',
  'semantic_eval_examples',
  'semantic_eval_quality_daily',
  'semantic_anomaly_configs',
  'semantic_anomaly_results',
  'semantic_alert_notifications',
  'semantic_correlation_cache',
  'semantic_forecast_models',
  'semantic_eval_experiments',
  'semantic_eval_experiment_variants',
  'semantic_eval_experiment_results',
  'semantic_eval_regression_suites',
  'semantic_eval_regression_cases',
  'semantic_eval_regression_runs',
  'semantic_eval_regression_case_results',
  'semantic_eval_cost_daily',
] as const;

// ── Evaluation infrastructure ─────────────────────────────────
export * from './evaluation';

// ── Semantic registry ─────────────────────────────────────────
export * from './registry';

// ── Query compiler ────────────────────────────────────────────
export * from './compiler';

// ── LLM integration layer ─────────────────────────────────────
export * from './llm';

// ── Custom Lenses ─────────────────────────────────────────────
export * from './lenses';

// ── Cache layer ───────────────────────────────────────────────
export * from './cache';

// ── Observability ─────────────────────────────────────────────
export * from './observability';

// ── Intelligence services (proactive AI) ─────────────────────
export * from './intelligence';

// ── RAG training store ───────────────────────────────────────
export * from './rag';

// ── Narrative config ─────────────────────────────────────────
export * from './config';

// ── PII masking ──────────────────────────────────────────────
export { maskRowsForLLM, maskFreeText } from './pii/pii-masker';

// ── MCP resource exposure ─────────────────────────────────────
export * from './mcp';
