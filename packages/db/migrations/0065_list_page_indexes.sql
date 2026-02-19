-- Covering index for tender aggregation in listOrders
-- The batch query filters by (tenantId, status='captured', orderId IN ...)
-- Existing idx_tenders_tenant_order lacks status, forcing a post-filter scan.
CREATE INDEX IF NOT EXISTS idx_tenders_tenant_status_order
  ON tenders (tenant_id, status, order_id);

-- Covering index for inventory on-hand SUM in listItems(includeInventory)
-- Includes quantity_delta so Postgres can do an index-only scan.
CREATE INDEX IF NOT EXISTS idx_inventory_movements_onhand
  ON inventory_movements (tenant_id, inventory_item_id)
  INCLUDE (quantity_delta);
