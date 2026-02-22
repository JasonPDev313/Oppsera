import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError, generateUlid } from '@oppsera/shared';
import { tenders, chargebacks } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { RecordChargebackInput } from '../chargeback-validation';
import {
  checkIdempotency,
  saveIdempotencyKey,
} from '@oppsera/core/helpers/idempotency';

/**
 * Record a new chargeback against a tender.
 *
 * Creates the chargeback record in 'received' status and emits
 * chargeback.received.v1 for GL posting.
 *
 * GL posting handled asynchronously by chargeback-posting-adapter:
 *   Dr Chargeback Expense (fee expense account from payment type mapping)
 *   Cr Cash/Bank (deposit account from payment type mapping)
 */
export async function recordChargeback(
  ctx: RequestContext,
  input: RecordChargebackInput,
) {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx,
      ctx.tenantId,
      input.clientRequestId,
      'recordChargeback',
    );
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // 1. Validate tender exists and belongs to this tenant
    const [tender] = await (tx as any)
      .select()
      .from(tenders)
      .where(
        and(
          eq(tenders.tenantId, ctx.tenantId),
          eq(tenders.id, input.tenderId),
        ),
      );

    if (!tender) {
      throw new AppError('TENDER_NOT_FOUND', `Tender ${input.tenderId} not found`, 404);
    }

    // 2. Validate chargeback amount does not exceed tender amount
    if (input.chargebackAmountCents > tender.amount) {
      throw new AppError(
        'CHARGEBACK_EXCEEDS_TENDER',
        `Chargeback amount ${input.chargebackAmountCents} exceeds tender amount ${tender.amount}`,
        400,
      );
    }

    // 3. Create chargeback record
    const chargebackId = generateUlid();
    const now = new Date();

    await (tx as any).insert(chargebacks).values({
      id: chargebackId,
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      tenderId: input.tenderId,
      orderId: input.orderId,
      chargebackReason: input.chargebackReason,
      chargebackAmountCents: input.chargebackAmountCents,
      feeAmountCents: input.feeAmountCents ?? 0,
      status: 'received',
      providerCaseId: input.providerCaseId ?? null,
      providerRef: input.providerRef ?? null,
      customerId: input.customerId ?? null,
      businessDate: input.businessDate,
      createdAt: now,
      updatedAt: now,
      createdBy: ctx.user.id,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'recordChargeback', {
      chargebackId,
    });

    // 4. Emit event
    const event = buildEventFromContext(ctx, 'chargeback.received.v1', {
      chargebackId,
      tenderId: input.tenderId,
      orderId: input.orderId,
      tenderType: tender.tenderType,
      chargebackAmountCents: input.chargebackAmountCents,
      feeAmountCents: input.feeAmountCents ?? 0,
      locationId: ctx.locationId,
      businessDate: input.businessDate,
      customerId: input.customerId ?? null,
      chargebackReason: input.chargebackReason,
    });

    return {
      result: {
        chargebackId,
        tenderId: input.tenderId,
        orderId: input.orderId,
        chargebackAmountCents: input.chargebackAmountCents,
        feeAmountCents: input.feeAmountCents ?? 0,
        status: 'received',
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'chargeback.received', 'chargeback', result.chargebackId);
  return result;
}
