import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { sql } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';
import type { CancelReservationV2Input } from '../validation-host';
import { validateReservationTransition } from '../validation-host';
import { fetchHostReservation, mapHostReservationRow } from './host-helpers';

/**
 * HOST V2: Cancel a reservation.
 * Validates state machine transition to 'canceled'.
 * Records who canceled and the reason.
 */
export async function cancelReservationV2(
  ctx: RequestContext,
  reservationId: string,
  input: CancelReservationV2Input,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const existing = await fetchHostReservation(tx, ctx.tenantId, reservationId);
    const oldStatus = String(existing.status);

    if (!validateReservationTransition(oldStatus, 'canceled')) {
      throw new AppError(
        'INVALID_STATUS_TRANSITION',
        `Cannot transition reservation from '${oldStatus}' to 'canceled'`,
        409,
      );
    }

    const rows = await tx.execute(sql`
      UPDATE fnb_reservations
      SET status = 'canceled',
          canceled_at = now(),
          canceled_by = ${ctx.user.id},
          cancel_reason = ${input.reason ?? null},
          version = version + 1,
          updated_at = now()
      WHERE id = ${reservationId} AND tenant_id = ${ctx.tenantId}
      RETURNING *
    `);

    const updated = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    const event = buildEventFromContext(ctx, 'fnb.reservation.cancelled.v1', {
      reservationId,
      oldStatus,
      canceledBy: ctx.user.id,
      reason: input.reason ?? null,
    });

    return { result: mapHostReservationRow(updated), events: [event] };
  });

  await auditLog(ctx, 'fnb.reservation.canceled', 'reservation', reservationId);
  return result;
}
