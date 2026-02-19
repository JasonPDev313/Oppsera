import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { computeBusinessDate } from '../business-date';
import type { TeeTimeBookedData } from '../events';

const CONSUMER_NAME = 'golf-reporting.channelDaily';

/**
 * Handles tee_time.booked.v1 events (same event, different consumer name from teeTimeBooked).
 *
 * Atomically (single transaction):
 * 1. Insert processed_events (idempotency guard)
 * 2. Timezone lookup
 * 3. Compute business date
 * 4. Compute lead time hours, isLastMinute (<24h), isAdvanced (>168h/7 days)
 * 5. UPSERT rm_golf_channel_daily (channel bucket, type bucket, lead time)
 */
export async function handleChannelDailyBooked(event: EventEnvelope): Promise<void> {
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

    // Step 2: Timezone lookup
    const courseTimezone = await (tx as any).execute(sql`
      SELECT l.timezone
      FROM courses c
      JOIN locations l ON c.location_id = l.id AND l.tenant_id = ${event.tenantId}
      WHERE c.tenant_id = ${event.tenantId} AND c.id = ${data.courseId}
      LIMIT 1
    `);
    const tzRows = Array.from(courseTimezone as Iterable<{ timezone: string }>);
    const timezone = tzRows[0]?.timezone ?? 'America/New_York';

    // Step 3: Business date
    const businessDate = computeBusinessDate(data.startAt, timezone);

    // Step 4: Lead time computation
    const bookedMs = new Date(event.occurredAt).getTime();
    const teeTimeMs = new Date(data.startAt).getTime();
    const leadTimeHours = Math.round((teeTimeMs - bookedMs) / 3600000);
    const isLastMinute = leadTimeHours < 24;
    const isAdvanced = leadTimeHours > 168; // 7 days

    // Step 5: Channel & type bucket increments
    const source = data.bookingSource ?? 'proshop';
    const onlineInc = source === 'online' ? data.players : 0;
    const proshopInc = (source === 'pro_shop' || source === 'proshop' || source === 'walk_in') ? data.players : 0;
    const phoneInc = source === 'phone' ? data.players : 0;

    const bookingType = data.bookingType ?? 'public';
    const memberInc = bookingType === 'member' ? data.players : 0;
    const publicInc = bookingType === 'public' ? data.players : 0;
    const leagueInc = bookingType === 'league' ? data.players : 0;
    const outingInc = bookingType === 'outing' ? data.players : 0;

    const lastMinuteInc = isLastMinute ? 1 : 0;
    const advancedInc = isAdvanced ? 1 : 0;

    // Step 6: UPSERT rm_golf_channel_daily
    await (tx as any).execute(sql`
      INSERT INTO rm_golf_channel_daily (
        id, tenant_id, course_id, business_date,
        online_slots_booked, proshop_slots_booked, phone_slots_booked,
        member_rounds, public_rounds, league_rounds, outing_rounds,
        booking_count, total_lead_time_hours, avg_lead_time_hours,
        last_minute_count, advanced_count, updated_at
      ) VALUES (
        ${generateUlid()}, ${event.tenantId}, ${data.courseId}, ${businessDate},
        ${onlineInc}, ${proshopInc}, ${phoneInc},
        ${memberInc}, ${publicInc}, ${leagueInc}, ${outingInc},
        1, ${leadTimeHours}, ${leadTimeHours},
        ${lastMinuteInc}, ${advancedInc}, NOW()
      )
      ON CONFLICT (tenant_id, course_id, business_date)
      DO UPDATE SET
        online_slots_booked = rm_golf_channel_daily.online_slots_booked + ${onlineInc},
        proshop_slots_booked = rm_golf_channel_daily.proshop_slots_booked + ${proshopInc},
        phone_slots_booked = rm_golf_channel_daily.phone_slots_booked + ${phoneInc},
        member_rounds = rm_golf_channel_daily.member_rounds + ${memberInc},
        public_rounds = rm_golf_channel_daily.public_rounds + ${publicInc},
        league_rounds = rm_golf_channel_daily.league_rounds + ${leagueInc},
        outing_rounds = rm_golf_channel_daily.outing_rounds + ${outingInc},
        booking_count = rm_golf_channel_daily.booking_count + 1,
        total_lead_time_hours = rm_golf_channel_daily.total_lead_time_hours + ${leadTimeHours},
        avg_lead_time_hours = (rm_golf_channel_daily.total_lead_time_hours + ${leadTimeHours})::numeric / (rm_golf_channel_daily.booking_count + 1),
        last_minute_count = rm_golf_channel_daily.last_minute_count + ${lastMinuteInc},
        advanced_count = rm_golf_channel_daily.advanced_count + ${advancedInc},
        updated_at = NOW()
    `);
  });
}
