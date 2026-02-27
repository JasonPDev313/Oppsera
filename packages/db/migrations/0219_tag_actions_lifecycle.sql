-- Migration 0219: Tag Actions & Lifecycle
-- Adds tag_actions, tag_action_executions tables + lifecycle columns on existing tag tables.
-- Part of the Intelligent Tag Management System (Session 1).

-- 1. tag_actions — Configurable actions triggered on tag apply/remove/expire
CREATE TABLE IF NOT EXISTS tag_actions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL,
  action_type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  execution_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tag_actions_tenant ON tag_actions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tag_actions_tenant_tag ON tag_actions(tenant_id, tag_id);
CREATE INDEX IF NOT EXISTS idx_tag_actions_tenant_tag_trigger ON tag_actions(tenant_id, tag_id, trigger)
  WHERE is_active = true;

ALTER TABLE tag_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_actions FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tag_actions' AND policyname = 'tag_actions_select_policy') THEN
    CREATE POLICY tag_actions_select_policy ON tag_actions FOR SELECT
      USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tag_actions' AND policyname = 'tag_actions_insert_policy') THEN
    CREATE POLICY tag_actions_insert_policy ON tag_actions FOR INSERT
      WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tag_actions' AND policyname = 'tag_actions_update_policy') THEN
    CREATE POLICY tag_actions_update_policy ON tag_actions FOR UPDATE
      USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tag_actions' AND policyname = 'tag_actions_delete_policy') THEN
    CREATE POLICY tag_actions_delete_policy ON tag_actions FOR DELETE
      USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- 2. tag_action_executions — Append-only audit log of action runs
CREATE TABLE IF NOT EXISTS tag_action_executions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  tag_action_id TEXT NOT NULL REFERENCES tag_actions(id),
  customer_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  result_summary JSONB,
  error_message TEXT,
  duration_ms INTEGER,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tag_action_executions_tenant_customer
  ON tag_action_executions(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_tag_action_executions_tenant_action
  ON tag_action_executions(tenant_id, tag_action_id);
CREATE INDEX IF NOT EXISTS idx_tag_action_executions_tenant_executed
  ON tag_action_executions(tenant_id, executed_at);

ALTER TABLE tag_action_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_action_executions FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tag_action_executions' AND policyname = 'tag_action_executions_select_policy') THEN
    CREATE POLICY tag_action_executions_select_policy ON tag_action_executions FOR SELECT
      USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tag_action_executions' AND policyname = 'tag_action_executions_insert_policy') THEN
    CREATE POLICY tag_action_executions_insert_policy ON tag_action_executions FOR INSERT
      WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- 3. Lifecycle columns on tags
ALTER TABLE tags ADD COLUMN IF NOT EXISTS default_expiry_days INTEGER;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS conflicts_with TEXT[] DEFAULT '{}';
ALTER TABLE tags ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 100;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS re_evaluation_interval_hours INTEGER;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS tag_group TEXT;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS evidence_template TEXT;

CREATE INDEX IF NOT EXISTS idx_tags_tenant_group ON tags(tenant_id, tag_group)
  WHERE tag_group IS NOT NULL;

-- 4. Event-driven + scheduling columns on smart_tag_rules
ALTER TABLE smart_tag_rules ADD COLUMN IF NOT EXISTS trigger_events TEXT[] DEFAULT '{}';
ALTER TABLE smart_tag_rules ADD COLUMN IF NOT EXISTS next_scheduled_run_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_smart_tag_rules_tenant_next_run
  ON smart_tag_rules(tenant_id, next_scheduled_run_at)
  WHERE is_active = true AND next_scheduled_run_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_smart_tag_rules_tenant_trigger_events
  ON smart_tag_rules USING gin (trigger_events)
  WHERE is_active = true;

-- 5. Confidence column on customer_tags
ALTER TABLE customer_tags ADD COLUMN IF NOT EXISTS confidence REAL;
