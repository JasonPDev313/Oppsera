import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { minimumSpendRules } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { ConfigureMinimumPolicyInput } from '../validation';

/**
 * Creates or updates a minimum spend policy (rule template) for a tenant.
 *
 * This creates a `minimum_spend_rules` record that can later be assigned to
 * individual members via `assignMinimumToMember`.
 */
export async function configureMinimumPolicy(
  ctx: RequestContext,
  input: ConfigureMinimumPolicyInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const id = generateUlid();
    const now = new Date();

    const [created] = await (tx as any)
      .insert(minimumSpendRules)
      .values({
        id,
        tenantId: ctx.tenantId,
        title: input.title,
        amountCents: input.amountCents,
        bucketType: input.bucketType ?? null,
        allocationMethod: input.allocationMethod ?? 'first_match',
        rolloverPolicy: input.rolloverPolicy ?? 'none',
        excludeTax: input.excludeTax ?? true,
        excludeTips: input.excludeTips ?? true,
        excludeServiceCharges: input.excludeServiceCharges ?? true,
        excludeDues: input.excludeDues ?? true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'membership.minimum_policy.configured.v1', {
      ruleId: id,
      title: input.title,
      amountCents: input.amountCents,
      bucketType: input.bucketType ?? null,
      allocationMethod: input.allocationMethod ?? 'first_match',
      rolloverPolicy: input.rolloverPolicy ?? 'none',
      excludeTax: input.excludeTax ?? true,
      excludeTips: input.excludeTips ?? true,
      excludeServiceCharges: input.excludeServiceCharges ?? true,
      excludeDues: input.excludeDues ?? true,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'membership.minimum_policy.configured', 'minimum_spend_rule', result.id);
  return result;
}
