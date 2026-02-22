import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { membershipAccounts, minimumSpendRules, minimumPeriodRollups } from '@oppsera/db';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import type { AssignMinimumToMemberInput } from '../validation';

/**
 * Assigns a minimum spend rule to a specific membership account.
 *
 * Creates a `minimum_period_rollups` record with status='open' for the given period.
 * The rollup tracks progress toward satisfying the minimum for that customer/rule/period.
 */
export async function assignMinimumToMember(
  ctx: RequestContext,
  input: AssignMinimumToMemberInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate membership account exists for this tenant
    const [account] = await (tx as any)
      .select({
        id: membershipAccounts.id,
        customerId: membershipAccounts.customerId,
      })
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

    // Validate the rule exists for this tenant
    const [rule] = await (tx as any)
      .select({
        id: minimumSpendRules.id,
        amountCents: minimumSpendRules.amountCents,
        title: minimumSpendRules.title,
      })
      .from(minimumSpendRules)
      .where(
        and(
          eq(minimumSpendRules.tenantId, ctx.tenantId),
          eq(minimumSpendRules.id, input.ruleId),
        ),
      )
      .limit(1);

    if (!rule) {
      throw new NotFoundError('MinimumSpendRule', input.ruleId);
    }

    const id = generateUlid();
    const now = new Date();
    const customerId = input.customerId ?? account.customerId ?? account.id;

    // Derive period dates from schema fields (startDate/periodEnd default to today/month-end)
    const periodStart = input.startDate ?? new Date().toISOString().slice(0, 10);
    const periodEnd = input.periodEnd ?? (() => {
      const d = new Date(periodStart);
      d.setMonth(d.getMonth() + 1);
      d.setDate(0); // last day of current month
      return d.toISOString().slice(0, 10);
    })();

    const [rollup] = await (tx as any)
      .insert(minimumPeriodRollups)
      .values({
        id,
        tenantId: ctx.tenantId,
        customerId,
        minimumSpendRuleId: input.ruleId,
        periodStart,
        periodEnd,
        requiredCents: rule.amountCents,
        satisfiedCents: 0,
        shortfallCents: rule.amountCents,
        rolloverInCents: 0,
        rolloverOutCents: 0,
        status: 'open',
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'membership.minimum.assigned.v1', {
      rollupId: id,
      membershipAccountId: input.membershipAccountId,
      customerId,
      ruleId: input.ruleId,
      ruleName: rule.title,
      requiredCents: rule.amountCents,
      periodStart,
      periodEnd,
    });

    return { result: rollup!, events: [event] };
  });

  await auditLog(ctx, 'membership.minimum.assigned', 'minimum_period_rollup', result.id);
  return result;
}
