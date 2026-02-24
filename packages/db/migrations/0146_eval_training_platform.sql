-- Migration 0146: Eval Training Platform Enhancement
-- Adds tables for experiments, regression testing, safety rules, cost tracking,
-- and extends existing eval tables with usage/effectiveness tracking.

-- Extend semantic_eval_examples with lifecycle tracking
ALTER TABLE semantic_eval_examples ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE semantic_eval_examples ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE semantic_eval_examples ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE semantic_eval_examples ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified';
--> statement-breakpoint
ALTER TABLE semantic_eval_examples ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE semantic_eval_examples ADD COLUMN IF NOT EXISTS notes TEXT;
--> statement-breakpoint

-- Extend semantic_eval_turns with experiment tracking
ALTER TABLE semantic_eval_turns ADD COLUMN IF NOT EXISTS experiment_id TEXT;
--> statement-breakpoint
ALTER TABLE semantic_eval_turns ADD COLUMN IF NOT EXISTS experiment_variant TEXT;
--> statement-breakpoint
ALTER TABLE semantic_eval_turns ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(10,6);
--> statement-breakpoint
ALTER TABLE semantic_eval_turns ADD COLUMN IF NOT EXISTS safety_issues JSONB;
--> statement-breakpoint

-- A/B Experiments
CREATE TABLE IF NOT EXISTS semantic_eval_experiments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  hypothesis TEXT,
  control_name TEXT NOT NULL DEFAULT 'Control',
  control_system_prompt TEXT,
  control_model TEXT,
  control_temperature NUMERIC(3,2),
  treatment_name TEXT NOT NULL DEFAULT 'Treatment',
  treatment_system_prompt TEXT,
  treatment_model TEXT,
  treatment_temperature NUMERIC(3,2),
  traffic_split_pct INTEGER NOT NULL DEFAULT 50,
  target_sample_size INTEGER DEFAULT 100,
  tenant_id TEXT,
  control_turns INTEGER NOT NULL DEFAULT 0,
  treatment_turns INTEGER NOT NULL DEFAULT 0,
  control_avg_rating NUMERIC(3,2),
  treatment_avg_rating NUMERIC(3,2),
  control_avg_quality NUMERIC(3,2),
  treatment_avg_quality NUMERIC(3,2),
  control_avg_latency_ms INTEGER,
  treatment_avg_latency_ms INTEGER,
  control_total_cost_usd NUMERIC(10,4) DEFAULT 0,
  treatment_total_cost_usd NUMERIC(10,4) DEFAULT 0,
  winner TEXT,
  conclusion_notes TEXT,
  created_by TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_eval_experiments_status ON semantic_eval_experiments (status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_eval_experiments_tenant ON semantic_eval_experiments (tenant_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_eval_turns_experiment ON semantic_eval_turns (experiment_id) WHERE experiment_id IS NOT NULL;
--> statement-breakpoint

-- Regression Test Runs
CREATE TABLE IF NOT EXISTS semantic_eval_regression_runs (
  id TEXT PRIMARY KEY,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  example_count INTEGER NOT NULL DEFAULT 0,
  category_filter TEXT,
  total_examples INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  errored INTEGER NOT NULL DEFAULT 0,
  pass_rate NUMERIC(5,2),
  avg_latency_ms INTEGER,
  total_cost_usd NUMERIC(10,4) DEFAULT 0,
  model_config JSONB,
  prompt_snapshot TEXT,
  created_by TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_eval_regression_status ON semantic_eval_regression_runs (status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_eval_regression_created ON semantic_eval_regression_runs (created_at DESC);
--> statement-breakpoint

-- Regression Test Results (per-example)
CREATE TABLE IF NOT EXISTS semantic_eval_regression_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES semantic_eval_regression_runs(id) ON DELETE CASCADE,
  example_id TEXT NOT NULL REFERENCES semantic_eval_examples(id),
  status TEXT NOT NULL,
  expected_plan JSONB,
  actual_plan JSONB,
  plan_match BOOLEAN,
  expected_sql TEXT,
  actual_sql TEXT,
  sql_match BOOLEAN,
  execution_time_ms INTEGER,
  row_count INTEGER,
  execution_error TEXT,
  cost_usd NUMERIC(10,6),
  diff_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_eval_regression_results_run ON semantic_eval_regression_results (run_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_eval_regression_results_status ON semantic_eval_regression_results (run_id, status);
--> statement-breakpoint

-- Safety Rules
CREATE TABLE IF NOT EXISTS semantic_eval_safety_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  rule_type TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  severity TEXT NOT NULL DEFAULT 'warning',
  config JSONB NOT NULL DEFAULT '{}',
  trigger_count INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_eval_safety_rules_active ON semantic_eval_safety_rules (is_active, rule_type);
--> statement-breakpoint

-- Safety Violations Log
CREATE TABLE IF NOT EXISTS semantic_eval_safety_violations (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES semantic_eval_safety_rules(id),
  eval_turn_id TEXT REFERENCES semantic_eval_turns(id),
  tenant_id TEXT,
  severity TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  details JSONB,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_eval_safety_violations_rule ON semantic_eval_safety_violations (rule_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_eval_safety_violations_unresolved ON semantic_eval_safety_violations (resolved, created_at DESC) WHERE resolved = false;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_eval_safety_violations_turn ON semantic_eval_safety_violations (eval_turn_id) WHERE eval_turn_id IS NOT NULL;
--> statement-breakpoint

-- Cost Tracking Aggregation (daily)
CREATE TABLE IF NOT EXISTS semantic_eval_cost_daily (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  business_date DATE NOT NULL,
  total_turns INTEGER NOT NULL DEFAULT 0,
  total_tokens_input INTEGER NOT NULL DEFAULT 0,
  total_tokens_output INTEGER NOT NULL DEFAULT 0,
  total_cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
  avg_cost_per_query NUMERIC(10,6),
  model_breakdown JSONB,
  lens_breakdown JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS idx_eval_cost_daily_tenant_date
  ON semantic_eval_cost_daily (COALESCE(tenant_id, '__global__'), business_date);
--> statement-breakpoint

-- Review Assignments
CREATE TABLE IF NOT EXISTS semantic_eval_review_assignments (
  id TEXT PRIMARY KEY,
  eval_turn_id TEXT NOT NULL REFERENCES semantic_eval_turns(id),
  assigned_to TEXT NOT NULL,
  assigned_by TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'pending',
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_eval_review_assignments_assignee
  ON semantic_eval_review_assignments (assigned_to, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_eval_review_assignments_turn
  ON semantic_eval_review_assignments (eval_turn_id);
