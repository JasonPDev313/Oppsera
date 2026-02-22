import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { discountRules } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { UpdateDiscountRuleInput } from '../validation';

/**
 * Updates an existing discount rule.
 *
 * Validates rule exists and belongs to the tenant.
 * Allows updating name, description, priority, dates, and ruleJson.
 */
export async function updateDiscountRule(ctx: RequestContext, input: UpdateDiscountRuleInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch existing rule
    const [existing] = await (tx as any).select().from(discountRules)
      .where(and(
        eq(discountRules.id, input.ruleId),
        eq(discountRules.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!existing) throw new NotFoundError('Discount rule', input.ruleId);

    // Build update set — only include provided fields
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.effectiveDate !== undefined) updates.effectiveDate = input.effectiveDate;
    if (input.expirationDate !== undefined) updates.expirationDate = input.expirationDate;
    if (input.ruleJson !== undefined) updates.ruleJson = input.ruleJson;

    const [updated] = await (tx as any).update(discountRules).set(updates)
      .where(eq(discountRules.id, input.ruleId)).returning();

    const event = buildEventFromContext(ctx, 'customer.discount_rule.updated.v1', {
      ruleId: input.ruleId,
      name: updated!.name,
      changes: Object.keys(updates).filter(k => k !== 'updatedAt'),
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'customer.discount_rule.updated', 'discount_rule', input.ruleId);
  return result;
}
