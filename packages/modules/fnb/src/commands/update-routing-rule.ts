import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbKitchenRoutingRules } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { UpdateRoutingRuleInput } from '../validation';
import { RoutingRuleNotFoundError } from '../errors';

export async function updateRoutingRule(
  ctx: RequestContext,
  ruleId: string,
  input: UpdateRoutingRuleInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'updateRoutingRule',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    const [rule] = await (tx as any)
      .select()
      .from(fnbKitchenRoutingRules)
      .where(and(
        eq(fnbKitchenRoutingRules.id, ruleId),
        eq(fnbKitchenRoutingRules.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!rule) throw new RoutingRuleNotFoundError(ruleId);

    const setFields: Record<string, unknown> = { updatedAt: new Date() };
    if (input.stationId !== undefined) setFields.stationId = input.stationId;
    if (input.priority !== undefined) setFields.priority = input.priority;
    if (input.isActive !== undefined) setFields.isActive = input.isActive;

    const [updated] = await (tx as any)
      .update(fnbKitchenRoutingRules)
      .set(setFields)
      .where(eq(fnbKitchenRoutingRules.id, ruleId))
      .returning();

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'updateRoutingRule', updated);

    return { result: updated!, events: [] };
  });

  await auditLog(ctx, 'fnb.routing_rule.updated', 'fnb_kitchen_routing_rules', ruleId);
  return result;
}
