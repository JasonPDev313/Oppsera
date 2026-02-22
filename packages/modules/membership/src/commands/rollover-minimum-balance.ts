import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { minimumPeriodRollups, minimumSpendRules } from '@oppsera/db';
import { generateUlid, NotFoundError, AppError } from '@oppsera/shared';
import type { RolloverMinimumBalanceInput } from '../validation';

/**
 * Rolls over unused minimum balance from one period to the next.
 *
 * Fetches the existing rollup, computes the remaining balance that can
 * be rolled over, creates a new period rollup with rolloverInCents from
 * the prior period, and updates the prior period's rolloverOutCents.
 */
export async function rolloverMinimumBalance(
  ctx: RequestContext,
  input: RolloverMinimumBalanceInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch the existing rollup
    const [existing] = await (tx as any)
      .select({
        id: minimumPeriodRollups.id,
        customerId: minimumPeriodRollups.customerId,
        minimumSpendRuleId: minimumPeriodRollups.minimumSpendRuleId,
        requiredCents: minimumPeriodRollups.requiredCents,
        satisfiedCents: minimumPeriodRollups.satisfiedCents,
        rolloverInCents: minimumPeriodRollups.rolloverInCents,
        rolloverOutCents: minimumPeriodRollups.rolloverOutCents,
        shortfallCents: minimumPeriodRollups.shortfallCents,
        status: minimumPeriodRollups.status,
        periodStart: minimumPeriodRollups.periodStart,
        periodEnd: minimumPeriodRollups.periodEnd,
      })
      .from(minimumPeriodRollups)
      .where(
        and(
          eq(minimumPeriodRollups.tenantId, ctx.tenantId),
          eq(minimumPeriodRollups.id, input.rollupId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('MinimumPeriodRollup', input.rollupId);
    }

    // Validate the rule exists and has rollover enabled
    const [rule] = await (tx as any)
      .select({
        id: minimumSpendRules.id,
        rolloverPolicy: minimumSpendRules.rolloverPolicy,
        amountCents: minimumSpendRules.amountCents,
      })
      .from(minimumSpendRules)
      .where(
        and(
          eq(minimumSpendRules.tenantId, ctx.tenantId),
          eq(minimumSpendRules.id, existing.minimumSpendRuleId),
        ),
      )
      .limit(1);

    if (!rule) {
      throw new NotFoundError('MinimumSpendRule', existing.minimumSpendRuleId);
    }

    if (rule.rolloverPolicy === 'none') {
      throw new AppError('VALIDATION_ERROR', 'Rollover is not enabled for this minimum spend rule', 422);
    }

    // Compute rollover amount:
    // If the member spent more than required, the excess can roll over.
    // rolloverAmount = max(0, satisfiedCents + rolloverInCents - requiredCents)
    const totalCredit = existing.satisfiedCents + existing.rolloverInCents;
    const rolloverAmount = Math.max(0, totalCredit - existing.requiredCents);

    const now = new Date();

    // Update prior period's rolloverOutCents and close it
    await (tx as any)
      .update(minimumPeriodRollups)
      .set({
        rolloverOutCents: rolloverAmount,
        status: 'closed',
        updatedAt: now,
      })
      .where(
        and(
          eq(minimumPeriodRollups.tenantId, ctx.tenantId),
          eq(minimumPeriodRollups.id, input.rollupId),
        ),
      );

    // Create new period rollup with rolloverInCents from prior period
    const newRollupId = generateUlid();
    const requiredCents = rule.amountCents;
    // Initial shortfall accounts for the rollover credit
    const shortfallCents = Math.max(0, requiredCents - rolloverAmount);

    const [newRollup] = await (tx as any)
      .insert(minimumPeriodRollups)
      .values({
        id: newRollupId,
        tenantId: ctx.tenantId,
        customerId: existing.customerId,
        minimumSpendRuleId: existing.minimumSpendRuleId,
        periodStart: input.newPeriodStart,
        periodEnd: input.newPeriodEnd,
        requiredCents,
        satisfiedCents: 0,
        shortfallCents,
        rolloverInCents: rolloverAmount,
        rolloverOutCents: 0,
        status: 'open',
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'membership.minimum.rolled_over.v1', {
      priorRollupId: input.rollupId,
      newRollupId,
      customerId: existing.customerId,
      ruleId: existing.minimumSpendRuleId,
      rolloverAmountCents: rolloverAmount,
      priorPeriodStart: existing.periodStart,
      priorPeriodEnd: existing.periodEnd,
      nextPeriodStart: input.newPeriodStart,
      nextPeriodEnd: input.newPeriodEnd,
      newRequiredCents: requiredCents,
    });

    return {
      result: {
        priorRollupId: input.rollupId,
        newRollup: newRollup!,
        rolloverAmountCents: rolloverAmount,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'membership.minimum.rolled_over', 'minimum_period_rollup', result.newRollup.id);
  return result;
}
