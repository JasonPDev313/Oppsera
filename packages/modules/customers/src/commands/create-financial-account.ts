import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customers, billingAccounts, billingAccountMembers, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { CreateFinancialAccountInput } from '../validation';

export async function createFinancialAccount(ctx: RequestContext, input: CreateFinancialAccountInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify customer exists
    const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    const [account] = await (tx as any).insert(billingAccounts).values({
      tenantId: ctx.tenantId,
      name: input.name,
      primaryCustomerId: input.customerId,
      creditLimitCents: input.creditLimitCents ?? null,
      billingCycle: input.billingCycle ?? 'monthly',
      dueDays: input.dueDays ?? 30,
      billingEmail: input.billingEmail ?? null,
      billingContactName: input.billingContactName ?? null,
      billingAddress: input.billingAddress ?? null,
      metadata: {
        accountType: input.accountType ?? 'house',
        currency: input.currency ?? 'USD',
      },
    }).returning();

    // Auto-add primary customer as billing account member
    await (tx as any).insert(billingAccountMembers).values({
      tenantId: ctx.tenantId,
      billingAccountId: account!.id,
      customerId: input.customerId,
      role: 'primary',
      chargeAllowed: true,
    });

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      activityType: 'system',
      title: `Financial account created: ${input.name}`,
      metadata: {
        accountId: account!.id,
        accountType: input.accountType ?? 'house',
        creditLimitCents: input.creditLimitCents ?? null,
      },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer.financial_account.created.v1', {
      accountId: account!.id,
      customerId: input.customerId,
      name: input.name,
      accountType: input.accountType ?? 'house',
      creditLimitCents: input.creditLimitCents ?? null,
      currency: input.currency ?? 'USD',
    });

    return { result: account!, events: [event] };
  });

  await auditLog(ctx, 'customer.financial_account_created', 'billing_account', result.id);
  return result;
}
