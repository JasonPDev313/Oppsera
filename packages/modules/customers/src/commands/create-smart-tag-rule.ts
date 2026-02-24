import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, AppError } from '@oppsera/shared';
import { tags, smartTagRules } from '@oppsera/db';
import { eq, and, isNull } from 'drizzle-orm';
import type { CreateSmartTagRuleInput } from '../validation';

export async function createSmartTagRule(ctx: RequestContext, input: CreateSmartTagRuleInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify tag exists and is a smart tag
    const [tag] = await (tx as any).select().from(tags)
      .where(and(eq(tags.id, input.tagId), eq(tags.tenantId, ctx.tenantId), isNull(tags.archivedAt)))
      .limit(1);
    if (!tag) throw new NotFoundError('Tag', input.tagId);
    if (tag.tagType !== 'smart') throw new AppError('INVALID_TAG_TYPE', 'Smart tag rules can only be created for smart tags', 400);

    // Check no rule already exists for this tag
    const [existing] = await (tx as any).select({ id: smartTagRules.id }).from(smartTagRules)
      .where(and(eq(smartTagRules.tenantId, ctx.tenantId), eq(smartTagRules.tagId, input.tagId)))
      .limit(1);
    if (existing) throw new AppError('RULE_EXISTS', 'A rule already exists for this tag', 409);

    const [created] = await (tx as any).insert(smartTagRules).values({
      tenantId: ctx.tenantId,
      tagId: input.tagId,
      name: input.name,
      description: input.description ?? null,
      evaluationMode: input.evaluationMode ?? 'scheduled',
      scheduleCron: input.scheduleCron ?? null,
      conditions: input.conditions,
      autoRemove: input.autoRemove ?? true,
      cooldownHours: input.cooldownHours ?? null,
      priority: input.priority ?? 100,
      createdBy: ctx.user.id,
    }).returning();

    const event = buildEventFromContext(ctx, 'customer.smart_tag_rule.created.v1', {
      ruleId: created!.id,
      tagId: input.tagId,
      name: input.name,
      evaluationMode: input.evaluationMode ?? 'scheduled',
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'customer.smart_tag_rule_created', 'smart_tag_rule', result.id);
  return result;
}
