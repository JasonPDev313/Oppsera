import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customers, billingAccounts, billingAccountMembers } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { CreateBillingAccountInput } from '../validation';

export async function createBillingAccount(ctx: RequestContext, input: CreateBillingAccountInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify primary customer exists
    const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.primaryCustomerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.primaryCustomerId);

    const [account] = await (tx as any).insert(billingAccounts).values({
      tenantId: ctx.tenantId,
      name: input.name,
      primaryCustomerId: input.primaryCustomerId,
      creditLimitCents: input.creditLimitCents ?? null,
      billingCycle: input.billingCycle ?? 'monthly',
      statementDayOfMonth: input.statementDayOfMonth ?? null,
      dueDays: input.dueDays ?? 30,
      lateFeePolicyId: input.lateFeePolicyId ?? null,
      taxExempt: input.taxExempt ?? false,
      taxExemptCertificateNumber: input.taxExemptCertificateNumber ?? null,
      authorizationRules: input.authorizationRules ?? null,
      billingEmail: input.billingEmail ?? null,
      billingContactName: input.billingContactName ?? null,
      billingAddress: input.billingAddress ?? null,
      glArAccountCode: input.glArAccountCode ?? '1200',
    }).returning();

    // Auto-add primary customer as billing account member
    await (tx as any).insert(billingAccountMembers).values({
      tenantId: ctx.tenantId,
      billingAccountId: account!.id,
      customerId: input.primaryCustomerId,
      role: 'primary',
      chargeAllowed: true,
    });

    const event = buildEventFromContext(ctx, 'billing_account.created.v1', {
      billingAccountId: account!.id,
      name: account!.name,
      primaryCustomerId: input.primaryCustomerId,
    });

    return { result: account!, events: [event] };
  });

  await auditLog(ctx, 'billing_account.created', 'billing_account', result.id);
  return result;
}
