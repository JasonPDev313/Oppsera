import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { billingAccounts, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { ConfigureAutopayInput } from '../validation';

export async function configureAutopay(ctx: RequestContext, input: ConfigureAutopayInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify account exists and belongs to tenant
    const [account] = await (tx as any).select().from(billingAccounts)
      .where(and(eq(billingAccounts.id, input.accountId), eq(billingAccounts.tenantId, ctx.tenantId)))
      .limit(1);
    if (!account) throw new NotFoundError('Billing account', input.accountId);

    // Validate fixed_amount strategy requires fixedAmountCents
    if (input.strategy === 'fixed_amount' && (!input.fixedAmountCents || input.fixedAmountCents <= 0)) {
      throw new ValidationError('Fixed amount strategy requires a positive fixedAmountCents');
    }

    const isDisabling = input.strategy === null;
    const existingMeta = (account.metadata as Record<string, unknown>) ?? {};

    const updates: Record<string, unknown> = {
      autoPayEnabled: !isDisabling,
      metadata: {
        ...existingMeta,
        autopayStrategy: input.strategy,
        autopayFixedAmountCents: input.strategy === 'fixed_amount' ? input.fixedAmountCents : null,
        autopayPaymentMethodId: input.paymentMethodId ?? existingMeta.autopayPaymentMethodId ?? null,
      },
      updatedAt: new Date(),
    };

    const [updated] = await (tx as any).update(billingAccounts).set(updates)
      .where(eq(billingAccounts.id, input.accountId)).returning();

    // Record audit entry
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: account.primaryCustomerId,
      activityType: 'system',
      title: isDisabling
        ? 'Autopay disabled'
        : `Autopay configured: ${input.strategy}`,
      metadata: {
        accountId: input.accountId,
        previousAutoPayEnabled: account.autoPayEnabled,
        newStrategy: input.strategy,
        fixedAmountCents: input.fixedAmountCents ?? null,
        paymentMethodId: input.paymentMethodId ?? null,
      },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer.autopay.configured.v1', {
      accountId: input.accountId,
      customerId: account.primaryCustomerId,
      strategy: input.strategy,
      fixedAmountCents: input.strategy === 'fixed_amount' ? input.fixedAmountCents : null,
      paymentMethodId: input.paymentMethodId ?? null,
      enabled: !isDisabling,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'customer.autopay_configured', 'billing_account', input.accountId);
  return result;
}
