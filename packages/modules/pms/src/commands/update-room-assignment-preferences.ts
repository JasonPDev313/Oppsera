import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, generateUlid } from '@oppsera/shared';
import { pmsRoomAssignmentPreferences, pmsProperties } from '@oppsera/db';
import type { UpdateRoomAssignmentPreferencesInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function updateRoomAssignmentPreferences(
  ctx: RequestContext,
  input: UpdateRoomAssignmentPreferencesInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate property exists
    const [property] = await tx
      .select({ id: pmsProperties.id })
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

    // Delete existing preferences for this property
    await tx
      .delete(pmsRoomAssignmentPreferences)
      .where(
        and(
          eq(pmsRoomAssignmentPreferences.tenantId, ctx.tenantId),
          eq(pmsRoomAssignmentPreferences.propertyId, input.propertyId),
        ),
      );

    // Insert new preferences
    const now = new Date();
    const rows = input.preferences.map((pref) => ({
      id: generateUlid(),
      tenantId: ctx.tenantId,
      propertyId: input.propertyId,
      name: pref.name,
      weight: pref.weight,
      isActive: pref.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    }));

    if (rows.length > 0) {
      await tx.insert(pmsRoomAssignmentPreferences).values(rows);
    }

    await pmsAuditLogEntry(
      tx, ctx, input.propertyId, 'room_assignment_preferences', input.propertyId, 'updated',
      { preferencesCount: { before: null, after: rows.length } },
    );

    const event = buildEventFromContext(ctx, PMS_EVENTS.AUTO_ASSIGNMENT_RUN, {
      propertyId: input.propertyId,
      action: 'preferences_updated',
      count: rows.length,
    });

    return { result: { propertyId: input.propertyId, count: rows.length }, events: [event] };
  });

  await auditLog(ctx, 'pms.room_assignment_preferences.updated', 'pms_room_assignment_preferences', input.propertyId);

  return result;
}
