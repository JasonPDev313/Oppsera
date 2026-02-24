/**
 * Save a card-on-file payment method for a guest.
 */
import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import { pmsPaymentMethods, pmsGuests } from '@oppsera/db';
import type { SavePaymentMethodInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function savePaymentMethod(ctx: RequestContext, input: SavePaymentMethodInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate guest exists
    const [guest] = await tx
      .select()
      .from(pmsGuests)
      .where(and(eq(pmsGuests.id, input.guestId), eq(pmsGuests.tenantId, ctx.tenantId)))
      .limit(1);
    if (!guest) throw new NotFoundError('Guest', input.guestId);

    // If setting as default, clear other defaults
    if (input.isDefault) {
      await tx
        .update(pmsPaymentMethods)
        .set({ isDefault: false })
        .where(
          and(
            eq(pmsPaymentMethods.tenantId, ctx.tenantId),
            eq(pmsPaymentMethods.guestId, input.guestId),
            eq(pmsPaymentMethods.isDefault, true),
          ),
        );
    }

    const id = generateUlid();
    await tx.insert(pmsPaymentMethods).values({
      id,
      tenantId: ctx.tenantId,
      guestId: input.guestId,
      gateway: input.gateway ?? 'stripe',
      gatewayCustomerId: input.gatewayCustomerId ?? null,
      gatewayPaymentMethodId: input.gatewayPaymentMethodId,
      cardLastFour: input.cardLastFour ?? null,
      cardBrand: input.cardBrand ?? null,
      cardExpMonth: input.cardExpMonth ?? null,
      cardExpYear: input.cardExpYear ?? null,
      isDefault: input.isDefault ?? false,
    });

    await pmsAuditLogEntry(tx, ctx, input.guestId, 'payment_method', id, 'created', {
      gateway: input.gateway,
      cardLastFour: input.cardLastFour,
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.PAYMENT_METHOD_SAVED, {
      paymentMethodId: id,
      guestId: input.guestId,
      cardBrand: input.cardBrand,
      cardLastFour: input.cardLastFour,
    });

    return { result: { id }, events: [event] };
  });

  await auditLog(ctx, 'pms.payment_method.saved', 'pms_payment_method', result.id);
  return result;
}
