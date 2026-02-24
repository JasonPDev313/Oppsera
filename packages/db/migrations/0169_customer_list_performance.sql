-- Customer list performance indexes
-- Addresses slow list page on production: cursor pagination, tag filtering, last-visit sort

-- 1. Covering index for keyset (displayName, id) cursor pagination.
--    Replaces the existing (tenant_id, display_name) index for list queries.
CREATE INDEX IF NOT EXISTS idx_customers_tenant_display_name_id
  ON customers (tenant_id, display_name, id);

-- 2. GIN index for JSONB containment tag filtering (tags @> '["vip"]'::jsonb).
--    Without this, tag-filtered queries cause sequential scans.
CREATE INDEX IF NOT EXISTS idx_customers_tags_gin
  ON customers USING gin (tags) WHERE tags IS NOT NULL;

-- 3. Index for "no search term" fallback: ORDER BY last_visit_at DESC NULLS LAST.
--    Used by search-customers.ts when no search term is provided.
CREATE INDEX IF NOT EXISTS idx_customers_tenant_last_visit
  ON customers (tenant_id, last_visit_at DESC NULLS LAST);
