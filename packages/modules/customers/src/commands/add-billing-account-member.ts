import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ConflictError, ValidationError } from '@oppsera/shared';
import { customers, billingAccounts, billingAccountMembers } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { AddBillingAccountMemberInput } from '../validation';

export async function addBillingAccountMember(ctx: RequestContext, input: AddBillingAccountMemberInput) {
  const result = await withTenant(ctx.tenantId, async (tx) => {
    // Verify billing account
    const [account] = await (tx as any).select({ id: billingAccounts.id, status: billingAccounts.status }).from(billingAccounts)
      .where(and(eq(billingAccounts.id, input.billingAccountId), eq(billingAccounts.tenantId, ctx.tenantId)))
      .limit(1);
    if (!account) throw new NotFoundError('Billing account', input.billingAccountId);
    if (account.status !== 'active') throw new ValidationError('Billing account is not active');

    // Verify customer
    const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    // Check for duplicate
    const [existing] = await (tx as any).select({ id: billingAccountMembers.id }).from(billingAccountMembers)
      .where(and(
        eq(billingAccountMembers.tenantId, ctx.tenantId),
        eq(billingAccountMembers.billingAccountId, input.billingAccountId),
        eq(billingAccountMembers.customerId, input.customerId),
      ))
      .limit(1);
    if (existing) throw new ConflictError('Customer is already a member of this billing account');

    const [member] = await (tx as any).insert(billingAccountMembers).values({
      tenantId: ctx.tenantId,
      billingAccountId: input.billingAccountId,
      customerId: input.customerId,
      role: input.role,
      chargeAllowed: input.chargeAllowed ?? true,
      spendingLimitCents: input.spendingLimitCents ?? null,
    }).returning();

    return member!;
  });

  await auditLog(ctx, 'billing_account.member_added', 'billing_account', input.billingAccountId);
  return result;
}
