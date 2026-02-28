import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { sql } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';
import type { SeatReservationInput } from '../validation-host';
import { validateReservationTransition } from '../validation-host';
import { fetchHostReservation, mapHostReservationRow } from './host-helpers';
import { suggestTables } from '../queries/suggest-tables';
import type { TableSuggestion } from '../services/table-assigner';

/**
 * HOST V2: Seat a reservation at one or more tables.
 *
 * Two modes:
 * 1. `tableIds` provided → seat at those tables (validates state machine, inserts turn log)
 * 2. `tableIds` not provided → return table suggestions without seating
 */
export async function seatReservation(
  ctx: RequestContext,
  reservationId: string,
  input: Partial<SeatReservationInput>,
): Promise<{ data: Record<string, unknown>; suggestions?: TableSuggestion[] }> {
  if (!ctx.locationId) {
    throw new Error('Location ID is required to seat a reservation');
  }
  // If no tableIds provided, return suggestions instead of seating
  if (!input.tableIds || input.tableIds.length === 0) {
    const existing = await fetchReservationReadOnly(ctx.tenantId, reservationId);
    const partySize = Number(existing.party_size);
    const preference = existing.seating_preference ? String(existing.seating_preference) : undefined;
    const customerId = existing.customer_id ? String(existing.customer_id) : undefined;

    const suggestions = await suggestTables({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId!,
      partySize,
      seatingPreference: preference,
      customerId,
    });

    return { data: mapHostReservationRow(existing), suggestions };
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const existing = await fetchHostReservation(tx, ctx.tenantId, reservationId);
    const oldStatus = String(existing.status);
    const partySize = Number(existing.party_size);

    // Determine target status: partially_seated if adjustedPartySize < partySize
    const adjustedPartySize = input.adjustedPartySize ?? partySize;
    const newStatus = adjustedPartySize < partySize ? 'partially_seated' : 'seated';

    if (!validateReservationTransition(oldStatus, newStatus)) {
      throw new AppError(
        'INVALID_STATUS_TRANSITION',
        `Cannot transition reservation from '${oldStatus}' to '${newStatus}'`,
        409,
      );
    }

    const rows = await tx.execute(sql`
      UPDATE fnb_reservations
      SET status = ${newStatus},
          seated_at = now(),
          table_ids = ${input.tableIds},
          version = version + 1,
          updated_at = now()
      WHERE id = ${reservationId} AND tenant_id = ${ctx.tenantId}
      RETURNING *
    `);

    const updated = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    // Insert table turn log entry for turn-time tracking
    const reservationDate = String(existing.reservation_date);
    const date = new Date(reservationDate + 'T12:00:00');
    const dayOfWeek = date.getDay();
    const mealPeriod = existing.meal_period ? String(existing.meal_period) : null;

    const tableIds = input.tableIds!;
    if (tableIds.length > 0) {
      const valueFragments = tableIds.map(
        (tableId) => sql`(
          gen_random_uuid()::text, ${ctx.tenantId}, ${ctx.locationId},
          ${tableId},
          now(), ${adjustedPartySize}, ${mealPeriod}, ${dayOfWeek},
          ${reservationId}, ${true}
        )`,
      );
      await tx.execute(sql`
        INSERT INTO fnb_table_turn_log (
          id, tenant_id, location_id, table_id,
          seated_at, party_size, meal_period, day_of_week,
          reservation_id, was_reservation
        ) VALUES ${sql.join(valueFragments, sql`, `)}
      `);
    }

    const event = buildEventFromContext(ctx, 'fnb.reservation.status_changed.v1', {
      reservationId,
      oldStatus,
      newStatus,
      tableIds: input.tableIds,
      adjustedPartySize,
    });

    return { result: mapHostReservationRow(updated), events: [event] };
  });

  await auditLog(ctx, 'fnb.reservation.seated', 'reservation', reservationId);
  return { data: result };
}

/** Read-only fetch for suggestion mode (outside write transaction) */
async function fetchReservationReadOnly(
  tenantId: string,
  reservationId: string,
): Promise<Record<string, unknown>> {
  const { withTenant } = await import('@oppsera/db');
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT * FROM fnb_reservations
      WHERE id = ${reservationId} AND tenant_id = ${tenantId}
    `);
    const row = Array.from(rows as Iterable<Record<string, unknown>>)[0];
    if (!row) {
      throw new AppError('NOT_FOUND', `Reservation ${reservationId} not found`, 404);
    }
    return row;
  });
}
