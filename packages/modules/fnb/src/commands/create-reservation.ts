import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { sql } from 'drizzle-orm';
import type { CreateReservationInput } from '../validation';

export async function createReservation(
  ctx: RequestContext,
  input: CreateReservationInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Compute end time
    const duration = input.durationMinutes ?? 90;
    const [hours = 0, minutes = 0] = input.reservationTime.split(':').map(Number);
    const endMinutes = hours * 60 + minutes + duration;
    const endHours = Math.floor(endMinutes / 60) % 24;
    const endMins = endMinutes % 60;
    const endTime = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;

    const rows = await tx.execute(sql`
      INSERT INTO fnb_reservations (
        id, tenant_id, location_id,
        guest_name, guest_phone, guest_email, party_size,
        reservation_date, reservation_time, duration_minutes, end_time,
        status, seating_preference, special_requests, occasion,
        is_vip, vip_note, customer_id, assigned_table_id,
        source, notes, confirmed_at, created_by
      ) VALUES (
        gen_random_uuid()::text, ${ctx.tenantId}, ${ctx.locationId},
        ${input.guestName}, ${input.guestPhone ?? null}, ${input.guestEmail ?? null}, ${input.partySize},
        ${input.reservationDate}, ${input.reservationTime}, ${duration}, ${endTime},
        'confirmed', ${input.seatingPreference ?? null}, ${input.specialRequests ?? null}, ${input.occasion ?? null},
        ${input.isVip ?? false}, ${input.vipNote ?? null}, ${input.customerId ?? null}, ${input.assignedTableId ?? null},
        ${input.source ?? 'host_stand'}, ${input.notes ?? null}, now(), ${ctx.user.id}
      )
      RETURNING *
    `);

    const created = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    const event = buildEventFromContext(ctx, 'fnb.reservation.created.v1', {
      reservationId: created.id,
      guestName: input.guestName,
      partySize: input.partySize,
      reservationDate: input.reservationDate,
      reservationTime: input.reservationTime,
    });

    return { result: mapReservationRow(created), events: [event] };
  });

  await auditLog(ctx, 'fnb.reservation.created', 'reservation', result.id);
  return result;
}

export function mapReservationRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    guestName: String(row.guest_name),
    guestPhone: row.guest_phone ? String(row.guest_phone) : null,
    guestEmail: row.guest_email ? String(row.guest_email) : null,
    partySize: Number(row.party_size),
    reservationDate: String(row.reservation_date),
    reservationTime: String(row.reservation_time),
    durationMinutes: Number(row.duration_minutes),
    endTime: row.end_time ? String(row.end_time) : null,
    status: String(row.status),
    seatingPreference: row.seating_preference ? String(row.seating_preference) : null,
    specialRequests: row.special_requests ? String(row.special_requests) : null,
    occasion: row.occasion ? String(row.occasion) : null,
    isVip: Boolean(row.is_vip),
    vipNote: row.vip_note ? String(row.vip_note) : null,
    customerId: row.customer_id ? String(row.customer_id) : null,
    assignedTableId: row.assigned_table_id ? String(row.assigned_table_id) : null,
    assignedServerUserId: row.assigned_server_user_id ? String(row.assigned_server_user_id) : null,
    seatedAt: row.seated_at ? String(row.seated_at) : null,
    tabId: row.tab_id ? String(row.tab_id) : null,
    confirmedAt: row.confirmed_at ? String(row.confirmed_at) : null,
    canceledAt: row.canceled_at ? String(row.canceled_at) : null,
    cancelReason: row.cancel_reason ? String(row.cancel_reason) : null,
    noShowAt: row.no_show_at ? String(row.no_show_at) : null,
    source: String(row.source),
    notes: row.notes ? String(row.notes) : null,
    createdAt: String(row.created_at),
  };
}
