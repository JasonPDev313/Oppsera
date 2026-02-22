import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { membershipAccounts, lateFeeAssessments } from '@oppsera/db';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import type { ApplyLateFeeInput } from '../validation';

export async function applyLateFee(
  ctx: RequestContext,
  input: ApplyLateFeeInput,
) {
  const today = new Date().toISOString().split('T')[0]!;
  const assessmentDate = input.assessmentDate ?? today;

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate membership account exists and belongs to tenant
    const [account] = await (tx as any)
      .select({ id: membershipAccounts.id, status: membershipAccounts.status })
      .from(membershipAccounts)
      .where(
        and(
          eq(membershipAccounts.tenantId, ctx.tenantId),
          eq(membershipAccounts.id, input.membershipAccountId),
        ),
      )
      .limit(1);

    if (!account) {
      throw new NotFoundError('MembershipAccount', input.membershipAccountId);
    }

    const id = generateUlid();
    const now = new Date();

    const [assessment] = await (tx as any)
      .insert(lateFeeAssessments)
      .values({
        id,
        tenantId: ctx.tenantId,
        membershipAccountId: input.membershipAccountId,
        assessmentDate,
        overdueAmountCents: input.overdueAmountCents,
        feeAmountCents: input.feeAmountCents,
        arTransactionId: null,
        waived: false,
        waivedBy: null,
        waivedReason: null,
        createdAt: now,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'membership.late_fee.assessed.v1', {
      assessmentId: id,
      membershipAccountId: input.membershipAccountId,
      assessmentDate,
      overdueAmountCents: input.overdueAmountCents,
      feeAmountCents: input.feeAmountCents,
    });

    return { result: assessment!, events: [event] };
  });

  await auditLog(ctx, 'membership.late_fee.assessed', 'late_fee_assessment', result.id);
  return result;
}
