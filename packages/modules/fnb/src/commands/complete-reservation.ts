import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { sql } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';
import type { CompleteReservationInput } from '../validation-host';
import { validateReservationTransition } from '../validation-host';
import { fetchHostReservation, mapHostReservationRow } from './host-helpers';

/**
 * HOST V2: Complete a reservation (table cleared, guest departed).
 * Validates state machine: seated → completed.
 * Also closes the turn log entries for associated tables.
 */
export async function completeReservation(
  ctx: RequestContext,
  reservationId: string,
  _input: CompleteReservationInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const existing = await fetchHostReservation(tx, ctx.tenantId, reservationId);
    const oldStatus = String(existing.status);

    if (!validateReservationTransition(oldStatus, 'completed')) {
      throw new AppError(
        'INVALID_STATUS_TRANSITION',
        `Cannot transition reservation from '${oldStatus}' to 'completed'`,
        409,
      );
    }

    const rows = await tx.execute(sql`
      UPDATE fnb_reservations
      SET status = 'completed',
          completed_at = now(),
          version = version + 1,
          updated_at = now()
      WHERE id = ${reservationId} AND tenant_id = ${ctx.tenantId}
      RETURNING *
    `);

    const updated = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    // Close turn log entries for this reservation:
    // set cleared_at and compute turn_time_minutes
    await tx.execute(sql`
      UPDATE fnb_table_turn_log
      SET cleared_at = now(),
          turn_time_minutes = EXTRACT(EPOCH FROM (now() - seated_at)) / 60
      WHERE reservation_id = ${reservationId}
        AND tenant_id = ${ctx.tenantId}
        AND cleared_at IS NULL
    `);

    const event = buildEventFromContext(ctx, 'fnb.reservation.status_changed.v1', {
      reservationId,
      oldStatus,
      newStatus: 'completed',
    });

    return { result: mapHostReservationRow(updated), events: [event] };
  });

  await auditLog(ctx, 'fnb.reservation.completed', 'reservation', reservationId);
  return result;
}
