import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { sql } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';
import type { ConfirmReservationInput } from '../validation-host';
import { validateReservationTransition } from '../validation-host';
import { fetchHostReservation, mapHostReservationRow } from './host-helpers';

/**
 * HOST V2: Confirm a reservation.
 * Validates state machine transition and optionally records confirmation sent timestamp.
 */
export async function confirmReservation(
  ctx: RequestContext,
  reservationId: string,
  input: ConfirmReservationInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const existing = await fetchHostReservation(tx, ctx.tenantId, reservationId);
    const oldStatus = String(existing.status);

    if (!validateReservationTransition(oldStatus, 'confirmed')) {
      throw new AppError(
        'INVALID_STATUS_TRANSITION',
        `Cannot transition reservation from '${oldStatus}' to 'confirmed'`,
        409,
      );
    }

    // Build the update — always set status, confirmed_at, version, updated_at
    // Optionally set confirmation_sent_at if sendConfirmation is true
    const confirmationSentClause = input.sendConfirmation
      ? sql`, confirmation_sent_at = now()`
      : sql``;

    const rows = await tx.execute(sql`
      UPDATE fnb_reservations
      SET status = 'confirmed',
          confirmed_at = now(),
          version = version + 1,
          updated_at = now()
          ${confirmationSentClause}
      WHERE id = ${reservationId} AND tenant_id = ${ctx.tenantId}
      RETURNING *
    `);

    const updated = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    const event = buildEventFromContext(ctx, 'fnb.reservation.status_changed.v1', {
      reservationId,
      oldStatus,
      newStatus: 'confirmed',
      confirmationSent: input.sendConfirmation ?? false,
    });

    return { result: mapHostReservationRow(updated), events: [event] };
  });

  await auditLog(ctx, 'fnb.reservation.confirmed', 'reservation', reservationId);
  return result;
}
