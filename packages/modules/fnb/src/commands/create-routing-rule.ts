import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbKitchenRoutingRules } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { CreateRoutingRuleInput } from '../validation';

export async function createRoutingRule(
  ctx: RequestContext,
  input: CreateRoutingRuleInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'createRoutingRule',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    const [created] = await (tx as any)
      .insert(fnbKitchenRoutingRules)
      .values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId,
        ruleType: input.ruleType,
        catalogItemId: input.catalogItemId ?? null,
        modifierId: input.modifierId ?? null,
        departmentId: input.departmentId ?? null,
        subDepartmentId: input.subDepartmentId ?? null,
        stationId: input.stationId,
        priority: input.priority,
        isActive: true,
      })
      .returning();

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createRoutingRule', created);

    return { result: created!, events: [] };
  });

  await auditLog(ctx, 'fnb.routing_rule.created', 'fnb_kitchen_routing_rules', result.id);
  return result;
}
