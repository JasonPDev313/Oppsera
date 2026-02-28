import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { sql } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';
import type { CheckInReservationInput } from '../validation';

/**
 * Check in a reservation. If a table is provided, seat directly.
 * Otherwise, mark as checked_in (waiting for table).
 */
export async function checkInReservation(
  ctx: RequestContext,
  reservationId: string,
  input: CheckInReservationInput,
) {
  if (!ctx.locationId) {
    throw new Error('Location ID is required to check in a reservation');
  }

  const result = await publishWithOutbox(ctx, async (tx): Promise<{ result: { id: string; status: string; seated: boolean; tableId?: string }; events: ReturnType<typeof buildEventFromContext>[] }> => {
    const resRows = await tx.execute(sql`
      SELECT * FROM fnb_reservations
      WHERE id = ${reservationId} AND tenant_id = ${ctx.tenantId}
      FOR UPDATE
    `);
    const reservation = Array.from(resRows as Iterable<Record<string, unknown>>)[0];
    if (!reservation) throw new AppError('NOT_FOUND', 'Reservation not found', 404);
    if (reservation.status !== 'confirmed') {
      throw new AppError('INVALID_STATUS', `Cannot check in reservation with status '${reservation.status}'`, 409);
    }

    const tableId = input.tableId ?? (reservation.assigned_table_id ? String(reservation.assigned_table_id) : null);
    const serverUserId = input.serverUserId ?? (reservation.assigned_server_user_id ? String(reservation.assigned_server_user_id) : null);

    if (tableId) {
      // Direct seat — table available?
      const tableRows = await tx.execute(sql`
        SELECT ls.status, t.display_label FROM fnb_tables t
        LEFT JOIN fnb_table_live_status ls ON ls.table_id = t.id AND ls.tenant_id = t.tenant_id
        WHERE t.id = ${tableId} AND t.tenant_id = ${ctx.tenantId}
      `);
      const table = Array.from(tableRows as Iterable<Record<string, unknown>>)[0];
      if (!table) throw new AppError('NOT_FOUND', 'Table not found', 404);

      if (table.status && table.status !== 'available' && table.status !== 'reserved') {
        // Table not available — mark as checked_in, will need to wait
        await tx.execute(sql`
          UPDATE fnb_reservations
          SET status = 'checked_in', updated_at = now()
          WHERE id = ${reservationId}
        `);

        const event = buildEventFromContext(ctx, 'fnb.reservation.checked_in.v1', {
          reservationId,
          guestName: String(reservation.guest_name),
          partySize: Number(reservation.party_size),
          directSeated: false,
        });

        return {
          result: { id: reservationId, status: 'checked_in' as const, seated: false },
          events: [event],
        };
      }

      // Seat directly
      await tx.execute(sql`
        UPDATE fnb_reservations
        SET status = 'seated',
            seated_at = now(),
            assigned_table_id = ${tableId},
            assigned_server_user_id = ${serverUserId},
            updated_at = now()
        WHERE id = ${reservationId}
      `);

      // Update table live status
      await tx.execute(sql`
        INSERT INTO fnb_table_live_status (id, tenant_id, table_id, status, party_size, current_server_user_id, seated_at, guest_names)
        VALUES (gen_random_uuid()::text, ${ctx.tenantId}, ${tableId}, 'seated', ${Number(reservation.party_size)}, ${serverUserId}, now(), ${String(reservation.guest_name)})
        ON CONFLICT (tenant_id, table_id) DO UPDATE SET
          status = 'seated',
          party_size = ${Number(reservation.party_size)},
          current_server_user_id = ${serverUserId},
          seated_at = now(),
          guest_names = ${String(reservation.guest_name)},
          updated_at = now(),
          version = fnb_table_live_status.version + 1
      `);

      // Record wait time (for reservations: wait from reservation_time to now)
      const now = new Date();
      const resTime = String(reservation.reservation_time);
      const [resH = 0, resM = 0] = resTime.split(':').map(Number);
      const resDate = new Date(`${String(reservation.reservation_date)}T${String(resH).padStart(2, '0')}:${String(resM).padStart(2, '0')}:00`);
      const waitMin = Math.max(0, Math.round((now.getTime() - resDate.getTime()) / 60000));

      await tx.execute(sql`
        INSERT INTO fnb_wait_time_history (
          id, tenant_id, location_id, business_date,
          party_size, actual_wait_minutes,
          seating_preference, day_of_week, hour_of_day, was_reservation
        ) VALUES (
          gen_random_uuid()::text, ${ctx.tenantId}, ${ctx.locationId},
          ${now.toISOString().slice(0, 10)},
          ${Number(reservation.party_size)}, ${waitMin},
          ${reservation.seating_preference ?? null}, ${now.getDay()}, ${now.getHours()}, true
        )
      `);

      const event = buildEventFromContext(ctx, 'fnb.reservation.seated.v1', {
        reservationId,
        guestName: String(reservation.guest_name),
        partySize: Number(reservation.party_size),
        tableId,
        tableLabel: String(table.display_label),
        serverUserId,
        directSeated: true,
      });

      return {
        result: { id: reservationId, status: 'seated' as const, seated: true, tableId },
        events: [event],
      };
    }

    // No table — just check in
    await tx.execute(sql`
      UPDATE fnb_reservations
      SET status = 'checked_in', updated_at = now()
      WHERE id = ${reservationId}
    `);

    const event = buildEventFromContext(ctx, 'fnb.reservation.checked_in.v1', {
      reservationId,
      guestName: String(reservation.guest_name),
      partySize: Number(reservation.party_size),
      directSeated: false,
    });

    return {
      result: { id: reservationId, status: 'checked_in' as const, seated: false },
      events: [event],
    };
  });

  await auditLog(ctx, 'fnb.reservation.checked_in', 'reservation', reservationId);
  return result;
}
