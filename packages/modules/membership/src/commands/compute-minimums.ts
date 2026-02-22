import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { minimumSpendRules, minimumPeriodRollups } from '@oppsera/db';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import type { ComputeMinimumsInput } from '../validation';
import { computeMinimumProgress } from '../helpers/minimum-engine';

/**
 * Computes minimum spend progress for a given customer and period.
 *
 * If no rollup exists for the customer + rule + period, creates one with
 * requiredCents from the rule. Updates satisfiedCents from the provided
 * spentCents (caller is responsible for applying exclusions before calling).
 */
export async function computeMinimums(
  ctx: RequestContext,
  input: ComputeMinimumsInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate the rule exists for this tenant
    const [rule] = await (tx as any)
      .select({
        id: minimumSpendRules.id,
        amountCents: minimumSpendRules.amountCents,
        excludeTax: minimumSpendRules.excludeTax,
        excludeTips: minimumSpendRules.excludeTips,
        excludeServiceCharges: minimumSpendRules.excludeServiceCharges,
        excludeDues: minimumSpendRules.excludeDues,
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

    // Look for existing rollup for this customer + rule + period
    const existingRollups = await (tx as any)
      .select({
        id: minimumPeriodRollups.id,
        requiredCents: minimumPeriodRollups.requiredCents,
        satisfiedCents: minimumPeriodRollups.satisfiedCents,
        rolloverInCents: minimumPeriodRollups.rolloverInCents,
        rolloverOutCents: minimumPeriodRollups.rolloverOutCents,
        shortfallCents: minimumPeriodRollups.shortfallCents,
        status: minimumPeriodRollups.status,
      })
      .from(minimumPeriodRollups)
      .where(
        and(
          eq(minimumPeriodRollups.tenantId, ctx.tenantId),
          eq(minimumPeriodRollups.customerId, input.customerId),
          eq(minimumPeriodRollups.minimumSpendRuleId, input.ruleId),
          eq(minimumPeriodRollups.periodStart, input.periodStart),
        ),
      )
      .limit(1);

    const now = new Date();
    const spentCents = input.spentCents ?? 0;
    let rollupId: string;
    let rolloverInCents: number;
    let requiredCents: number;

    if (existingRollups.length > 0) {
      // Update existing rollup
      const existing = existingRollups[0]!;
      rollupId = existing.id;
      rolloverInCents = existing.rolloverInCents;
      requiredCents = existing.requiredCents;

      const progress = computeMinimumProgress({
        requiredCents,
        spentCents,
        rolloverInCents,
        excludeTax: rule.excludeTax,
        excludeTips: rule.excludeTips,
        excludeServiceCharges: rule.excludeServiceCharges,
        excludeDues: rule.excludeDues,
      });

      await (tx as any)
        .update(minimumPeriodRollups)
        .set({
          satisfiedCents: progress.satisfiedCents,
          shortfallCents: progress.shortfallCents,
          updatedAt: now,
        })
        .where(
          and(
            eq(minimumPeriodRollups.tenantId, ctx.tenantId),
            eq(minimumPeriodRollups.id, rollupId),
          ),
        );
    } else {
      // Create new rollup
      rollupId = generateUlid();
      rolloverInCents = 0;
      requiredCents = rule.amountCents;

      const progress = computeMinimumProgress({
        requiredCents,
        spentCents,
        rolloverInCents,
        excludeTax: rule.excludeTax,
        excludeTips: rule.excludeTips,
        excludeServiceCharges: rule.excludeServiceCharges,
        excludeDues: rule.excludeDues,
      });

      await (tx as any)
        .insert(minimumPeriodRollups)
        .values({
          id: rollupId,
          tenantId: ctx.tenantId,
          customerId: input.customerId,
          minimumSpendRuleId: input.ruleId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          requiredCents,
          satisfiedCents: progress.satisfiedCents,
          shortfallCents: progress.shortfallCents,
          rolloverInCents,
          rolloverOutCents: 0,
          status: 'open',
          createdAt: now,
          updatedAt: now,
        });
    }

    // Recompute final progress for event payload
    const finalProgress = computeMinimumProgress({
      requiredCents,
      spentCents,
      rolloverInCents,
      excludeTax: rule.excludeTax,
      excludeTips: rule.excludeTips,
      excludeServiceCharges: rule.excludeServiceCharges,
      excludeDues: rule.excludeDues,
    });

    const event = buildEventFromContext(ctx, 'membership.minimums.computed.v1', {
      rollupId,
      customerId: input.customerId,
      ruleId: input.ruleId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      requiredCents,
      satisfiedCents: finalProgress.satisfiedCents,
      shortfallCents: finalProgress.shortfallCents,
      progressPercent: finalProgress.progressPercent,
      isMetMinimum: finalProgress.isMetMinimum,
    });

    return {
      result: {
        rollupId,
        customerId: input.customerId,
        ruleId: input.ruleId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        ...finalProgress,
        requiredCents,
        rolloverInCents,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'membership.minimums.computed', 'minimum_period_rollup', result.rollupId);
  return result;
}
