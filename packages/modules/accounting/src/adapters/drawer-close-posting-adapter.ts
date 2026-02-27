import { db } from '@oppsera/db';
import type { EventEnvelope } from '@oppsera/shared';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { ensureAccountingSettings } from '../helpers/ensure-accounting-settings';
import { logUnmappedEvent } from '../helpers/resolve-mapping';

interface DrawerSessionClosedData {
  drawerSessionId: string;
  terminalId: string;
  locationId: string;
  businessDate: string;
  closingCountCents: number;
  expectedCashCents: number;
  varianceCents: number;
  closedBy: string;
}

/**
 * GL posting for drawer session close — cash variance.
 *
 * When varianceCents != 0:
 *   Over (positive variance):
 *     Dr Cash On Hand (Undeposited Funds)   / Cr Cash Over/Short
 *   Short (negative variance):
 *     Dr Cash Over/Short                    / Cr Cash On Hand (Undeposited Funds)
 *
 * Never throws — GL failures never block drawer operations.
 */
export async function handleDrawerSessionClosedForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as DrawerSessionClosedData;

  try {
    // No variance = no GL entry needed
    if (data.varianceCents === 0) return;

    // Ensure accounting settings exist (auto-bootstrap if needed)
    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }

    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'drawer.session.closed.v1',
          sourceModule: 'drawer_session',
          sourceReferenceId: data.drawerSessionId,
          entityType: 'accounting_settings',
          entityId: event.tenantId,
          reason: 'CRITICAL: GL drawer variance posting skipped — accounting settings missing even after ensureAccountingSettings.',
        });
      } catch { /* best-effort */ }
      console.error(`[drawer-gl] CRITICAL: accounting settings missing for tenant=${event.tenantId} after ensureAccountingSettings`);
      return;
    }

    const cashOverShortAccountId = settings.defaultCashOverShortAccountId;
    const cashAccountId = settings.defaultUndepositedFundsAccountId
      ?? settings.defaultUncategorizedRevenueAccountId;

    if (!cashOverShortAccountId || !cashAccountId) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'drawer.session.closed.v1',
          sourceModule: 'drawer_session',
          sourceReferenceId: data.drawerSessionId,
          entityType: 'gl_account',
          entityId: !cashOverShortAccountId ? 'cash_over_short' : 'cash_on_hand',
          reason: `Drawer variance of $${(Math.abs(data.varianceCents) / 100).toFixed(2)} ${data.varianceCents > 0 ? 'over' : 'short'} has no GL account configured. Configure ${!cashOverShortAccountId ? 'Cash Over/Short' : 'Cash On Hand'} account in accounting settings.`,
        });
      } catch { /* best-effort */ }
      return;
    }

    const absAmount = (Math.abs(data.varianceCents) / 100).toFixed(2);
    const isOver = data.varianceCents > 0;

    const postingApi = getAccountingPostingApi();
    await postingApi.postEntry(
      {
        tenantId: event.tenantId,
        locationId: data.locationId,
        user: { id: data.closedBy, email: '' },
        requestId: `drawer-close-gl-${data.drawerSessionId}`,
      } as any,
      {
        businessDate: data.businessDate,
        sourceModule: 'drawer_session',
        sourceReferenceId: `drawer-close-${data.drawerSessionId}`,
        memo: `Drawer close variance: $${absAmount} ${isOver ? 'over' : 'short'} — terminal ${data.terminalId}`,
        lines: isOver
          ? [
              {
                accountId: cashAccountId,
                debitAmount: absAmount,
                creditAmount: '0',
                locationId: data.locationId,
                terminalId: data.terminalId,
                memo: 'Cash overage',
              },
              {
                accountId: cashOverShortAccountId,
                debitAmount: '0',
                creditAmount: absAmount,
                locationId: data.locationId,
                terminalId: data.terminalId,
                memo: 'Cash over/short - overage',
              },
            ]
          : [
              {
                accountId: cashOverShortAccountId,
                debitAmount: absAmount,
                creditAmount: '0',
                locationId: data.locationId,
                terminalId: data.terminalId,
                memo: 'Cash over/short - shortage',
              },
              {
                accountId: cashAccountId,
                debitAmount: '0',
                creditAmount: absAmount,
                locationId: data.locationId,
                terminalId: data.terminalId,
                memo: 'Cash shortage',
              },
            ],
        forcePost: true,
      },
    );
  } catch (error) {
    // GL failures NEVER block drawer operations
    console.error(`[drawer-gl] GL posting failed for drawer session ${data.drawerSessionId}:`, error);
  }
}
