import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsPricingRules } from '@oppsera/db';
import type { UpdatePricingRuleInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function updatePricingRule(
  ctx: RequestContext,
  id: string,
  input: UpdatePricingRuleInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch existing pricing rule
    const [existing] = await tx
      .select()
      .from(pmsPricingRules)
      .where(
        and(
          eq(pmsPricingRules.id, id),
          eq(pmsPricingRules.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Pricing rule', id);
    }

    // Build update fields (PATCH semantics)
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.ruleType !== undefined) updates.ruleType = input.ruleType;
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.conditions !== undefined) updates.conditionsJson = input.conditions;
    if (input.adjustments !== undefined) updates.adjustmentsJson = input.adjustments;
    if (input.floorCents !== undefined) updates.floorCents = input.floorCents;
    if (input.ceilingCents !== undefined) updates.ceilingCents = input.ceilingCents;
    if (input.isActive !== undefined) updates.isActive = input.isActive;

    const [updated] = await tx
      .update(pmsPricingRules)
      .set(updates)
      .where(
        and(
          eq(pmsPricingRules.id, id),
          eq(pmsPricingRules.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    // Compute diff for audit
    const diff: Record<string, { before: unknown; after: unknown }> = {};
    if (input.name !== undefined && existing.name !== updated!.name) {
      diff.name = { before: existing.name, after: updated!.name };
    }
    if (input.ruleType !== undefined && existing.ruleType !== updated!.ruleType) {
      diff.ruleType = { before: existing.ruleType, after: updated!.ruleType };
    }
    if (input.priority !== undefined && existing.priority !== updated!.priority) {
      diff.priority = { before: existing.priority, after: updated!.priority };
    }
    if (input.conditions !== undefined) {
      diff.conditions = { before: existing.conditionsJson, after: updated!.conditionsJson };
    }
    if (input.adjustments !== undefined) {
      diff.adjustments = { before: existing.adjustmentsJson, after: updated!.adjustmentsJson };
    }
    if (input.floorCents !== undefined && existing.floorCents !== updated!.floorCents) {
      diff.floorCents = { before: existing.floorCents, after: updated!.floorCents };
    }
    if (input.ceilingCents !== undefined && existing.ceilingCents !== updated!.ceilingCents) {
      diff.ceilingCents = { before: existing.ceilingCents, after: updated!.ceilingCents };
    }
    if (input.isActive !== undefined && existing.isActive !== updated!.isActive) {
      diff.isActive = { before: existing.isActive, after: updated!.isActive };
    }

    await pmsAuditLogEntry(
      tx, ctx, existing.propertyId, 'pricing_rule', id, 'updated',
      Object.keys(diff).length > 0 ? diff : undefined,
    );

    const event = buildEventFromContext(ctx, PMS_EVENTS.PRICING_RULE_UPDATED, {
      pricingRuleId: id,
      propertyId: existing.propertyId,
      name: updated!.name,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'pms.pricing_rule.updated', 'pms_pricing_rule', id);

  return result;
}
