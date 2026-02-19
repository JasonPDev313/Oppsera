import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { computeBusinessDate } from '../business-date';
import type { TeeTimeCancelledData } from '../events';

const CONSUMER_NAME = 'golf-reporting.teeTimeCancelled';

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
 * Handles tee_time.cancelled.v1 events.
 *
 * Atomically (single transaction):
 * 1. Insert processed_events (idempotency guard)
 * 2. Look up course timezone via courses → locations join
 * 3. Compute business date from startAt
 * 4. Upsert rm_golf_tee_time_demand — increment cancellations, decrement slots_booked
 * 5. Upsert rm_golf_hourly_distribution — decrement slots_booked
 * 6. Do NOT touch rm_golf_booking_lead_time
 */
export async function handleTeeTimeCancelled(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as TeeTimeCancelledData;

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

    // Step 2: Look up course timezone via courses → locations
    const courseTimezone = await (tx as any).execute(sql`
      SELECT l.timezone
      FROM courses c
      JOIN locations l ON c.location_id = l.id AND l.tenant_id = ${event.tenantId}
      WHERE c.tenant_id = ${event.tenantId} AND c.id = ${data.courseId}
      LIMIT 1
    `);
    const tzRows = Array.from(courseTimezone as Iterable<{ timezone: string }>);
    const timezone = tzRows[0]?.timezone ?? 'America/New_York';

    // Step 3: Compute business date from tee time start
    const businessDate = computeBusinessDate(data.startAt, timezone);

    // Step 4: Extract hour of day
    const hourOfDay = getHourOfDay(data.startAt, timezone);

    // Step 5: Upsert rm_golf_tee_time_demand — increment cancellations, decrement slots_booked
    await (tx as any).execute(sql`
      INSERT INTO rm_golf_tee_time_demand (id, tenant_id, course_id, business_date, slots_booked, cancellations, updated_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${data.courseId}, ${businessDate}, ${-data.players}, ${data.players}, NOW())
      ON CONFLICT (tenant_id, course_id, business_date)
      DO UPDATE SET
        slots_booked = rm_golf_tee_time_demand.slots_booked - ${data.players},
        cancellations = rm_golf_tee_time_demand.cancellations + ${data.players},
        updated_at = NOW()
    `);

    // Step 6: Upsert rm_golf_hourly_distribution — decrement slots_booked
    await (tx as any).execute(sql`
      INSERT INTO rm_golf_hourly_distribution (id, tenant_id, course_id, business_date, hour_of_day, slots_booked, updated_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${data.courseId}, ${businessDate}, ${hourOfDay}, ${-data.players}, NOW())
      ON CONFLICT (tenant_id, course_id, business_date, hour_of_day)
      DO UPDATE SET
        slots_booked = rm_golf_hourly_distribution.slots_booked - ${data.players},
        updated_at = NOW()
    `);

    // Step 7: Update rm_golf_tee_time_fact — set status to cancelled
    await (tx as any).execute(sql`
      UPDATE rm_golf_tee_time_fact
      SET status = 'cancelled', updated_at = NOW()
      WHERE tenant_id = ${event.tenantId} AND reservation_id = ${data.teeTimeId}
    `);
  });
}
