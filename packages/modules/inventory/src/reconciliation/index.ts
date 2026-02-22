import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { InventoryMovementsSummaryData } from '@oppsera/core/helpers/reconciliation-read-api';

// ── getInventoryMovementsSummary ────────────────────────────────
/**
 * Computes beginning and ending inventory valuation for a period.
 * Beginning = SUM(on_hand_before_period * currentCost) for all items.
 * Ending = SUM(on_hand_through_end * currentCost) for all items.
 */
export async function getInventoryMovementsSummary(
  tenantId: string,
  locationId: string | undefined,
  periodStart: string,
  periodEnd: string,
): Promise<InventoryMovementsSummaryData> {
  return withTenant(tenantId, async (tx) => {
    const locationFilter = locationId
      ? sql`AND im.location_id = ${locationId}`
      : sql``;

    // Beginning inventory: SUM(on_hand_before_period * currentCost)
    const beginRows = await tx.execute(sql`
      SELECT COALESCE(SUM(
        sub.on_hand * COALESCE(ii.current_cost, 0)
      ), 0) AS total
      FROM (
        SELECT im.inventory_item_id, SUM(im.quantity_delta) AS on_hand
        FROM inventory_movements im
        WHERE im.tenant_id = ${tenantId}
          AND im.business_date < ${periodStart}
          ${locationFilter}
        GROUP BY im.inventory_item_id
      ) sub
      JOIN inventory_items ii ON ii.id = sub.inventory_item_id
      WHERE ii.tenant_id = ${tenantId}
    `);
    const beginArr = Array.from(beginRows as Iterable<Record<string, unknown>>);
    const beginningInventoryDollars = Number(beginArr[0]?.total ?? '0');

    // Ending inventory: SUM(on_hand_through_end * currentCost)
    const endRows = await tx.execute(sql`
      SELECT COALESCE(SUM(
        sub.on_hand * COALESCE(ii.current_cost, 0)
      ), 0) AS total
      FROM (
        SELECT im.inventory_item_id, SUM(im.quantity_delta) AS on_hand
        FROM inventory_movements im
        WHERE im.tenant_id = ${tenantId}
          AND im.business_date <= ${periodEnd}
          ${locationFilter}
        GROUP BY im.inventory_item_id
      ) sub
      JOIN inventory_items ii ON ii.id = sub.inventory_item_id
      WHERE ii.tenant_id = ${tenantId}
    `);
    const endArr = Array.from(endRows as Iterable<Record<string, unknown>>);
    const endingInventoryDollars = Number(endArr[0]?.total ?? '0');

    return {
      beginningInventoryDollars,
      endingInventoryDollars,
    };
  });
}

// ── getReceivingPurchasesTotals ──────────────────────────────────
/**
 * SUM of posted receiving receipts in the period.
 * Used by periodic COGS calculation.
 */
export async function getReceivingPurchasesTotals(
  tenantId: string,
  periodStart: string,
  periodEnd: string,
): Promise<number> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT COALESCE(SUM(rr.total), 0) AS total
      FROM receiving_receipts rr
      WHERE rr.tenant_id = ${tenantId}
        AND rr.status = 'posted'
        AND rr.receipt_date >= ${periodStart}
        AND rr.receipt_date <= ${periodEnd}
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    return Number(arr[0]?.total ?? '0');
  });
}
