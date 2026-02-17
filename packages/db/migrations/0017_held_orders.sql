-- 0017_held_orders.sql
-- Add held_at / held_by columns for POS "save tab" feature.
-- A held order is status='open' AND held_at IS NOT NULL.

ALTER TABLE orders ADD COLUMN held_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN held_by TEXT;

CREATE INDEX idx_orders_held
  ON orders (tenant_id, location_id)
  WHERE held_at IS NOT NULL AND status = 'open';
