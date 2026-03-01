import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';
import { db } from '@oppsera/db';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { ensureAccountingSettings } from '../helpers/ensure-accounting-settings';
import { logUnmappedEvent } from '../helpers/resolve-mapping';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';

const SpaCheckoutPayloadSchema = z.object({
  appointmentId: z.string(),
  tenantId: z.string(),
  locationId: z.string().optional(),
  customerId: z.string(),
  providerId: z.string(),
  totalCents: z.number(),
  taxCents: z.number(),
  tipCents: z.number(),
  serviceItems: z.array(z.object({
    serviceId: z.string(),
    serviceName: z.string(),
    priceCents: z.number(),
    providerId: z.string(),
  })),
  tenderId: z.string().optional(),
  tenderType: z.string().optional(),
  businessDate: z.string(),
  orderId: z.string().nullish(),
});

type _SpaCheckoutPayload = z.infer<typeof SpaCheckoutPayloadSchema>;

function buildSyntheticCtx(tenantId: string, locationId?: string, sourceRef?: string): RequestContext {
  return {
    tenantId,
    locationId: locationId ?? null,
    user: { id: 'system', email: 'system@oppsera.io', name: 'System', tenantId, tenantStatus: 'active', membershipStatus: 'active' },
    requestId: `spa-gl-${sourceRef ?? 'unknown'}`,
    isPlatformAdmin: false,
  } as RequestContext;
}

/**
 * Handles spa.appointment.checked_out.v1 events.
 *
 * GL posting for spa appointment checkout:
 *   Dr Cash / Undeposited Funds (based on tender type)
 *   Cr Spa Service Revenue
 *   Cr Sales Tax Payable (if tax > 0)
 *   Cr Tips Payable (if tip > 0)
 *
 * Never blocks checkout — catches all errors.
 */
export async function handleSpaCheckoutForAccounting(event: EventEnvelope): Promise<void> {
  const parsed = SpaCheckoutPayloadSchema.safeParse(event.data);
  if (!parsed.success) {
    console.error(`[spa-gl] Invalid event payload for spa.appointment.checked_out.v1:`, parsed.error.message);
    return;
  }
  const data = parsed.data;

  // When checkout flows through orders/tenders pipeline, GL is posted by
  // handleTenderForAccounting — skip to prevent double-posting
  if (data.orderId) return;

  try {
    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }
    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'spa.appointment.checked_out.v1',
          sourceModule: 'spa',
          sourceReferenceId: data.appointmentId,
          entityType: 'accounting_settings',
          entityId: event.tenantId,
          reason: 'CRITICAL: GL spa checkout posting skipped — accounting settings missing even after ensureAccountingSettings.',
        });
      } catch { /* never block spa checkout */ }
      console.error(`[spa-gl] CRITICAL: accounting settings missing for tenant=${event.tenantId}`);
      return;
    }

    // Resolve revenue account — use uncategorized revenue as fallback
    const revenueAccountId = settings.defaultUncategorizedRevenueAccountId;
    if (!revenueAccountId) {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'spa.appointment.checked_out.v1',
        sourceModule: 'spa',
        sourceReferenceId: data.appointmentId,
        entityType: 'revenue_account',
        entityId: 'default',
        reason: 'Missing default revenue account for spa service revenue',
      });
      return;
    }

    // Resolve cash/clearing account (debit side)
    const cashAccountId = settings.defaultUndepositedFundsAccountId;
    if (!cashAccountId) {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'spa.appointment.checked_out.v1',
        sourceModule: 'spa',
        sourceReferenceId: data.appointmentId,
        entityType: 'cash_account',
        entityId: 'default',
        reason: 'Missing default undeposited funds account for spa checkout',
      });
      return;
    }

    const lines: Array<{
      accountId: string;
      debitAmount: string;
      creditAmount: string;
      locationId?: string;
      customerId?: string;
      channel?: string;
      memo?: string;
    }> = [];

    const netRevenueCents = data.totalCents - data.taxCents - data.tipCents;
    const revenueDollars = (netRevenueCents / 100).toFixed(2);
    const totalDollars = (data.totalCents / 100).toFixed(2);

    // Debit: Cash / Undeposited Funds (full amount including tax and tip)
    lines.push({
      accountId: cashAccountId,
      debitAmount: totalDollars,
      creditAmount: '0',
      locationId: data.locationId,
      customerId: data.customerId,
      channel: 'spa',
      memo: 'Spa appointment checkout — cash/clearing',
    });

    // Credit: Spa Service Revenue (net of tax and tip)
    if (netRevenueCents > 0) {
      lines.push({
        accountId: revenueAccountId,
        debitAmount: '0',
        creditAmount: revenueDollars,
        locationId: data.locationId,
        channel: 'spa',
        memo: 'Spa appointment checkout — service revenue',
      });
    }

    // Credit: Sales Tax Payable
    if (data.taxCents > 0) {
      const taxAccountId = settings.defaultSalesTaxPayableAccountId;
      if (taxAccountId) {
        lines.push({
          accountId: taxAccountId,
          debitAmount: '0',
          creditAmount: (data.taxCents / 100).toFixed(2),
          locationId: data.locationId,
          channel: 'spa',
          memo: 'Spa appointment checkout — sales tax',
        });
      }
    }

    // Credit: Tips Payable
    if (data.tipCents > 0) {
      const tipsAccountId = settings.defaultTipsPayableAccountId;
      if (tipsAccountId) {
        lines.push({
          accountId: tipsAccountId,
          debitAmount: '0',
          creditAmount: (data.tipCents / 100).toFixed(2),
          locationId: data.locationId,
          channel: 'spa',
          memo: 'Spa appointment checkout — tips payable',
        });
      }
    }

    if (lines.length < 2) {
      console.error(`[spa-gl] CRITICAL: < 2 GL lines for appointment=${data.appointmentId}`);
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'spa.appointment.checked_out.v1',
        sourceModule: 'spa',
        sourceReferenceId: data.appointmentId,
        entityType: 'gl_posting_gap',
        entityId: data.appointmentId,
        reason: 'CRITICAL: fewer than 2 GL lines generated for spa checkout',
      });
      return;
    }

    const postingApi = getAccountingPostingApi();
    const ctx = buildSyntheticCtx(event.tenantId, data.locationId, data.appointmentId);

    await postingApi.postEntry(ctx, {
      businessDate: data.businessDate,
      sourceModule: 'spa',
      sourceReferenceId: `checkout-${data.appointmentId}`,
      memo: `Spa appointment checkout: ${data.appointmentId}`,
      currency: 'USD',
      lines,
      forcePost: true,
    });
  } catch (err) {
    console.error(`Spa checkout GL posting failed for ${data.appointmentId}:`, err);
    try {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'spa.appointment.checked_out.v1',
        sourceModule: 'spa',
        sourceReferenceId: data.appointmentId,
        entityType: 'posting_error',
        entityId: data.appointmentId,
        reason: `GL posting failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    } catch { /* best-effort tracking */ }
  }
}
