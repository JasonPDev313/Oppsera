import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsProperties } from '@oppsera/db';
import type { UpdatePropertyInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function updateProperty(
  ctx: RequestContext,
  propertyId: string,
  input: UpdatePropertyInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch existing property
    const [existing] = await tx
      .select()
      .from(pmsProperties)
      .where(
        and(
          eq(pmsProperties.id, propertyId),
          eq(pmsProperties.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Property', propertyId);
    }

    // Build update fields (PATCH semantics — only include provided fields)
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (input.name !== undefined) updates.name = input.name;
    if (input.timezone !== undefined) updates.timezone = input.timezone;
    if (input.currency !== undefined) updates.currency = input.currency;
    if (input.addressJson !== undefined) updates.addressJson = input.addressJson;
    if (input.taxRatePct !== undefined) updates.taxRatePct = String(input.taxRatePct);
    if (input.checkInTime !== undefined) updates.checkInTime = input.checkInTime;
    if (input.checkOutTime !== undefined) updates.checkOutTime = input.checkOutTime;
    if (input.nightAuditTime !== undefined) updates.nightAuditTime = input.nightAuditTime;

    const [updated] = await tx
      .update(pmsProperties)
      .set(updates)
      .where(and(eq(pmsProperties.id, propertyId), eq(pmsProperties.tenantId, ctx.tenantId)))
      .returning();

    // Compute diff for audit
    const diff: Record<string, { before: unknown; after: unknown }> = {};
    if (input.name !== undefined && existing.name !== updated!.name) {
      diff.name = { before: existing.name, after: updated!.name };
    }
    if (input.timezone !== undefined && existing.timezone !== updated!.timezone) {
      diff.timezone = { before: existing.timezone, after: updated!.timezone };
    }
    if (input.currency !== undefined && existing.currency !== updated!.currency) {
      diff.currency = { before: existing.currency, after: updated!.currency };
    }
    if (input.taxRatePct !== undefined && existing.taxRatePct !== updated!.taxRatePct) {
      diff.taxRatePct = { before: existing.taxRatePct, after: updated!.taxRatePct };
    }
    if (input.checkInTime !== undefined && existing.checkInTime !== updated!.checkInTime) {
      diff.checkInTime = { before: existing.checkInTime, after: updated!.checkInTime };
    }
    if (input.checkOutTime !== undefined && existing.checkOutTime !== updated!.checkOutTime) {
      diff.checkOutTime = { before: existing.checkOutTime, after: updated!.checkOutTime };
    }
    if (input.nightAuditTime !== undefined && existing.nightAuditTime !== updated!.nightAuditTime) {
      diff.nightAuditTime = { before: existing.nightAuditTime, after: updated!.nightAuditTime };
    }

    await pmsAuditLogEntry(
      tx, ctx, propertyId, 'property', propertyId, 'updated',
      Object.keys(diff).length > 0 ? diff : undefined,
    );

    const event = buildEventFromContext(ctx, PMS_EVENTS.PROPERTY_UPDATED, {
      propertyId,
      changes: diff,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'pms.property.updated', 'pms_property', propertyId);

  return result;
}
