import { withTenant } from '@oppsera/db';
import {
  paymentTransactions,
  paymentIntents,
  customerPaymentMethods,
  chargebacks,
} from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import type { RequestContext } from '@oppsera/core/auth/context';
import { auditLog } from '@oppsera/core/audit/helpers';
import { extractCardLast4, detectCardBrand } from '../helpers/amount';

// ── Types ──────────────────────────────────────────────────────────

export type WebhookEventType =
  | 'chargeback'
  | 'card_update'
  | 'settlement'
  | 'status_update'
  | 'unknown';

export interface WebhookPayload {
  eventType: WebhookEventType;
  providerCode: string;
  tenantId: string;
  data: Record<string, unknown>;
}

export interface WebhookProcessResult {
  processed: boolean;
  action: string;
  details?: Record<string, unknown>;
}

// ── Router ─────────────────────────────────────────────────────────

/**
 * Route a webhook event to the appropriate handler.
 */
export async function processWebhookEvent(
  ctx: RequestContext,
  payload: WebhookPayload,
): Promise<WebhookProcessResult> {
  switch (payload.eventType) {
    case 'chargeback':
      return processChargebackEvent(ctx, payload.data);
    case 'card_update':
      return processCardUpdateEvent(ctx, payload.data);
    case 'settlement':
      return processSettlementEvent(ctx, payload.data);
    case 'status_update':
      return processStatusUpdateEvent(ctx, payload.data);
    default:
      return { processed: false, action: 'unknown_event_type' };
  }
}

// ── Chargeback Handler ─────────────────────────────────────────────

/**
 * Process a chargeback notification from the provider.
 *
 * Flow:
 * 1. Find original transaction by providerRef (retref)
 * 2. Resolve tenderId and orderId via payment_intents
 * 3. Check idempotency by providerCaseId
 * 4. Create chargeback record via direct insert (matches chargebacks schema)
 * 5. Publish chargeback.received.v1 event for GL posting adapter
 */
async function processChargebackEvent(
  ctx: RequestContext,
  data: Record<string, unknown>,
): Promise<WebhookProcessResult> {
  const retref = String(data.retref ?? data.providerRef ?? '');
  const amountStr = String(data.amount ?? data.chargebackAmount ?? '0');
  const amountCents = Math.round(parseFloat(amountStr) * 100);
  const reason = String(data.reason ?? data.reasonCode ?? 'Chargeback received via webhook');
  const caseNumber = String(data.caseNumber ?? data.caseid ?? '');

  if (!retref) {
    return { processed: false, action: 'chargeback_missing_retref' };
  }

  return withTenant(ctx.tenantId, async (tx) => {
    // Find the original transaction
    const [txnRow] = await tx
      .select({
        id: paymentTransactions.id,
        paymentIntentId: paymentTransactions.paymentIntentId,
        amountCents: paymentTransactions.amountCents,
      })
      .from(paymentTransactions)
      .where(
        and(
          eq(paymentTransactions.tenantId, ctx.tenantId),
          eq(paymentTransactions.providerRef, retref),
          eq(paymentTransactions.responseStatus, 'approved'),
        ),
      )
      .limit(1);

    if (!txnRow) {
      return {
        processed: false,
        action: 'chargeback_no_matching_transaction',
        details: { retref },
      };
    }

    // Get intent for tender + order linkage
    const [intent] = await tx
      .select({
        tenderId: paymentIntents.tenderId,
        orderId: paymentIntents.orderId,
      })
      .from(paymentIntents)
      .where(eq(paymentIntents.id, txnRow.paymentIntentId))
      .limit(1);

    if (!intent?.tenderId || !intent?.orderId) {
      return {
        processed: false,
        action: 'chargeback_no_tender_linkage',
        details: { retref, paymentIntentId: txnRow.paymentIntentId },
      };
    }

    // Check for existing chargeback by providerCaseId (idempotent)
    if (caseNumber) {
      const [existing] = await tx
        .select({ id: chargebacks.id })
        .from(chargebacks)
        .where(
          and(
            eq(chargebacks.tenantId, ctx.tenantId),
            eq(chargebacks.providerCaseId, caseNumber),
          ),
        )
        .limit(1);

      if (existing) {
        return {
          processed: true,
          action: 'chargeback_already_exists',
          details: { chargebackId: existing.id },
        };
      }
    }

    // Create chargeback record matching the chargebacks schema
    const chargebackId = generateUlid();
    const now = new Date();
    const businessDate = now.toISOString().slice(0, 10);

    const result = await publishWithOutbox(ctx, async () => {
      await tx.insert(chargebacks).values({
        id: chargebackId,
        tenantId: ctx.tenantId,
        locationId: ctx.locationId ?? 'webhook',
        tenderId: intent.tenderId!,
        orderId: intent.orderId!,
        chargebackReason: reason,
        chargebackAmountCents: amountCents,
        feeAmountCents: 0,
        status: 'received',
        providerCaseId: caseNumber || null,
        providerRef: retref,
        businessDate,
        createdAt: now,
        updatedAt: now,
        createdBy: 'system:webhook',
      });

      const event = buildEventFromContext(ctx, 'chargeback.received.v1', {
        chargebackId,
        tenderId: intent.tenderId,
        orderId: intent.orderId,
        tenderType: 'credit_card',
        chargebackAmountCents: amountCents,
        feeAmountCents: 0,
        locationId: ctx.locationId ?? 'webhook',
        businessDate,
        chargebackReason: reason,
      });

      return { result: { chargebackId }, events: [event] };
    });

    await auditLog(ctx, 'chargeback.received', 'chargeback', result.chargebackId);

    return {
      processed: true,
      action: 'chargeback_created',
      details: { chargebackId, tenderId: intent.tenderId },
    };
  });
}

