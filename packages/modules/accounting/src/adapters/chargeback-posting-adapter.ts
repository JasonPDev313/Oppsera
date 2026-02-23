import type { EventEnvelope } from '@oppsera/shared';
import { db } from '@oppsera/db';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { resolvePaymentTypeAccounts, logUnmappedEvent } from '../helpers/resolve-mapping';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';

interface ChargebackReceivedPayload {
  chargebackId: string;
  tenderId: string;
  orderId: string;
  tenderType: string;
  chargebackAmountCents: number;
  feeAmountCents: number;
  locationId: string;
  businessDate: string;
  customerId: string | null;
  chargebackReason: string;
}

interface ChargebackResolvedPayload {
  chargebackId: string;
  tenderId: string;
  orderId: string;
  tenderType: string;
  resolution: 'won' | 'lost';
  chargebackAmountCents: number;
  feeAmountCents: number;
  locationId: string;
  businessDate: string;
  customerId: string | null;
  resolutionReason: string;
  glJournalEntryId: string | null;
}

function buildSyntheticCtx(tenantId: string, locationId: string, sourceRef: string): RequestContext {
  return {
    tenantId,
    locationId,
    user: { id: 'system', email: 'system@oppsera.io', name: 'System', tenantId, tenantStatus: 'active', membershipStatus: 'active' },
    requestId: `chargeback-gl-${sourceRef}`,
    isPlatformAdmin: false,
  } as RequestContext;
}

/**
 * Handles chargeback.received.v1 events.
 *
 * GL posting:
 *   Dr Chargeback Expense (fee expense account from payment type mapping)
 *   Cr Cash/Bank (deposit account from payment type mapping)
 *
 * The chargeback is a forced reversal of funds by the payment processor.
 * We expense it immediately; if won later, the reversal GL undoes it.
 *
 * Never blocks payment operations — catches all errors.
 */
