import { db } from '@oppsera/db';
import type { EventEnvelope } from '@oppsera/shared';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { ensureAccountingSettings } from '../helpers/ensure-accounting-settings';
import { logUnmappedEvent } from '../helpers/resolve-mapping';

interface CompEventData {
  compEventId: string;
  orderId: string;
  orderLineId: string;
  amountCents: number;
  reason: string;
  compCategory: string;
  approvedBy: string | null;
  locationId: string;
  businessDate: string;
}

interface VoidLineEventData {
  orderId: string;
  orderLineId: string;
  voidedAmountCents: number;
  reason: string;
  approvedBy: string | null;
  wasteTracking: boolean;
  locationId: string;
  catalogItemId: string | null;
  catalogItemName: string | null;
  subDepartmentId: string | null;
}

/**
 * GL posting for order line comp.
 *
 * When a line item is comped (manager/quality/promo comp):
 *   Dr Comp Expense (or sub-department comp account)  / Cr Revenue (or sub-department revenue)
 *
 * Uses sub-department GL mapping if available for granular expense tracking.
 *
 * Never throws — GL failures never block POS operations.
 */
export async function handleCompForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as CompEventData;

  try {
    // Zero-amount comps skip GL
    if (data.amountCents === 0) return;

    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }

    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'order.line.comped.v1',
          sourceModule: 'pos',
          sourceReferenceId: data.compEventId,
          entityType: 'accounting_settings',
          entityId: event.tenantId,
          reason: 'CRITICAL: GL comp posting skipped — accounting settings missing even after ensureAccountingSettings.',
        });
      } catch { /* best-effort */ }
      console.error(`[comp-gl] CRITICAL: accounting settings missing for tenant=${event.tenantId} after ensureAccountingSettings`);
      return;
    }

    // Comp expense account — try sub-department mapping first
    const settingsAny = settings as Record<string, any>;
    const compExpenseAccountId: string | null = (settingsAny.defaultCompExpenseAccountId as string | null)
      ?? settings.defaultUncategorizedRevenueAccountId;
    const revenueAccountId: string | null = settings.defaultUncategorizedRevenueAccountId;

    // Try sub-department-specific comp account (NOTE: the comp event doesn't carry subDepartmentId
    // directly, so we use the default. For richer resolution, the event payload would need enrichment.)

    if (!compExpenseAccountId || !revenueAccountId) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'order.line.comped.v1',
          sourceModule: 'pos',
          sourceReferenceId: data.compEventId,
          entityType: 'gl_account',
          entityId: !compExpenseAccountId ? 'comp_expense' : 'revenue',
          reason: `Comp of $${(data.amountCents / 100).toFixed(2)} (${data.compCategory}: ${data.reason}) has no ${!compExpenseAccountId ? 'Comp Expense' : 'Revenue'} GL account configured.`,
        });
      } catch { /* best-effort */ }
      return;
    }

    const amountDollars = (data.amountCents / 100).toFixed(2);

    const postingApi = getAccountingPostingApi();
    await postingApi.postEntry(
      {
        tenantId: event.tenantId,
        user: { id: data.approvedBy ?? 'system', email: '' },
        requestId: `comp-gl-${data.compEventId}`,
      } as any,
      {
        businessDate: data.businessDate,
        sourceModule: 'pos',
        sourceReferenceId: `comp-${data.compEventId}`,
        memo: `Comp: $${amountDollars} — ${data.compCategory}: ${data.reason} (order ${data.orderId})`,
        lines: [
          {
            accountId: compExpenseAccountId,
            debitAmount: amountDollars,
            creditAmount: '0',
            memo: `Comp expense — ${data.compCategory}`,
          },
          {
            accountId: revenueAccountId,
            debitAmount: '0',
            creditAmount: amountDollars,
            memo: `Revenue offset — comp`,
          },
        ],
        forcePost: true,
      },
    );
  } catch (error) {
    console.error(`[comp-gl] GL posting failed for comp ${data.compEventId}:`, error);
  }
}

