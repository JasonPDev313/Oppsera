import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { paymentTerms } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import { AP_EVENTS } from '../events/types';
import type { UpdatePaymentTermsInput } from '../validation';

export async function updatePaymentTerms(
  ctx: RequestContext,
  paymentTermsId: string,
  input: UpdatePaymentTermsInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Load existing
    const [existing] = await tx
      .select()
      .from(paymentTerms)
      .where(
        and(
          eq(paymentTerms.id, paymentTermsId),
          eq(paymentTerms.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Payment Terms', paymentTermsId);
    }

    // 2. Build update set
    const updateSet: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) updateSet.name = input.name;
    if (input.netDays !== undefined) updateSet.days = input.netDays;
    if (input.discountPercent !== undefined) updateSet.discountPercent = input.discountPercent;
    if (input.discountDays !== undefined) updateSet.discountDays = input.discountDays;
    if (input.isActive !== undefined) updateSet.isActive = input.isActive;

    // 3. Update
    const [updated] = await tx
      .update(paymentTerms)
      .set(updateSet)
      .where(eq(paymentTerms.id, paymentTermsId))
      .returning();

    const event = buildEventFromContext(ctx, AP_EVENTS.PAYMENT_TERMS_UPDATED, {
      paymentTermsId: updated!.id,
      name: updated!.name,
    });

    return {
      result: updated!,
      events: [event],
    };
  });

  await auditLog(ctx, 'ap.payment_terms.updated', 'payment_terms', result.id);
  return result;
}
