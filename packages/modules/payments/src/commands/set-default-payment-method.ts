import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { customerPaymentMethods } from '@oppsera/db';
import { withTenant } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

export const setDefaultPaymentMethodSchema = z.object({
  paymentMethodId: z.string().min(1),
  customerId: z.string().min(1),
});
export type SetDefaultPaymentMethodInput = z.input<typeof setDefaultPaymentMethodSchema>;

/**
 * Set a payment method as the default for a customer.
 * Unsets is_default on all other methods.
 */
export async function setDefaultPaymentMethod(
  ctx: RequestContext,
  input: SetDefaultPaymentMethodInput,
): Promise<void> {
  await withTenant(ctx.tenantId, async (tx) => {
    // 1. Verify the target method exists and is active
    const [method] = await tx
      .select({ id: customerPaymentMethods.id })
      .from(customerPaymentMethods)
      .where(
        and(
          eq(customerPaymentMethods.id, input.paymentMethodId),
          eq(customerPaymentMethods.tenantId, ctx.tenantId),
          eq(customerPaymentMethods.customerId, input.customerId),
          eq(customerPaymentMethods.status, 'active'),
        ),
      )
      .limit(1);

    if (!method) {
      throw new AppError('PAYMENT_METHOD_NOT_FOUND', 'Payment method not found', 404);
    }

    // 2. Unset all defaults for this customer
    await tx
      .update(customerPaymentMethods)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(
        and(
          eq(customerPaymentMethods.tenantId, ctx.tenantId),
          eq(customerPaymentMethods.customerId, input.customerId),
          eq(customerPaymentMethods.isDefault, true),
        ),
      );

    // 3. Set the target as default
    await tx
      .update(customerPaymentMethods)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(customerPaymentMethods.id, input.paymentMethodId));
  });

  await auditLog(ctx, 'payment.method.default_set', 'customer_payment_method', input.paymentMethodId);
}
