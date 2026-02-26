import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { sql } from 'drizzle-orm';
import type { HostCreateReservationInput } from '../validation-host';
import type { MealPeriod } from '../validation-host';
import { mapHostReservationRow } from './host-helpers';

/**
 * Infer meal period from reservation time if not explicitly provided.
 * Breakfast < 11:00, Lunch 11:00-14:59, Dinner >= 15:00.
 * Brunch on weekends (Sat/Sun) 09:00-13:59.
 */
function inferMealPeriod(
  reservationTime: string,
  reservationDate: string,
): MealPeriod {
  const [hours = 0] = reservationTime.split(':').map(Number);
  const date = new Date(reservationDate + 'T12:00:00');
  const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  if (isWeekend && hours >= 9 && hours < 14) return 'brunch';
  if (hours < 11) return 'breakfast';
  if (hours < 15) return 'lunch';
  return 'dinner';
}

/**
 * HOST V2: Create a reservation with full V2 fields.
 * Backward-compatible with the original createReservation command
 * which stays for existing callers.
 */
export async function hostCreateReservation(
  ctx: RequestContext,
  input: HostCreateReservationInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Calculate end time from reservationTime + duration (default 90 min)
    const duration = 90;
    const [hours = 0, minutes = 0] = input.reservationTime.split(':').map(Number);
    const endMinutes = hours * 60 + minutes + duration;
    const endHours = Math.floor(endMinutes / 60) % 24;
    const endMins = endMinutes % 60;
    const endTime = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;

    // Infer meal period if not provided
    const mealPeriod = input.mealPeriod ?? inferMealPeriod(input.reservationTime, input.reservationDate);

    const rows = await tx.execute(sql`
      INSERT INTO fnb_reservations (
        id, tenant_id, location_id, guest_name, guest_phone, guest_email,
        party_size, reservation_date, reservation_time, duration_minutes, end_time,
        status, seating_preference, special_requests, occasion,
        customer_id, source, notes, created_by,
        meal_period, tags, version, table_ids, assigned_server_user_id
      ) VALUES (
        gen_random_uuid()::text, ${ctx.tenantId}, ${ctx.locationId},
        ${input.guestName}, ${input.guestPhone ?? null}, ${input.guestEmail ?? null},
        ${input.partySize}, ${input.reservationDate}, ${input.reservationTime},
        ${duration}, ${endTime},
        'booked', ${input.seatingPreference ?? null}, ${input.specialRequests ?? null},
        ${input.occasion ?? null},
        ${input.customerId ?? null}, ${input.source ?? 'host'}, ${input.notes ?? null},
        ${ctx.user.id},
        ${mealPeriod}, ${input.tags ?? []}, 1,
        ${input.tableIds ?? null}, ${input.serverId ?? null}
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
      mealPeriod,
      status: 'booked',
    });

    return { result: mapHostReservationRow(created), events: [event] };
  });

  await auditLog(ctx, 'fnb.reservation.created', 'reservation', result.id);
  return result;
}
