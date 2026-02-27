import type { EventEnvelope } from '@oppsera/shared';
import { db } from '@oppsera/db';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { ensureAccountingSettings } from '../helpers/ensure-accounting-settings';
import { logUnmappedEvent } from '../helpers/resolve-mapping';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';

interface MembershipBillingPayload {
  membershipId: string;
  membershipPlanId: string;
  customerId: string;
  billingAccountId: string;
  amountCents: number;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  businessDate: string;
  locationId?: string;
  revenueGlAccountId: string | null;
  deferredRevenueGlAccountId: string | null;
}

function buildSyntheticCtx(tenantId: string, locationId?: string, sourceRef?: string): RequestContext {
  return {
    tenantId,
    locationId: locationId ?? null,
    user: { id: 'system', email: 'system@oppsera.io', name: 'System', tenantId, tenantStatus: 'active', membershipStatus: 'active' },
    requestId: `membership-gl-${sourceRef ?? 'unknown'}`,
    isPlatformAdmin: false,
  } as RequestContext;
}

/**
 * Handles membership.billing.charged.v1 events.
 *
 * GL posting for membership billing:
 *   Dr Accounts Receivable (AR control)
 *   Cr Deferred Revenue (membership plan's deferred revenue account)
 *
 * Revenue is deferred at billing time and recognized over the membership period.
 * Never blocks membership billing — catches all errors.
 */
export async function handleMembershipBillingForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as MembershipBillingPayload;

  try {
    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }
    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'membership.billing.charged.v1',
          sourceModule: 'membership',
          sourceReferenceId: data.membershipId,
          entityType: 'accounting_settings',
          entityId: event.tenantId,
          reason: 'CRITICAL: GL membership billing posting skipped — accounting settings missing even after ensureAccountingSettings. Investigate immediately.',
        });
      } catch { /* never block membership billing */ }
      console.error(`[membership-gl] CRITICAL: accounting settings missing for tenant=${event.tenantId} after ensureAccountingSettings`);
      return;
    }

    // AR control account (debit side)
    const arAccountId = settings.defaultARControlAccountId;
    if (!arAccountId) {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'membership.billing.charged.v1',
        sourceModule: 'membership',
        sourceReferenceId: data.membershipId,
        entityType: 'ar_control',
        entityId: 'default',
        reason: 'Missing default AR control account for membership billing',
      });
      return;
    }

    // Deferred revenue account (credit side) — from the membership plan
    const deferredRevenueAccountId = data.deferredRevenueGlAccountId;
    if (!deferredRevenueAccountId) {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'membership.billing.charged.v1',
        sourceModule: 'membership',
        sourceReferenceId: data.membershipId,
        entityType: 'deferred_revenue',
        entityId: data.membershipPlanId,
        reason: 'Missing deferred revenue GL account on membership plan',
      });
      return;
    }

    const amountDollars = (data.amountCents / 100).toFixed(2);

    const postingApi = getAccountingPostingApi();
    const ctx = buildSyntheticCtx(event.tenantId, data.locationId, data.membershipId);

    await postingApi.postEntry(ctx, {
      businessDate: data.businessDate,
      sourceModule: 'membership',
      sourceReferenceId: `billing-${data.membershipId}-${data.billingPeriodStart}`,
      memo: `Membership billing: ${data.billingPeriodStart} to ${data.billingPeriodEnd}`,
      currency: 'USD',
      lines: [
        {
          accountId: arAccountId,
          debitAmount: amountDollars,
          creditAmount: '0',
          locationId: data.locationId,
          customerId: data.customerId,
          memo: `Membership billing — AR charge`,
        },
        {
          accountId: deferredRevenueAccountId,
          debitAmount: '0',
          creditAmount: amountDollars,
          locationId: data.locationId,
          memo: `Membership billing — deferred revenue`,
        },
      ],
      forcePost: true,
    });
  } catch (err) {
    console.error(`Membership billing GL posting failed for ${data.membershipId}:`, err);
    try {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'membership.billing.charged.v1',
        sourceModule: 'membership',
        sourceReferenceId: data.membershipId,
        entityType: 'posting_error',
        entityId: data.membershipId,
        reason: `GL posting failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    } catch { /* best-effort tracking */ }
  }
}
