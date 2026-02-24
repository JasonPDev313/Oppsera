-- Migration: 0163_tag_management
-- Tag Management + Smart Tags system
-- 5 new tables: tags, customer_tags, smart_tag_rules, smart_tag_evaluations, tag_audit_log

-- ── Table 1: tags — Tag definitions (manual + smart) ────────────────────────
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#6366f1',
  icon TEXT,
  tag_type TEXT NOT NULL DEFAULT 'manual',
  category TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_system BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  customer_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL,
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  archived_reason TEXT,
  CONSTRAINT chk_tags_tag_type CHECK (tag_type IN ('manual', 'smart')),
  CONSTRAINT chk_tags_category CHECK (category IS NULL OR category IN ('behavior', 'lifecycle', 'demographic', 'operational'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_tenant_slug
  ON tags(tenant_id, slug) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tags_tenant_type_active
  ON tags(tenant_id, tag_type, is_active);
CREATE INDEX IF NOT EXISTS idx_tags_tenant_category
  ON tags(tenant_id, category) WHERE category IS NOT NULL;

-- ── Table 2: customer_tags — Customer-to-tag assignments ────────────────────
CREATE TABLE IF NOT EXISTS customer_tags (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  tag_id TEXT NOT NULL REFERENCES tags(id),
  source TEXT NOT NULL DEFAULT 'manual',
  source_rule_id TEXT,
  evidence JSONB,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by TEXT NOT NULL,
  removed_at TIMESTAMPTZ,
  removed_by TEXT,
  removed_reason TEXT,
  expires_at TIMESTAMPTZ,
  evaluation_snapshot JSONB,
  CONSTRAINT chk_customer_tags_source CHECK (source IN ('manual', 'smart_rule', 'import', 'api'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_tags_tenant_customer_tag_active
  ON customer_tags(tenant_id, customer_id, tag_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customer_tags_tenant_tag
  ON customer_tags(tenant_id, tag_id);
CREATE INDEX IF NOT EXISTS idx_customer_tags_tenant_customer
  ON customer_tags(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_tags_tenant_source_rule
  ON customer_tags(tenant_id, source_rule_id) WHERE source_rule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_tags_tenant_expires
  ON customer_tags(tenant_id, expires_at) WHERE expires_at IS NOT NULL AND removed_at IS NULL;

-- ── Table 3: smart_tag_rules — Smart tag rule definitions ───────────────────
CREATE TABLE IF NOT EXISTS smart_tag_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  tag_id TEXT NOT NULL REFERENCES tags(id),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  evaluation_mode TEXT NOT NULL DEFAULT 'scheduled',
  schedule_cron TEXT,
  conditions JSONB NOT NULL,
  auto_remove BOOLEAN NOT NULL DEFAULT true,
  cooldown_hours INTEGER,
  priority INTEGER NOT NULL DEFAULT 100,
  version INTEGER NOT NULL DEFAULT 1,
  last_evaluated_at TIMESTAMPTZ,
  last_evaluation_duration_ms INTEGER,
  customers_matched INTEGER NOT NULL DEFAULT 0,
  customers_added INTEGER NOT NULL DEFAULT 0,
  customers_removed INTEGER NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL,
  CONSTRAINT chk_smart_tag_rules_eval_mode CHECK (evaluation_mode IN ('scheduled', 'event_driven', 'hybrid'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_smart_tag_rules_tenant_tag
  ON smart_tag_rules(tenant_id, tag_id);
CREATE INDEX IF NOT EXISTS idx_smart_tag_rules_tenant_active
  ON smart_tag_rules(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_smart_tag_rules_tenant_eval_mode
  ON smart_tag_rules(tenant_id, evaluation_mode) WHERE is_active = true;

-- ── Table 4: smart_tag_evaluations — Evaluation run history (append-only) ───
CREATE TABLE IF NOT EXISTS smart_tag_evaluations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  rule_id TEXT NOT NULL REFERENCES smart_tag_rules(id),
  trigger_type TEXT NOT NULL,
  trigger_event_id TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  customers_evaluated INTEGER NOT NULL DEFAULT 0,
  tags_applied INTEGER NOT NULL DEFAULT 0,
  tags_removed INTEGER NOT NULL DEFAULT 0,
  tags_unchanged INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  duration_ms INTEGER,
  metadata JSONB,
  CONSTRAINT chk_smart_tag_evaluations_trigger CHECK (trigger_type IN ('scheduled', 'event', 'manual')),
  CONSTRAINT chk_smart_tag_evaluations_status CHECK (status IN ('running', 'completed', 'failed', 'partial'))
);

CREATE INDEX IF NOT EXISTS idx_smart_tag_evaluations_tenant_rule_started
  ON smart_tag_evaluations(tenant_id, rule_id, started_at);
CREATE INDEX IF NOT EXISTS idx_smart_tag_evaluations_tenant_status
  ON smart_tag_evaluations(tenant_id, status);

-- ── Table 5: tag_audit_log — Append-only audit trail ────────────────────────
CREATE TABLE IF NOT EXISTS tag_audit_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  customer_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  action TEXT NOT NULL,
  source TEXT NOT NULL,
  source_rule_id TEXT,
  actor_id TEXT NOT NULL,
  evidence JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_tag_audit_log_action CHECK (action IN ('applied', 'removed', 'expired', 'auto_applied', 'auto_removed'))
);

CREATE INDEX IF NOT EXISTS idx_tag_audit_log_tenant_customer_occurred
  ON tag_audit_log(tenant_id, customer_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_tag_audit_log_tenant_tag_occurred
  ON tag_audit_log(tenant_id, tag_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_tag_audit_log_tenant_action_occurred
  ON tag_audit_log(tenant_id, action, occurred_at);

-- ── GIN index on existing customers.tags JSONB for backward compat ──────────
CREATE INDEX IF NOT EXISTS idx_customers_tags_gin ON customers USING gin(tags);

-- ── FK: customer_tags.source_rule_id → smart_tag_rules (deferred) ───────────
ALTER TABLE customer_tags
  ADD CONSTRAINT fk_customer_tags_source_rule
  FOREIGN KEY (source_rule_id) REFERENCES smart_tag_rules(id)
  NOT VALID;

-- ── RLS: tags (full CRUD) ───────────────────────────────────────────────────
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tags' AND policyname = 'tags_select') THEN
    CREATE POLICY tags_select ON tags FOR SELECT
      USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tags' AND policyname = 'tags_insert') THEN
    CREATE POLICY tags_insert ON tags FOR INSERT
      WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tags' AND policyname = 'tags_update') THEN
    CREATE POLICY tags_update ON tags FOR UPDATE
      USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tags' AND policyname = 'tags_delete') THEN
    CREATE POLICY tags_delete ON tags FOR DELETE
      USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- ── RLS: customer_tags (full CRUD) ──────────────────────────────────────────
ALTER TABLE customer_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tags FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_tags' AND policyname = 'customer_tags_select') THEN
    CREATE POLICY customer_tags_select ON customer_tags FOR SELECT
      USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_tags' AND policyname = 'customer_tags_insert') THEN
    CREATE POLICY customer_tags_insert ON customer_tags FOR INSERT
      WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_tags' AND policyname = 'customer_tags_update') THEN
    CREATE POLICY customer_tags_update ON customer_tags FOR UPDATE
      USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_tags' AND policyname = 'customer_tags_delete') THEN
    CREATE POLICY customer_tags_delete ON customer_tags FOR DELETE
      USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- ── RLS: smart_tag_rules (full CRUD) ────────────────────────────────────────
ALTER TABLE smart_tag_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE smart_tag_rules FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'smart_tag_rules' AND policyname = 'smart_tag_rules_select') THEN
    CREATE POLICY smart_tag_rules_select ON smart_tag_rules FOR SELECT
      USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'smart_tag_rules' AND policyname = 'smart_tag_rules_insert') THEN
    CREATE POLICY smart_tag_rules_insert ON smart_tag_rules FOR INSERT
      WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'smart_tag_rules' AND policyname = 'smart_tag_rules_update') THEN
    CREATE POLICY smart_tag_rules_update ON smart_tag_rules FOR UPDATE
      USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'smart_tag_rules' AND policyname = 'smart_tag_rules_delete') THEN
    CREATE POLICY smart_tag_rules_delete ON smart_tag_rules FOR DELETE
      USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- ── RLS: smart_tag_evaluations (append-only: SELECT + INSERT) ───────────────
ALTER TABLE smart_tag_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE smart_tag_evaluations FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'smart_tag_evaluations' AND policyname = 'smart_tag_evaluations_select') THEN
    CREATE POLICY smart_tag_evaluations_select ON smart_tag_evaluations FOR SELECT
      USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'smart_tag_evaluations' AND policyname = 'smart_tag_evaluations_insert') THEN
    CREATE POLICY smart_tag_evaluations_insert ON smart_tag_evaluations FOR INSERT
      WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- ── RLS: tag_audit_log (append-only: SELECT + INSERT) ───────────────────────
ALTER TABLE tag_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_audit_log FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tag_audit_log' AND policyname = 'tag_audit_log_select') THEN
    CREATE POLICY tag_audit_log_select ON tag_audit_log FOR SELECT
      USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tag_audit_log' AND policyname = 'tag_audit_log_insert') THEN
    CREATE POLICY tag_audit_log_insert ON tag_audit_log FOR INSERT
      WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
  END IF;
END $$;