// ── Card Update Handler ────────────────────────────────────────────

/**
 * Process a Card Account Updater notification.
 *
 * When a customer's card is reissued (new number, new expiry),
 * CardPointe sends updated token data via CAU webhook.
 *
 * Flow:
 * 1. Find customer_payment_methods by old token/profileId
 * 2. Update token, last4, expiry
 * 3. Audit log the change
 */
async function processCardUpdateEvent(
  ctx: RequestContext,
  data: Record<string, unknown>,
): Promise<WebhookProcessResult> {
  const oldToken = String(data.oldtoken ?? data.old_token ?? '');
  const newToken = String(data.newtoken ?? data.new_token ?? data.token ?? '');
  const newExpiry = String(data.expiry ?? data.new_expiry ?? '');
  const profileId = String(data.profileid ?? data.profile_id ?? '');

  if (!newToken && !profileId) {
    return { processed: false, action: 'card_update_missing_identifier' };
  }

  return withTenant(ctx.tenantId, async (tx) => {
    // Find the payment method by provider profile ID or old token
    let matchCondition;
    if (profileId) {
      matchCondition = eq(customerPaymentMethods.providerProfileId, profileId);
    } else if (oldToken) {
      // Match by last4 from old token (we don't store full tokens)
      const oldLast4 = extractCardLast4(oldToken);
      if (!oldLast4) {
        return { processed: false, action: 'card_update_cannot_match' };
      }
      matchCondition = eq(customerPaymentMethods.last4, oldLast4);
    } else {
      return { processed: false, action: 'card_update_no_match_criteria' };
    }

    const methods = await tx
      .select({
        id: customerPaymentMethods.id,
        customerId: customerPaymentMethods.customerId,
        last4: customerPaymentMethods.last4,
        brand: customerPaymentMethods.brand,
      })
      .from(customerPaymentMethods)
      .where(
        and(
          eq(customerPaymentMethods.tenantId, ctx.tenantId),
          eq(customerPaymentMethods.status, 'active'),
          matchCondition,
        ),
      );

    if (methods.length === 0) {
      return { processed: false, action: 'card_update_no_matching_method' };
    }

    // Update each matching method
    let updatedCount = 0;
    for (const method of methods) {
      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (newToken) {
        const newLast4 = extractCardLast4(newToken);
        if (newLast4) updates.last4 = newLast4;
        const newBrand = detectCardBrand(newToken.slice(1)); // skip leading '9'
        if (newBrand) updates.brand = newBrand;
      }

      if (newExpiry && newExpiry.length >= 4) {
        // CardPointe expiry format: MMYY
        const mm = parseInt(newExpiry.slice(0, 2), 10);
        const yy = parseInt(newExpiry.slice(2, 4), 10);
        const yyyy = yy < 50 ? 2000 + yy : 1900 + yy;
        updates.expiryMonth = mm;
        updates.expiryYear = yyyy;
      }

      await tx
        .update(customerPaymentMethods)
        .set(updates)
        .where(
          and(
            eq(customerPaymentMethods.id, method.id),
            eq(customerPaymentMethods.tenantId, ctx.tenantId),
          ),
        );

      updatedCount++;
    }

    await auditLog(ctx, 'payment.card_updated', 'customer_payment_method', methods[0]!.id);

    return {
      processed: true,
      action: 'card_updated',
      details: { updatedCount, customerId: methods[0]!.customerId },
    };
  });
}

