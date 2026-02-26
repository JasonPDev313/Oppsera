import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { sql } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';
import type { HostUpdateReservationInput } from '../validation-host';
import { fetchHostReservation, mapHostReservationRow } from './host-helpers';

/**
 * HOST V2: Update a reservation with PATCH semantics.
 * Only provided fields are updated. Supports optimistic locking via expectedVersion.
 */
export async function hostUpdateReservation(
  ctx: RequestContext,
  reservationId: string,
  input: HostUpdateReservationInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const existing = await fetchHostReservation(tx, ctx.tenantId, reservationId);

    // Guard: cannot modify completed/canceled/no-show reservations
    const currentStatus = String(existing.status);
    const immutableStatuses = ['completed', 'canceled', 'no_show'];
    if (immutableStatuses.includes(currentStatus)) {
      throw new AppError(
        'INVALID_STATUS_TRANSITION',
        `Cannot modify reservation in '${currentStatus}' status`,
        409,
      );
    }

    // Optimistic locking: if expectedVersion provided, validate it matches
    if (input.expectedVersion !== undefined && Number(existing.version) !== input.expectedVersion) {
      throw new AppError(
        'VERSION_CONFLICT',
        `Reservation ${reservationId} has been modified by another user`,
        409,
      );
    }

    // Build SET clause dynamically from provided fields
    const setClauses: ReturnType<typeof sql>[] = [];

    if (input.guestName !== undefined) {
      setClauses.push(sql`guest_name = ${input.guestName}`);
    }
    if (input.guestEmail !== undefined) {
      setClauses.push(sql`guest_email = ${input.guestEmail}`);
    }
    if (input.guestPhone !== undefined) {
      setClauses.push(sql`guest_phone = ${input.guestPhone}`);
    }
    if (input.partySize !== undefined) {
      setClauses.push(sql`party_size = ${input.partySize}`);
    }
    if (input.reservationDate !== undefined) {
      setClauses.push(sql`reservation_date = ${input.reservationDate}`);
    }
    if (input.reservationTime !== undefined) {
      setClauses.push(sql`reservation_time = ${input.reservationTime}`);
      // Recompute end_time when time changes
      const [hours = 0, minutes = 0] = input.reservationTime.split(':').map(Number);
      const duration = Number(existing.duration_minutes);
      const endMinutes = hours * 60 + minutes + duration;
      const endHours = Math.floor(endMinutes / 60) % 24;
      const endMins = endMinutes % 60;
      const endTime = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
      setClauses.push(sql`end_time = ${endTime}`);
    }
    if (input.mealPeriod !== undefined) {
      setClauses.push(sql`meal_period = ${input.mealPeriod}`);
    }
    if (input.specialRequests !== undefined) {
      setClauses.push(sql`special_requests = ${input.specialRequests}`);
    }
    if (input.occasion !== undefined) {
      setClauses.push(sql`occasion = ${input.occasion}`);
    }
    if (input.tags !== undefined) {
      setClauses.push(sql`tags = ${input.tags}`);
    }
    if (input.seatingPreference !== undefined) {
      setClauses.push(sql`seating_preference = ${input.seatingPreference}`);
    }
    if (input.tableIds !== undefined) {
      setClauses.push(sql`table_ids = ${input.tableIds}`);
    }
    if (input.serverId !== undefined) {
      setClauses.push(sql`assigned_server_user_id = ${input.serverId}`);
    }
    if (input.notes !== undefined) {
      setClauses.push(sql`notes = ${input.notes}`);
    }

    // Always increment version and update timestamp
    setClauses.push(sql`version = version + 1`);
    setClauses.push(sql`updated_at = now()`);

    // Build the combined SET expression
    const setExpression = sql.join(setClauses, sql`, `);

    const rows = await tx.execute(sql`
      UPDATE fnb_reservations
      SET ${setExpression}
      WHERE id = ${reservationId} AND tenant_id = ${ctx.tenantId}
      RETURNING *
    `);

    const updated = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    const event = buildEventFromContext(ctx, 'fnb.reservation.updated.v1', {
      reservationId,
      updatedFields: Object.keys(input).filter(
        (k) => k !== 'expectedVersion' && k !== 'clientRequestId' && (input as any)[k] !== undefined,
      ),
    });

    return { result: mapHostReservationRow(updated), events: [event] };
  });

  await auditLog(ctx, 'fnb.reservation.updated', 'reservation', reservationId);
  return result;
}
