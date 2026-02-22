import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { billingAccounts, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { PlaceFinancialHoldInput } from '../validation';

export async function placeFinancialHold(ctx: RequestContext, input: PlaceFinancialHoldInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify account exists and belongs to tenant
    const [account] = await (tx as any).select().from(billingAccounts)
      .where(and(eq(billingAccounts.id, input.accountId), eq(billingAccounts.tenantId, ctx.tenantId)))
      .limit(1);
    if (!account) throw new NotFoundError('Billing account', input.accountId);

    // Validate current status — cannot place hold on already held/frozen or closed account
    if (account.status === input.holdType) {
      throw new ValidationError(`Account is already in ${input.holdType} status`);
    }
    if (account.status === 'closed') {
      throw new ValidationError('Cannot place hold on a closed account');
    }

    const previousStatus = account.status;

    const [updated] = await (tx as any).update(billingAccounts).set({
      status: input.holdType,
      updatedAt: new Date(),
    }).where(eq(billingAccounts.id, input.accountId)).returning();

    // Record audit entry with before/after
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: account.primaryCustomerId,
      activityType: 'system',
      title: `Financial hold placed: ${input.holdType}`,
      details: input.reason,
      metadata: {
        accountId: input.accountId,
        previousStatus,
        newStatus: input.holdType,
        holdType: input.holdType,
        reason: input.reason,
      },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer.financial_hold.placed.v1', {
      accountId: input.accountId,
      customerId: account.primaryCustomerId,
      holdType: input.holdType,
      previousStatus,
      reason: input.reason,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'customer.financial_hold_placed', 'billing_account', input.accountId);
  return result;
}
