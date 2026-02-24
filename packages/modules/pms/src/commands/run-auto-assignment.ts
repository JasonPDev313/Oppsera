import { sql, eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import {
  pmsProperties,
  pmsReservations,
  pmsGuests,
  pmsRoomAssignmentPreferences,
} from '@oppsera/db';
import type { RunAutoAssignmentInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { rankRooms } from '../helpers/room-assignment-engine';
import type { ScoredRoom, AssignmentContext } from '../helpers/room-assignment-engine';

export interface AutoAssignmentResult {
  reservationId: string;
  roomId: string;
  roomNumber: string;
  score: number;
  reasons: string[];
}

export async function runAutoAssignment(
  ctx: RequestContext,
  input: RunAutoAssignmentInput,
): Promise<AutoAssignmentResult[]> {
  const results = await publishWithOutbox(ctx, async (tx) => {
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

    // Load preferences for the property
    const prefRows = await tx
      .select()
      .from(pmsRoomAssignmentPreferences)
      .where(
        and(
          eq(pmsRoomAssignmentPreferences.tenantId, ctx.tenantId),
          eq(pmsRoomAssignmentPreferences.propertyId, input.propertyId),
          eq(pmsRoomAssignmentPreferences.isActive, true),
        ),
      );

    const weights = prefRows.map((r) => ({
      name: r.name,
      weight: r.weight,
    }));

    // Load unassigned reservations for the target date
    let reservationFilter = sql`
      r.tenant_id = ${ctx.tenantId}
      AND r.property_id = ${input.propertyId}
      AND r.check_in_date = ${input.targetDate}::date
      AND r.room_id IS NULL
      AND r.status IN ('CONFIRMED', 'HOLD')
    `;

    if (input.reservationIds && input.reservationIds.length > 0) {
      const ids = input.reservationIds;
      reservationFilter = sql`
        r.tenant_id = ${ctx.tenantId}
        AND r.property_id = ${input.propertyId}
        AND r.id = ANY(${ids})
        AND r.room_id IS NULL
        AND r.status IN ('CONFIRMED', 'HOLD')
      `;
    }

    const reservationRows = await tx.execute(sql`
      SELECT
        r.id,
        r.room_type_id,
        r.check_in_date,
        r.check_out_date,
        r.guest_id
      FROM pms_reservations r
      WHERE ${reservationFilter}
      ORDER BY r.check_in_date, r.created_at
    `);

    const reservations = Array.from(
      reservationRows as Iterable<Record<string, unknown>>,
    ).map((row) => ({
      id: String(row.id),
      roomTypeId: String(row.room_type_id),
      checkInDate: String(row.check_in_date),
      checkOutDate: String(row.check_out_date),
      guestId: row.guest_id ? String(row.guest_id) : null,
    }));

    if (reservations.length === 0) {
      return { result: [] as AutoAssignmentResult[], events: [] };
    }

    // Track assigned rooms so we don't double-assign
    const assignedRoomIds = new Set<string>();
    const assignments: AutoAssignmentResult[] = [];

    for (const reservation of reservations) {
      // Load guest preferences if available
      let guestPreferences: Record<string, unknown> = {};
      let isVip = false;
      if (reservation.guestId) {
        const [guest] = await tx
          .select({
            isVip: pmsGuests.isVip,
            roomPreferencesJson: pmsGuests.roomPreferencesJson,
          })
          .from(pmsGuests)
          .where(
            and(
              eq(pmsGuests.id, reservation.guestId),
              eq(pmsGuests.tenantId, ctx.tenantId),
            ),
          )
          .limit(1);

        if (guest) {
          isVip = guest.isVip;
          guestPreferences = (guest.roomPreferencesJson ?? {}) as Record<string, unknown>;
        }
      }

      // Load available rooms for this reservation's room type
      const roomRows = await tx.execute(sql`
        SELECT
          r.id,
          r.room_number,
          r.room_type_id,
          r.floor,
          r.view_type,
          r.wing,
          r.accessibility_json,
          r.connecting_room_ids,
          rt.name     AS room_type_name
        FROM pms_rooms r
        JOIN pms_room_types rt ON rt.id = r.room_type_id
        WHERE r.tenant_id = ${ctx.tenantId}
          AND r.property_id = ${input.propertyId}
          AND r.room_type_id = ${reservation.roomTypeId}
          AND r.is_active = true
          AND r.is_out_of_order = false
          AND NOT EXISTS (
            SELECT 1 FROM pms_room_blocks rb
            WHERE rb.room_id = r.id
              AND rb.is_active = true
              AND daterange(rb.start_date, rb.end_date, '[)')
                  && daterange(${reservation.checkInDate}::date, ${reservation.checkOutDate}::date, '[)')
          )
          AND NOT EXISTS (
            SELECT 1 FROM pms_reservations res
            WHERE res.room_id = r.id
              AND res.id != ${reservation.id}
              AND res.status IN ('CONFIRMED', 'HOLD', 'CHECKED_IN')
              AND daterange(res.check_in_date, res.check_out_date, '[)')
                  && daterange(${reservation.checkInDate}::date, ${reservation.checkOutDate}::date, '[)')
          )
        ORDER BY r.room_number
      `);

      const availableRooms: ScoredRoom[] = Array.from(
        roomRows as Iterable<Record<string, unknown>>,
      )
        .filter((row) => !assignedRoomIds.has(String(row.id)))
        .map((row) => ({
          id: String(row.id),
          roomNumber: String(row.room_number),
          roomTypeId: String(row.room_type_id),
          floor: row.floor ? String(row.floor) : null,
          viewType: row.view_type ? String(row.view_type) : null,
          wing: row.wing ? String(row.wing) : null,
          accessibilityJson: (row.accessibility_json ?? {}) as Record<string, unknown>,
          connectingRoomIds: (row.connecting_room_ids ?? []) as string[],
        }));

      // Build room number lookup
      const roomNumberMap = new Map<string, string>();
      for (const r of availableRooms) {
        roomNumberMap.set(r.id, r.roomNumber);
      }

      if (availableRooms.length === 0) continue;

      // Rank rooms and pick the best
      const context: AssignmentContext = {
        guestPreferences,
        isVip,
        isRepeatGuest: false,
        roomTypeId: reservation.roomTypeId,
      };

      const ranked = rankRooms(availableRooms, context, weights);

      const best = ranked[0];
      if (!best) continue;

      // Assign the room to the reservation
      await tx
        .update(pmsReservations)
        .set({ roomId: best.roomId, updatedAt: new Date() })
        .where(eq(pmsReservations.id, reservation.id));

      assignedRoomIds.add(best.roomId);

      assignments.push({
        reservationId: reservation.id,
        roomId: best.roomId,
        roomNumber: roomNumberMap.get(best.roomId) ?? '',
        score: best.score,
        reasons: best.reasons,
      });
    }

    await pmsAuditLogEntry(
      tx, ctx, input.propertyId, 'auto_assignment', input.propertyId, 'run',
      {
        targetDate: { before: null, after: input.targetDate },
        assignmentsCount: { before: null, after: assignments.length },
        requestedReservations: { before: null, after: reservations.length },
      },
    );

    const event = buildEventFromContext(ctx, PMS_EVENTS.AUTO_ASSIGNMENT_RUN, {
      propertyId: input.propertyId,
      targetDate: input.targetDate,
      assignmentsCount: assignments.length,
    });

    return { result: assignments, events: [event] };
  });

  await auditLog(ctx, 'pms.auto_assignment.run', 'pms_property', input.propertyId);

  return results;
}
