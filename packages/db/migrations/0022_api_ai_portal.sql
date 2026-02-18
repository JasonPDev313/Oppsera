-- Migration: 0022_api_ai_portal
-- Creates api_keys, ai_conversations, ai_messages, ai_message_metadata, portal_section_configs, mobile_app_configs

-- ══════════════════════════════════════════════════════════════════
-- API Domain
-- ══════════════════════════════════════════════════════════════════

-- ── api_keys ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id             TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id      TEXT NOT NULL REFERENCES tenants(id),
  name           TEXT NOT NULL,
  key_hash       TEXT NOT NULL,
  key_prefix     TEXT NOT NULL,
  is_enabled     BOOLEAN NOT NULL DEFAULT true,
  expires_at     TIMESTAMPTZ,
  revoked_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_api_keys_tenant_key_hash ON api_keys (tenant_id, key_hash);
CREATE INDEX idx_api_keys_tenant_enabled ON api_keys (tenant_id, is_enabled);

-- ══════════════════════════════════════════════════════════════════
-- AI Domain
-- ══════════════════════════════════════════════════════════════════

-- ── ai_conversations ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_conversations (
  id             TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id      TEXT NOT NULL REFERENCES tenants(id),
  title          TEXT,
  chat_type      TEXT NOT NULL DEFAULT 'general',
  user_id        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_conversations_tenant_user ON ai_conversations (tenant_id, user_id);

-- ── ai_messages ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_messages (
  id                TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  conversation_id   TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role              TEXT NOT NULL,
  content           TEXT NOT NULL,
  intent            TEXT,
  model_id          TEXT,
  input_tokens      INTEGER,
  output_tokens     INTEGER,
  total_tokens      INTEGER,
  response_time_ms  INTEGER,
  feedback_action   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_messages_tenant_conv_created ON ai_messages (tenant_id, conversation_id, created_at);

-- ── ai_message_metadata ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_message_metadata (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  conversation_id       TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  message_id            TEXT NOT NULL REFERENCES ai_messages(id) ON DELETE CASCADE,
  tool_caller_name      TEXT,
  tool_call_name        TEXT,
  tool_call_input       TEXT,
  tool_call_output      TEXT,
  response_time_ms      INTEGER,
  input_tokens          INTEGER,
  output_tokens         INTEGER,
  total_tokens          INTEGER,
  is_success            BOOLEAN NOT NULL DEFAULT true,
  error_message         TEXT,
  model_id              TEXT,
  additional_metadata   JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_message_metadata_tenant_message ON ai_message_metadata (tenant_id, message_id);

-- ══════════════════════════════════════════════════════════════════
-- Portal Domain
-- ══════════════════════════════════════════════════════════════════

-- ── portal_section_configs ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS portal_section_configs (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  portal_type     TEXT NOT NULL,
  identifier      TEXT NOT NULL,
  title           TEXT NOT NULL,
  display_order   INTEGER NOT NULL DEFAULT 0,
  custom_fields   JSONB,
  course_id       TEXT,
  svg_icon_url    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_portal_section_configs_tenant_type_ident ON portal_section_configs (tenant_id, portal_type, identifier);

-- ── mobile_app_configs ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mobile_app_configs (
  id                      TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  platform                TEXT NOT NULL,
  app_package             TEXT,
  fcm_config              JSONB,
  firebase_config         JSONB,
  management_company_id   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_mobile_app_configs_tenant_platform ON mobile_app_configs (tenant_id, platform);

-- ══════════════════════════════════════════════════════════════════
-- RLS Policies
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_message_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_section_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_app_configs ENABLE ROW LEVEL SECURITY;

-- api_keys
CREATE POLICY api_keys_select ON api_keys FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY api_keys_insert ON api_keys FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY api_keys_update ON api_keys FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY api_keys_delete ON api_keys FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ai_conversations
CREATE POLICY ai_conversations_select ON ai_conversations FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ai_conversations_insert ON ai_conversations FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ai_conversations_update ON ai_conversations FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ai_conversations_delete ON ai_conversations FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ai_messages
CREATE POLICY ai_messages_select ON ai_messages FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ai_messages_insert ON ai_messages FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ai_messages_update ON ai_messages FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ai_messages_delete ON ai_messages FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ai_message_metadata
CREATE POLICY ai_message_metadata_select ON ai_message_metadata FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ai_message_metadata_insert ON ai_message_metadata FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ai_message_metadata_update ON ai_message_metadata FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY ai_message_metadata_delete ON ai_message_metadata FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- portal_section_configs
CREATE POLICY portal_section_configs_select ON portal_section_configs FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY portal_section_configs_insert ON portal_section_configs FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY portal_section_configs_update ON portal_section_configs FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY portal_section_configs_delete ON portal_section_configs FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- mobile_app_configs
CREATE POLICY mobile_app_configs_select ON mobile_app_configs FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY mobile_app_configs_insert ON mobile_app_configs FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY mobile_app_configs_update ON mobile_app_configs FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY mobile_app_configs_delete ON mobile_app_configs FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
