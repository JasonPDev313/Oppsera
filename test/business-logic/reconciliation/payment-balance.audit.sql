-- ============================================================
-- RECONCILIATION QUERY: Payment Balance Integrity
-- ============================================================
-- Purpose: Find payment mismatches between orders and tenders
-- Run: Against production (read-only) to detect reconciliation issues
-- Expected: 0 rows for paid orders; partial rows for open orders are OK
-- ============================================================

-- 1. Paid orders where sum(tender.amount) - sum(reversal.amount) != order.total
SELECT
  o.id AS order_id,
  o.order_number,
  o.tenant_id,
  o.status,
  o.total AS order_total,
  COALESCE(t.total_tendered, 0) AS total_tendered,
  COALESCE(r.total_reversed, 0) AS total_reversed,
  COALESCE(t.total_tendered, 0) - COALESCE(r.total_reversed, 0) AS net_paid,
  o.total - (COALESCE(t.total_tendered, 0) - COALESCE(r.total_reversed, 0)) AS difference
FROM orders o
LEFT JOIN (
  SELECT order_id, SUM(amount)::int AS total_tendered
  FROM tenders WHERE status = 'captured'
  GROUP BY order_id
) t ON t.order_id = o.id
LEFT JOIN (
  SELECT order_id, SUM(amount)::int AS total_reversed
  FROM tender_reversals WHERE status = 'completed'
  GROUP BY order_id
) r ON r.order_id = o.id
WHERE o.status = 'paid'
  AND o.total != COALESCE(t.total_tendered, 0) - COALESCE(r.total_reversed, 0)
ORDER BY ABS(o.total - (COALESCE(t.total_tendered, 0) - COALESCE(r.total_reversed, 0))) DESC;

-- 2. Voided orders where net paid != 0 (reversals should zero out)
SELECT
  o.id AS order_id,
  o.order_number,
  o.tenant_id,
  COALESCE(t.total_tendered, 0) AS total_tendered,
  COALESCE(r.total_reversed, 0) AS total_reversed,
  COALESCE(t.total_tendered, 0) - COALESCE(r.total_reversed, 0) AS net_paid
FROM orders o
LEFT JOIN (
  SELECT order_id, SUM(amount)::int AS total_tendered
  FROM tenders WHERE status = 'captured'
  GROUP BY order_id
) t ON t.order_id = o.id
LEFT JOIN (
  SELECT order_id, SUM(amount)::int AS total_reversed
  FROM tender_reversals WHERE status = 'completed'
  GROUP BY order_id
) r ON r.order_id = o.id
WHERE o.status = 'voided'
  AND COALESCE(t.total_tendered, 0) > 0
  AND COALESCE(t.total_tendered, 0) - COALESCE(r.total_reversed, 0) != 0
ORDER BY ABS(COALESCE(t.total_tendered, 0) - COALESCE(r.total_reversed, 0)) DESC;

-- 3. Reversals exceeding original tender amount
SELECT
  tr.id AS reversal_id,
  tr.original_tender_id,
  tr.order_id,
  tr.tenant_id,
  t.amount AS tender_amount,
  reversal_totals.total_reversed,
  reversal_totals.total_reversed - t.amount AS overage
FROM tender_reversals tr
JOIN tenders t ON t.id = tr.original_tender_id
JOIN (
  SELECT original_tender_id, SUM(amount)::int AS total_reversed
  FROM tender_reversals WHERE status = 'completed'
  GROUP BY original_tender_id
) reversal_totals ON reversal_totals.original_tender_id = tr.original_tender_id
WHERE reversal_totals.total_reversed > t.amount
ORDER BY reversal_totals.total_reversed - t.amount DESC;

-- 4. Orphan tenders (order doesn't exist or is deleted)
SELECT
  t.id AS tender_id,
  t.order_id,
  t.tenant_id,
  t.amount,
  t.tender_type,
  o.status AS order_status
FROM tenders t
LEFT JOIN orders o ON o.id = t.order_id
WHERE o.id IS NULL OR o.status = 'deleted'
ORDER BY t.created_at DESC;

-- 5. GL journal entries that don't balance (sum(debit) != sum(credit))
SELECT
  pje.id,
  pje.reference_id,
  pje.reference_type,
  pje.order_id,
  pje.tenant_id,
  (SELECT SUM((e->>'debit')::int) FROM jsonb_array_elements(pje.entries) e) AS total_debit,
  (SELECT SUM((e->>'credit')::int) FROM jsonb_array_elements(pje.entries) e) AS total_credit,
  (SELECT SUM((e->>'debit')::int) FROM jsonb_array_elements(pje.entries) e) -
  (SELECT SUM((e->>'credit')::int) FROM jsonb_array_elements(pje.entries) e) AS imbalance
FROM payment_journal_entries pje
WHERE pje.posting_status = 'posted'
  AND (SELECT SUM((e->>'debit')::int) FROM jsonb_array_elements(pje.entries) e) !=
      (SELECT SUM((e->>'credit')::int) FROM jsonb_array_elements(pje.entries) e)
ORDER BY ABS(
  (SELECT SUM((e->>'debit')::int) FROM jsonb_array_elements(pje.entries) e) -
  (SELECT SUM((e->>'credit')::int) FROM jsonb_array_elements(pje.entries) e)
) DESC;
