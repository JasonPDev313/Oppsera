import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsPricingRules } from '@oppsera/db';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function deactivatePricingRule(
  ctx: RequestContext,
  id: string,
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

    const [updated] = await tx
      .update(pmsPricingRules)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(pmsPricingRules.id, id),
          eq(pmsPricingRules.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    await pmsAuditLogEntry(
      tx, ctx, existing.propertyId, 'pricing_rule', id, 'deactivated',
      { isActive: { before: existing.isActive, after: false } },
    );

    const event = buildEventFromContext(ctx, PMS_EVENTS.PRICING_RULE_DEACTIVATED, {
      pricingRuleId: id,
      propertyId: existing.propertyId,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'pms.pricing_rule.deactivated', 'pms_pricing_rule', id);

  return result;
}
