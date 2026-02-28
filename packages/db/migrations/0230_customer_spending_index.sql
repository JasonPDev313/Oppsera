-- Covering index for customer spending report query pattern:
-- WHERE tenant_id = ? AND customer_id IS NOT NULL AND status IN (...) AND business_date BETWEEN ? AND ?
-- Also INCLUDE location_id for the optional location filter without a separate index lookup.
CREATE INDEX IF NOT EXISTS idx_orders_customer_spending
  ON orders (tenant_id, business_date, status, customer_id)
  INCLUDE (location_id)
  WHERE customer_id IS NOT NULL;
