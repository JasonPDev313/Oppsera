import { eq, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { periodicCogsCalculations, accountingSettings } from '@oppsera/db';
import { AppError, generateUlid } from '@oppsera/shared';
import { auditLogSystem } from '@oppsera/core/audit/helpers';
import { getReconciliationReadApi } from '@oppsera/core/helpers/reconciliation-read-api';
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
  // ── 1. Check settings + look for previous period (local) ──────
  const { settings, prevEndingInventory } = await withTenant(tenantId, async (tx) => {
    const [s] = await tx
      .select()
      .from(accountingSettings)
      .where(eq(accountingSettings.tenantId, tenantId))
      .limit(1);

    if (!s) {
      throw new AppError('VALIDATION_ERROR', 'Accounting settings not configured', 400);
    }

    if (s.cogsPostingMode !== 'periodic') {
      throw new AppError(
        'VALIDATION_ERROR',
        `COGS posting mode is '${s.cogsPostingMode}', expected 'periodic'`,
        400,
      );
    }

    // Look for previous period's ending inventory
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
    const prevEnding = prevCalcArr.length > 0 ? Number(prevCalcArr[0]!.ending_inventory_dollars) : null;

    return { settings: s, prevEndingInventory: prevEnding };
  });

  // ── 2. Cross-module data via ReconciliationReadApi ─────────────
  const api = getReconciliationReadApi();

  const [inventorySummary, purchasesDollars] = await Promise.all([
    // Inventory movements summary (beginning + ending valuations)
    // Only needed if no previous period or no manual override
    (prevEndingInventory !== null && input.endingInventoryOverride)
      ? Promise.resolve({ beginningInventoryDollars: 0, endingInventoryDollars: 0 })
      : api.getInventoryMovementsSummary(tenantId, input.locationId, input.periodStart, input.periodEnd),
    // Purchases from receiving receipts
    api.getReceivingPurchasesTotals(tenantId, input.periodStart, input.periodEnd),
  ]);

  // Resolve beginning inventory
  const beginningInventoryDollars = prevEndingInventory !== null
    ? prevEndingInventory
    : inventorySummary.beginningInventoryDollars;

  // Resolve ending inventory
  const endingInventoryDollars = input.endingInventoryOverride
    ? Number(input.endingInventoryOverride)
    : inventorySummary.endingInventoryDollars;

  // ── 3. COGS = Beginning + Purchases - Ending ──────────────────
  const cogsDollars = beginningInventoryDollars + purchasesDollars - endingInventoryDollars;

  // ── 4. Create draft calculation (local) ───────────────────────
  return withTenant(tenantId, async (tx) => {
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
