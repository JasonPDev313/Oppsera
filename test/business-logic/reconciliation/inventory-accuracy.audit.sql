-- ============================================================
-- RECONCILIATION QUERY: Inventory Accuracy
-- ============================================================
-- Purpose: Verify inventory accuracy and detect stock anomalies
-- Run: Against production (read-only) for audit/reconciliation
-- Expected: 0 rows for discrepancy queries
-- ============================================================

-- 1. Computed on-hand for all active inventory items
-- (on-hand is ALWAYS computed as SUM(quantity_delta), never stored)
SELECT
  ii.id AS inventory_item_id,
  ii.tenant_id,
  ii.location_id,
  ii.name,
  ii.sku,
  ii.allow_negative,
  COALESCE(m.computed_on_hand, 0) AS on_hand,
  ii.reorder_point,
  CASE
    WHEN COALESCE(m.computed_on_hand, 0) <= 0 THEN 'OUT_OF_STOCK'
    WHEN COALESCE(m.computed_on_hand, 0) <= COALESCE(ii.reorder_point::numeric, 0) THEN 'LOW_STOCK'
    ELSE 'OK'
  END AS stock_status
FROM inventory_items ii
LEFT JOIN (
  SELECT
    inventory_item_id,
    SUM(quantity_delta::numeric) AS computed_on_hand
  FROM inventory_movements
  GROUP BY inventory_item_id
) m ON m.inventory_item_id = ii.id
WHERE ii.status = 'active' AND ii.track_inventory = true
ORDER BY COALESCE(m.computed_on_hand, 0) ASC;

-- 2. Items with negative stock (when allow_negative = false)
SELECT
  ii.id AS inventory_item_id,
  ii.tenant_id,
  ii.location_id,
  ii.name,
  ii.allow_negative,
  SUM(im.quantity_delta::numeric) AS on_hand
FROM inventory_items ii
JOIN inventory_movements im ON im.inventory_item_id = ii.id
WHERE ii.status = 'active'
  AND ii.allow_negative = false
GROUP BY ii.id, ii.tenant_id, ii.location_id, ii.name, ii.allow_negative
HAVING SUM(im.quantity_delta::numeric) < 0
ORDER BY SUM(im.quantity_delta::numeric) ASC;

-- 3. Transfer batches that don't balance (out + in != 0)
SELECT
  batch_id,
  tenant_id,
  SUM(CASE WHEN movement_type = 'transfer_out' THEN quantity_delta::numeric ELSE 0 END) AS out_total,
  SUM(CASE WHEN movement_type = 'transfer_in' THEN quantity_delta::numeric ELSE 0 END) AS in_total,
  SUM(quantity_delta::numeric) AS net
FROM inventory_movements
WHERE batch_id IS NOT NULL
  AND movement_type IN ('transfer_out', 'transfer_in')
GROUP BY batch_id, tenant_id
HAVING SUM(quantity_delta::numeric) != 0
ORDER BY ABS(SUM(quantity_delta::numeric)) DESC;

-- 4. Duplicate movements (same reference should not produce duplicate entries)
-- Checks the idempotency constraint
SELECT
  tenant_id,
  reference_type,
  reference_id,
  inventory_item_id,
  movement_type,
  COUNT(*) AS duplicate_count
FROM inventory_movements
WHERE reference_type IS NOT NULL
  AND reference_id IS NOT NULL
GROUP BY tenant_id, reference_type, reference_id, inventory_item_id, movement_type
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- 5. Sale movements without a matching order
SELECT
  im.id AS movement_id,
  im.tenant_id,
  im.inventory_item_id,
  im.reference_id AS order_id,
  im.quantity_delta,
  im.created_at,
  o.id AS found_order_id
FROM inventory_movements im
LEFT JOIN orders o ON o.id = im.reference_id
WHERE im.movement_type = 'sale'
  AND im.reference_type = 'order'
  AND o.id IS NULL
ORDER BY im.created_at DESC;

-- 6. Void reversals without a matching sale
-- (Every void_reversal should have a corresponding sale for the same order)
SELECT
  vr.id AS reversal_movement_id,
  vr.tenant_id,
  vr.inventory_item_id,
  vr.reference_id AS order_id,
  vr.quantity_delta AS reversal_qty,
  COALESCE(sale.sale_qty, 0) AS original_sale_qty
FROM inventory_movements vr
LEFT JOIN (
  SELECT reference_id, inventory_item_id, SUM(quantity_delta::numeric) AS sale_qty
  FROM inventory_movements
  WHERE movement_type = 'sale' AND reference_type = 'order'
  GROUP BY reference_id, inventory_item_id
) sale ON sale.reference_id = vr.reference_id AND sale.inventory_item_id = vr.inventory_item_id
WHERE vr.movement_type = 'void_reversal'
  AND vr.reference_type = 'order'
  AND sale.sale_qty IS NULL
ORDER BY vr.created_at DESC;

-- 7. Movement volume by type (for monitoring)
SELECT
  tenant_id,
  movement_type,
  COUNT(*) AS movement_count,
  SUM(quantity_delta::numeric) AS total_delta,
  MIN(created_at) AS earliest,
  MAX(created_at) AS latest
FROM inventory_movements
GROUP BY tenant_id, movement_type
ORDER BY tenant_id, movement_count DESC;
