import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { billingAccounts, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { UpdateFinancialAccountInput } from '../validation';

export async function updateFinancialAccount(ctx: RequestContext, input: UpdateFinancialAccountInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify account exists and belongs to tenant
    const [existing] = await (tx as any).select().from(billingAccounts)
      .where(and(eq(billingAccounts.id, input.accountId), eq(billingAccounts.tenantId, ctx.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Billing account', input.accountId);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.status !== undefined) updates.status = input.status;
    if (input.creditLimitCents !== undefined) updates.creditLimitCents = input.creditLimitCents;
    if (input.billingCycle !== undefined) updates.billingCycle = input.billingCycle;
    if (input.dueDays !== undefined) updates.dueDays = input.dueDays;
    if (input.billingEmail !== undefined) updates.billingEmail = input.billingEmail;

    // Handle autopay fields
    if (input.autopayStrategy !== undefined) {
      updates.autoPayEnabled = input.autopayStrategy !== null;
      const existingMeta = (existing.metadata as Record<string, unknown>) ?? {};
      updates.metadata = {
        ...existingMeta,
        autopayStrategy: input.autopayStrategy,
        autopayFixedAmountCents: input.autopayFixedAmountCents ?? existingMeta.autopayFixedAmountCents ?? null,
        autopayPaymentMethodId: input.autopayPaymentMethodId ?? existingMeta.autopayPaymentMethodId ?? null,
      };
    }
    if (input.autopayFixedAmountCents !== undefined && input.autopayStrategy === undefined) {
      const existingMeta = (existing.metadata as Record<string, unknown>) ?? {};
      updates.metadata = { ...existingMeta, autopayFixedAmountCents: input.autopayFixedAmountCents };
    }
    if (input.autopayPaymentMethodId !== undefined && input.autopayStrategy === undefined) {
      const existingMeta = (existing.metadata as Record<string, unknown>) ?? {};
      updates.metadata = { ...existingMeta, autopayPaymentMethodId: input.autopayPaymentMethodId };
    }

    const [updated] = await (tx as any).update(billingAccounts).set(updates)
      .where(eq(billingAccounts.id, input.accountId)).returning();

    // Record audit entry for credit limit changes
    if (input.creditLimitCents !== undefined && input.creditLimitCents !== existing.creditLimitCents) {
      await (tx as any).insert(customerActivityLog).values({
        tenantId: ctx.tenantId,
        customerId: existing.primaryCustomerId,
        activityType: 'system',
        title: `Credit limit updated: ${existing.creditLimitCents ?? 'none'} -> ${input.creditLimitCents ?? 'none'}`,
        metadata: {
          accountId: input.accountId,
          previousCreditLimitCents: existing.creditLimitCents,
          newCreditLimitCents: input.creditLimitCents,
        },
        createdBy: ctx.user.id,
      });
    }

    const event = buildEventFromContext(ctx, 'customer.financial_account.updated.v1', {
      accountId: input.accountId,
      customerId: existing.primaryCustomerId,
      changes: Object.keys(updates).filter(k => k !== 'updatedAt'),
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'customer.financial_account_updated', 'billing_account', input.accountId);
  return result;
}
