import { eq, and, sql, gte, lte } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { periodicCogsCalculations, accountingSettings } from '@oppsera/db';
import { AppError, generateUlid } from '@oppsera/shared';
import { auditLogSystem } from '@oppsera/core/audit/helpers';
import type { CalculatePeriodicCogsInput } from '../validation';

interface CogsSubDeptDetail {
  subDepartmentId: string;
  subDepartmentName: string | null;
  beginningInventoryDollars: string;
  purchasesDollars: string;
  endingInventoryDollars: string;
  cogsDollars: string;
}

export interface PeriodicCogsCalculation {
  id: string;
  tenantId: string;
  locationId: string | null;
  periodStart: string;
  periodEnd: string;
  status: string;
  calculationMethod: string;
  beginningInventoryDollars: string;
  purchasesDollars: string;
  endingInventoryDollars: string;
  cogsDollars: string;
  detail: CogsSubDeptDetail[] | null;
  glJournalEntryId: string | null;
  calculatedAt: string;
  postedAt: string | null;
  postedBy: string | null;
}

/**
 * Calculate periodic COGS for a date range.
 *
 * Formula: COGS = Beginning Inventory + Purchases − Ending Inventory
 *
 * - Beginning Inventory: ending inventory from previous period's calculation,
 *   or current inventory value at period start (SUM of on-hand * currentCost)
 * - Purchases: SUM of receiving receipts posted within the period
 * - Ending Inventory: current on-hand * currentCost (or manual override)
 *
 * Creates a draft calculation that must be explicitly posted via postPeriodicCogs.
 */
