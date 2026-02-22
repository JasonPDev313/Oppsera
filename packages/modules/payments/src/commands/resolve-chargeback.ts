import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { chargebacks, tenders } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { ResolveChargebackInput } from '../chargeback-validation';

/**
 * Resolve a chargeback as won or lost.
 *
 * Won: reverses the received GL entries (money returned to merchant).
 * Lost: posts any fee as additional expense. The original chargeback
 *       expense stands.
 *
 * GL posting handled asynchronously by chargeback-posting-adapter.
 */
export async function resolveChargeback(
  ctx: RequestContext,
  input: ResolveChargebackInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Fetch the chargeback
    const [chargeback] = await (tx as any)
      .select()
      .from(chargebacks)
      .where(
        and(
          eq(chargebacks.tenantId, ctx.tenantId),
          eq(chargebacks.id, input.chargebackId),
        ),
      );

    if (!chargeback) {
      throw new AppError('CHARGEBACK_NOT_FOUND', `Chargeback ${input.chargebackId} not found`, 404);
    }

    // 2. Validate status — can only resolve from 'received' or 'under_review'
    if (chargeback.status !== 'received' && chargeback.status !== 'under_review') {
      throw new AppError(
        'CHARGEBACK_ALREADY_RESOLVED',
        `Chargeback ${input.chargebackId} is already ${chargeback.status}`,
        409,
      );
    }

    // 3. Fetch tender for tenderType (needed for GL adapter)
    const [tender] = await (tx as any)
      .select()
      .from(tenders)
      .where(
        and(
          eq(tenders.tenantId, ctx.tenantId),
          eq(tenders.id, chargeback.tenderId),
        ),
      );

    // 4. Update fee if provided on resolution
    const finalFeeAmountCents = input.feeAmountCents ?? chargeback.feeAmountCents;

    // 5. Update chargeback status
    const now = new Date();
    const today = now.toISOString().split('T')[0]!;

    await (tx as any)
      .update(chargebacks)
      .set({
        status: input.resolution,
        resolutionReason: input.resolutionReason,
        resolutionDate: today,
        feeAmountCents: finalFeeAmountCents,
        resolvedBy: ctx.user.id,
        updatedAt: now,
      })
      .where(eq(chargebacks.id, input.chargebackId));

    // 6. Emit event
    const event = buildEventFromContext(ctx, 'chargeback.resolved.v1', {
      chargebackId: input.chargebackId,
      tenderId: chargeback.tenderId,
      orderId: chargeback.orderId,
      tenderType: tender?.tenderType ?? 'unknown',
      resolution: input.resolution,
      chargebackAmountCents: chargeback.chargebackAmountCents,
      feeAmountCents: finalFeeAmountCents,
      locationId: chargeback.locationId,
      businessDate: chargeback.businessDate,
      customerId: chargeback.customerId ?? null,
      resolutionReason: input.resolutionReason,
      glJournalEntryId: chargeback.glJournalEntryId ?? null,
    });

    return {
      result: {
        chargebackId: input.chargebackId,
        status: input.resolution,
        resolutionReason: input.resolutionReason,
        feeAmountCents: finalFeeAmountCents,
      },
      events: [event],
    };
  });

  await auditLog(ctx, `chargeback.${input.resolution}`, 'chargeback', result.chargebackId);
  return result;
}
