-- ── Add / fix RLS policies for AI support + assistant tables ────────
-- Migration 0316 enabled RLS on these tables but either:
--   (a) created no policy (deny-all for non-superuser — gotcha #574), or
--   (b) used wrong setting name 'app.tenant_id' instead of 'app.current_tenant_id'
-- Migration 0328 (feature_gaps) also enabled RLS with no policy.
--
-- Fix: add correct policies using (select current_setting(...)) subselect
-- form (per optimization in migration 0094). Allow tenant_id IS NULL for
-- global/admin-created rows.

-- ── Tables that had NO policy (deny-all) ────────────────────────────

-- ai_support_answer_cards
DROP POLICY IF EXISTS rls_ai_support_answer_cards ON ai_support_answer_cards;
CREATE POLICY rls_ai_support_answer_cards ON ai_support_answer_cards
  FOR ALL
  USING (
    tenant_id IS NULL
    OR tenant_id = (select current_setting('app.current_tenant_id', true))
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = (select current_setting('app.current_tenant_id', true))
  );

-- ai_support_route_manifests
DROP POLICY IF EXISTS rls_ai_support_route_manifests ON ai_support_route_manifests;
CREATE POLICY rls_ai_support_route_manifests ON ai_support_route_manifests
  FOR ALL
  USING (
    tenant_id IS NULL
    OR tenant_id = (select current_setting('app.current_tenant_id', true))
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = (select current_setting('app.current_tenant_id', true))
  );

-- ai_support_action_manifests
DROP POLICY IF EXISTS rls_ai_support_action_manifests ON ai_support_action_manifests;
CREATE POLICY rls_ai_support_action_manifests ON ai_support_action_manifests
  FOR ALL
  USING (
    tenant_id IS NULL
    OR tenant_id = (select current_setting('app.current_tenant_id', true))
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = (select current_setting('app.current_tenant_id', true))
  );

-- ai_assistant_answer_memory
DROP POLICY IF EXISTS rls_ai_assistant_answer_memory ON ai_assistant_answer_memory;
CREATE POLICY rls_ai_assistant_answer_memory ON ai_assistant_answer_memory
  FOR ALL
  USING (
    tenant_id IS NULL
    OR tenant_id = (select current_setting('app.current_tenant_id', true))
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = (select current_setting('app.current_tenant_id', true))
  );

-- ai_assistant_content_invalidation (no tenant_id column — allow all)
DROP POLICY IF EXISTS rls_ai_assistant_content_invalidation ON ai_assistant_content_invalidation;
CREATE POLICY rls_ai_assistant_content_invalidation ON ai_assistant_content_invalidation
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ai_support_documents
DROP POLICY IF EXISTS rls_ai_support_documents ON ai_support_documents;
CREATE POLICY rls_ai_support_documents ON ai_support_documents
  FOR ALL
  USING (
    tenant_id IS NULL
    OR tenant_id = (select current_setting('app.current_tenant_id', true))
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = (select current_setting('app.current_tenant_id', true))
  );

-- ai_support_feature_gaps (migration 0328, also missing policy)
DROP POLICY IF EXISTS rls_ai_support_feature_gaps ON ai_support_feature_gaps;
CREATE POLICY rls_ai_support_feature_gaps ON ai_support_feature_gaps
  FOR ALL
  USING (
    tenant_id IS NULL
    OR tenant_id = (select current_setting('app.current_tenant_id', true))
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = (select current_setting('app.current_tenant_id', true))
  );

-- ── Tables that had WRONG setting name ('app.tenant_id') ────────────
-- Migration 0316 created policies for these 5 tables using the wrong
-- setting name. Drop and recreate with correct 'app.current_tenant_id'.

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'ai_assistant_threads', 'ai_assistant_messages', 'ai_assistant_context_snapshots',
    'ai_assistant_feedback', 'ai_assistant_reviews'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'rls_' || tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (tenant_id = (select current_setting(''app.current_tenant_id'', true))) WITH CHECK (tenant_id = (select current_setting(''app.current_tenant_id'', true)))',
      'rls_' || tbl, tbl
    );
  END LOOP;
END $$;