export async function calculatePeriodicCogs(
  tenantId: string,
  input: CalculatePeriodicCogsInput,
): Promise<PeriodicCogsCalculation> {
  return withTenant(tenantId, async (tx) => {
    // Verify tenant has periodic COGS mode
    const [settings] = await tx
      .select()
      .from(accountingSettings)
      .where(eq(accountingSettings.tenantId, tenantId))
      .limit(1);

    if (!settings) {
      throw new AppError('VALIDATION_ERROR', 'Accounting settings not configured', 400);
    }

    if (settings.cogsPostingMode !== 'periodic') {
      throw new AppError(
        'VALIDATION_ERROR',
        `COGS posting mode is '${settings.cogsPostingMode}', expected 'periodic'`,
        400,
      );
    }

    const locationFilter = input.locationId
      ? sql`AND im.location_id = ${input.locationId}`
      : sql``;

    const locationFilterReceipt = input.locationId
      ? sql`AND rr.location_id = ${input.locationId}`
      : sql``;

    // ── 1. Beginning inventory ─────────────────────────────────────
    // Look for previous period's ending inventory (from most recent posted calculation)
    const prevCalcRows = await tx.execute(sql`
      SELECT ending_inventory_dollars
      FROM periodic_cogs_calculations
      WHERE tenant_id = ${tenantId}
        AND status = 'posted'
        AND period_end < ${input.periodStart}
        ${input.locationId ? sql`AND location_id = ${input.locationId}` : sql`AND location_id IS NULL`}
      ORDER BY period_end DESC
      LIMIT 1
    `);
    const prevCalcArr = Array.from(prevCalcRows as Iterable<Record<string, unknown>>);

    let beginningInventoryDollars: number;

    if (prevCalcArr.length > 0) {
      beginningInventoryDollars = Number(prevCalcArr[0]!.ending_inventory_dollars);
    } else {
      // No previous calculation — compute from inventory movements before period start
      // Beginning = SUM(on_hand_at_start * currentCost) for all items
      const beginRows = await tx.execute(sql`
        SELECT COALESCE(SUM(
          sub.on_hand * COALESCE(ii.current_cost, 0)
        ), 0) AS total
        FROM (
          SELECT im.inventory_item_id, SUM(im.quantity_delta) AS on_hand
          FROM inventory_movements im
          WHERE im.tenant_id = ${tenantId}
            AND im.business_date < ${input.periodStart}
            ${locationFilter}
          GROUP BY im.inventory_item_id
        ) sub
        JOIN inventory_items ii ON ii.id = sub.inventory_item_id
        WHERE ii.tenant_id = ${tenantId}
      `);
      const beginArr = Array.from(beginRows as Iterable<Record<string, unknown>>);

      beginningInventoryDollars = Number(beginArr[0]?.total ?? '0');
    }

    // ── 2. Purchases during period ─────────────────────────────────
    // SUM of posted receiving receipts in the period
    const purchasesRows = await tx.execute(sql`
      SELECT COALESCE(SUM(rr.total), 0) AS total
      FROM receiving_receipts rr
      WHERE rr.tenant_id = ${tenantId}
        AND rr.status = 'posted'
        AND rr.receipt_date >= ${input.periodStart}
        AND rr.receipt_date <= ${input.periodEnd}
        ${locationFilterReceipt}
    `);
    const purchasesArr = Array.from(purchasesRows as Iterable<Record<string, unknown>>);

    const purchasesDollars = Number(purchasesArr[0]?.total ?? '0');

    // ── 3. Ending inventory ────────────────────────────────────────
    let endingInventoryDollars: number;

    if (input.endingInventoryOverride) {
      // Manual override (e.g., from physical count)
      endingInventoryDollars = Number(input.endingInventoryOverride);
    } else {
      // Computed: SUM(on_hand_through_end * currentCost) for all items
      const endRows = await tx.execute(sql`
        SELECT COALESCE(SUM(
          sub.on_hand * COALESCE(ii.current_cost, 0)
        ), 0) AS total
        FROM (
          SELECT im.inventory_item_id, SUM(im.quantity_delta) AS on_hand
          FROM inventory_movements im
          WHERE im.tenant_id = ${tenantId}
            AND im.business_date <= ${input.periodEnd}
            ${locationFilter}
          GROUP BY im.inventory_item_id
        ) sub
        JOIN inventory_items ii ON ii.id = sub.inventory_item_id
        WHERE ii.tenant_id = ${tenantId}
      `);
      const endArr = Array.from(endRows as Iterable<Record<string, unknown>>);

      endingInventoryDollars = Number(endArr[0]?.total ?? '0');
    }

    // ── 4. COGS = Beginning + Purchases - Ending ───────────────────
    const cogsDollars = beginningInventoryDollars + purchasesDollars - endingInventoryDollars;

    // ── 5. Create draft calculation ────────────────────────────────
    const id = generateUlid();
    const [created] = await tx
      .insert(periodicCogsCalculations)
      .values({
        id,
        tenantId,
        locationId: input.locationId ?? null,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        status: 'draft',
        calculationMethod: settings.periodicCogsMethod ?? 'weighted_average',
        beginningInventoryDollars: beginningInventoryDollars.toFixed(2),
        purchasesDollars: purchasesDollars.toFixed(2),
        endingInventoryDollars: endingInventoryDollars.toFixed(2),
        cogsDollars: cogsDollars.toFixed(2),
      })
      .returning();

    await auditLogSystem(
      tenantId,
      'accounting.cogs.calculated',
      'periodic_cogs_calculation',
      created!.id,
      {
        amountDollars: cogsDollars.toFixed(2),
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      },
    );

    return {
      id: created!.id,
      tenantId: created!.tenantId,
      locationId: created!.locationId,
      periodStart: created!.periodStart,
      periodEnd: created!.periodEnd,
      status: created!.status,
      calculationMethod: created!.calculationMethod,
      beginningInventoryDollars: created!.beginningInventoryDollars,
      purchasesDollars: created!.purchasesDollars,
      endingInventoryDollars: created!.endingInventoryDollars,
      cogsDollars: created!.cogsDollars,
      detail: null,
      glJournalEntryId: created!.glJournalEntryId,
      calculatedAt: created!.calculatedAt.toISOString(),
      postedAt: created!.postedAt?.toISOString() ?? null,
      postedBy: created!.postedBy,
    };
  });
}
