import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { billingAccounts, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { LiftFinancialHoldInput } from '../validation';

export async function liftFinancialHold(ctx: RequestContext, input: LiftFinancialHoldInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify account exists and belongs to tenant
    const [account] = await (tx as any).select().from(billingAccounts)
      .where(and(eq(billingAccounts.id, input.accountId), eq(billingAccounts.tenantId, ctx.tenantId)))
      .limit(1);
    if (!account) throw new NotFoundError('Billing account', input.accountId);

    // Validate current status is hold or frozen
    if (account.status !== 'hold' && account.status !== 'frozen') {
      throw new ValidationError(`Account is not on hold or frozen (current status: ${account.status})`);
    }

    const previousStatus = account.status;

    const [updated] = await (tx as any).update(billingAccounts).set({
      status: 'active',
      updatedAt: new Date(),
    }).where(eq(billingAccounts.id, input.accountId)).returning();

    // Record audit entry
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: account.primaryCustomerId,
      activityType: 'system',
      title: `Financial hold lifted (was: ${previousStatus})`,
      details: input.reason,
      metadata: {
        accountId: input.accountId,
        previousStatus,
        newStatus: 'active',
        reason: input.reason,
      },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer.financial_hold.lifted.v1', {
      accountId: input.accountId,
      customerId: account.primaryCustomerId,
      previousStatus,
      reason: input.reason,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'customer.financial_hold_lifted', 'billing_account', input.accountId);
  return result;
}
