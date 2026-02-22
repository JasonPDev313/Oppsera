-- Session 43: Line-item returns — add return tracking columns to orders and order_lines

ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_type TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_order_id TEXT;

ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS original_line_id TEXT;

-- Index for finding return orders by original order
CREATE INDEX IF NOT EXISTS idx_orders_return_order
  ON orders(tenant_id, return_order_id)
  WHERE return_order_id IS NOT NULL;

COMMENT ON COLUMN orders.return_type IS 'full or partial — set on return orders only';
COMMENT ON COLUMN orders.return_order_id IS 'links this return order to the original order';
COMMENT ON COLUMN order_lines.original_line_id IS 'links return line to original order line';
