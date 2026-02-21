-- Migration: 0073_custom_lenses
-- Adds tenant_id to semantic_lenses so tenants can create their own custom lenses.
-- System lenses keep tenant_id = NULL (global).
-- Custom lenses have tenant_id set (scoped to that tenant).

-- ── Add tenant_id column ─────────────────────────────────────────

ALTER TABLE semantic_lenses
  ADD COLUMN IF NOT EXISTS tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE;

-- ── Replace global UNIQUE(slug) with partial unique constraints ───
-- System lenses (tenant_id IS NULL): slug must be globally unique
-- Custom lenses (tenant_id IS NOT NULL): slug must be unique per tenant

ALTER TABLE semantic_lenses
  DROP CONSTRAINT IF EXISTS semantic_lenses_slug_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_semantic_lenses_system_slug
  ON semantic_lenses (slug)
  WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_semantic_lenses_tenant_slug
  ON semantic_lenses (tenant_id, slug)
  WHERE tenant_id IS NOT NULL;

-- ── RLS ─────────────────────────────────────────────────────────
-- System lenses (tenant_id IS NULL): visible to all authenticated users
-- Custom lenses: only visible to their owning tenant

ALTER TABLE semantic_lenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE semantic_lenses FORCE ROW LEVEL SECURITY;

-- SELECT: system lenses (all) + own tenant's custom lenses
CREATE POLICY semantic_lenses_select ON semantic_lenses
  FOR SELECT
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id', TRUE)
  );

-- INSERT/UPDATE/DELETE: only own custom lenses (isSystem must be false, tenant_id must match)
CREATE POLICY semantic_lenses_insert ON semantic_lenses
  FOR INSERT
  WITH CHECK (
    is_system = FALSE
    AND tenant_id = current_setting('app.current_tenant_id', TRUE)
  );

CREATE POLICY semantic_lenses_update ON semantic_lenses
  FOR UPDATE
  USING (
    is_system = FALSE
    AND tenant_id = current_setting('app.current_tenant_id', TRUE)
  );

CREATE POLICY semantic_lenses_delete ON semantic_lenses
  FOR DELETE
  USING (
    is_system = FALSE
    AND tenant_id = current_setting('app.current_tenant_id', TRUE)
  );
