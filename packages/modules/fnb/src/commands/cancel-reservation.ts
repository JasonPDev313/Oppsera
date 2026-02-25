import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/audit-log';
import { sql } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';

export async function cancelReservation(
  ctx: RequestContext,
  reservationId: string,
  cancelReason?: string,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const rows = await tx.execute(sql`
      UPDATE fnb_reservations
      SET status = 'canceled',
          canceled_at = now(),
          cancel_reason = ${cancelReason ?? null},
          updated_at = now()
      WHERE id = ${reservationId}
        AND tenant_id = ${ctx.tenantId}
        AND status IN ('confirmed', 'checked_in')
      RETURNING id, guest_name, party_size, reservation_date, reservation_time
    `);

    const updated = Array.from(rows as Iterable<Record<string, unknown>>)[0];
    if (!updated) throw new AppError('NOT_FOUND', 'Reservation not found or already resolved', 404);

    const event = buildEventFromContext(ctx, 'fnb.reservation.canceled.v1', {
      reservationId,
      guestName: String(updated.guest_name),
      partySize: Number(updated.party_size),
      cancelReason,
    });

    return {
      result: { id: reservationId, status: 'canceled' as const },
      events: [event],
    };
  });

  await auditLog(ctx, 'fnb.reservation.canceled', 'reservation', reservationId);
  return result;
}

export async function noShowReservation(
  ctx: RequestContext,
  reservationId: string,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const rows = await tx.execute(sql`
      UPDATE fnb_reservations
      SET status = 'no_show',
          no_show_at = now(),
          updated_at = now()
      WHERE id = ${reservationId}
        AND tenant_id = ${ctx.tenantId}
        AND status IN ('confirmed', 'checked_in')
      RETURNING id, guest_name, party_size, reservation_date, reservation_time
    `);

    const updated = Array.from(rows as Iterable<Record<string, unknown>>)[0];
    if (!updated) throw new AppError('NOT_FOUND', 'Reservation not found or already resolved', 404);

    const event = buildEventFromContext(ctx, 'fnb.reservation.no_show.v1', {
      reservationId,
      guestName: String(updated.guest_name),
      partySize: Number(updated.party_size),
    });

    return {
      result: { id: reservationId, status: 'no_show' as const },
      events: [event],
    };
  });

  await auditLog(ctx, 'fnb.reservation.no_show', 'reservation', reservationId);
  return result;
}
