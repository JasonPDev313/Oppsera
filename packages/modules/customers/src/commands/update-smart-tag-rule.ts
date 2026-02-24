import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { smartTagRules } from '@oppsera/db';
import { eq, and, sql } from 'drizzle-orm';
import type { UpdateSmartTagRuleInput } from '../validation';

export async function updateSmartTagRule(ctx: RequestContext, ruleId: string, input: UpdateSmartTagRuleInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await (tx as any).select().from(smartTagRules)
      .where(and(eq(smartTagRules.id, ruleId), eq(smartTagRules.tenantId, ctx.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Smart tag rule', ruleId);

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
      version: sql`${smartTagRules.version} + 1`,
    };
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.evaluationMode !== undefined) updates.evaluationMode = input.evaluationMode;
    if (input.scheduleCron !== undefined) updates.scheduleCron = input.scheduleCron;
    if (input.conditions !== undefined) updates.conditions = input.conditions;
    if (input.autoRemove !== undefined) updates.autoRemove = input.autoRemove;
    if (input.cooldownHours !== undefined) updates.cooldownHours = input.cooldownHours;
    if (input.priority !== undefined) updates.priority = input.priority;

    const [updated] = await (tx as any).update(smartTagRules).set(updates)
      .where(eq(smartTagRules.id, ruleId)).returning();

    const event = buildEventFromContext(ctx, 'customer.smart_tag_rule.updated.v1', {
      ruleId,
      tagId: existing.tagId,
      changes: Object.keys(updates).filter(k => k !== 'updatedAt' && k !== 'version'),
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'customer.smart_tag_rule_updated', 'smart_tag_rule', ruleId);
  return result;
}
