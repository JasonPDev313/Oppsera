import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { discountRules } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { ToggleDiscountRuleInput } from '../validation';

/**
 * Activates or deactivates a discount rule.
 */
export async function toggleDiscountRule(ctx: RequestContext, input: ToggleDiscountRuleInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch existing rule
    const [existing] = await (tx as any).select().from(discountRules)
      .where(and(
        eq(discountRules.id, input.ruleId),
        eq(discountRules.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!existing) throw new NotFoundError('Discount rule', input.ruleId);

    // Update isActive
    const [updated] = await (tx as any).update(discountRules).set({
      isActive: input.isActive,
      updatedAt: new Date(),
    }).where(eq(discountRules.id, input.ruleId)).returning();

    const event = buildEventFromContext(ctx, 'customer.discount_rule.toggled.v1', {
      ruleId: input.ruleId,
      name: existing.name,
      isActive: input.isActive,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(
    ctx,
    input.isActive ? 'customer.discount_rule.activated' : 'customer.discount_rule.deactivated',
    'discount_rule',
    input.ruleId,
  );
  return result;
}
