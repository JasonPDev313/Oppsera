import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { paymentIntents, achReturns, tenders } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { PAYMENT_GATEWAY_EVENTS, assertIntentTransition } from '../events/gateway-types';
import type { PaymentIntentStatus } from '../events/gateway-types';
import { getReturnDescription, isRetryableReturn, isAdministrativeReturn } from '../helpers/ach-return-codes';

export interface ProcessAchReturnInput {
  paymentIntentId: string;
  returnCode: string;      // R01, R02, etc.
  returnReason?: string;    // human-readable (overrides our registry if provided)
  returnDate: string;       // YYYY-MM-DD
  providerRef?: string;     // provider reference for the return
  fundingBatchId?: string;  // batch ID from funding poll
}

export interface ProcessAchReturnResult {
  achReturnId: string;
  paymentIntentId: string;
  returnCode: string;
  returnReason: string;
  isRetryable: boolean;
}

/**
 * Process an ACH return (bank rejection/reversal).
 * Appends to ach_returns, updates payment_intent status, emits event.
 *
 * Called by:
 * - Funding poll job (daily check of CardPointe funding endpoint)
 * - Webhook handler (real-time CardPointe ACH webhook)
 */
export async function processAchReturn(
  ctx: RequestContext,
  input: ProcessAchReturnInput,
): Promise<ProcessAchReturnResult> {
  const returnReason = input.returnReason ?? getReturnDescription(input.returnCode);
  const retryable = isRetryableReturn(input.returnCode);
  const administrative = isAdministrativeReturn(input.returnCode);

  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Load the payment intent
    const [intent] = await tx
      .select()
      .from(paymentIntents)
      .where(
        and(
          eq(paymentIntents.id, input.paymentIntentId),
          eq(paymentIntents.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!intent) {
      throw new AppError('PAYMENT_INTENT_NOT_FOUND', 'Payment intent not found', 404);
    }

    // Validate it's an ACH payment
    if (intent.paymentMethodType !== 'ach') {
      throw new AppError('NOT_ACH_PAYMENT', 'Payment intent is not an ACH payment', 422);
    }

    // 2. Check for duplicate return (idempotent)
    const [existingReturn] = await tx
      .select()
      .from(achReturns)
      .where(
        and(
          eq(achReturns.paymentIntentId, input.paymentIntentId),
          eq(achReturns.tenantId, ctx.tenantId),
          eq(achReturns.returnCode, input.returnCode),
        ),
      )
      .limit(1);

    if (existingReturn) {
      // Already processed — idempotent return
      return {
        result: {
          achReturnId: existingReturn.id,
          paymentIntentId: input.paymentIntentId,
          returnCode: input.returnCode,
          returnReason,
          isRetryable: retryable,
        } satisfies ProcessAchReturnResult,
        events: [],
      };
    }

    // 3. Insert into ach_returns (append-only)
    const [achReturn] = await tx
      .insert(achReturns)
      .values({
        tenantId: ctx.tenantId,
        paymentIntentId: input.paymentIntentId,
        returnCode: input.returnCode,
        returnReason,
        returnDate: input.returnDate,
        originalAmountCents: intent.amountCents,
        providerRef: input.providerRef ?? null,
        fundingBatchId: input.fundingBatchId ?? null,
        isAdministrative: administrative,
      })
      .returning();

    // 4. Update payment intent ACH fields
    const currentStatus = intent.status as PaymentIntentStatus;
    assertIntentTransition(currentStatus, 'ach_returned');

    await tx
      .update(paymentIntents)
      .set({
        status: 'ach_returned',
        achSettlementStatus: 'returned',
        achReturnCode: input.returnCode,
        achReturnReason: returnReason,
        errorMessage: `ACH Return ${input.returnCode}: ${returnReason}`,
        updatedAt: new Date(),
      })
      .where(eq(paymentIntents.id, input.paymentIntentId));

    // 5. Resolve linked tender for downstream GL reversal
    let tenderId: string | null = null;
    try {
      const [tender] = await tx
        .select({ id: tenders.id })
        .from(tenders)
        .where(
          and(
            eq(tenders.tenantId, ctx.tenantId),
            eq(tenders.paymentIntentId, input.paymentIntentId),
          ),
        )
        .limit(1);
      tenderId = tender?.id ?? null;
    } catch {
      // Best-effort — don't block ACH return processing if tender lookup fails
    }

    // 6. Emit ACH return event (enriched with tenderId for GL reversal)
    const event = buildEventFromContext(ctx, PAYMENT_GATEWAY_EVENTS.ACH_RETURNED, {
      paymentIntentId: input.paymentIntentId,
      tenantId: ctx.tenantId,
      locationId: intent.locationId,
      merchantAccountId: intent.merchantAccountId,
      amountCents: intent.amountCents,
      returnCode: input.returnCode,
      returnReason,
      returnDate: input.returnDate,
      providerRef: input.providerRef ?? null,
      orderId: intent.orderId ?? null,
      customerId: intent.customerId ?? null,
      achReturnId: achReturn!.id,
      isRetryable: retryable,
      tenderId, // for accounting adapter GL reversal
    });

    return {
      result: {
        achReturnId: achReturn!.id,
        paymentIntentId: input.paymentIntentId,
        returnCode: input.returnCode,
        returnReason,
        isRetryable: retryable,
      } satisfies ProcessAchReturnResult,
      events: [event],
    };
  });

  await auditLog(ctx, 'payment.ach_return.processed', 'payment_intent', input.paymentIntentId);
  return result;
}
