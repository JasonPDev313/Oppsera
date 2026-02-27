import { db } from '@oppsera/db';
import type { EventEnvelope } from '@oppsera/shared';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { ensureAccountingSettings } from '../helpers/ensure-accounting-settings';
import { logUnmappedEvent } from '../helpers/resolve-mapping';

interface DrawerEventRecordedData {
  drawerSessionEventId: string;
  drawerSessionId: string;
  eventType: 'paid_in' | 'paid_out' | 'cash_drop' | 'drawer_open' | 'no_sale';
  amountCents: number;
  employeeId: string;
}

/**
 * GL posting for drawer events that physically move cash.
 *
 * paid_in (cash added to drawer, e.g., change fund, petty cash):
 *   Dr Cash On Hand (Undeposited Funds)  / Cr Cash Source (Petty Cash or Operating)
 *
 * paid_out (cash removed from drawer, e.g., vendor COD, tips):
 *   Dr Expense/Payable                   / Cr Cash On Hand (Undeposited Funds)
 *
 * cash_drop (cash moved from drawer to safe — transfer between cash accounts):
 *   Dr Cash in Safe (or Cash Drop Clearing)  / Cr Cash On Hand (Undeposited Funds)
 *
 * drawer_open and no_sale: NO GL — these are operational events only.
 *
 * Never throws — GL failures never block drawer operations.
 */
export async function handleDrawerEventForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as DrawerEventRecordedData;

  try {
    // Only cash-moving events need GL
    if (!['paid_in', 'paid_out', 'cash_drop'].includes(data.eventType)) return;

    // Zero-amount events skip GL
    if (data.amountCents === 0) return;

    // Ensure accounting settings exist (auto-bootstrap if needed)
    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }

    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'drawer.event.recorded.v1',
          sourceModule: 'drawer_session',
          sourceReferenceId: data.drawerSessionEventId,
          entityType: 'accounting_settings',
          entityId: event.tenantId,
          reason: `CRITICAL: GL drawer event (${data.eventType}) posting skipped — accounting settings missing even after ensureAccountingSettings.`,
        });
      } catch { /* best-effort */ }
      console.error(`[drawer-event-gl] CRITICAL: accounting settings missing for tenant=${event.tenantId} after ensureAccountingSettings`);
      return;
    }

    // Cash On Hand account (drawer)
    const cashAccountId = settings.defaultUndepositedFundsAccountId
      ?? settings.defaultUncategorizedRevenueAccountId;

    // The "other side" depends on event type. For all types we use uncategorized
    // as the fallback — accountant can later reclassify via journal reclassification.
    const otherAccountId = settings.defaultUncategorizedRevenueAccountId;

    if (!cashAccountId || !otherAccountId) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'drawer.event.recorded.v1',
          sourceModule: 'drawer_session',
          sourceReferenceId: data.drawerSessionEventId,
          entityType: 'gl_account',
          entityId: 'cash_on_hand',
          reason: `Drawer ${data.eventType} of $${(data.amountCents / 100).toFixed(2)} has no Cash On Hand GL account configured.`,
        });
      } catch { /* best-effort */ }
      return;
    }

    const amountDollars = (data.amountCents / 100).toFixed(2);

    const postingApi = getAccountingPostingApi();

    if (data.eventType === 'paid_in') {
      // Cash added to drawer: Dr Cash On Hand / Cr Other
      await postingApi.postEntry(
        {
          tenantId: event.tenantId,
          user: { id: data.employeeId, email: '' },
          requestId: `drawer-event-gl-${data.drawerSessionEventId}`,
        } as any,
        {
          businessDate: new Date().toISOString().split('T')[0]!,
          sourceModule: 'drawer_session',
          sourceReferenceId: `drawer-event-${data.drawerSessionEventId}`,
          memo: `Paid In: $${amountDollars} added to drawer`,
          lines: [
            {
              accountId: cashAccountId,
              debitAmount: amountDollars,
              creditAmount: '0',
              memo: 'Paid in — cash to drawer',
            },
            {
              accountId: otherAccountId,
              debitAmount: '0',
              creditAmount: amountDollars,
              memo: 'Paid in — source (reclassify to correct account)',
            },
          ],
          forcePost: true,
        },
      );
    } else if (data.eventType === 'paid_out') {
      // Cash removed from drawer: Dr Other / Cr Cash On Hand
      await postingApi.postEntry(
        {
          tenantId: event.tenantId,
          user: { id: data.employeeId, email: '' },
          requestId: `drawer-event-gl-${data.drawerSessionEventId}`,
        } as any,
        {
          businessDate: new Date().toISOString().split('T')[0]!,
          sourceModule: 'drawer_session',
          sourceReferenceId: `drawer-event-${data.drawerSessionEventId}`,
          memo: `Paid Out: $${amountDollars} removed from drawer`,
          lines: [
            {
              accountId: otherAccountId,
              debitAmount: amountDollars,
              creditAmount: '0',
              memo: 'Paid out — expense (reclassify to correct account)',
            },
            {
              accountId: cashAccountId,
              debitAmount: '0',
              creditAmount: amountDollars,
              memo: 'Paid out — cash from drawer',
            },
          ],
          forcePost: true,
        },
      );
    } else if (data.eventType === 'cash_drop') {
      // Cash moved to safe: Dr Other (safe) / Cr Cash On Hand (drawer)
      await postingApi.postEntry(
        {
          tenantId: event.tenantId,
          user: { id: data.employeeId, email: '' },
          requestId: `drawer-event-gl-${data.drawerSessionEventId}`,
        } as any,
        {
          businessDate: new Date().toISOString().split('T')[0]!,
          sourceModule: 'drawer_session',
          sourceReferenceId: `drawer-event-${data.drawerSessionEventId}`,
          memo: `Cash Drop: $${amountDollars} moved to safe`,
          lines: [
            {
              accountId: otherAccountId,
              debitAmount: amountDollars,
              creditAmount: '0',
              memo: 'Cash drop — cash in safe (reclassify if separate safe account)',
            },
            {
              accountId: cashAccountId,
              debitAmount: '0',
              creditAmount: amountDollars,
              memo: 'Cash drop — cash from drawer',
            },
          ],
          forcePost: true,
        },
      );
    }
  } catch (error) {
    // GL failures NEVER block drawer operations
    console.error(`[drawer-event-gl] GL posting failed for drawer event ${data.drawerSessionEventId}:`, error);
  }
}