export async function handleChargebackReceivedForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as ChargebackReceivedPayload;

  try {
    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) return;

    // Resolve accounts from payment type GL mapping
    const paymentMapping = await resolvePaymentTypeAccounts(db, event.tenantId, data.tenderType);

    const depositAccountId = paymentMapping?.depositAccountId ?? settings.defaultUndepositedFundsAccountId;
    if (!depositAccountId) {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'chargeback.received.v1',
        sourceModule: 'chargeback',
        sourceReferenceId: data.chargebackId,
        entityType: 'payment_type',
        entityId: data.tenderType,
        reason: 'Missing deposit/cash account for chargeback posting',
      });
      return;
    }

    const expenseAccountId = paymentMapping?.feeExpenseAccountId;
    if (!expenseAccountId) {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'chargeback.received.v1',
        sourceModule: 'chargeback',
        sourceReferenceId: data.chargebackId,
        entityType: 'payment_type',
        entityId: data.tenderType,
        reason: 'Missing fee expense account for chargeback posting',
      });
      return;
    }

    const amountDollars = (data.chargebackAmountCents / 100).toFixed(2);

    const postingApi = getAccountingPostingApi();
    const ctx = buildSyntheticCtx(event.tenantId, data.locationId, data.chargebackId);

    await postingApi.postEntry(ctx, {
      businessDate: data.businessDate,
      sourceModule: 'chargeback',
      sourceReferenceId: `received-${data.chargebackId}`,
      memo: `Chargeback received: order ${data.orderId} — ${data.chargebackReason}`,
      currency: 'USD',
      lines: [
        {
          accountId: expenseAccountId,
          debitAmount: amountDollars,
          creditAmount: '0',
          locationId: data.locationId,
          memo: `Chargeback expense — tender ${data.tenderId}`,
        },
        {
          accountId: depositAccountId,
          debitAmount: '0',
          creditAmount: amountDollars,
          locationId: data.locationId,
          memo: `Chargeback cash withdrawal — tender ${data.tenderId}`,
        },
      ],
      forcePost: true,
    });
  } catch (err) {
    console.error(`Chargeback received GL posting failed for ${data.chargebackId}:`, err);
    try {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'chargeback.received.v1',
        sourceModule: 'chargeback',
        sourceReferenceId: data.chargebackId,
        entityType: 'posting_error',
        entityId: data.chargebackId,
        reason: `GL posting failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    } catch { /* best-effort tracking */ }
  }
}

/**
 * Handles chargeback.resolved.v1 events.
 *
 * Won: Reversal of received GL entries (money returned to merchant).
 *   Dr Cash/Bank
 *   Cr Chargeback Expense
 *
 * Lost: If fee > 0, post the fee as additional expense.
 *   Dr Chargeback Fee Expense
 *   Cr Cash/Bank
 *
 * Never blocks payment operations — catches all errors.
 */
export async function handleChargebackResolvedForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as ChargebackResolvedPayload;

  try {
    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) return;

    const paymentMapping = await resolvePaymentTypeAccounts(db, event.tenantId, data.tenderType);

    const depositAccountId = paymentMapping?.depositAccountId ?? settings.defaultUndepositedFundsAccountId;
    if (!depositAccountId) {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'chargeback.resolved.v1',
        sourceModule: 'chargeback',
        sourceReferenceId: data.chargebackId,
        entityType: 'payment_type',
        entityId: data.tenderType,
        reason: 'Missing deposit/cash account for chargeback resolution posting',
      });
      return;
    }

    const expenseAccountId = paymentMapping?.feeExpenseAccountId;
    if (!expenseAccountId) {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'chargeback.resolved.v1',
        sourceModule: 'chargeback',
        sourceReferenceId: data.chargebackId,
        entityType: 'payment_type',
        entityId: data.tenderType,
        reason: 'Missing fee expense account for chargeback resolution posting',
      });
      return;
    }

    const postingApi = getAccountingPostingApi();
    const ctx = buildSyntheticCtx(event.tenantId, data.locationId, data.chargebackId);

    if (data.resolution === 'won') {
      // Won: reverse the original chargeback posting
      const amountDollars = (data.chargebackAmountCents / 100).toFixed(2);

      await postingApi.postEntry(ctx, {
        businessDate: data.businessDate,
        sourceModule: 'chargeback',
        sourceReferenceId: `won-${data.chargebackId}`,
        memo: `Chargeback won: order ${data.orderId} — funds returned`,
        currency: 'USD',
        lines: [
          {
            accountId: depositAccountId,
            debitAmount: amountDollars,
            creditAmount: '0',
            locationId: data.locationId,
            memo: `Chargeback won — cash restored, tender ${data.tenderId}`,
          },
          {
            accountId: expenseAccountId,
            debitAmount: '0',
            creditAmount: amountDollars,
            locationId: data.locationId,
            memo: `Chargeback won — expense reversed, tender ${data.tenderId}`,
          },
        ],
        forcePost: true,
      });
    } else {
      // Lost: post fee if applicable
      if (data.feeAmountCents > 0) {
        const feeDollars = (data.feeAmountCents / 100).toFixed(2);

        await postingApi.postEntry(ctx, {
          businessDate: data.businessDate,
          sourceModule: 'chargeback',
          sourceReferenceId: `lost-fee-${data.chargebackId}`,
          memo: `Chargeback lost: order ${data.orderId} — fee charged`,
          currency: 'USD',
          lines: [
            {
              accountId: expenseAccountId,
              debitAmount: feeDollars,
              creditAmount: '0',
              locationId: data.locationId,
              memo: `Chargeback fee — tender ${data.tenderId}`,
            },
            {
              accountId: depositAccountId,
              debitAmount: '0',
              creditAmount: feeDollars,
              locationId: data.locationId,
              memo: `Chargeback fee withdrawn — tender ${data.tenderId}`,
            },
          ],
          forcePost: true,
        });
      }
      // No GL entry needed for lost with zero fee — the original received entry stands as the expense
    }
  } catch (err) {
    console.error(`Chargeback resolved GL posting failed for ${data.chargebackId}:`, err);
    try {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'chargeback.resolved.v1',
        sourceModule: 'chargeback',
        sourceReferenceId: data.chargebackId,
        entityType: 'posting_error',
        entityId: data.chargebackId,
        reason: `GL posting failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    } catch { /* best-effort tracking */ }
  }
}
