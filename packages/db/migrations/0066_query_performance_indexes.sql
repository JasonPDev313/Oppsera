-- Query performance indexes identified during Session B audit.
--
-- Covers gaps not already addressed by 0065_list_page_indexes.sql.

-- ── customer_identifiers: value-based lookup ────────────────────
-- searchCustomers() filters by (tenant_id, value, is_active) to find
-- a customer by barcode/card scan. The existing unique index
-- uq_customer_identifiers_tenant_type_value has `type` in position 2,
-- which blocks efficient (tenant_id, value) lookups when type is unknown.
-- This index supports the POS customer-lookup-by-identifier flow.
CREATE INDEX IF NOT EXISTS idx_customer_identifiers_tenant_value_active
  ON customer_identifiers (tenant_id, value, is_active);

-- ── catalog_items: active-only listing with cursor pagination ───
-- listItems() default query: WHERE tenant_id = ? AND archived_at IS NULL
-- ORDER BY id DESC LIMIT N. Also used by getCatalogForPOS().
-- The partial index lets Postgres scan active items in id-desc order
-- and stop at the limit without sorting.
CREATE INDEX IF NOT EXISTS idx_catalog_items_tenant_active_id
  ON catalog_items (tenant_id, id DESC)
  WHERE archived_at IS NULL;