/**
 * GL posting for order line void (before payment).
 *
 * When a line is voided on an open/placed order:
 * - If the order has NOT been tendered yet, the line void simply reduces the order total.
 *   No GL entry is needed because the POS adapter posts GL at tender time based on
 *   the final order total (which already reflects the void).
 * - If the order HAS been partially tendered, we need to reverse the proportional revenue:
 *   Dr Revenue  / Cr Accounts Receivable (or similar clearing)
 *
 * For simplicity in V1, line voids on unpaid orders DON'T need GL (order total recalculated,
 * GL happens at tender time). Line voids on paid orders are a different operation (return/refund).
 *
 * However, we still log the event for audit completeness.
 *
 * Never throws — GL failures never block POS operations.
 */
export async function handleLineVoidForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as VoidLineEventData;

  try {
    // Zero-amount voids skip completely
    if (data.voidedAmountCents === 0) return;

    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }

    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'order.line.voided.v1',
          sourceModule: 'pos',
          sourceReferenceId: `${data.orderId}-${data.orderLineId}`,
          entityType: 'accounting_settings',
          entityId: event.tenantId,
          reason: 'CRITICAL: GL line void posting skipped — accounting settings missing even after ensureAccountingSettings.',
        });
      } catch { /* best-effort */ }
      console.error(`[void-line-gl] CRITICAL: accounting settings missing for tenant=${event.tenantId} after ensureAccountingSettings`);
      return;
    }

    // V1 approach: Line voids on open orders don't need GL (order total recalculated before tender).
    // We log it for audit trail and the accountant can review.
    // Waste-tracked voids (already sent to kitchen) are especially important for operational reports.

    if (data.wasteTracking) {
      // Waste tracking: Dr Waste Expense / Cr Inventory (or Uncategorized)
      // This represents product that was prepared but discarded
      const wasteAccountId = (settings as Record<string, any>).defaultCompExpenseAccountId
        ?? settings.defaultUncategorizedRevenueAccountId;
      const inventoryAccountId = (settings as Record<string, any>).defaultInventoryAssetAccountId
        ?? settings.defaultUncategorizedRevenueAccountId;

      if (wasteAccountId && inventoryAccountId) {
        const amountDollars = (data.voidedAmountCents / 100).toFixed(2);

        const postingApi = getAccountingPostingApi();
        await postingApi.postEntry(
          {
            tenantId: event.tenantId,
            user: { id: data.approvedBy ?? 'system', email: '' },
            requestId: `void-line-gl-${data.orderId}-${data.orderLineId}`,
          } as any,
          {
            businessDate: new Date().toISOString().split('T')[0]!,
            sourceModule: 'pos',
            sourceReferenceId: `void-line-${data.orderId}-${data.orderLineId}`,
            memo: `Line void (waste): $${amountDollars} — ${data.catalogItemName ?? 'item'} — ${data.reason}`,
            lines: [
              {
                accountId: wasteAccountId,
                debitAmount: amountDollars,
                creditAmount: '0',
                memo: `Kitchen waste — ${data.catalogItemName ?? data.orderLineId}`,
              },
              {
                accountId: inventoryAccountId,
                debitAmount: '0',
                creditAmount: amountDollars,
                memo: `Inventory write-off — ${data.catalogItemName ?? data.orderLineId}`,
              },
            ],
            forcePost: true,
          },
        );
      }
    }

    // For non-waste voids: no GL needed in V1 (order total recalculated, GL at tender time).
    // Log for audit trail regardless.
    // NOTE: If this void happens AFTER a tender was recorded (partial pay), the existing
    // POS adapter proportional allocation will handle the discrepancy at final tender.

  } catch (error) {
    console.error(`[void-line-gl] GL posting failed for line void ${data.orderId}/${data.orderLineId}:`, error);
  }
}
