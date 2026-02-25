import type { RequestContext } from '@oppsera/core/auth/context';
import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';
import type { UpdateReservationInput } from '../validation';

export async function updateReservation(
  ctx: RequestContext,
  reservationId: string,
  input: UpdateReservationInput,
) {
  return withTenant(ctx.tenantId, async (tx) => {
    const existing = await tx.execute(sql`
      SELECT id, status FROM fnb_reservations
      WHERE id = ${reservationId} AND tenant_id = ${ctx.tenantId}
    `);
    const entry = Array.from(existing as Iterable<Record<string, unknown>>)[0];
    if (!entry) throw new AppError('NOT_FOUND', 'Reservation not found', 404);
    if (entry.status === 'canceled' || entry.status === 'no_show' || entry.status === 'completed') {
      throw new AppError('INVALID_STATUS', `Cannot update reservation with status '${entry.status}'`, 409);
    }

    // Recompute end time if date/time/duration changed
    let endTimeSql = sql`end_time`;
    if (input.reservationTime || input.durationMinutes) {
      endTimeSql = sql`
        CASE
          WHEN ${input.reservationTime ?? null} IS NOT NULL OR ${input.durationMinutes ?? null} IS NOT NULL
          THEN (
            (COALESCE(${input.reservationTime ?? null}::time, reservation_time)
             + (COALESCE(${input.durationMinutes ?? null}, duration_minutes) || ' minutes')::interval)::time
          )
          ELSE end_time
        END
      `;
    }

    const rows = await tx.execute(sql`
      UPDATE fnb_reservations
      SET
        guest_name = COALESCE(${input.guestName ?? null}, guest_name),
        guest_phone = CASE WHEN ${input.guestPhone !== undefined} THEN ${input.guestPhone ?? null} ELSE guest_phone END,
        guest_email = CASE WHEN ${input.guestEmail !== undefined} THEN ${input.guestEmail ?? null} ELSE guest_email END,
        party_size = COALESCE(${input.partySize ?? null}, party_size),
        reservation_date = COALESCE(${input.reservationDate ?? null}, reservation_date),
        reservation_time = COALESCE(${input.reservationTime ?? null}::time, reservation_time),
        duration_minutes = COALESCE(${input.durationMinutes ?? null}, duration_minutes),
        end_time = ${endTimeSql},
        seating_preference = CASE WHEN ${input.seatingPreference !== undefined} THEN ${input.seatingPreference ?? null} ELSE seating_preference END,
        special_requests = CASE WHEN ${input.specialRequests !== undefined} THEN ${input.specialRequests ?? null} ELSE special_requests END,
        occasion = CASE WHEN ${input.occasion !== undefined} THEN ${input.occasion ?? null} ELSE occasion END,
        is_vip = COALESCE(${input.isVip ?? null}, is_vip),
        vip_note = CASE WHEN ${input.vipNote !== undefined} THEN ${input.vipNote ?? null} ELSE vip_note END,
        assigned_table_id = CASE WHEN ${input.assignedTableId !== undefined} THEN ${input.assignedTableId ?? null} ELSE assigned_table_id END,
        notes = CASE WHEN ${input.notes !== undefined} THEN ${input.notes ?? null} ELSE notes END,
        updated_at = now()
      WHERE id = ${reservationId} AND tenant_id = ${ctx.tenantId}
      RETURNING *
    `);

    const updated = Array.from(rows as Iterable<Record<string, unknown>>)[0];
    if (!updated) throw new AppError('NOT_FOUND', 'Reservation not found', 404);
    return updated;
  });
}
