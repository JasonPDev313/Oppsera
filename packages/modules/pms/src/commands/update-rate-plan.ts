import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsRatePlans } from '@oppsera/db';
import type { UpdateRatePlanInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function updateRatePlan(
  ctx: RequestContext,
  ratePlanId: string,
  input: UpdateRatePlanInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch existing rate plan
    const [existing] = await tx
      .select()
      .from(pmsRatePlans)
      .where(
        and(
          eq(pmsRatePlans.id, ratePlanId),
          eq(pmsRatePlans.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Rate plan', ratePlanId);
    }

    // If toggling isDefault to true, unset previous default for this property
    if (input.isDefault === true && !existing.isDefault) {
      await tx
        .update(pmsRatePlans)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(
          and(
            eq(pmsRatePlans.tenantId, ctx.tenantId),
            eq(pmsRatePlans.propertyId, existing.propertyId),
            eq(pmsRatePlans.isDefault, true),
          ),
        );
    }

    // Build update fields (PATCH semantics)
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.isDefault !== undefined) updates.isDefault = input.isDefault;
    if (input.isActive !== undefined) updates.isActive = input.isActive;
    if (input.defaultNightlyRateCents !== undefined) updates.defaultNightlyRateCents = input.defaultNightlyRateCents;

    const [updated] = await tx
      .update(pmsRatePlans)
      .set(updates)
      .where(and(eq(pmsRatePlans.id, ratePlanId), eq(pmsRatePlans.tenantId, ctx.tenantId)))
      .returning();

    // Compute diff for audit
    const diff: Record<string, { before: unknown; after: unknown }> = {};
    if (input.name !== undefined && existing.name !== updated!.name) {
      diff.name = { before: existing.name, after: updated!.name };
    }
    if (input.description !== undefined && existing.description !== updated!.description) {
      diff.description = { before: existing.description, after: updated!.description };
    }
    if (input.isDefault !== undefined && existing.isDefault !== updated!.isDefault) {
      diff.isDefault = { before: existing.isDefault, after: updated!.isDefault };
    }
    if (input.isActive !== undefined && existing.isActive !== updated!.isActive) {
      diff.isActive = { before: existing.isActive, after: updated!.isActive };
    }

    await pmsAuditLogEntry(
      tx, ctx, existing.propertyId, 'rate_plan', ratePlanId, 'updated',
      Object.keys(diff).length > 0 ? diff : undefined,
    );

    const event = buildEventFromContext(ctx, PMS_EVENTS.RATE_PLAN_UPDATED, {
      ratePlanId,
      propertyId: existing.propertyId,
      changes: diff,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'pms.rate_plan.updated', 'pms_rate_plan', ratePlanId);

  return result;
}
