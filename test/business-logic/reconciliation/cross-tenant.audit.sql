-- ============================================================
-- RECONCILIATION QUERY: Cross-Tenant Data Integrity
-- ============================================================
-- Purpose: Detect data leaks or miscategorized tenant data
-- Run: Against production (admin connection, bypasses RLS)
-- Expected: 0 rows for all queries (no cross-contamination)
-- ============================================================

-- 1. Order lines referencing a different tenant than their parent order
SELECT
  ol.id AS line_id,
  ol.tenant_id AS line_tenant,
  o.tenant_id AS order_tenant,
  ol.order_id
FROM order_lines ol
JOIN orders o ON o.id = ol.order_id
WHERE ol.tenant_id != o.tenant_id;

-- 2. Order charges referencing a different tenant than their parent order
SELECT
  oc.id AS charge_id,
  oc.tenant_id AS charge_tenant,
  o.tenant_id AS order_tenant,
  oc.order_id
FROM order_charges oc
JOIN orders o ON o.id = oc.order_id
WHERE oc.tenant_id != o.tenant_id;

-- 3. Order discounts referencing a different tenant than their parent order
SELECT
  od.id AS discount_id,
  od.tenant_id AS discount_tenant,
  o.tenant_id AS order_tenant,
  od.order_id
FROM order_discounts od
JOIN orders o ON o.id = od.order_id
WHERE od.tenant_id != o.tenant_id;

-- 4. Tenders referencing a different tenant than their order
SELECT
  t.id AS tender_id,
  t.tenant_id AS tender_tenant,
  o.tenant_id AS order_tenant,
  t.order_id
FROM tenders t
JOIN orders o ON o.id = t.order_id
WHERE t.tenant_id != o.tenant_id;

-- 5. Tender reversals referencing a different tenant than their tender
SELECT
  tr.id AS reversal_id,
  tr.tenant_id AS reversal_tenant,
  t.tenant_id AS tender_tenant,
  tr.original_tender_id
FROM tender_reversals tr
JOIN tenders t ON t.id = tr.original_tender_id
WHERE tr.tenant_id != t.tenant_id;

-- 6. Inventory movements referencing a different tenant than their item
SELECT
  im.id AS movement_id,
  im.tenant_id AS movement_tenant,
  ii.tenant_id AS item_tenant,
  im.inventory_item_id
FROM inventory_movements im
JOIN inventory_items ii ON ii.id = im.inventory_item_id
WHERE im.tenant_id != ii.tenant_id;

-- 7. Locations belonging to non-existent tenants
SELECT
  l.id AS location_id,
  l.tenant_id,
  l.name AS location_name
FROM locations l
LEFT JOIN tenants t ON t.id = l.tenant_id
WHERE t.id IS NULL;

-- 8. Users with roles in non-existent tenants
SELECT
  ur.id AS role_id,
  ur.user_id,
  ur.tenant_id,
  ur.role
FROM user_roles ur
LEFT JOIN tenants t ON t.id = ur.tenant_id
WHERE t.id IS NULL;

-- 9. GL journal entries referencing orders from a different tenant
SELECT
  pje.id AS journal_id,
  pje.tenant_id AS journal_tenant,
  o.tenant_id AS order_tenant,
  pje.order_id
FROM payment_journal_entries pje
JOIN orders o ON o.id = pje.order_id
WHERE pje.tenant_id != o.tenant_id;

-- 10. Summary: row counts per tenant per table (for monitoring)
SELECT 'orders' AS table_name, tenant_id, COUNT(*) AS row_count FROM orders GROUP BY tenant_id
UNION ALL
SELECT 'order_lines', tenant_id, COUNT(*) FROM order_lines GROUP BY tenant_id
UNION ALL
SELECT 'tenders', tenant_id, COUNT(*) FROM tenders GROUP BY tenant_id
UNION ALL
SELECT 'inventory_items', tenant_id, COUNT(*) FROM inventory_items GROUP BY tenant_id
UNION ALL
SELECT 'inventory_movements', tenant_id, COUNT(*) FROM inventory_movements GROUP BY tenant_id
UNION ALL
SELECT 'customers', tenant_id, COUNT(*) FROM customers GROUP BY tenant_id
UNION ALL
SELECT 'catalog_items', tenant_id, COUNT(*) FROM catalog_items GROUP BY tenant_id
ORDER BY table_name, tenant_id;
