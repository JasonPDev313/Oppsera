import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { pmsGroups, pmsReservations, pmsRoomBlocks, pmsFolios, pmsRooms } from '@oppsera/db';
import type { CancelGroupInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { ConcurrencyConflictError } from '../errors';

export async function cancelGroup(
  ctx: RequestContext,
  groupId: string,
  input: CancelGroupInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [group] = await tx
      .select()
      .from(pmsGroups)
      .where(and(eq(pmsGroups.id, groupId), eq(pmsGroups.tenantId, ctx.tenantId)))
      .limit(1);

    if (!group) throw new NotFoundError('Group', groupId);

    if (group.status === 'cancelled') {
      throw new ValidationError('Group is already cancelled', [
        { field: 'groupId', message: 'Group is already cancelled' },
      ]);
    }

    // Optimistic locking
    const [updated] = await tx
      .update(pmsGroups)
      .set({ status: 'cancelled', updatedAt: new Date(), version: sql`version + 1` })
      .where(
        and(
          eq(pmsGroups.id, groupId),
          eq(pmsGroups.tenantId, ctx.tenantId),
          eq(pmsGroups.version, input.version),
        ),
      )
      .returning();

    if (!updated) throw new ConcurrencyConflictError(groupId);

    // Release all unreleased blocks
    await tx.execute(sql`
      UPDATE pms_group_room_blocks
      SET released = true, updated_at = now()
      WHERE tenant_id = ${ctx.tenantId}
        AND group_id = ${groupId}
        AND released = false
    `);

    let cancelledReservationCount = 0;

    if (input.cancelReservations) {
      // Find all active reservations linked to this group
      const activeRows = await tx.execute(sql`
        SELECT id, room_id, status, version
        FROM pms_reservations
        WHERE tenant_id = ${ctx.tenantId}
          AND group_id = ${groupId}
          AND status NOT IN ('CANCELLED', 'CHECKED_OUT', 'NO_SHOW')
      `);
      const activeArr = Array.from(activeRows as Iterable<Record<string, unknown>>);

      for (const row of activeArr) {
        const resId = String(row.id);
        const wasCheckedIn = String(row.status) === 'CHECKED_IN';

        // Deactivate room block
        if (row.room_id) {
          await tx
            .update(pmsRoomBlocks)
            .set({ isActive: false })
            .where(
              and(
                eq(pmsRoomBlocks.reservationId, resId),
                eq(pmsRoomBlocks.tenantId, ctx.tenantId),
                eq(pmsRoomBlocks.isActive, true),
              ),
            );
        }

        // Free the room if it was checked in
        if (wasCheckedIn && row.room_id) {
          await tx
            .update(pmsRooms)
            .set({ status: 'VACANT_DIRTY', updatedAt: new Date() })
            .where(and(eq(pmsRooms.id, String(row.room_id)), eq(pmsRooms.tenantId, ctx.tenantId)));
        }

        // Close folio
        await tx
          .update(pmsFolios)
          .set({ status: 'CLOSED', updatedAt: new Date() })
          .where(
            and(
              eq(pmsFolios.reservationId, resId),
              eq(pmsFolios.tenantId, ctx.tenantId),
              eq(pmsFolios.status, 'OPEN'),
            ),
          );

        // Cancel reservation
        await tx
          .update(pmsReservations)
          .set({ status: 'CANCELLED', version: sql`version + 1`, updatedAt: new Date() })
          .where(
            and(
              eq(pmsReservations.id, resId),
              eq(pmsReservations.tenantId, ctx.tenantId),
            ),
          );

        cancelledReservationCount++;
      }
    }

    await pmsAuditLogEntry(tx, ctx, group.propertyId, 'group', groupId, 'cancelled', {
      reason: input.reason ?? null,
      cancelledReservationCount,
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.GROUP_CANCELLED, {
      groupId,
      propertyId: group.propertyId,
      name: group.name,
      cancelledReservationCount,
      reason: input.reason ?? null,
    });

    return { result: { groupId, cancelledReservationCount }, events: [event] };
  });

  auditLogDeferred(ctx, 'pms.group.cancelled', 'pms_group', groupId);
  return result;
}
