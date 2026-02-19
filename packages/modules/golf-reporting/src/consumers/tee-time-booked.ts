import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { computeBusinessDate } from '../business-date';
import type { TeeTimeBookedData } from '../events';

const CONSUMER_NAME = 'golf-reporting.teeTimeBooked';

/**
 * Extracts hour-of-day from an ISO timestamp in a given timezone.
 */
function getHourOfDay(isoTimestamp: string, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  });
  return parseInt(formatter.format(new Date(isoTimestamp)), 10);
}

/**
 * Computes lead-time bucket: how many days between booking and tee time.
 */
function getLeadTimeBucket(
  bookedAt: string,
  startAt: string,
): 'same_day' | 'one_day' | 'two_to_seven' | 'eight_plus' {
  const bookingMs = new Date(bookedAt).getTime();
  const teeTimeMs = new Date(startAt).getTime();
  const daysDiff = Math.floor((teeTimeMs - bookingMs) / (24 * 60 * 60 * 1000));

  if (daysDiff <= 0) return 'same_day';
  if (daysDiff === 1) return 'one_day';
  if (daysDiff <= 7) return 'two_to_seven';
  return 'eight_plus';
}

/**
 * Handles tee_time.booked.v1 events.
 *
 * Atomically (single transaction):
 * 1. Insert processed_events (idempotency guard)
 * 2. Look up course timezone via courses → locations join
 * 3. Compute business date from startAt (NOT occurredAt)
 * 4. Upsert rm_golf_tee_time_demand
 * 5. Upsert rm_golf_hourly_distribution
 * 6. Upsert rm_golf_booking_lead_time
 */
export async function handleTeeTimeBooked(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as TeeTimeBookedData;

  await withTenant(event.tenantId, async (tx) => {
    // Step 1: Atomic idempotency check
    const inserted = await (tx as any).execute(sql`
      INSERT INTO processed_events (id, tenant_id, event_id, consumer_name, processed_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${event.eventId}, ${CONSUMER_NAME}, NOW())
      ON CONFLICT (event_id, consumer_name) DO NOTHING
      RETURNING id
    `);
    const rows = Array.from(inserted as Iterable<{ id: string }>);
    if (rows.length === 0) return; // Already processed

    // Step 2: Look up course timezone + location_id via courses → locations
    const courseTimezone = await (tx as any).execute(sql`
      SELECT l.timezone, c.location_id
      FROM courses c
      JOIN locations l ON c.location_id = l.id AND l.tenant_id = ${event.tenantId}
      WHERE c.tenant_id = ${event.tenantId} AND c.id = ${data.courseId}
      LIMIT 1
    `);
    const tzRows = Array.from(courseTimezone as Iterable<{ timezone: string; location_id: string }>);
    const timezone = tzRows[0]?.timezone ?? 'America/New_York';
    const locationId = data.locationId ?? tzRows[0]?.location_id ?? '';

    // Step 3: Compute business date from tee time start (not booking time)
    const businessDate = computeBusinessDate(data.startAt, timezone);

    // Step 4: Extract hour of day
    const hourOfDay = getHourOfDay(data.startAt, timezone);

    // Step 5: Compute lead time bucket
    const bucket = getLeadTimeBucket(event.occurredAt, data.startAt);

    // Step 6: Revenue in dollars (greenFeeCents → dollars for NUMERIC(19,4))
    const revenueDollars = data.greenFeeCents / 100;

    // Step 7: Online slots increment
    const onlineIncrement = data.bookingSource === 'online' ? data.players : 0;

    // Step 8: Upsert rm_golf_tee_time_demand
    await (tx as any).execute(sql`
      INSERT INTO rm_golf_tee_time_demand (id, tenant_id, course_id, business_date, slots_booked, online_slots_booked, revenue_booked, updated_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${data.courseId}, ${businessDate}, ${data.players}, ${onlineIncrement}, ${revenueDollars}, NOW())
      ON CONFLICT (tenant_id, course_id, business_date)
      DO UPDATE SET
        slots_booked = rm_golf_tee_time_demand.slots_booked + ${data.players},
        online_slots_booked = rm_golf_tee_time_demand.online_slots_booked + ${onlineIncrement},
        revenue_booked = rm_golf_tee_time_demand.revenue_booked + ${revenueDollars},
        updated_at = NOW()
    `);

    // Step 9: Upsert rm_golf_hourly_distribution
    await (tx as any).execute(sql`
      INSERT INTO rm_golf_hourly_distribution (id, tenant_id, course_id, business_date, hour_of_day, slots_booked, updated_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${data.courseId}, ${businessDate}, ${hourOfDay}, ${data.players}, NOW())
      ON CONFLICT (tenant_id, course_id, business_date, hour_of_day)
      DO UPDATE SET
        slots_booked = rm_golf_hourly_distribution.slots_booked + ${data.players},
        updated_at = NOW()
    `);

    // Step 10: Upsert rm_golf_booking_lead_time
    const sameDayInc = bucket === 'same_day' ? 1 : 0;
    const oneDayInc = bucket === 'one_day' ? 1 : 0;
    const twoToSevenInc = bucket === 'two_to_seven' ? 1 : 0;
    const eightPlusInc = bucket === 'eight_plus' ? 1 : 0;

    await (tx as any).execute(sql`
      INSERT INTO rm_golf_booking_lead_time (id, tenant_id, course_id, business_date, same_day_count, one_day_count, two_to_seven_count, eight_plus_count, updated_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${data.courseId}, ${businessDate}, ${sameDayInc}, ${oneDayInc}, ${twoToSevenInc}, ${eightPlusInc}, NOW())
      ON CONFLICT (tenant_id, course_id, business_date)
      DO UPDATE SET
        same_day_count = rm_golf_booking_lead_time.same_day_count + ${sameDayInc},
        one_day_count = rm_golf_booking_lead_time.one_day_count + ${oneDayInc},
        two_to_seven_count = rm_golf_booking_lead_time.two_to_seven_count + ${twoToSevenInc},
        eight_plus_count = rm_golf_booking_lead_time.eight_plus_count + ${eightPlusInc},
        updated_at = NOW()
    `);

    // Step 11: Insert rm_golf_tee_time_fact (initial lifecycle row)
    await (tx as any).execute(sql`
      INSERT INTO rm_golf_tee_time_fact (
        id, tenant_id, course_id, location_id, reservation_id, business_date,
        start_at, status, party_size_booked, booking_source, booking_type,
        customer_id, customer_name, walking_count, riding_count, holes,
        green_fee_cents, created_at, updated_at
      ) VALUES (
        ${generateUlid()}, ${event.tenantId}, ${data.courseId}, ${locationId},
        ${data.teeTimeId}, ${businessDate}, ${data.startAt}, 'booked',
        ${data.players}, ${data.bookingSource}, ${data.bookingType ?? 'public'},
        ${data.customerId ?? null}, ${data.customerName ?? null},
        ${data.walkingCount ?? null}, ${data.ridingCount ?? null},
        ${data.holes ?? 18}, ${data.greenFeeCents}, NOW(), NOW()
      )
      ON CONFLICT (tenant_id, reservation_id) DO NOTHING
    `);
  });
}
