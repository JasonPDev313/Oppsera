-- AI Support Assistant — core + knowledge layer tables
-- Migration 0316

-- ── Threads ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_assistant_threads (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL,
  session_id TEXT,
  channel TEXT NOT NULL DEFAULT 'in_app',
  current_route TEXT,
  module_key TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  question_type TEXT,
  outcome TEXT,
  issue_tag TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_threads_tenant_user ON ai_assistant_threads(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_ai_threads_tenant_status ON ai_assistant_threads(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_threads_tenant_module ON ai_assistant_threads(tenant_id, module_key);
CREATE INDEX IF NOT EXISTS idx_ai_threads_created ON ai_assistant_threads(tenant_id, created_at);

-- ── Messages ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_assistant_messages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  thread_id TEXT NOT NULL REFERENCES ai_assistant_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  message_text TEXT NOT NULL,
  model_name TEXT,
  prompt_version TEXT,
  answer_confidence TEXT,
  source_tier_used TEXT,
  citations_json JSONB,
  retrieval_trace_json JSONB,
  feedback_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_thread_created ON ai_assistant_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_messages_tenant_created ON ai_assistant_messages(tenant_id, created_at);

-- ── Context Snapshots ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_assistant_context_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  thread_id TEXT NOT NULL REFERENCES ai_assistant_threads(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES ai_assistant_messages(id) ON DELETE CASCADE,
  route TEXT,
  screen_title TEXT,
  module_key TEXT,
  role_keys_json JSONB,
  feature_flags_json JSONB,
  enabled_modules_json JSONB,
  visible_actions_json JSONB,
  selected_record_json JSONB,
  ui_state_json JSONB,
  tenant_settings_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_context_thread ON ai_assistant_context_snapshots(thread_id);
CREATE INDEX IF NOT EXISTS idx_ai_context_message ON ai_assistant_context_snapshots(message_id);

-- ── Feedback ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_assistant_feedback (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  message_id TEXT NOT NULL REFERENCES ai_assistant_messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  rating TEXT NOT NULL,
  reason_code TEXT,
  freeform_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_feedback_message_user ON ai_assistant_feedback(message_id, user_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_tenant_rating ON ai_assistant_feedback(tenant_id, rating);

-- ── Reviews ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_assistant_reviews (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  thread_id TEXT NOT NULL REFERENCES ai_assistant_threads(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES ai_assistant_messages(id) ON DELETE CASCADE,
  reviewer_user_id TEXT NOT NULL,
  review_status TEXT NOT NULL,
  review_notes TEXT,
  corrected_answer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_reviews_thread ON ai_assistant_reviews(thread_id);
CREATE INDEX IF NOT EXISTS idx_ai_reviews_status ON ai_assistant_reviews(review_status);

-- ═══════════════════════════════════════════════════════════════════
-- KNOWLEDGE LAYER
-- ═══════════════════════════════════════════════════════════════════

-- ── Support Documents ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_support_documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  source_type TEXT NOT NULL,
  source_ref TEXT,
  repo_sha TEXT,
  module_key TEXT,
  route TEXT,
  title TEXT,
  content_markdown TEXT,
  metadata_json JSONB,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_docs_module_route ON ai_support_documents(module_key, route);
CREATE INDEX IF NOT EXISTS idx_ai_docs_source_type ON ai_support_documents(source_type);
CREATE INDEX IF NOT EXISTS idx_ai_docs_tenant ON ai_support_documents(tenant_id);

-- ── Answer Cards ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_support_answer_cards (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  slug TEXT NOT NULL,
  module_key TEXT,
  route TEXT,
  question_pattern TEXT NOT NULL,
  approved_answer_markdown TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  owner_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_answer_cards_slug ON ai_support_answer_cards(slug);
CREATE INDEX IF NOT EXISTS idx_ai_answer_cards_module_route ON ai_support_answer_cards(module_key, route);
CREATE INDEX IF NOT EXISTS idx_ai_answer_cards_status ON ai_support_answer_cards(status);

-- ── Route Manifests ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_support_route_manifests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  route TEXT NOT NULL,
  module_key TEXT NOT NULL,
  page_title TEXT NOT NULL,
  description TEXT NOT NULL,
  tabs_json JSONB,
  actions_json JSONB,
  permissions_json JSONB,
  warnings_json JSONB,
  help_text TEXT,
  repo_sha TEXT,
  owner_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_route_manifests_route ON ai_support_route_manifests(route);
CREATE INDEX IF NOT EXISTS idx_ai_route_manifests_module ON ai_support_route_manifests(module_key);

-- ── Action Manifests ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_support_action_manifests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  route TEXT NOT NULL,
  action_label TEXT NOT NULL,
  handler_description TEXT,
  preconditions_json JSONB,
  confirmations TEXT,
  success_state TEXT,
  failure_state TEXT,
  permission_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_action_manifests_route_label ON ai_support_action_manifests(route, action_label);
CREATE INDEX IF NOT EXISTS idx_ai_action_manifests_route ON ai_support_action_manifests(route);

-- ── Answer Memory ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_assistant_answer_memory (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  question_normalized TEXT NOT NULL,
  screen_key TEXT,
  module_key TEXT,
  role_scope TEXT,
  tenant_scope TEXT NOT NULL DEFAULT 'global',
  answer_markdown TEXT NOT NULL,
  source_refs_json JSONB,
  source_tier_used TEXT,
  source_commit_sha TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending',
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  supersedes_answer_id TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_answer_memory_screen_module ON ai_assistant_answer_memory(screen_key, module_key);
CREATE INDEX IF NOT EXISTS idx_ai_answer_memory_review_status ON ai_assistant_answer_memory(review_status);
CREATE INDEX IF NOT EXISTS idx_ai_answer_memory_question ON ai_assistant_answer_memory(question_normalized);

-- ── Content Invalidation ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_assistant_content_invalidation (
  id TEXT PRIMARY KEY,
  answer_memory_id TEXT REFERENCES ai_assistant_answer_memory(id),
  answer_card_id TEXT REFERENCES ai_support_answer_cards(id),
  invalidation_reason TEXT NOT NULL,
  changed_files_json JSONB,
  repo_sha TEXT,
  invalidated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_invalidation_memory ON ai_assistant_content_invalidation(answer_memory_id);
CREATE INDEX IF NOT EXISTS idx_ai_invalidation_card ON ai_assistant_content_invalidation(answer_card_id);

-- ── RLS Policies ─────────────────────────────────────────────────
ALTER TABLE ai_assistant_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_assistant_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_assistant_context_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_assistant_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_assistant_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_support_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_support_answer_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_support_route_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_support_action_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_assistant_answer_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_assistant_content_invalidation ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'ai_assistant_threads', 'ai_assistant_messages', 'ai_assistant_context_snapshots',
    'ai_assistant_feedback', 'ai_assistant_reviews'
  ]) LOOP
    -- DROP + CREATE because CREATE POLICY does not support IF NOT EXISTS
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'rls_' || tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (tenant_id = current_setting(''app.tenant_id'', true))',
      'rls_' || tbl, tbl
    );
  END LOOP;
END $$;
