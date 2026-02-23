import type { EventEnvelope } from '@oppsera/shared';
import { generateUlid } from '@oppsera/shared';
import { db, pendingBreakageReview } from '@oppsera/db';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { logUnmappedEvent } from '../helpers/resolve-mapping';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';

interface VoucherPurchasedPayload {
  voucherId: string;
  voucherNumber: string;
  voucherTypeId: string;
  amountCents: number;
  locationId: string;
  businessDate: string;
  customerId: string | null;
  paymentMethod: string;
  liabilityChartOfAccountId: string | null;
}

interface VoucherRedeemedPayload {
  voucherId: string;
  voucherNumber: string;
  amountCents: number;
  remainingBalanceCents: number;
  locationId: string;
  businessDate: string;
  orderId: string | null;
  tenderId: string | null;
  liabilityChartOfAccountId: string | null;
}

interface VoucherExpiredPayload {
  voucherId: string;
  voucherNumber: string;
  expirationAmountCents: number;
  expirationDate: string;
  liabilityChartOfAccountId: string | null;
  expirationIncomeChartOfAccountId: string | null;
}

function buildSyntheticCtx(tenantId: string, locationId?: string, sourceRef?: string): RequestContext {
  return {
    tenantId,
    locationId: locationId ?? null,
    user: { id: 'system', email: 'system@oppsera.io', name: 'System', tenantId, tenantStatus: 'active', membershipStatus: 'active' },
    requestId: `voucher-gl-${sourceRef ?? 'unknown'}`,
    isPlatformAdmin: false,
  } as RequestContext;
}

/**
 * Handles voucher.purchased.v1 events.
 *
 * GL posting:
 *   Dr Cash/Payment account (undeposited funds)
 *   Cr Deferred Revenue Liability (voucher type's liability account)
 *
 * Never blocks voucher operations — catches all errors.
 */
export async function handleVoucherPurchaseForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as VoucherPurchasedPayload;

  try {
    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) return;

    const liabilityAccountId = data.liabilityChartOfAccountId;
    if (!liabilityAccountId) {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'voucher.purchased.v1',
        sourceModule: 'voucher',
        sourceReferenceId: data.voucherId,
        entityType: 'voucher_type',
        entityId: data.voucherTypeId,
        reason: 'Missing liability account on voucher type',
      });
      return;
    }

    const cashAccountId = settings.defaultUndepositedFundsAccountId;
    if (!cashAccountId) {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'voucher.purchased.v1',
        sourceModule: 'voucher',
        sourceReferenceId: data.voucherId,
        entityType: 'payment_account',
        entityId: data.paymentMethod,
        reason: 'Missing undeposited funds account in accounting settings',
      });
      return;
    }

    const amountDollars = (data.amountCents / 100).toFixed(2);

    const postingApi = getAccountingPostingApi();
    const ctx = buildSyntheticCtx(event.tenantId, data.locationId, data.voucherId);

    await postingApi.postEntry(ctx, {
      businessDate: data.businessDate,
      sourceModule: 'voucher',
      sourceReferenceId: `purchase-${data.voucherId}`,
      memo: `Voucher purchased: ${data.voucherNumber}`,
      currency: 'USD',
      lines: [
        {
          accountId: cashAccountId,
          debitAmount: amountDollars,
          creditAmount: '0',
          locationId: data.locationId,
          memo: `Voucher ${data.voucherNumber} purchase — cash received`,
        },
        {
          accountId: liabilityAccountId,
          debitAmount: '0',
          creditAmount: amountDollars,
          locationId: data.locationId,
          memo: `Voucher ${data.voucherNumber} — deferred revenue liability`,
        },
      ],
      forcePost: true,
    });
  } catch (err) {
    console.error(`Voucher purchase GL posting failed for ${data.voucherId}:`, err);
    try {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'voucher.purchased.v1',
        sourceModule: 'voucher',
        sourceReferenceId: data.voucherId,
        entityType: 'posting_error',
        entityId: data.voucherId,
        reason: `GL posting failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    } catch { /* best-effort tracking */ }
  }
}

/**
 * Handles voucher.redeemed.v1 events.
 *
 * GL posting:
 *   Dr Deferred Revenue Liability
 *   Cr Revenue (uses default revenue — gift card revenue is recognized when redeemed)
 *
 * Never blocks voucher operations — catches all errors.
 */
export async function handleVoucherRedemptionForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as VoucherRedeemedPayload;

  try {
    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) return;

    const liabilityAccountId = data.liabilityChartOfAccountId;
    if (!liabilityAccountId) {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'voucher.redeemed.v1',
        sourceModule: 'voucher',
        sourceReferenceId: data.voucherId,
        entityType: 'voucher_liability',
        entityId: data.voucherId,
        reason: 'Missing liability account on voucher type for redemption',
      });
      return;
    }

    // For redemptions, revenue is recognized. Use the AR control as a proxy for
    // general revenue, or fall back to undeposited funds. In practice, tenants
    // should configure a specific gift card revenue account.
    // We use the defaultARControlAccountId as revenue recognition.
    const revenueAccountId = settings.defaultARControlAccountId;
    if (!revenueAccountId) {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'voucher.redeemed.v1',
        sourceModule: 'voucher',
        sourceReferenceId: data.voucherId,
        entityType: 'revenue_account',
        entityId: 'default',
        reason: 'Missing default AR control / revenue account for voucher redemption',
      });
      return;
    }

    const amountDollars = (data.amountCents / 100).toFixed(2);

    const postingApi = getAccountingPostingApi();
    const ctx = buildSyntheticCtx(event.tenantId, data.locationId, data.voucherId);

    await postingApi.postEntry(ctx, {
      businessDate: data.businessDate,
      sourceModule: 'voucher',
      sourceReferenceId: `redeem-${data.voucherId}-${data.tenderId ?? data.amountCents}`,
      memo: `Voucher redeemed: ${data.voucherNumber}`,
      currency: 'USD',
      lines: [
        {
          accountId: liabilityAccountId,
          debitAmount: amountDollars,
          creditAmount: '0',
          locationId: data.locationId,
          memo: `Voucher ${data.voucherNumber} — liability released`,
        },
        {
          accountId: revenueAccountId,
          debitAmount: '0',
          creditAmount: amountDollars,
          locationId: data.locationId,
          memo: `Voucher ${data.voucherNumber} — revenue recognized`,
        },
      ],
      forcePost: true,
    });
  } catch (err) {
    console.error(`Voucher redemption GL posting failed for ${data.voucherId}:`, err);
    try {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'voucher.redeemed.v1',
        sourceModule: 'voucher',
        sourceReferenceId: data.voucherId,
        entityType: 'posting_error',
        entityId: data.voucherId,
        reason: `GL posting failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    } catch { /* best-effort tracking */ }
  }
}

