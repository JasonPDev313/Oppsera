import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { computeBusinessDate } from '../business-date';
import type { TeeTimeCancelledData } from '../events';

const CONSUMER_NAME = 'golf-reporting.channelDailyCancelled';

/**
 * Handles tee_time.cancelled.v1 events (same event, different consumer name from teeTimeCancelled).
 *
 * Atomically (single transaction):
 * 1. Insert processed_events (idempotency guard)
 * 2. SELECT fact row (get bookingSource, bookingType)
 * 3. Timezone lookup
 * 4. Compute business date
 * 5. UPSERT rm_golf_channel_daily (decrement channel/type buckets; do NOT adjust lead time)
 */
export async function handleChannelDailyCancelled(event: EventEnvelope): Promise<void> {
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

    // Step 2: SELECT fact row to get bookingSource and bookingType
    const factResult = await (tx as any).execute(sql`
      SELECT booking_source, booking_type
      FROM rm_golf_tee_time_fact
      WHERE tenant_id = ${event.tenantId} AND reservation_id = ${data.teeTimeId}
      LIMIT 1
    `);
    const factRows = Array.from(factResult as Iterable<{ booking_source: string; booking_type: string }>);
    if (factRows.length === 0) return; // No fact row — skip

    const fact = factRows[0]!;

    // Step 3: Timezone lookup
    const courseTimezone = await (tx as any).execute(sql`
      SELECT l.timezone
      FROM courses c
      JOIN locations l ON c.location_id = l.id AND l.tenant_id = ${event.tenantId}
      WHERE c.tenant_id = ${event.tenantId} AND c.id = ${data.courseId}
      LIMIT 1
    `);
    const tzRows = Array.from(courseTimezone as Iterable<{ timezone: string }>);
    const timezone = tzRows[0]?.timezone ?? 'America/New_York';

    // Step 4: Business date
    const businessDate = computeBusinessDate(data.startAt, timezone);

    // Step 5: Channel & type bucket decrements
    const source = fact.booking_source;
    const onlineDec = source === 'online' ? data.players : 0;
    const proshopDec = (source === 'pro_shop' || source === 'proshop' || source === 'walk_in') ? data.players : 0;
    const phoneDec = source === 'phone' ? data.players : 0;

    const bookingType = fact.booking_type;
    const memberDec = bookingType === 'member' ? data.players : 0;
    const publicDec = bookingType === 'public' ? data.players : 0;
    const leagueDec = bookingType === 'league' ? data.players : 0;
    const outingDec = bookingType === 'outing' ? data.players : 0;

    // Step 6: UPSERT rm_golf_channel_daily — decrement only, no lead time adjustment
    await (tx as any).execute(sql`
      INSERT INTO rm_golf_channel_daily (
        id, tenant_id, course_id, business_date,
        online_slots_booked, proshop_slots_booked, phone_slots_booked,
        member_rounds, public_rounds, league_rounds, outing_rounds,
        updated_at
      ) VALUES (
        ${generateUlid()}, ${event.tenantId}, ${data.courseId}, ${businessDate},
        ${-onlineDec}, ${-proshopDec}, ${-phoneDec},
        ${-memberDec}, ${-publicDec}, ${-leagueDec}, ${-outingDec},
        NOW()
      )
      ON CONFLICT (tenant_id, course_id, business_date)
      DO UPDATE SET
        online_slots_booked = rm_golf_channel_daily.online_slots_booked - ${onlineDec},
        proshop_slots_booked = rm_golf_channel_daily.proshop_slots_booked - ${proshopDec},
        phone_slots_booked = rm_golf_channel_daily.phone_slots_booked - ${phoneDec},
        member_rounds = rm_golf_channel_daily.member_rounds - ${memberDec},
        public_rounds = rm_golf_channel_daily.public_rounds - ${publicDec},
        league_rounds = rm_golf_channel_daily.league_rounds - ${leagueDec},
        outing_rounds = rm_golf_channel_daily.outing_rounds - ${outingDec},
        updated_at = NOW()
    `);
  });
}
