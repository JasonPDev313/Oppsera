-- Fix RLS on AI support knowledge tables to allow global (tenant_id IS NULL) rows.
-- These tables store answer cards, route manifests, action manifests, and documents
-- that can be either tenant-specific or global (shared across all tenants).
-- The original migration (0316) enabled RLS but only created policies for
-- tenant-scoped tables (threads, messages, etc.), leaving knowledge tables
-- with RLS enabled but no policy = deny all.

-- ai_support_answer_cards: allow global (NULL tenant) + tenant-scoped rows
DROP POLICY IF EXISTS rls_ai_support_answer_cards ON ai_support_answer_cards;
CREATE POLICY rls_ai_support_answer_cards ON ai_support_answer_cards
  FOR ALL USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.tenant_id', true)
  );

-- ai_support_route_manifests: same pattern
DROP POLICY IF EXISTS rls_ai_support_route_manifests ON ai_support_route_manifests;
CREATE POLICY rls_ai_support_route_manifests ON ai_support_route_manifests
  FOR ALL USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.tenant_id', true)
  );

-- ai_support_action_manifests: same pattern
DROP POLICY IF EXISTS rls_ai_support_action_manifests ON ai_support_action_manifests;
CREATE POLICY rls_ai_support_action_manifests ON ai_support_action_manifests
  FOR ALL USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.tenant_id', true)
  );

-- ai_support_documents: same pattern
DROP POLICY IF EXISTS rls_ai_support_documents ON ai_support_documents;
CREATE POLICY rls_ai_support_documents ON ai_support_documents
  FOR ALL USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.tenant_id', true)
  );

-- ai_assistant_answer_memory: same pattern
DROP POLICY IF EXISTS rls_ai_assistant_answer_memory ON ai_assistant_answer_memory;
CREATE POLICY rls_ai_assistant_answer_memory ON ai_assistant_answer_memory
  FOR ALL USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.tenant_id', true)
  );

-- ai_assistant_content_invalidation: no tenant_id column — skip RLS policy
-- This table stores cache-invalidation signals and is not tenant-scoped.
