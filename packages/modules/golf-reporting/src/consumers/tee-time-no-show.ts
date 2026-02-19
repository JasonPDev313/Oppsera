import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { computeBusinessDate } from '../business-date';
import type { TeeTimeNoShowData } from '../events';

const CONSUMER_NAME = 'golf-reporting.teeTimeNoShow';

/**
 * Handles tee_time.no_show_marked.v1 events.
 *
 * Atomically (single transaction):
 * 1. Insert processed_events (idempotency guard)
 * 2. Look up course timezone via courses → locations join
 * 3. Compute business date from startAt
 * 4. Upsert rm_golf_tee_time_demand — increment no_shows only
 *    (do NOT decrement slots_booked — no-shows were booked and remain booked)
 */
export async function handleTeeTimeNoShow(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as TeeTimeNoShowData;

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

    // Step 4: Upsert rm_golf_tee_time_demand — increment no_shows only
    await (tx as any).execute(sql`
      INSERT INTO rm_golf_tee_time_demand (id, tenant_id, course_id, business_date, no_shows, updated_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${data.courseId}, ${businessDate}, ${data.players}, NOW())
      ON CONFLICT (tenant_id, course_id, business_date)
      DO UPDATE SET
        no_shows = rm_golf_tee_time_demand.no_shows + ${data.players},
        updated_at = NOW()
    `);

    // Step 5: Update rm_golf_tee_time_fact — set status to no_show
    await (tx as any).execute(sql`
      UPDATE rm_golf_tee_time_fact
      SET status = 'no_show', updated_at = NOW()
      WHERE tenant_id = ${event.tenantId} AND reservation_id = ${data.teeTimeId}
    `);
  });
}
