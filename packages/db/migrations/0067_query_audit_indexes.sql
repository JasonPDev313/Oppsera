-- ==========================================================================
-- Migration 0067: Query Audit Index Recommendations
-- Created: 2026-02-19
-- Context: Staff Performance Engineer audit of 6 hot-path queries
-- ==========================================================================
--
-- All indexes use IF NOT EXISTS for idempotency.
-- CONCURRENTLY cannot be used inside a transaction block (Drizzle migrations
-- run in a transaction). Run these manually with CONCURRENTLY if applying
-- to a production database with live traffic, or accept the brief lock
-- during a maintenance window.
--
-- Index inventory BEFORE this migration:
--   0055: pg_trgm + GIN trigram on customers (display_name, email, phone)
--   0062: GIN trigram on catalog_items (name, sku), item_identifiers (value),
--         partial B-tree idx_catalog_items_tenant_active_name
--   0065: idx_tenders_tenant_status_order, idx_inventory_movements_onhand (covering)
--   0066: idx_customer_identifiers_tenant_value_active,
--         idx_catalog_items_tenant_active_id (partial, DESC)

-- ── 1. orders: covering index for default sort (createdAt DESC) ─────────
-- listOrders default: WHERE tenant_id=? AND location_id=?
--   ORDER BY created_at DESC, id DESC LIMIT 51
-- Existing idx_orders_tenant_location_created covers (tenant_id, location_id, created_at)
-- but a tiebreaker on id is needed for stable cursor pagination.
-- The id column is small (text ULID) and including it avoids a heap fetch
-- for the cursor value.
CREATE INDEX IF NOT EXISTS idx_orders_tenant_location_created_id
  ON orders (tenant_id, location_id, created_at DESC, id DESC);

-- ── 2. orders: business_date range filter covering index ────────────────
-- listOrders with dateFrom/dateTo: adds gte/lte on business_date.
-- Existing idx_orders_tenant_location_business_date covers the filter,
-- but adding id DESC enables cursor-based pagination directly on the index.
-- This replaces a sort step when both date range and cursor are used.
CREATE INDEX IF NOT EXISTS idx_orders_tenant_loc_bdate_id
  ON orders (tenant_id, location_id, business_date, id DESC);

-- ── 3. rm_customer_activity: last_visit_at for dashboard 30-day count ───
-- getDashboardMetrics runs:
--   SELECT count(*) FROM rm_customer_activity
--   WHERE tenant_id=? AND last_visit_at >= ?
-- Existing idx_rm_customer_activity_last_visit covers (tenant_id, last_visit_at),
-- which is exactly what this query needs. No new index required.
-- (Noted here for audit completeness.)

-- ── 4. rm_inventory_on_hand: low stock count for dashboard ──────────────
-- getDashboardMetrics runs:
--   SELECT count(*) FROM rm_inventory_on_hand
--   WHERE tenant_id=? AND is_below_threshold=true [AND location_id=?]
-- Existing idx_rm_inventory_on_hand_below covers (tenant_id, location_id, is_below_threshold).
-- For the single-location case this is optimal.
-- For the all-locations case (no location_id filter), the planner must skip
-- the location_id column. A partial index improves this:
CREATE INDEX IF NOT EXISTS idx_rm_inventory_on_hand_below_only
  ON rm_inventory_on_hand (tenant_id)
  WHERE is_below_threshold = true;

-- ── 5. catalog_categories: POS query ordering optimization ──────────────
-- getCatalogForPOS runs:
--   SELECT ... FROM catalog_categories
--   WHERE tenant_id=? AND is_active=true
--   ORDER BY sort_order, name
-- Existing idx_catalog_categories_parent covers (tenant_id, parent_id) — wrong columns.
-- A dedicated index lets Postgres return rows pre-sorted:
CREATE INDEX IF NOT EXISTS idx_catalog_categories_tenant_active_sort
  ON catalog_categories (tenant_id, sort_order, name)
  WHERE is_active = true;

-- ── 6. customers: composite keyset cursor pagination ────────────────────
-- listCustomers: ORDER BY display_name ASC, id ASC with composite cursor.
-- Existing idx_customers_tenant_display_name covers (tenant_id, display_name)
-- but doesn't include id for the tiebreaker sort.
-- Adding id enables the index to serve the full ORDER BY without a sort step.
CREATE INDEX IF NOT EXISTS idx_customers_tenant_displayname_id
  ON customers (tenant_id, display_name, id);

-- ── 7. listCustomers ILIKE search with merged-record exclusion ──────────
-- The query always adds: NOT display_name ILIKE '[MERGED]%'
-- This is a constant negative filter. For the common case (no search term),
-- the B-tree on (tenant_id, display_name, id) can skip merged rows efficiently
-- because '[MERGED]' sorts before most real names.
-- For the SEARCH case, the GIN trigram index from 0055 handles it.
-- No additional index needed. (Noted for audit completeness.)