/**
 * Handles voucher.expired.v1 events.
 *
 * GL posting:
 *   Dr Deferred Revenue Liability
 *   Cr Breakage Income (expiration income account from voucher type)
 *
 * Never blocks voucher operations — catches all errors.
 */
export async function handleVoucherExpirationForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as VoucherExpiredPayload;

  try {
    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) return;

    // Check breakage policy: if automatic recognition is disabled,
    // queue to pending_breakage_review instead of posting GL directly
    if (!settings.recognizeBreakageAutomatically || settings.breakageRecognitionMethod === 'manual_only') {
      await db.insert(pendingBreakageReview).values({
        id: generateUlid(),
        tenantId: event.tenantId,
        voucherId: data.voucherId,
        voucherNumber: data.voucherNumber,
        amountCents: data.expirationAmountCents,
        expiredAt: new Date(data.expirationDate),
        status: 'pending',
      });
      return;
    }

    const liabilityAccountId = data.liabilityChartOfAccountId;
    if (!liabilityAccountId) {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'voucher.expired.v1',
        sourceModule: 'voucher',
        sourceReferenceId: data.voucherId,
        entityType: 'voucher_liability',
        entityId: data.voucherId,
        reason: 'Missing liability account on voucher type for expiration',
      });
      return;
    }

    // Resolve breakage income account: settings override > voucher type default
    const breakageAccountId = settings.breakageIncomeAccountId ?? data.expirationIncomeChartOfAccountId;
    if (!breakageAccountId) {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'voucher.expired.v1',
        sourceModule: 'voucher',
        sourceReferenceId: data.voucherId,
        entityType: 'breakage_income',
        entityId: data.voucherId,
        reason: 'Missing expiration income account on voucher type and no default in settings',
      });
      return;
    }

    const amountDollars = (data.expirationAmountCents / 100).toFixed(2);

    const postingApi = getAccountingPostingApi();
    // No location for expiration (batch job, not location-specific)
    const ctx = buildSyntheticCtx(event.tenantId, undefined, data.voucherId);

    await postingApi.postEntry(ctx, {
      businessDate: data.expirationDate,
      sourceModule: 'voucher',
      sourceReferenceId: `expire-${data.voucherId}`,
      memo: `Voucher expired: ${data.voucherNumber} — breakage income`,
      currency: 'USD',
      lines: [
        {
          accountId: liabilityAccountId,
          debitAmount: amountDollars,
          creditAmount: '0',
          memo: `Voucher ${data.voucherNumber} — liability released (expired)`,
        },
        {
          accountId: breakageAccountId,
          debitAmount: '0',
          creditAmount: amountDollars,
          memo: `Voucher ${data.voucherNumber} — breakage income recognized`,
        },
      ],
      forcePost: true,
    });
  } catch (err) {
    console.error(`Voucher expiration GL posting failed for ${data.voucherId}:`, err);
    try {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'voucher.expired.v1',
        sourceModule: 'voucher',
        sourceReferenceId: data.voucherId,
        entityType: 'posting_error',
        entityId: data.voucherId,
        reason: `GL posting failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    } catch { /* best-effort tracking */ }
  }
}
