import { db } from '@oppsera/db';
import type { EventEnvelope } from '@oppsera/shared';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { ensureAccountingSettings } from '../helpers/ensure-accounting-settings';
import { resolvePaymentTypeAccounts, logUnmappedEvent } from '../helpers/resolve-mapping';

interface TenderReversedData {
  reversalId: string;
  originalTenderId: string;
  orderId: string;
  amount: number; // cents
  reason: string | null;
  reversalType: string;
  refundMethod: string;
}

interface TipAdjustedData {
  tenderId: string;
  orderId: string;
  previousTipAmount: number; // cents
  newTipAmount: number; // cents
  delta: number; // cents (positive = increase, negative = decrease)
  reason: string | null;
}

/**
 * GL posting for tender reversal (refund / void).
 *
 * Reverses the original GL posting:
 *   Dr Revenue (or Uncategorized Revenue)  / Cr Payment Account (cash/clearing/bank)
 *
 * Never throws — GL failures never block business operations.
 */
export async function handleTenderReversalForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as TenderReversedData;

  try {
    // Zero-amount reversals skip GL
    if (data.amount === 0) return;

    // Ensure accounting settings exist (auto-bootstrap if needed)
    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }

    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'tender.reversed.v1',
          sourceModule: 'payments',
          sourceReferenceId: data.reversalId,
          entityType: 'accounting_settings',
          entityId: event.tenantId,
          reason: 'CRITICAL: GL tender reversal posting skipped — accounting settings missing even after ensureAccountingSettings.',
        });
      } catch { /* best-effort */ }
      console.error(`[tender-reversal-gl] CRITICAL: accounting settings missing for tenant=${event.tenantId} after ensureAccountingSettings`);
      return;
    }

    // Revenue account (debit side — returning revenue)
    const revenueAccountId = settings.defaultUncategorizedRevenueAccountId;

    // Payment account (credit side — returning money to customer)
    let paymentAccountId: string | null = null;
    try {
      const paymentAccounts = await resolvePaymentTypeAccounts(
        db,
        event.tenantId,
        data.refundMethod ?? 'cash',
      );
      paymentAccountId = paymentAccounts?.depositAccountId ?? paymentAccounts?.clearingAccountId ?? null;
    } catch { /* best-effort */ }

    // Fallback to undeposited funds
    if (!paymentAccountId) {
      paymentAccountId = settings.defaultUndepositedFundsAccountId
        ?? settings.defaultUncategorizedRevenueAccountId;
    }

    if (!revenueAccountId || !paymentAccountId) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'tender.reversed.v1',
          sourceModule: 'payments',
          sourceReferenceId: data.reversalId,
          entityType: 'gl_account',
          entityId: !revenueAccountId ? 'revenue' : 'payment',
          reason: `Tender reversal of $${(data.amount / 100).toFixed(2)} (${data.reversalType}) has no ${!revenueAccountId ? 'revenue' : 'payment'} GL account configured.`,
        });
      } catch { /* best-effort */ }
      return;
    }

    const amountDollars = (data.amount / 100).toFixed(2);

    const postingApi = getAccountingPostingApi();
    await postingApi.postEntry(
      {
        tenantId: event.tenantId,
        user: { id: 'system', email: '' },
        requestId: `tender-reversal-gl-${data.reversalId}`,
      } as any,
      {
        businessDate: new Date().toISOString().split('T')[0]!,
        sourceModule: 'payments',
        sourceReferenceId: `reversal-${data.reversalId}`,
        memo: `Tender reversal: $${amountDollars} (${data.reversalType}) — order ${data.orderId}`,
        lines: [
          {
            accountId: revenueAccountId,
            debitAmount: amountDollars,
            creditAmount: '0',
            memo: `Revenue reversal — ${data.reversalType}`,
          },
          {
            accountId: paymentAccountId,
            debitAmount: '0',
            creditAmount: amountDollars,
            memo: `Refund via ${data.refundMethod}`,
          },
        ],
        forcePost: true,
      },
    );
  } catch (error) {
    // GL failures NEVER block tender operations
    console.error(`[tender-reversal-gl] GL posting failed for reversal ${data.reversalId}:`, error);
  }
}

/**
 * GL posting for tip adjustment.
 *
 * When tip changes:
 *   Increase (delta > 0):
 *     Dr Cash/Clearing (payment account)  / Cr Tips Payable
 *   Decrease (delta < 0):
 *     Dr Tips Payable                     / Cr Cash/Clearing (payment account)
 *
 * Never throws — GL failures never block tender operations.
 */
export async function handleTipAdjustedForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as TipAdjustedData;

  try {
    // Zero delta = no GL entry needed
    if (data.delta === 0) return;

    // Ensure accounting settings exist (auto-bootstrap if needed)
    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }

    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'tender.tip_adjusted.v1',
          sourceModule: 'payments',
          sourceReferenceId: data.tenderId,
          entityType: 'accounting_settings',
          entityId: event.tenantId,
          reason: 'CRITICAL: GL tip adjustment posting skipped — accounting settings missing even after ensureAccountingSettings.',
        });
      } catch { /* best-effort */ }
      console.error(`[tip-adjust-gl] CRITICAL: accounting settings missing for tenant=${event.tenantId} after ensureAccountingSettings`);
      return;
    }

    const tipsPayableAccountId = settings.defaultTipsPayableAccountId;
    const cashAccountId = settings.defaultUndepositedFundsAccountId
      ?? settings.defaultUncategorizedRevenueAccountId;

    if (!tipsPayableAccountId || !cashAccountId) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'tender.tip_adjusted.v1',
          sourceModule: 'payments',
          sourceReferenceId: data.tenderId,
          entityType: 'gl_account',
          entityId: !tipsPayableAccountId ? 'tips_payable' : 'cash',
          reason: `Tip adjustment of $${(Math.abs(data.delta) / 100).toFixed(2)} has no ${!tipsPayableAccountId ? 'Tips Payable' : 'Cash'} GL account configured.`,
        });
      } catch { /* best-effort */ }
      return;
    }

    const absDollars = (Math.abs(data.delta) / 100).toFixed(2);
    const isIncrease = data.delta > 0;

    const postingApi = getAccountingPostingApi();
    await postingApi.postEntry(
      {
        tenantId: event.tenantId,
        user: { id: 'system', email: '' },
        requestId: `tip-adjust-gl-${data.tenderId}-${Date.now()}`,
      } as any,
      {
        businessDate: new Date().toISOString().split('T')[0]!,
        sourceModule: 'payments',
        sourceReferenceId: `tip-adjust-${data.tenderId}-${event.eventId}`,
        memo: `Tip ${isIncrease ? 'increase' : 'decrease'}: $${absDollars} on tender ${data.tenderId}`,
        lines: isIncrease
          ? [
              {
                accountId: cashAccountId,
                debitAmount: absDollars,
                creditAmount: '0',
                memo: 'Tip increase — payment account',
              },
              {
                accountId: tipsPayableAccountId,
                debitAmount: '0',
                creditAmount: absDollars,
                memo: 'Tip increase — tips payable',
              },
            ]
          : [
              {
                accountId: tipsPayableAccountId,
                debitAmount: absDollars,
                creditAmount: '0',
                memo: 'Tip decrease — tips payable',
              },
              {
                accountId: cashAccountId,
                debitAmount: '0',
                creditAmount: absDollars,
                memo: 'Tip decrease — payment account',
              },
            ],
        forcePost: true,
      },
    );
  } catch (error) {
    // GL failures NEVER block tender operations
    console.error(`[tip-adjust-gl] GL posting failed for tip adjustment on tender ${data.tenderId}:`, error);
  }
}
