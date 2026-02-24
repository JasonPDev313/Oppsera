-- Migration 0147: AI Proactive Intelligence
-- Adds tables for: anomaly alerts, scheduled digests, metric goals/pacing,
-- shared insights, user AI preferences, alert rules, background analysis findings,
-- what-if simulations

-- -- 1. Metric Goals (Pacing / Goal Tracking) -----------------------
CREATE TABLE IF NOT EXISTS semantic_metric_goals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  metric_slug TEXT NOT NULL,
  target_value NUMERIC(19,4) NOT NULL,
  period_type TEXT NOT NULL DEFAULT 'monthly', -- daily|weekly|monthly|quarterly|yearly
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  location_id TEXT,
  created_by TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_metric_goals_tenant_active
  ON semantic_metric_goals (tenant_id, is_active, period_type);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_metric_goals_tenant_metric
  ON semantic_metric_goals (tenant_id, metric_slug, is_active);
--> statement-breakpoint

ALTER TABLE semantic_metric_goals ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS metric_goals_tenant_isolation ON semantic_metric_goals;
--> statement-breakpoint
CREATE POLICY metric_goals_tenant_isolation ON semantic_metric_goals
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
--> statement-breakpoint

-- -- 2. Alert Rules (NL-configured + system-generated) --------------
CREATE TABLE IF NOT EXISTS semantic_alert_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  -- Rule definition
  name TEXT NOT NULL,
  description TEXT,
  rule_type TEXT NOT NULL DEFAULT 'threshold', -- threshold|anomaly|pacing|trend|custom
  metric_slug TEXT,
  -- Threshold config (for threshold type)
  threshold_operator TEXT, -- gt|lt|gte|lte|eq|change_pct
  threshold_value NUMERIC(19,4),
  -- Anomaly config (for anomaly type)
  sensitivity TEXT DEFAULT 'medium', -- low|medium|high
  baseline_window_days INTEGER DEFAULT 30,
  -- Delivery config
  delivery_channels JSONB NOT NULL DEFAULT '["in_app"]'::jsonb, -- ["in_app","email","slack"]
  schedule TEXT DEFAULT 'realtime', -- realtime|daily|weekly
  -- Filters
  location_id TEXT,
  dimension_filters JSONB, -- optional dimension constraints
  -- NL source
  original_nl_query TEXT, -- the natural language that created this rule
  -- Lifecycle
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  cooldown_minutes INTEGER NOT NULL DEFAULT 60,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_alert_rules_tenant_active
  ON semantic_alert_rules (tenant_id, is_active, rule_type);
--> statement-breakpoint

ALTER TABLE semantic_alert_rules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS alert_rules_tenant_isolation ON semantic_alert_rules;
--> statement-breakpoint
CREATE POLICY alert_rules_tenant_isolation ON semantic_alert_rules
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
--> statement-breakpoint

