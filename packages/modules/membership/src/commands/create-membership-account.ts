import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { membershipAccounts } from '@oppsera/db';
import { generateUlid, ConflictError } from '@oppsera/shared';
import type { CreateMembershipAccountInput } from '../validation';

export async function createMembershipAccount(
  ctx: RequestContext,
  input: CreateMembershipAccountInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate account number uniqueness per tenant
    const [existing] = await (tx as any)
      .select({ id: membershipAccounts.id })
      .from(membershipAccounts)
      .where(
        and(
          eq(membershipAccounts.tenantId, ctx.tenantId),
          eq(membershipAccounts.accountNumber, input.accountNumber),
        ),
      )
      .limit(1);

    if (existing) {
      throw new ConflictError(
        `Membership account number '${input.accountNumber}' already exists for this tenant`,
      );
    }

    const id = generateUlid();
    const now = new Date();

    const [account] = await (tx as any)
      .insert(membershipAccounts)
      .values({
        id,
        tenantId: ctx.tenantId,
        accountNumber: input.accountNumber,
        status: 'active',
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        primaryMemberId: input.primaryMemberId ?? null,
        billingEmail: input.billingEmail ?? null,
        billingAddressJson: input.billingAddressJson ?? null,
        statementDayOfMonth: input.statementDayOfMonth ?? 1,
        paymentTermsDays: input.paymentTermsDays ?? 30,
        autopayEnabled: input.autopayEnabled ?? false,
        creditLimitCents: input.creditLimitCents ?? null,
        holdCharging: false,
        billingAccountId: input.billingAccountId ?? null,
        customerId: input.customerId ?? null,
        notes: input.notes ?? null,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'membership.account.created.v1', {
      accountId: id,
      accountNumber: input.accountNumber,
      status: 'active',
      customerId: input.customerId ?? null,
      primaryMemberId: input.primaryMemberId ?? null,
    });

    return { result: account!, events: [event] };
  });

  await auditLog(ctx, 'membership.account.created', 'membership_account', result.id);
  return result;
}
