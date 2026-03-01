import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';
import { db } from '@oppsera/db';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { ensureAccountingSettings } from '../helpers/ensure-accounting-settings';
import { logUnmappedEvent } from '../helpers/resolve-mapping';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';

const SpaPackagePurchasePayloadSchema = z.object({
  packageBalanceId: z.string(),
  packageDefinitionId: z.string(),
  customerId: z.string(),
  tenantId: z.string(),
  locationId: z.string().optional(),
  amountCents: z.number(),
  businessDate: z.string(),
});

type _SpaPackagePurchasePayload = z.infer<typeof SpaPackagePurchasePayloadSchema>;

const SpaPackageRedemptionPayloadSchema = z.object({
  packageBalanceId: z.string(),
  packageDefinitionId: z.string(),
  customerId: z.string(),
  tenantId: z.string(),
  locationId: z.string().optional(),
  amountCents: z.number(),
  appointmentId: z.string().optional(),
  businessDate: z.string(),
});

type _SpaPackageRedemptionPayload = z.infer<typeof SpaPackageRedemptionPayloadSchema>;

function buildSyntheticCtx(tenantId: string, locationId?: string, sourceRef?: string): RequestContext {
  return {
    tenantId,
    locationId: locationId ?? null,
    user: { id: 'system', email: 'system@oppsera.io', name: 'System', tenantId, tenantStatus: 'active', membershipStatus: 'active' },
    requestId: `spa-package-gl-${sourceRef ?? 'unknown'}`,
    isPlatformAdmin: false,
  } as RequestContext;
}

/**
 * Handles spa.package.purchased.v1 events.
 *
 * GL posting for spa package purchase (deferred revenue):
 *   Dr Cash / Undeposited Funds
 *   Cr Deferred Revenue (package liability — revenue recognized later on redemption)
 *
 * Never blocks package purchase — catches all errors.
 */