// ── Settlement Handler ─────────────────────────────────────────────

/**
 * Process a settlement notification.
 * This triggers the settlement fetch job for the notified date.
 *
 * Note: Most settlement reconciliation happens via the daily cron job.
 * This handler is for real-time settlement notifications (if configured).
 */
async function processSettlementEvent(
  _ctx: RequestContext,
  data: Record<string, unknown>,
): Promise<WebhookProcessResult> {
  // Settlement webhooks are informational — they tell us a batch was settled.
  // The actual data fetch happens via fetchDailySettlements() cron job.
  // We log the event for audit purposes.
  const batchId = String(data.batchid ?? data.batch_id ?? '');
  const merchId = String(data.merchid ?? data.merchant_id ?? '');

  return {
    processed: true,
    action: 'settlement_notification_logged',
    details: { batchId, merchId, note: 'Daily cron job will fetch full settlement data' },
  };
}

// ── Status Update Handler ──────────────────────────────────────────

/**
 * Process a transaction status update (e.g., void confirmation, capture confirmation).
 * Records the status change in the transaction log.
 */
async function processStatusUpdateEvent(
  ctx: RequestContext,
  data: Record<string, unknown>,
): Promise<WebhookProcessResult> {
  const retref = String(data.retref ?? data.providerRef ?? '');
  const newStatus = String(data.setlstat ?? data.status ?? '');

  if (!retref) {
    return { processed: false, action: 'status_update_missing_retref' };
  }

  return withTenant(ctx.tenantId, async (tx) => {
    // Find the transaction
    const [txnRow] = await tx
      .select({ paymentIntentId: paymentTransactions.paymentIntentId })
      .from(paymentTransactions)
      .where(
        and(
          eq(paymentTransactions.tenantId, ctx.tenantId),
          eq(paymentTransactions.providerRef, retref),
        ),
      )
      .limit(1);

    if (!txnRow) {
      return {
        processed: false,
        action: 'status_update_no_matching_transaction',
        details: { retref },
      };
    }

    // Record the status update in the transaction log
    await tx.insert(paymentTransactions).values({
      id: generateUlid(),
      tenantId: ctx.tenantId,
      paymentIntentId: txnRow.paymentIntentId,
      transactionType: 'status_update',
      providerRef: retref,
      amountCents: 0,
      responseStatus: 'approved',
      responseCode: newStatus,
      responseText: `Webhook status update: ${newStatus}`,
      providerResponse: data,
    });

    return {
      processed: true,
      action: 'status_update_recorded',
      details: { retref, newStatus },
    };
  });
}

// ── Event Type Detection ───────────────────────────────────────────

/**
 * Detect the webhook event type from the payload.
 * CardPointe doesn't have a standard event type field — we infer from payload shape.
 */
export function detectEventType(
  providerCode: string,
  payload: Record<string, unknown>,
): WebhookEventType {
  if (providerCode === 'cardpointe') {
    // Chargeback: has 'chargebackAmount' or 'reason' + 'caseNumber'
    if (payload.chargebackAmount || (payload.reason && payload.caseNumber)) {
      return 'chargeback';
    }
    // Card update: has 'newtoken' or 'new_token'
    if (payload.newtoken || payload.new_token || payload.profileupdate) {
      return 'card_update';
    }
    // Settlement: has 'batchid' and no 'retref'
    if (payload.batchid && !payload.retref) {
      return 'settlement';
    }
    // Status update: has 'retref' + 'setlstat'
    if (payload.retref && payload.setlstat) {
      return 'status_update';
    }
  }

  return 'unknown';
}
