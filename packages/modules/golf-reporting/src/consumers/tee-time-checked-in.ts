import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import type { TeeTimeCheckedInData } from '../events';

const CONSUMER_NAME = 'golf-reporting.teeTimeCheckedIn';

/**
 * Handles tee_time.checked_in.v1 events.
 *
 * Atomically (single transaction):
 * 1. Insert processed_events (idempotency guard)
 * 2. SELECT fact row (reservation_id) for current party_size_booked
 * 3. UPDATE fact (status='checked_in', checkedInAt, partySizeActual)
 * 4. If partySizeActual differs from partySizeBooked, adjust rm_golf_tee_time_demand
 */
export async function handleTeeTimeCheckedIn(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as TeeTimeCheckedInData;

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

    // Step 2: SELECT fact row to get partySizeBooked
    const factResult = await (tx as any).execute(sql`
      SELECT party_size_booked, course_id, business_date
      FROM rm_golf_tee_time_fact
      WHERE tenant_id = ${event.tenantId} AND reservation_id = ${data.teeTimeId}
      LIMIT 1
    `);
    const factRows = Array.from(factResult as Iterable<{ party_size_booked: number; course_id: string; business_date: string }>);
    if (factRows.length === 0) return; // No fact row — skip

    const fact = factRows[0]!;
    const partySizeActual = data.partySizeActual ?? data.players;

    // Step 3: UPDATE fact — set status, checkedInAt, partySizeActual
    await (tx as any).execute(sql`
      UPDATE rm_golf_tee_time_fact
      SET status = 'checked_in',
          checked_in_at = ${data.checkedInAt},
          party_size_actual = ${partySizeActual},
          updated_at = NOW()
      WHERE tenant_id = ${event.tenantId} AND reservation_id = ${data.teeTimeId}
    `);

    // Step 4: If party size changed, adjust demand
    const delta = partySizeActual - fact.party_size_booked;
    if (delta !== 0) {
      await (tx as any).execute(sql`
        INSERT INTO rm_golf_tee_time_demand (id, tenant_id, course_id, business_date, slots_booked, updated_at)
        VALUES (${generateUlid()}, ${event.tenantId}, ${fact.course_id}, ${fact.business_date}, ${delta}, NOW())
        ON CONFLICT (tenant_id, course_id, business_date)
        DO UPDATE SET
          slots_booked = rm_golf_tee_time_demand.slots_booked + ${delta},
          updated_at = NOW()
      `);
    }
  });
}