export async function handleSpaPackagePurchaseForAccounting(event: EventEnvelope): Promise<void> {
  const parsed = SpaPackagePurchasePayloadSchema.safeParse(event.data);
  if (!parsed.success) {
    console.error(`[spa-package-gl] Invalid event payload for spa.package.purchased.v1:`, parsed.error.message);
    return;
  }
  const data = parsed.data;

  try {
    if (data.amountCents === 0) return;

    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }
    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'spa.package.purchased.v1',
          sourceModule: 'spa_package',
          sourceReferenceId: data.packageBalanceId,
          entityType: 'accounting_settings',
          entityId: event.tenantId,
          reason: 'CRITICAL: GL spa package purchase posting skipped — accounting settings missing.',
        });
      } catch { /* never block purchase */ }
      console.error(`[spa-package-gl] CRITICAL: accounting settings missing for tenant=${event.tenantId}`);
      return;
    }

    const cashAccountId = settings.defaultUndepositedFundsAccountId;
    if (!cashAccountId) {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'spa.package.purchased.v1',
        sourceModule: 'spa_package',
        sourceReferenceId: data.packageBalanceId,
        entityType: 'cash_account',
        entityId: 'default',
        reason: 'Missing default undeposited funds account for spa package purchase',
      });
      return;
    }

    // TODO: Add a dedicated spa deferred revenue account setting.
    // For now, using uncategorized revenue as deferred revenue fallback.
    const deferredRevenueAccountId = settings.defaultUncategorizedRevenueAccountId;
    if (!deferredRevenueAccountId) {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'spa.package.purchased.v1',
        sourceModule: 'spa_package',
        sourceReferenceId: data.packageBalanceId,
        entityType: 'deferred_revenue_account',
        entityId: 'default',
        reason: 'Missing deferred revenue account for spa package purchase',
      });
      return;
    }

    const amountDollars = (data.amountCents / 100).toFixed(2);
    const postingApi = getAccountingPostingApi();
    const ctx = buildSyntheticCtx(event.tenantId, data.locationId, data.packageBalanceId);

    await postingApi.postEntry(ctx, {
      businessDate: data.businessDate,
      sourceModule: 'spa_package',
      sourceReferenceId: `purchase-${data.packageBalanceId}`,
      memo: `Spa package purchase: ${data.packageDefinitionId}`,
      currency: 'USD',
      lines: [
        {
          accountId: cashAccountId,
          debitAmount: amountDollars,
          creditAmount: '0',
          locationId: data.locationId,
          customerId: data.customerId,
          channel: 'spa',
          memo: 'Spa package purchase — cash/clearing',
        },
        {
          accountId: deferredRevenueAccountId,
          debitAmount: '0',
          creditAmount: amountDollars,
          locationId: data.locationId,
          channel: 'spa',
          memo: 'Spa package purchase — deferred revenue',
        },
      ],
      forcePost: true,
    });
  } catch (err) {
    console.error(`Spa package purchase GL posting failed for ${data.packageBalanceId}:`, err);
    try {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'spa.package.purchased.v1',
        sourceModule: 'spa_package',
        sourceReferenceId: data.packageBalanceId,
        entityType: 'posting_error',
        entityId: data.packageBalanceId,
        reason: `GL posting failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    } catch { /* best-effort tracking */ }
  }
}

/**
 * Handles spa.package.redeemed.v1 events.
 *
 * GL posting for spa package redemption (revenue recognition):
 *   Dr Deferred Revenue (reduce liability)
 *   Cr Service Revenue (recognize earned revenue)
 *
 * Never blocks package redemption — catches all errors.
 */
export async function handleSpaPackageRedemptionForAccounting(event: EventEnvelope): Promise<void> {
  const parsed = SpaPackageRedemptionPayloadSchema.safeParse(event.data);
  if (!parsed.success) {
    console.error(`[spa-package-gl] Invalid event payload for spa.package.redeemed.v1:`, parsed.error.message);
    return;
  }
  const data = parsed.data;

  try {
    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }
    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'spa.package.redeemed.v1',
          sourceModule: 'spa_package',
          sourceReferenceId: data.packageBalanceId,
          entityType: 'accounting_settings',
          entityId: event.tenantId,
          reason: 'CRITICAL: GL spa package redemption posting skipped — accounting settings missing.',
        });
      } catch { /* never block redemption */ }
      console.error(`[spa-package-gl] CRITICAL: accounting settings missing for tenant=${event.tenantId}`);
      return;
    }

    // Deferred revenue (debit side) — ideally a dedicated liability account.
    // TODO: Add a dedicated spa deferred revenue account setting.
    // Uses defaultUncategorizedRevenueAccountId as fallback for deferred revenue.
    const deferredRevenueAccountId = settings.defaultUncategorizedRevenueAccountId;

    // Service revenue (credit side) — where earned revenue is recognized.
    // Needs to be a DIFFERENT account from deferred revenue to avoid self-canceling entries.
    // Without a dedicated spa revenue account, we cannot post a meaningful entry.
    const revenueAccountId = settings.defaultUncategorizedRevenueAccountId;

    if (!deferredRevenueAccountId || !revenueAccountId) {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'spa.package.redeemed.v1',
        sourceModule: 'spa_package',
        sourceReferenceId: data.packageBalanceId,
        entityType: 'gl_account',
        entityId: 'deferred_revenue_or_revenue',
        reason: 'Missing deferred revenue or service revenue account for spa package redemption',
      });
      return;
    }

    // Prevent self-canceling entries (gotcha #453) — if both accounts are the same,
    // posting Dr X / Cr X would inflate activity with zero net effect.
    if (deferredRevenueAccountId === revenueAccountId) {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'spa.package.redeemed.v1',
        sourceModule: 'spa_package',
        sourceReferenceId: data.packageBalanceId,
        entityType: 'deferred_revenue_same_as_revenue',
        entityId: data.packageBalanceId,
        reason: `Spa package redemption skipped: deferred revenue and service revenue resolve to the same GL account. Configure a dedicated deferred revenue liability account and remap.`,
      });
      return;
    }

    if (data.amountCents === 0) return;

    const amountDollars = (data.amountCents / 100).toFixed(2);
    const appointmentRef = data.appointmentId ?? 'manual';
    const postingApi = getAccountingPostingApi();
    const ctx = buildSyntheticCtx(event.tenantId, data.locationId, data.packageBalanceId);

    await postingApi.postEntry(ctx, {
      businessDate: data.businessDate,
      sourceModule: 'spa_package',
      sourceReferenceId: `redeem-${data.packageBalanceId}-${appointmentRef}`,
      memo: `Spa package redemption: ${data.packageDefinitionId}`,
      currency: 'USD',
      lines: [
        {
          accountId: deferredRevenueAccountId,
          debitAmount: amountDollars,
          creditAmount: '0',
          locationId: data.locationId,
          channel: 'spa',
          memo: 'Spa package redemption — deferred revenue release',
        },
        {
          accountId: revenueAccountId,
          debitAmount: '0',
          creditAmount: amountDollars,
          locationId: data.locationId,
          channel: 'spa',
          memo: 'Spa package redemption — service revenue',
        },
      ],
      forcePost: true,
    });
  } catch (err) {
    console.error(`Spa package redemption GL posting failed for ${data.packageBalanceId}:`, err);
    try {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'spa.package.redeemed.v1',
        sourceModule: 'spa_package',
        sourceReferenceId: data.packageBalanceId,
        entityType: 'posting_error',
        entityId: data.packageBalanceId,
        reason: `GL posting failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    } catch { /* best-effort tracking */ }
  }
}
