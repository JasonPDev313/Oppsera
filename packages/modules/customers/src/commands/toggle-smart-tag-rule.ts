import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { smartTagRules } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { ToggleSmartTagRuleInput } from '../validation';

export async function toggleSmartTagRule(ctx: RequestContext, ruleId: string, input: ToggleSmartTagRuleInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await (tx as any).select().from(smartTagRules)
      .where(and(eq(smartTagRules.id, ruleId), eq(smartTagRules.tenantId, ctx.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Smart tag rule', ruleId);

    const [updated] = await (tx as any).update(smartTagRules).set({
      isActive: input.isActive,
      updatedAt: new Date(),
    }).where(eq(smartTagRules.id, ruleId)).returning();

    const event = buildEventFromContext(ctx, 'customer.smart_tag_rule.toggled.v1', {
      ruleId,
      tagId: existing.tagId,
      isActive: input.isActive,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, input.isActive ? 'customer.smart_tag_rule_activated' : 'customer.smart_tag_rule_deactivated', 'smart_tag_rule', ruleId);
  return result;
}
