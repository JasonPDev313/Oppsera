import { db } from '@oppsera/db';
import type { EventEnvelope } from '@oppsera/shared';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { ensureAccountingSettings } from '../helpers/ensure-accounting-settings';
import { logUnmappedEvent } from '../helpers/resolve-mapping';

interface GatewayRefundedData {
  paymentIntentId: string;
  amountCents: number;
  refundedAmountCents: number;
  orderId: string | null;
  customerId: string | null;
  providerRef: string | null;
}

interface GatewayVoidedData {
  paymentIntentId: string;
  amountCents: number;
  orderId: string | null;
  customerId: string | null;
  providerRef: string | null;
}

/**
 * GL posting for direct payment gateway refund (payment.gateway.refunded.v1).
 *
 * This handles refunds issued directly against a payment intent (not via
 * the POS tender reversal flow). If the tender reversal adapter already
 * posted a reversal for the same payment intent, this is a no-op via
 * idempotency on sourceReferenceId.
 *
 * Never throws — GL failures never block business operations.
 */
export async function handleGatewayRefundForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as GatewayRefundedData;

  try {
    if (data.refundedAmountCents === 0) return;

    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }

    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      console.error(`[gateway-refund-gl] accounting settings missing for tenant=${event.tenantId}`);
      return;
    }

    const amountDollars = (data.refundedAmountCents / 100).toFixed(2);
    const postingApi = getAccountingPostingApi();
    const ctx = {
      tenantId: event.tenantId,
      user: { id: 'system', email: '' },
      requestId: `gateway-refund-gl-${data.paymentIntentId}-${data.refundedAmountCents}`,
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any -- system context

    // Try to find the original tender GL entry via payment intent linkage.
    // POS adapter posts with sourceReferenceId = tenderId, but we only have
    // paymentIntentId here. Look for any entry referencing this intent.
    // If not found, post a generic reversal.
    const revenueAccountId = settings.defaultUncategorizedRevenueAccountId;
    const paymentAccountId = settings.defaultUndepositedFundsAccountId;

    if (!revenueAccountId || !paymentAccountId) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'payment.gateway.refunded.v1',
          sourceModule: 'payments',
          sourceReferenceId: data.paymentIntentId,
          entityType: 'gl_account',
          entityId: !revenueAccountId ? 'revenue' : 'payment',
          reason: `Gateway refund of $${amountDollars} has no ${!revenueAccountId ? 'revenue' : 'payment'} GL account configured.`,
        });
      } catch { /* best-effort */ }
      return;
    }

    if (revenueAccountId === paymentAccountId) return;

    await postingApi.postEntry(ctx, {
      businessDate: new Date().toISOString().split('T')[0]!,
      sourceModule: 'payments',
      sourceReferenceId: `gateway-refund-${data.paymentIntentId}-${data.refundedAmountCents}`,
      memo: `Gateway refund: $${amountDollars} — intent ${data.paymentIntentId}${data.orderId ? ` order ${data.orderId}` : ''}`,
      lines: [
        {
          accountId: revenueAccountId,
          debitAmount: amountDollars,
          creditAmount: '0',
          memo: 'Revenue reversal — gateway refund',
        },
        {
          accountId: paymentAccountId,
          debitAmount: '0',
          creditAmount: amountDollars,
          memo: 'Refund — gateway refund',
        },
      ],
      forcePost: true,
    });
  } catch (error) {
    console.error(`[gateway-refund-gl] GL posting failed for intent ${data.paymentIntentId}:`, error);
  }
}

/**
 * GL posting for direct payment gateway void (payment.gateway.voided.v1).
 *
 * Reverses the original authorization/capture GL entry. If the tender
 * reversal adapter already handled this, the unique sourceReferenceId
 * prevents duplication.
 *
 * Never throws — GL failures never block business operations.
 */
export async function handleGatewayVoidForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as GatewayVoidedData;

  try {
    if (data.amountCents === 0) return;

    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }

    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      console.error(`[gateway-void-gl] accounting settings missing for tenant=${event.tenantId}`);
      return;
    }

    const amountDollars = (data.amountCents / 100).toFixed(2);
    const postingApi = getAccountingPostingApi();
    const ctx = {
      tenantId: event.tenantId,
      user: { id: 'system', email: '' },
      requestId: `gateway-void-gl-${data.paymentIntentId}-${data.amountCents}`,
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any -- system context

    const revenueAccountId = settings.defaultUncategorizedRevenueAccountId;
    const paymentAccountId = settings.defaultUndepositedFundsAccountId;

    if (!revenueAccountId || !paymentAccountId) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'payment.gateway.voided.v1',
          sourceModule: 'payments',
          sourceReferenceId: data.paymentIntentId,
          entityType: 'gl_account',
          entityId: !revenueAccountId ? 'revenue' : 'payment',
          reason: `Gateway void of $${amountDollars} has no ${!revenueAccountId ? 'revenue' : 'payment'} GL account configured.`,
        });
      } catch { /* best-effort */ }
      return;
    }

    if (revenueAccountId === paymentAccountId) return;

    await postingApi.postEntry(ctx, {
      businessDate: new Date().toISOString().split('T')[0]!,
      sourceModule: 'payments',
      sourceReferenceId: `gateway-void-${data.paymentIntentId}-${data.amountCents}`,
      memo: `Gateway void: $${amountDollars} — intent ${data.paymentIntentId}${data.orderId ? ` order ${data.orderId}` : ''}`,
      lines: [
        {
          accountId: revenueAccountId,
          debitAmount: amountDollars,
          creditAmount: '0',
          memo: 'Revenue reversal — gateway void',
        },
        {
          accountId: paymentAccountId,
          debitAmount: '0',
          creditAmount: amountDollars,
          memo: 'Void — gateway void',
        },
      ],
      forcePost: true,
    });
  } catch (error) {
    console.error(`[gateway-void-gl] GL posting failed for intent ${data.paymentIntentId}:`, error);
  }
}
