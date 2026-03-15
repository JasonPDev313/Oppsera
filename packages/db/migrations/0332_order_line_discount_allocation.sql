-- Migration 0332: Add discount allocation + finalized line amounts to order_lines
--
-- Each line becomes the source of truth after discount allocation.
-- Original prices are preserved; final (post-discount) amounts are what
-- drive order totals, tax remittance, GL posting, and receipts.
--
-- After discount allocation:
--   finalLineSubtotal = line_subtotal - discount_allocation_cents  (exclusive)
--   finalLineSubtotal = extracted pre-tax base from discounted gross (inclusive)
--   finalLineTax       = tax on discounted base
--   finalLineTotal     = finalLineSubtotal + finalLineTax
--
-- Order totals are computed from final values:
--   orders.subtotal  = SUM(final_line_subtotal)
--   orders.taxTotal  = SUM(final_line_tax)
--   orders.total     = SUM(final_line_total)

ALTER TABLE order_lines
  ADD COLUMN IF NOT EXISTS discount_allocation_cents INTEGER NOT NULL DEFAULT 0;

ALTER TABLE order_lines
  ADD COLUMN IF NOT EXISTS final_line_subtotal INTEGER;

ALTER TABLE order_lines
  ADD COLUMN IF NOT EXISTS final_line_tax INTEGER;

ALTER TABLE order_lines
  ADD COLUMN IF NOT EXISTS final_line_total INTEGER;

-- Backfill: for existing lines with no discount, final = original
UPDATE order_lines
SET final_line_subtotal = line_subtotal,
    final_line_tax = line_tax,
    final_line_total = line_total
WHERE final_line_subtotal IS NULL;

-- Now make them NOT NULL with defaults
ALTER TABLE order_lines
  ALTER COLUMN final_line_subtotal SET NOT NULL,
  ALTER COLUMN final_line_subtotal SET DEFAULT 0;

ALTER TABLE order_lines
  ALTER COLUMN final_line_tax SET NOT NULL,
  ALTER COLUMN final_line_tax SET DEFAULT 0;

ALTER TABLE order_lines
  ALTER COLUMN final_line_total SET NOT NULL,
  ALTER COLUMN final_line_total SET DEFAULT 0;

COMMENT ON COLUMN order_lines.discount_allocation_cents IS
  'Prorated share of cart-level discounts allocated to this line (cents).';

COMMENT ON COLUMN order_lines.final_line_subtotal IS
  'Post-discount pre-tax amount (cents). For exclusive: line_subtotal - discount. For inclusive: extracted pre-tax base from discounted gross.';

COMMENT ON COLUMN order_lines.final_line_tax IS
  'Tax on the post-discount amount (cents). Always computed via calculateTaxes on the discounted base.';

COMMENT ON COLUMN order_lines.final_line_total IS
  'Post-discount total (cents) = final_line_subtotal + final_line_tax. This is the source of truth for order totals.';
