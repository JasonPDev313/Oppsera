import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { billingAccounts, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { UpdateCreditLimitInput } from '../validation';

export async function updateCreditLimit(ctx: RequestContext, input: UpdateCreditLimitInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify account exists and belongs to tenant
    const [account] = await (tx as any).select().from(billingAccounts)
      .where(and(eq(billingAccounts.id, input.accountId), eq(billingAccounts.tenantId, ctx.tenantId)))
      .limit(1);
    if (!account) throw new NotFoundError('Billing account', input.accountId);

    const previousCreditLimitCents = account.creditLimitCents;

    const [updated] = await (tx as any).update(billingAccounts).set({
      creditLimitCents: input.newCreditLimitCents,
      updatedAt: new Date(),
    }).where(eq(billingAccounts.id, input.accountId)).returning();

    // Record detailed audit entry (before/after credit limit)
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: account.primaryCustomerId,
      activityType: 'system',
      title: `Credit limit changed: ${previousCreditLimitCents ?? 'none'} -> ${input.newCreditLimitCents}`,
      details: input.reason,
      metadata: {
        accountId: input.accountId,
        previousCreditLimitCents,
        newCreditLimitCents: input.newCreditLimitCents,
        reason: input.reason,
        approvedBy: input.approvedBy ?? null,
        currentBalanceCents: Number(account.currentBalanceCents),
      },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer.credit_limit.changed.v1', {
      accountId: input.accountId,
      customerId: account.primaryCustomerId,
      previousCreditLimitCents,
      newCreditLimitCents: input.newCreditLimitCents,
      reason: input.reason,
      approvedBy: input.approvedBy ?? null,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'customer.credit_limit_changed', 'billing_account', input.accountId);
  return result;
}