-- -- 3. Alert Notifications (triggered alerts) ----------------------
CREATE TABLE IF NOT EXISTS semantic_alert_notifications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  alert_rule_id TEXT NOT NULL REFERENCES semantic_alert_rules(id),
  -- Alert content
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info', -- info|warning|critical
  -- Data context
  metric_slug TEXT,
  metric_value NUMERIC(19,4),
  baseline_value NUMERIC(19,4),
  deviation_pct NUMERIC(8,2),
  business_date DATE,
  location_id TEXT,
  -- Delivery
  channels_sent JSONB DEFAULT '[]'::jsonb,
  -- User interaction
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  dismissed_at TIMESTAMPTZ,
  action_taken TEXT, -- acknowledge|investigate|snooze|dismiss
  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_alert_notifications_tenant_unread
  ON semantic_alert_notifications (tenant_id, is_read, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_alert_notifications_rule
  ON semantic_alert_notifications (alert_rule_id, created_at DESC);
--> statement-breakpoint

ALTER TABLE semantic_alert_notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS alert_notifications_tenant_isolation ON semantic_alert_notifications;
--> statement-breakpoint
CREATE POLICY alert_notifications_tenant_isolation ON semantic_alert_notifications
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
--> statement-breakpoint

-- -- 4. Scheduled Insight Digests ------------------------------------
CREATE TABLE IF NOT EXISTS semantic_insight_digests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  -- Config
  digest_type TEXT NOT NULL DEFAULT 'daily', -- daily|weekly|monthly
  schedule_day INTEGER, -- 0-6 for weekly (0=Sun), 1-28 for monthly
  schedule_hour INTEGER NOT NULL DEFAULT 8, -- UTC hour to generate
  -- Content
  target_role TEXT, -- owner|manager|cashier|server|staff|all
  target_user_id TEXT, -- specific user, or null for role-based
  metric_slugs JSONB, -- specific metrics to include, null = auto-select
  location_id TEXT,
  -- Generated content (filled when digest runs)
  last_generated_at TIMESTAMPTZ,
  last_narrative TEXT, -- cached markdown narrative
  last_sections JSONB, -- cached NarrativeSection[]
  last_kpis JSONB, -- { slug: value }[]
  -- Delivery
  delivery_channels JSONB NOT NULL DEFAULT '["in_app"]'::jsonb,
  -- Lifecycle
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_insight_digests_tenant_active
  ON semantic_insight_digests (tenant_id, is_active, digest_type);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_insight_digests_schedule
  ON semantic_insight_digests (is_active, schedule_hour) WHERE is_active = true;
--> statement-breakpoint

ALTER TABLE semantic_insight_digests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS insight_digests_tenant_isolation ON semantic_insight_digests;
--> statement-breakpoint
CREATE POLICY insight_digests_tenant_isolation ON semantic_insight_digests
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
--> statement-breakpoint

-- -- 5. Shared Insights (shareable links) ----------------------------
CREATE TABLE IF NOT EXISTS semantic_shared_insights (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  -- Source reference
  eval_turn_id TEXT REFERENCES semantic_eval_turns(id),
  session_id TEXT,
  -- Snapshot of the insight (immutable)
  title TEXT,
  user_message TEXT NOT NULL,
  narrative TEXT NOT NULL,
  sections JSONB, -- NarrativeSection[]
  query_result JSONB, -- first 50 rows
  chart_config JSONB, -- saved chart configuration
  mode TEXT, -- metrics|sql
  -- Access control
  share_token TEXT NOT NULL UNIQUE, -- URL-safe random token
  access_level TEXT NOT NULL DEFAULT 'tenant', -- tenant|specific_users|public_link
  allowed_user_ids JSONB, -- for specific_users mode
  -- Lifecycle
  expires_at TIMESTAMPTZ, -- null = never expires
  view_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_shared_insights_token
  ON semantic_shared_insights (share_token);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_shared_insights_tenant
  ON semantic_shared_insights (tenant_id, created_at DESC);
--> statement-breakpoint

ALTER TABLE semantic_shared_insights ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS shared_insights_tenant_isolation ON semantic_shared_insights;
--> statement-breakpoint
CREATE POLICY shared_insights_tenant_isolation ON semantic_shared_insights
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
--> statement-breakpoint

-- -- 6. User AI Preferences (cross-session memory) ------------------
CREATE TABLE IF NOT EXISTS semantic_user_preferences (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL,
  -- Preferences
  preferred_metrics JSONB, -- frequently asked metric slugs with frequency count
  preferred_dimensions JSONB, -- preferred grouping dimensions
  preferred_granularity TEXT, -- daily|weekly|monthly
  preferred_location_id TEXT,
  default_date_range TEXT, -- last_7_days|last_30_days|this_month|etc
  -- Behavioral memory
  frequent_questions JSONB, -- top N questions with timestamps
  topic_interests JSONB, -- { topic: score } derived from questions
  last_session_context JSONB, -- last conversation context for continuity
  -- Display preferences
  preferred_chart_type TEXT, -- line|bar|table|auto
  show_debug_panel BOOLEAN DEFAULT false,
  auto_expand_tables BOOLEAN DEFAULT true,
  -- Role-based customization
  insight_feed_role TEXT, -- override role for insight feed
  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_user_prefs_tenant_user
  ON semantic_user_preferences (tenant_id, user_id);
--> statement-breakpoint

ALTER TABLE semantic_user_preferences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS user_prefs_tenant_isolation ON semantic_user_preferences;
--> statement-breakpoint
CREATE POLICY user_prefs_tenant_isolation ON semantic_user_preferences
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
--> statement-breakpoint

-- -- 7. Background Analysis Findings (agentic overnight scan) --------
CREATE TABLE IF NOT EXISTS semantic_analysis_findings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  -- Finding details
  finding_type TEXT NOT NULL, -- anomaly|trend|correlation|forecast|pattern|opportunity
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  detailed_narrative TEXT,
  -- Data context
  metric_slugs JSONB, -- metrics involved
  dimension_values JSONB, -- specific dimension values (location, item, etc.)
  business_date_start DATE,
  business_date_end DATE,
  -- Statistical context
  confidence NUMERIC(3,2), -- 0.00–1.00
  significance_score NUMERIC(5,2), -- z-score or similar
  baseline_value NUMERIC(19,4),
  observed_value NUMERIC(19,4),
  change_pct NUMERIC(8,2),
  -- Visualization hint
  chart_type TEXT, -- line|bar|sparkline|comparison
  chart_data JSONB, -- pre-computed chart data points
  -- Priority & lifecycle
  priority TEXT NOT NULL DEFAULT 'medium', -- low|medium|high|critical
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  is_actionable BOOLEAN NOT NULL DEFAULT true,
  suggested_actions JSONB, -- ["Check ribeye pricing", "Review Wednesday staffing"]
  -- Analysis metadata
  analysis_run_id TEXT, -- batch ID for the overnight run
  analysis_duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_analysis_findings_tenant_unread
  ON semantic_analysis_findings (tenant_id, is_read, priority, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_analysis_findings_tenant_type
  ON semantic_analysis_findings (tenant_id, finding_type, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_analysis_findings_run
  ON semantic_analysis_findings (analysis_run_id);
--> statement-breakpoint

ALTER TABLE semantic_analysis_findings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS analysis_findings_tenant_isolation ON semantic_analysis_findings;
--> statement-breakpoint
CREATE POLICY analysis_findings_tenant_isolation ON semantic_analysis_findings
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
--> statement-breakpoint

-- -- 8. What-If Simulations ------------------------------------------
CREATE TABLE IF NOT EXISTS semantic_simulations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  -- Simulation definition
  title TEXT NOT NULL,
  description TEXT,
  simulation_type TEXT NOT NULL, -- price_change|volume_change|cost_change|staffing|custom
  -- Input parameters
  base_metric_slug TEXT NOT NULL,
  base_value NUMERIC(19,4) NOT NULL, -- current actual value
  -- Scenarios (multiple per simulation)
  scenarios JSONB NOT NULL, -- [{ name, adjustments: [{ variable, changeType, changeValue }], projectedValue, narrative }]
  -- Results
  best_scenario TEXT,
  result_narrative TEXT, -- LLM-generated comparison narrative
  result_sections JSONB, -- NarrativeSection[]
  -- Lifecycle
  created_by TEXT NOT NULL,
  is_saved BOOLEAN NOT NULL DEFAULT false, -- true = user saved for reference
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_simulations_tenant
  ON semantic_simulations (tenant_id, created_at DESC);
--> statement-breakpoint

ALTER TABLE semantic_simulations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS simulations_tenant_isolation ON semantic_simulations;
--> statement-breakpoint
CREATE POLICY simulations_tenant_isolation ON semantic_simulations
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
--> statement-breakpoint

-- -- 9. Add suggestedFollowUps + chartConfig to eval turns -----------
ALTER TABLE semantic_eval_turns ADD COLUMN IF NOT EXISTS suggested_follow_ups JSONB;
--> statement-breakpoint
ALTER TABLE semantic_eval_turns ADD COLUMN IF NOT EXISTS chart_config JSONB;
--> statement-breakpoint
ALTER TABLE semantic_eval_turns ADD COLUMN IF NOT EXISTS visualization_type TEXT;
