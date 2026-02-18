-- ============================================================
-- RECONCILIATION QUERY: Daily Revenue Reconciliation
-- ============================================================
-- Purpose: Cross-check revenue totals across orders, tenders, and GL
-- Run: Against production (read-only) — typically for daily close
-- Expected: All three sources should agree within rounding tolerance
-- ============================================================

-- 1. Daily revenue from orders (by business_date)
SELECT
  tenant_id,
  business_date,
  COUNT(*) AS order_count,
  SUM(subtotal)::int AS gross_revenue,
  SUM(tax_total)::int AS tax_collected,
  SUM(service_charge_total)::int AS service_charges,
  SUM(discount_total)::int AS discounts,
  SUM(total)::int AS net_revenue
FROM orders
WHERE status IN ('placed', 'paid')
GROUP BY tenant_id, business_date
ORDER BY business_date DESC, tenant_id;

-- 2. Daily tender collection (by business_date)
SELECT
  t.tenant_id,
  t.business_date,
  t.tender_type,
  COUNT(*) AS tender_count,
  SUM(t.amount)::int AS total_tendered,
  SUM(t.tip_amount)::int AS total_tips,
  COALESCE(SUM(tr.reversed), 0)::int AS total_reversed,
  SUM(t.amount)::int - COALESCE(SUM(tr.reversed), 0)::int AS net_collected
FROM tenders t
LEFT JOIN (
  SELECT original_tender_id, SUM(amount) AS reversed
  FROM tender_reversals WHERE status = 'completed'
  GROUP BY original_tender_id
) tr ON tr.original_tender_id = t.id
WHERE t.status = 'captured'
GROUP BY t.tenant_id, t.business_date, t.tender_type
ORDER BY t.business_date DESC, t.tenant_id, t.tender_type;

-- 3. Daily comparison: order revenue vs tender collection
WITH order_daily AS (
  SELECT tenant_id, business_date,
    SUM(total)::int AS order_total
  FROM orders
  WHERE status = 'paid'
  GROUP BY tenant_id, business_date
),
tender_daily AS (
  SELECT t.tenant_id, t.business_date,
    SUM(t.amount)::int - COALESCE(SUM(tr.reversed), 0)::int AS tender_net
  FROM tenders t
  LEFT JOIN (
    SELECT original_tender_id, SUM(amount) AS reversed
    FROM tender_reversals WHERE status = 'completed'
    GROUP BY original_tender_id
  ) tr ON tr.original_tender_id = t.id
  WHERE t.status = 'captured'
  GROUP BY t.tenant_id, t.business_date
)
SELECT
  COALESCE(o.tenant_id, t.tenant_id) AS tenant_id,
  COALESCE(o.business_date, t.business_date) AS business_date,
  COALESCE(o.order_total, 0) AS order_revenue,
  COALESCE(t.tender_net, 0) AS tender_collection,
  COALESCE(o.order_total, 0) - COALESCE(t.tender_net, 0) AS variance
FROM order_daily o
FULL OUTER JOIN tender_daily t
  ON o.tenant_id = t.tenant_id AND o.business_date = t.business_date
WHERE COALESCE(o.order_total, 0) != COALESCE(t.tender_net, 0)
ORDER BY ABS(COALESCE(o.order_total, 0) - COALESCE(t.tender_net, 0)) DESC;

-- 4. Tax collection by rate (for tax filing)
SELECT
  o.tenant_id,
  o.business_date,
  'order_line_tax' AS tax_source,
  SUM(ol.line_tax)::int AS tax_amount,
  COUNT(DISTINCT o.id) AS order_count
FROM orders o
JOIN order_lines ol ON ol.order_id = o.id
WHERE o.status IN ('placed', 'paid')
GROUP BY o.tenant_id, o.business_date
ORDER BY o.business_date DESC, o.tenant_id;

-- 5. Service charge totals by day (for staff payroll/pooling)
SELECT
  o.tenant_id,
  o.business_date,
  SUM(oc.amount)::int AS total_charges,
  SUM(oc.tax_amount)::int AS charge_tax,
  COUNT(*) AS charge_count
FROM order_charges oc
JOIN orders o ON o.id = oc.order_id
WHERE o.status IN ('placed', 'paid')
GROUP BY o.tenant_id, o.business_date
ORDER BY o.business_date DESC;

-- 6. Tips by day (for staff payroll)
SELECT
  tenant_id,
  business_date,
  tender_type,
  SUM(tip_amount)::int AS total_tips,
  COUNT(CASE WHEN tip_amount > 0 THEN 1 END) AS tipped_count,
  COUNT(*) AS total_tenders,
  ROUND(100.0 * COUNT(CASE WHEN tip_amount > 0 THEN 1 END) / NULLIF(COUNT(*), 0), 1) AS tip_pct
FROM tenders
WHERE status = 'captured'
GROUP BY tenant_id, business_date, tender_type
HAVING SUM(tip_amount) > 0
ORDER BY business_date DESC, tender_type;
