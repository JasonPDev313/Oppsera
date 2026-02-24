import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { customerPaymentMethods } from '@oppsera/db';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { PAYMENT_GATEWAY_EVENTS } from '../events/gateway-types';
import { resolveProvider } from '../helpers/resolve-provider';

export const removePaymentMethodSchema = z.object({
  paymentMethodId: z.string().min(1),
});
export type RemovePaymentMethodInput = z.input<typeof removePaymentMethodSchema>;

/**
 * Remove a stored payment method.
 * Deletes from provider and soft-deletes locally (status='deleted').
 * If was default, promotes next method to default.
 */
export async function removePaymentMethod(
  ctx: RequestContext,
  input: RemovePaymentMethodInput,
): Promise<void> {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  await publishWithOutbox(ctx, async (tx) => {
    // 1. Load the payment method
    const [method] = await tx
      .select()
      .from(customerPaymentMethods)
      .where(
        and(
          eq(customerPaymentMethods.id, input.paymentMethodId),
          eq(customerPaymentMethods.tenantId, ctx.tenantId),
          eq(customerPaymentMethods.status, 'active'),
        ),
      )
      .limit(1);

    if (!method) {
      throw new AppError('PAYMENT_METHOD_NOT_FOUND', 'Payment method not found', 404);
    }

    // 2. Delete from provider (best-effort — don't fail if provider delete fails)
    if (method.providerProfileId) {
      try {
        const { provider, merchantId } = await resolveProvider(
          ctx.tenantId,
          ctx.locationId!,
        );
        await provider.deleteProfile(
          method.providerProfileId,
          merchantId,
          method.providerAccountId ?? undefined,
        );
      } catch {
        // Log but don't fail — provider cleanup is best-effort
        console.error(
          `Failed to delete provider profile ${method.providerProfileId} — continuing with local removal`,
        );
      }
    }

    // 3. Soft-delete locally
    await tx
      .update(customerPaymentMethods)
      .set({ status: 'deleted', updatedAt: new Date() })
      .where(eq(customerPaymentMethods.id, method.id));

    // 4. If was default, promote next method
    if (method.isDefault) {
      const [nextMethod] = await tx
        .select({ id: customerPaymentMethods.id })
        .from(customerPaymentMethods)
        .where(
          and(
            eq(customerPaymentMethods.tenantId, ctx.tenantId),
            eq(customerPaymentMethods.customerId, method.customerId),
            eq(customerPaymentMethods.status, 'active'),
          ),
        )
        .orderBy(desc(customerPaymentMethods.createdAt))
        .limit(1);

      if (nextMethod) {
        await tx
          .update(customerPaymentMethods)
          .set({ isDefault: true, updatedAt: new Date() })
          .where(eq(customerPaymentMethods.id, nextMethod.id));
      }
    }

    // 5. Build event
    const event = buildEventFromContext(ctx, PAYMENT_GATEWAY_EVENTS.PROFILE_DELETED, {
      tenantId: ctx.tenantId,
      customerId: method.customerId,
      paymentMethodId: method.id,
      providerProfileId: method.providerProfileId,
    });

    return { result: undefined, events: [event] };
  });

  await auditLog(ctx, 'payment.method.removed', 'customer_payment_method', input.paymentMethodId);
}
