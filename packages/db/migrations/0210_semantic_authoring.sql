-- Migration 0210: Semantic Authoring
-- Adds tenant_id to semantic_metrics and semantic_dimensions so tenants
-- can define custom metrics/dimensions alongside system ones.
-- Pattern mirrors semantic_lenses (NULL tenant_id = system, set = custom).

-- ── Add tenant_id to semantic_metrics ─────────────────────────────
ALTER TABLE semantic_metrics ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- Drop the FK from semantic_metric_dimensions that depends on the old unique constraint
ALTER TABLE semantic_metric_dimensions DROP CONSTRAINT IF EXISTS semantic_metric_dimensions_metric_slug_fkey;

-- Also drop dimension_slug FK if it exists (same pattern)
ALTER TABLE semantic_metric_dimensions DROP CONSTRAINT IF EXISTS semantic_metric_dimensions_dimension_slug_fkey;

-- Drop old unique constraint on slug (it's now slug + tenant scope)
DROP INDEX IF EXISTS semantic_metrics_slug_unique;
ALTER TABLE semantic_metrics DROP CONSTRAINT IF EXISTS semantic_metrics_slug_unique;
ALTER TABLE semantic_metrics DROP CONSTRAINT IF EXISTS semantic_metrics_slug_key;

-- System metrics: slug must be unique where tenant_id IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS uq_semantic_metrics_system_slug
  ON semantic_metrics (slug) WHERE tenant_id IS NULL;

-- Custom metrics: (tenant_id, slug) must be unique where tenant_id IS NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS uq_semantic_metrics_tenant_slug
  ON semantic_metrics (tenant_id, slug) WHERE tenant_id IS NOT NULL;

-- Index for listing custom metrics per tenant
CREATE INDEX IF NOT EXISTS idx_semantic_metrics_tenant
  ON semantic_metrics (tenant_id) WHERE tenant_id IS NOT NULL;

-- ── Add tenant_id to semantic_dimensions ──────────────────────────
ALTER TABLE semantic_dimensions ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- Drop old unique constraint on slug
DROP INDEX IF EXISTS semantic_dimensions_slug_unique;
ALTER TABLE semantic_dimensions DROP CONSTRAINT IF EXISTS semantic_dimensions_slug_unique;
ALTER TABLE semantic_dimensions DROP CONSTRAINT IF EXISTS semantic_dimensions_slug_key;

-- System dimensions: slug must be unique where tenant_id IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS uq_semantic_dimensions_system_slug
  ON semantic_dimensions (slug) WHERE tenant_id IS NULL;

-- Custom dimensions: (tenant_id, slug) must be unique where tenant_id IS NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS uq_semantic_dimensions_tenant_slug
  ON semantic_dimensions (tenant_id, slug) WHERE tenant_id IS NOT NULL;

-- Index for listing custom dimensions per tenant
CREATE INDEX IF NOT EXISTS idx_semantic_dimensions_tenant
  ON semantic_dimensions (tenant_id) WHERE tenant_id IS NOT NULL;
