-- Migration: Add GIN trigram indexes for fast ILIKE search on catalog_items
-- These eliminate sequential scans for the receiving item search endpoint.
--
-- pg_trgm was already enabled by 0055_customer_search_indexes.sql.
-- These indexes support both '%query%' ILIKE patterns AND exact match fallback.

-- ── catalog_items.name — primary search target ──────────────────
-- Without this, ILIKE '%bolt%' on catalog_items does a full seq scan.
-- GIN trigram indexes accelerate arbitrary substring searches.
CREATE INDEX IF NOT EXISTS idx_catalog_items_name_trgm
  ON catalog_items USING gin (name gin_trgm_ops);

-- ── catalog_items.sku — secondary search target ─────────────────
-- SKU searches are frequent during receiving (vendor invoices reference SKUs).
CREATE INDEX IF NOT EXISTS idx_catalog_items_sku_trgm
  ON catalog_items USING gin (sku gin_trgm_ops)
  WHERE sku IS NOT NULL;

-- ── item_identifiers.value — barcode/PLU/UPC scan target ────────
-- Exact match is already covered by uq_item_identifiers_tenant_type_value,
-- but add a trigram index for partial barcode/PLU substring search.
CREATE INDEX IF NOT EXISTS idx_item_identifiers_value_trgm
  ON item_identifiers USING gin (value gin_trgm_ops);

-- ── Covering index for the receiving search query ───────────────
-- The search query filters by tenant_id + archived_at IS NULL, then does
-- ILIKE on name/sku. This partial B-tree index lets Postgres skip archived
-- rows before the GIN index kicks in.
CREATE INDEX IF NOT EXISTS idx_catalog_items_tenant_active_name
  ON catalog_items (tenant_id, name)
  WHERE archived_at IS NULL;
