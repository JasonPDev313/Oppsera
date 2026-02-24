/**
 * Remove a saved payment method.
 */
import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsPaymentMethods } from '@oppsera/db';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function removePaymentMethod(ctx: RequestContext, paymentMethodId: string) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(pmsPaymentMethods)
      .where(
        and(
          eq(pmsPaymentMethods.id, paymentMethodId),
          eq(pmsPaymentMethods.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);
    if (!existing) throw new NotFoundError('PaymentMethod', paymentMethodId);

    await tx
      .delete(pmsPaymentMethods)
      .where(
        and(
          eq(pmsPaymentMethods.id, paymentMethodId),
          eq(pmsPaymentMethods.tenantId, ctx.tenantId),
        ),
      );

    await pmsAuditLogEntry(tx, ctx, existing.guestId, 'payment_method', paymentMethodId, 'removed', {
      cardLastFour: existing.cardLastFour,
    });

    return { result: { id: paymentMethodId }, events: [] };
  });

  await auditLog(ctx, 'pms.payment_method.removed', 'pms_payment_method', paymentMethodId);
  return result;
}
