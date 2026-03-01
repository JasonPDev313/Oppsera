import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';
import { db } from '@oppsera/db';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { ensureAccountingSettings } from '../helpers/ensure-accounting-settings';
import { logUnmappedEvent } from '../helpers/resolve-mapping';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';

const SpaCommissionPaidPayloadSchema = z.object({
  commissionId: z.string(),
  tenantId: z.string(),
  locationId: z.string().optional(),
  providerId: z.string(),
  providerName: z.string(),
  amountCents: z.number(),
  payPeriod: z.string(),
  payoutMethod: z.enum(['cash', 'payroll', 'check']),
  businessDate: z.string(),
});

type _SpaCommissionPaidPayload = z.infer<typeof SpaCommissionPaidPayloadSchema>;

function buildSyntheticCtx(tenantId: string, locationId?: string, sourceRef?: string): RequestContext {
  return {
    tenantId,
    locationId: locationId ?? null,
    user: { id: 'system', email: 'system@oppsera.io', name: 'System', tenantId, tenantStatus: 'active', membershipStatus: 'active' },
    requestId: `spa-gl-commission-${sourceRef ?? 'unknown'}`,
    isPlatformAdmin: false,
  } as RequestContext;
}

/**
 * Handles spa.commission.paid.v1 events.
 *
 * GL posting for spa provider commission payout:
 *   Dr Commission Expense (falls back to uncategorized revenue — logged as unmapped for remapping)
 *   Cr Cash / Bank (defaultUndepositedFundsAccountId) OR Payroll Clearing (defaultPayrollClearingAccountId)
 *
 * The credit account is determined by payoutMethod:
 *   - 'cash' / 'check' -> defaultUndepositedFundsAccountId
 *   - 'payroll'         -> defaultPayrollClearingAccountId (falls back to defaultUndepositedFundsAccountId)
 *
 * Since there is no dedicated commission expense account in accounting_settings, the adapter uses
 * defaultUncategorizedRevenueAccountId as a catch-all and logs an unmapped event so the tenant can
 * remap to a proper commission expense account later.
 *
 * Never blocks commission payout — catches all errors.
 */
export async function handleSpaCommissionPaidForAccounting(event: EventEnvelope): Promise<void> {
  const parsed = SpaCommissionPaidPayloadSchema.safeParse(event.data);
  if (!parsed.success) {
    console.error(`[spa-commission-gl] Invalid event payload for spa.commission.paid.v1:`, parsed.error.message);
    return;
  }
  const data = parsed.data;

  try {
    // Zero-amount commissions skip GL
    if (data.amountCents === 0) return;

    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }
    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'spa.commission.paid.v1',
          sourceModule: 'spa_commission',
          sourceReferenceId: data.commissionId,
          entityType: 'accounting_settings',
          entityId: event.tenantId,
          reason: 'CRITICAL: GL spa commission posting skipped — accounting settings missing even after ensureAccountingSettings.',
        });
      } catch { /* never block commission payout */ }
      console.error(`[spa-commission-gl] CRITICAL: accounting settings missing for tenant=${event.tenantId} after ensureAccountingSettings`);
      return;
    }

    // Expense account (debit side) — no dedicated commission expense account in settings,
    // use uncategorized revenue as catch-all and log unmapped for proper remapping later
    const expenseAccountId = settings.defaultUncategorizedRevenueAccountId;
    if (!expenseAccountId) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'spa.commission.paid.v1',
          sourceModule: 'spa_commission',
          sourceReferenceId: data.commissionId,
          entityType: 'gl_account',
          entityId: 'commission_expense',
          reason: `Commission payout of $${(data.amountCents / 100).toFixed(2)} to ${data.providerName} has no expense GL account configured. Configure an uncategorized revenue account (or a dedicated commission expense account) in accounting settings.`,
        });
      } catch { /* best-effort */ }
      return;
    }

    // Credit account — determined by payout method
    let creditAccountId: string | null;
    let creditMemo: string;

    if (data.payoutMethod === 'payroll') {
      creditAccountId = settings.defaultPayrollClearingAccountId ?? settings.defaultUndepositedFundsAccountId;
      creditMemo = 'Spa commission payout — payroll clearing';
    } else {
      // 'cash' or 'check' — use undeposited funds (cash/bank)
      creditAccountId = settings.defaultUndepositedFundsAccountId;
      creditMemo = `Spa commission payout — ${data.payoutMethod}`;
    }

    if (!creditAccountId) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'spa.commission.paid.v1',
          sourceModule: 'spa_commission',
          sourceReferenceId: data.commissionId,
          entityType: 'gl_account',
          entityId: data.payoutMethod === 'payroll' ? 'payroll_clearing' : 'undeposited_funds',
          reason: `Commission payout of $${(data.amountCents / 100).toFixed(2)} to ${data.providerName} via ${data.payoutMethod} has no ${data.payoutMethod === 'payroll' ? 'Payroll Clearing' : 'Undeposited Funds'} GL account configured.`,
        });
      } catch { /* best-effort */ }
      return;
    }

    // Log unmapped event for the expense side so tenant can remap to a proper commission expense account
    try {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'spa.commission.paid.v1',
        sourceModule: 'spa_commission',
        sourceReferenceId: data.commissionId,
        entityType: 'commission_expense_fallback',
        entityId: data.providerId,
        reason: `Commission expense for ${data.providerName} ($${(data.amountCents / 100).toFixed(2)}) posted to uncategorized revenue as fallback. Configure a dedicated commission expense GL account and remap.`,
      });
    } catch { /* best-effort — posting still proceeds */ }

    const amountDollars = (data.amountCents / 100).toFixed(2);

    const postingApi = getAccountingPostingApi();
    const ctx = buildSyntheticCtx(event.tenantId, data.locationId, data.commissionId);

    await postingApi.postEntry(ctx, {
      businessDate: data.businessDate,
      sourceModule: 'spa_commission',
      sourceReferenceId: `commission-paid-${data.commissionId}`,
      memo: `Spa commission payout: $${amountDollars} to ${data.providerName} (${data.payoutMethod}) — period ${data.payPeriod}`,
      currency: 'USD',
      lines: [
        {
          accountId: expenseAccountId,
          debitAmount: amountDollars,
          creditAmount: '0',
          locationId: data.locationId,
          channel: 'spa',
          memo: `Commission expense — ${data.providerName} (${data.payPeriod})`,
        },
        {
          accountId: creditAccountId,
          debitAmount: '0',
          creditAmount: amountDollars,
          locationId: data.locationId,
          channel: 'spa',
          memo: creditMemo,
        },
      ],
      forcePost: true,
    });
  } catch (err) {
    console.error(`[spa-commission-gl] GL posting failed for commission ${data.commissionId}:`, err);
    try {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'spa.commission.paid.v1',
        sourceModule: 'spa_commission',
        sourceReferenceId: data.commissionId,
        entityType: 'posting_error',
        entityId: data.commissionId,
        reason: `GL posting failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    } catch { /* best-effort tracking */ }
  }
}
