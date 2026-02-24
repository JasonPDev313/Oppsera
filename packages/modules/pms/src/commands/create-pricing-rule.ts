import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsPricingRules, pmsProperties } from '@oppsera/db';
import type { CreatePricingRuleInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function createPricingRule(ctx: RequestContext, input: CreatePricingRuleInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'pms.createPricingRule');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    // Validate property exists and belongs to tenant
    const [property] = await tx
      .select()
      .from(pmsProperties)
      .where(
        and(
          eq(pmsProperties.id, input.propertyId),
          eq(pmsProperties.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!property) {
      throw new NotFoundError('Property', input.propertyId);
    }

    const [created] = await tx
      .insert(pmsPricingRules)
      .values({
        tenantId: ctx.tenantId,
        propertyId: input.propertyId,
        name: input.name,
        ruleType: input.ruleType,
        priority: input.priority ?? 0,
        conditionsJson: input.conditions as Record<string, unknown>,
        adjustmentsJson: input.adjustments as Record<string, unknown>,
        floorCents: input.floorCents ?? null,
        ceilingCents: input.ceilingCents ?? null,
        isActive: input.isActive ?? true,
        createdBy: ctx.user.id,
      })
      .returning();

    await pmsAuditLogEntry(tx, ctx, input.propertyId, 'pricing_rule', created!.id, 'created');

    const event = buildEventFromContext(ctx, PMS_EVENTS.PRICING_RULE_CREATED, {
      pricingRuleId: created!.id,
      propertyId: input.propertyId,
      name: created!.name,
      ruleType: created!.ruleType,
    });

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'pms.createPricingRule', created);
    }

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'pms.pricing_rule.created', 'pms_pricing_rule', result.id);

  return result;
}
