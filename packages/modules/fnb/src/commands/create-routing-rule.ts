import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbKitchenRoutingRules } from '@oppsera/db';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { CreateKdsRoutingRuleInput } from '../validation';
import { resolveKdsLocationId } from '../services/kds-routing-engine';
import { withEffectiveLocationId } from '../helpers/venue-location';

export async function createRoutingRule(
  ctx: RequestContext,
  input: CreateKdsRoutingRuleInput,
) {
  if (!ctx.locationId) {
    throw new Error('Location ID is required to create a routing rule');
  }

  // Pre-transaction: resolve site → venue (KDS stations/rules are ONLY on venues)
  const kdsLocation = await resolveKdsLocationId(ctx.tenantId, ctx.locationId);
  if (kdsLocation.warning) {
    throw new AppError('VENUE_REQUIRED', kdsLocation.warning, 400);
  }
  const effectiveLocationId = kdsLocation.locationId;

  const effectiveCtx = withEffectiveLocationId(ctx, effectiveLocationId);
  const result = await publishWithOutbox(effectiveCtx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'createRoutingRule',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB
    }

    const [created] = await tx
      .insert(fnbKitchenRoutingRules)
      .values({
        tenantId: ctx.tenantId,
        locationId: effectiveLocationId,
        ruleType: input.ruleType,
        catalogItemId: input.catalogItemId ?? null,
        modifierId: input.modifierId ?? null,
        departmentId: input.departmentId ?? null,
        subDepartmentId: input.subDepartmentId ?? null,
        categoryId: input.categoryId ?? null,
        stationId: input.stationId,
        priority: input.priority,
        ruleName: input.ruleName ?? null,
        orderTypeCondition: input.orderTypeCondition ?? null,
        channelCondition: input.channelCondition ?? null,
        timeConditionStart: input.timeConditionStart ?? null,
        timeConditionEnd: input.timeConditionEnd ?? null,
        isActive: true,
      })
      .returning();

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createRoutingRule', created);

    return { result: created!, events: [] };
  });

  auditLogDeferred(ctx, 'fnb.routing_rule.created', 'fnb_kitchen_routing_rules', result.id);
  return result;
}
