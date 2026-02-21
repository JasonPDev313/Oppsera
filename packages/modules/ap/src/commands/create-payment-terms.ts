import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { paymentTerms } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import { AP_EVENTS } from '../events/types';
import type { CreatePaymentTermsInput } from '../validation';

export async function createPaymentTerms(
  ctx: RequestContext,
  input: CreatePaymentTermsInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [created] = await tx
      .insert(paymentTerms)
      .values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        name: input.name,
        days: input.netDays ?? 0,
        discountPercent: input.discountPercent ?? '0',
        discountDays: input.discountDays ?? 0,
        isActive: input.isActive ?? true,
      })
      .returning();

    const event = buildEventFromContext(ctx, AP_EVENTS.PAYMENT_TERMS_CREATED, {
      paymentTermsId: created!.id,
      name: input.name,
      days: input.netDays ?? 0,
    });

    return {
      result: created!,
      events: [event],
    };
  });

  await auditLog(ctx, 'ap.payment_terms.created', 'payment_terms', result.id);
  return result;
}
