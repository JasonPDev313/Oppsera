-- ============================================================
-- RECONCILIATION QUERY: Order Total Integrity
-- ============================================================
-- Purpose: Find orders where stored totals don't match computed totals
-- Run: Against production (read-only) to detect data corruption
-- Expected: 0 rows returned (all orders balanced)
-- ============================================================

-- 1. Orders where subtotal != sum(line_subtotal)
SELECT
  o.id AS order_id,
  o.order_number,
  o.tenant_id,
  o.subtotal AS stored_subtotal,
  COALESCE(l.computed_subtotal, 0) AS computed_subtotal,
  o.subtotal - COALESCE(l.computed_subtotal, 0) AS subtotal_diff
FROM orders o
LEFT JOIN (
  SELECT order_id, SUM(line_subtotal)::int AS computed_subtotal
  FROM order_lines GROUP BY order_id
) l ON l.order_id = o.id
WHERE o.status NOT IN ('deleted')
  AND o.subtotal != COALESCE(l.computed_subtotal, 0)
ORDER BY ABS(o.subtotal - COALESCE(l.computed_subtotal, 0)) DESC;

-- 2. Orders where tax_total != sum(line_tax) + sum(charge_tax)
SELECT
  o.id AS order_id,
  o.order_number,
  o.tax_total AS stored_tax,
  COALESCE(l.line_taxes, 0) + COALESCE(c.charge_taxes, 0) AS computed_tax,
  o.tax_total - (COALESCE(l.line_taxes, 0) + COALESCE(c.charge_taxes, 0)) AS tax_diff
FROM orders o
LEFT JOIN (
  SELECT order_id, SUM(line_tax)::int AS line_taxes
  FROM order_lines GROUP BY order_id
) l ON l.order_id = o.id
LEFT JOIN (
  SELECT order_id, SUM(tax_amount)::int AS charge_taxes
  FROM order_charges GROUP BY order_id
) c ON c.order_id = o.id
WHERE o.status NOT IN ('deleted')
  AND o.tax_total != COALESCE(l.line_taxes, 0) + COALESCE(c.charge_taxes, 0)
ORDER BY ABS(o.tax_total - (COALESCE(l.line_taxes, 0) + COALESCE(c.charge_taxes, 0))) DESC;

-- 3. Orders where total doesn't match the formula:
--    total = MAX(0, sum(line_total) + service_charge_total + service_charge_tax - discount_total + rounding_adjustment)
SELECT
  o.id AS order_id,
  o.order_number,
  o.total AS stored_total,
  GREATEST(0,
    COALESCE(l.line_totals, 0) +
    COALESCE(c.charge_amounts, 0) +
    COALESCE(c.charge_taxes, 0) -
    COALESCE(d.discount_amounts, 0) +
    o.rounding_adjustment
  ) AS computed_total,
  o.total - GREATEST(0,
    COALESCE(l.line_totals, 0) +
    COALESCE(c.charge_amounts, 0) +
    COALESCE(c.charge_taxes, 0) -
    COALESCE(d.discount_amounts, 0) +
    o.rounding_adjustment
  ) AS total_diff
FROM orders o
LEFT JOIN (
  SELECT order_id, SUM(line_total)::int AS line_totals
  FROM order_lines GROUP BY order_id
) l ON l.order_id = o.id
LEFT JOIN (
  SELECT order_id,
    SUM(amount)::int AS charge_amounts,
    SUM(tax_amount)::int AS charge_taxes
  FROM order_charges GROUP BY order_id
) c ON c.order_id = o.id
LEFT JOIN (
  SELECT order_id, SUM(amount)::int AS discount_amounts
  FROM order_discounts GROUP BY order_id
) d ON d.order_id = o.id
WHERE o.status NOT IN ('deleted')
  AND o.total != GREATEST(0,
    COALESCE(l.line_totals, 0) +
    COALESCE(c.charge_amounts, 0) +
    COALESCE(c.charge_taxes, 0) -
    COALESCE(d.discount_amounts, 0) +
    o.rounding_adjustment
  )
ORDER BY ABS(o.total - GREATEST(0,
    COALESCE(l.line_totals, 0) +
    COALESCE(c.charge_amounts, 0) +
    COALESCE(c.charge_taxes, 0) -
    COALESCE(d.discount_amounts, 0) +
    o.rounding_adjustment
  )) DESC;

-- 4. Orders with negative totals (should never exist)
SELECT id, order_number, tenant_id, total
FROM orders
WHERE total < 0
ORDER BY total ASC;
