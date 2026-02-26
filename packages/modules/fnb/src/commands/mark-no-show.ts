import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { sql } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';
import type { MarkNoShowInput } from '../validation-host';
import { validateReservationTransition } from '../validation-host';
import { fetchHostReservation, mapHostReservationRow } from './host-helpers';

/**
 * HOST V2: Mark a reservation as no-show.
 * Validates state machine transition to 'no_show'.
 */
export async function markNoShow(
  ctx: RequestContext,
  reservationId: string,
  _input: MarkNoShowInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const existing = await fetchHostReservation(tx, ctx.tenantId, reservationId);
    const oldStatus = String(existing.status);

    if (!validateReservationTransition(oldStatus, 'no_show')) {
      throw new AppError(
        'INVALID_STATUS_TRANSITION',
        `Cannot transition reservation from '${oldStatus}' to 'no_show'`,
        409,
      );
    }

    const rows = await tx.execute(sql`
      UPDATE fnb_reservations
      SET status = 'no_show',
          no_show_at = now(),
          version = version + 1,
          updated_at = now()
      WHERE id = ${reservationId} AND tenant_id = ${ctx.tenantId}
      RETURNING *
    `);

    const updated = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    const event = buildEventFromContext(ctx, 'fnb.reservation.status_changed.v1', {
      reservationId,
      oldStatus,
      newStatus: 'no_show',
    });

    return { result: mapHostReservationRow(updated), events: [event] };
  });

  await auditLog(ctx, 'fnb.reservation.no_show', 'reservation', reservationId);
  return result;
}
