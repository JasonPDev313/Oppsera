import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { membershipAccounts } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import type { UpdateMembershipAccountInput } from '../validation';

export async function updateMembershipAccount(
  ctx: RequestContext,
  input: UpdateMembershipAccountInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch existing account
    const [existing] = await (tx as any)
      .select()
      .from(membershipAccounts)
      .where(
        and(
          eq(membershipAccounts.tenantId, ctx.tenantId),
          eq(membershipAccounts.id, input.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('MembershipAccount', input.accountId);
    }

    const updateValues: Record<string, unknown> = { updatedAt: new Date() };

    // Only set fields that were explicitly provided
    if (input.status !== undefined) updateValues.status = input.status;
    if (input.startDate !== undefined) updateValues.startDate = input.startDate;
    if (input.endDate !== undefined) updateValues.endDate = input.endDate;
    if (input.primaryMemberId !== undefined) updateValues.primaryMemberId = input.primaryMemberId;
    if (input.billingEmail !== undefined) updateValues.billingEmail = input.billingEmail;
    if (input.billingAddressJson !== undefined) updateValues.billingAddressJson = input.billingAddressJson;
    if (input.statementDayOfMonth !== undefined) updateValues.statementDayOfMonth = input.statementDayOfMonth;
    if (input.paymentTermsDays !== undefined) updateValues.paymentTermsDays = input.paymentTermsDays;
    if (input.autopayEnabled !== undefined) updateValues.autopayEnabled = input.autopayEnabled;
    if (input.creditLimitCents !== undefined) updateValues.creditLimitCents = input.creditLimitCents;
    if (input.holdCharging !== undefined) updateValues.holdCharging = input.holdCharging;
    if (input.billingAccountId !== undefined) updateValues.billingAccountId = input.billingAccountId;
    if (input.customerId !== undefined) updateValues.customerId = input.customerId;
    if (input.notes !== undefined) updateValues.notes = input.notes;
    if (input.metadata !== undefined) updateValues.metadata = input.metadata;

    const [updated] = await (tx as any)
      .update(membershipAccounts)
      .set(updateValues)
      .where(
        and(
          eq(membershipAccounts.tenantId, ctx.tenantId),
          eq(membershipAccounts.id, input.accountId),
        ),
      )
      .returning();

    const event = buildEventFromContext(ctx, 'membership.account.updated.v1', {
      accountId: input.accountId,
      updatedFields: Object.keys(updateValues).filter((k) => k !== 'updatedAt'),
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'membership.account.updated', 'membership_account', result.id);
  return result;
}
