-- Performance indexes migration
-- All indexes use IF NOT EXISTS for idempotency

-- orders.terminal_id (for terminal-filtered order lookups)
CREATE INDEX IF NOT EXISTS idx_orders_tenant_location_terminal
  ON orders (tenant_id, location_id, terminal_id)
  WHERE terminal_id IS NOT NULL;

-- tenders.employee_id (for shift reports, employee earnings)
CREATE INDEX IF NOT EXISTS idx_tenders_tenant_employee
  ON tenders (tenant_id, employee_id, created_at DESC);

-- tenders.shift_id (for shift-based tender lookups)
CREATE INDEX IF NOT EXISTS idx_tenders_tenant_shift
  ON tenders (tenant_id, shift_id)
  WHERE shift_id IS NOT NULL;

-- tenders.status (for status-based filtering)
CREATE INDEX IF NOT EXISTS idx_tenders_tenant_status
  ON tenders (tenant_id, status);

-- tender_reversals.status (for reversal status lookups)
CREATE INDEX IF NOT EXISTS idx_tender_reversals_tenant_status
  ON tender_reversals (tenant_id, status);

-- catalog_items.item_type (for type-filtered catalog browsing)
CREATE INDEX IF NOT EXISTS idx_catalog_items_tenant_type_active
  ON catalog_items (tenant_id, item_type, is_active);

-- catalog_categories.sort_order (for ordered category listing)
CREATE INDEX IF NOT EXISTS idx_catalog_categories_tenant_sort
  ON catalog_categories (tenant_id, sort_order, name);

-- catalog_modifiers: replace single-column index with tenant-scoped composite
DROP INDEX IF EXISTS idx_catalog_modifiers_group;
CREATE INDEX IF NOT EXISTS idx_catalog_modifiers_tenant_group_sort
  ON catalog_modifiers (tenant_id, modifier_group_id, sort_order);

-- ar_transactions aging composite (for aging report queries)
CREATE INDEX IF NOT EXISTS idx_ar_transactions_tenant_account_type_due
  ON ar_transactions (tenant_id, billing_account_id, type, due_date)
  WHERE due_date IS NOT NULL;

-- statements open-invoice lookup
CREATE INDEX IF NOT EXISTS idx_statements_tenant_account_status
  ON statements (tenant_id, billing_account_id, status);

-- inventory_movements.movement_type (for movement type filtering)
CREATE INDEX IF NOT EXISTS idx_inventory_movements_item_type
  ON inventory_movements (tenant_id, inventory_item_id, movement_type, created_at DESC);

-- role_assignments: role + location indexes
CREATE INDEX IF NOT EXISTS idx_role_assignments_role
  ON role_assignments (tenant_id, role_id);
CREATE INDEX IF NOT EXISTS idx_role_assignments_location
  ON role_assignments (tenant_id, location_id)
  WHERE location_id IS NOT NULL;

-- customer_identifiers: value lookup for search
CREATE INDEX IF NOT EXISTS idx_customer_identifiers_tenant_value_active
  ON customer_identifiers (tenant_id, value)
  WHERE is_active = true;

-- event_outbox: fix partial index (recreate as proper partial)
DROP INDEX IF EXISTS idx_outbox_unpublished;
CREATE INDEX IF NOT EXISTS idx_outbox_unpublished
  ON event_outbox (published_at)
  WHERE published_at IS NULL;

-- customer_segment_memberships: active members
CREATE INDEX IF NOT EXISTS idx_customer_segment_memberships_active
  ON customer_segment_memberships (tenant_id, segment_id, customer_id)
  WHERE removed_at IS NULL;
