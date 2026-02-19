import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import type { TeeTimeCompletedData } from '../events';

const CONSUMER_NAME = 'golf-reporting.teeTimeCompleted';

/** Slow round thresholds in minutes: 18 holes=270, 9 holes=150 */
function getSlowThreshold(holes: number): number {
  return holes <= 9 ? 150 : 270;
}

/**
 * Handles tee_time.completed.v1 events.
 *
 * Atomically (single transaction):
 * 1. Insert processed_events (idempotency guard)
 * 2. SELECT fact row (get startedAt, holes, partySizeBooked, customerId, revenue)
 * 3. Compute durationMinutes (only if startedAt exists), paceMinutesPerHole
 * 4. UPDATE fact (status='completed', completedAt, holesCompleted, durationMinutes, pace)
 * 5. UPSERT rm_golf_pace_daily (roundsCompleted++, duration agg, slow rounds)
 * 6. UPSERT rm_golf_revenue_daily (roundsPlayed += partySize, revPerRound recomputed)
 * 7. If customerId: UPSERT rm_golf_customer_play
 */
export async function handleTeeTimeCompleted(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as TeeTimeCompletedData;

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

    // Step 2: SELECT fact row
    const factResult = await (tx as any).execute(sql`
      SELECT started_at, holes, party_size_booked, party_size_actual,
             customer_id, customer_name, course_id, business_date, total_revenue
      FROM rm_golf_tee_time_fact
      WHERE tenant_id = ${event.tenantId} AND reservation_id = ${data.teeTimeId}
      LIMIT 1
    `);
    const factRows = Array.from(factResult as Iterable<{
      started_at: string | null;
      holes: number;
      party_size_booked: number;
      party_size_actual: number | null;
      customer_id: string | null;
      customer_name: string | null;
      course_id: string;
      business_date: string;
      total_revenue: string;
    }>);
    if (factRows.length === 0) return; // No fact row — skip

    const fact = factRows[0]!;
    const completedAt = data.completedAt ?? data.finishedAt;
    const holesCompleted = data.holesCompleted ?? fact.holes;

    // Step 3: Compute duration (only if startedAt exists)
    let durationMinutes: number | null = null;
    let paceMinutesPerHole: number | null = null;
    if (fact.started_at) {
      const startMs = new Date(fact.started_at).getTime();
      const endMs = new Date(completedAt).getTime();
      durationMinutes = Math.round((endMs - startMs) / 60000);
      if (holesCompleted > 0) {
        paceMinutesPerHole = Math.round((durationMinutes / holesCompleted) * 10) / 10;
      }
    }

    // Step 4: UPDATE fact
    await (tx as any).execute(sql`
      UPDATE rm_golf_tee_time_fact
      SET status = 'completed',
          completed_at = ${completedAt},
          holes_completed = ${holesCompleted},
          duration_minutes = ${durationMinutes},
          pace_minutes_per_hole = ${paceMinutesPerHole},
          updated_at = NOW()
      WHERE tenant_id = ${event.tenantId} AND reservation_id = ${data.teeTimeId}
    `);

    // Step 5: UPSERT rm_golf_pace_daily (only if durationMinutes is available)
    if (durationMinutes !== null) {
      const slowThreshold = getSlowThreshold(holesCompleted);
      const isSlow = durationMinutes > slowThreshold;
      const slowInc = isSlow ? 1 : 0;

      await (tx as any).execute(sql`
        INSERT INTO rm_golf_pace_daily (
          id, tenant_id, course_id, business_date,
          rounds_completed, total_duration_min, avg_round_duration_min,
          slow_rounds_count, avg_minutes_per_hole, updated_at
        ) VALUES (
          ${generateUlid()}, ${event.tenantId}, ${fact.course_id}, ${fact.business_date},
          1, ${durationMinutes}, ${durationMinutes},
          ${slowInc}, ${paceMinutesPerHole ?? 0}, NOW()
        )
        ON CONFLICT (tenant_id, course_id, business_date)
        DO UPDATE SET
          rounds_completed = rm_golf_pace_daily.rounds_completed + 1,
          total_duration_min = rm_golf_pace_daily.total_duration_min + ${durationMinutes},
          avg_round_duration_min = (rm_golf_pace_daily.total_duration_min + ${durationMinutes})::numeric / (rm_golf_pace_daily.rounds_completed + 1),
          slow_rounds_count = rm_golf_pace_daily.slow_rounds_count + ${slowInc},
          avg_minutes_per_hole = CASE WHEN ${holesCompleted} > 0
            THEN (rm_golf_pace_daily.total_duration_min + ${durationMinutes})::numeric / ((rm_golf_pace_daily.rounds_completed + 1) * ${holesCompleted})
            ELSE rm_golf_pace_daily.avg_minutes_per_hole END,
          updated_at = NOW()
      `);
    }

    // Step 6: UPSERT rm_golf_revenue_daily — roundsPlayed += partySize
    const partySize = fact.party_size_actual ?? fact.party_size_booked;
    await (tx as any).execute(sql`
      INSERT INTO rm_golf_revenue_daily (
        id, tenant_id, course_id, business_date,
        rounds_played, rev_per_round, updated_at
      ) VALUES (
        ${generateUlid()}, ${event.tenantId}, ${fact.course_id}, ${fact.business_date},
        ${partySize}, 0, NOW()
      )
      ON CONFLICT (tenant_id, course_id, business_date)
      DO UPDATE SET
        rounds_played = rm_golf_revenue_daily.rounds_played + ${partySize},
        rev_per_round = CASE WHEN (rm_golf_revenue_daily.rounds_played + ${partySize}) > 0
          THEN rm_golf_revenue_daily.total_revenue / (rm_golf_revenue_daily.rounds_played + ${partySize})
          ELSE 0 END,
        updated_at = NOW()
    `);

    // Step 7: UPSERT rm_golf_customer_play (only if customerId exists)
    if (fact.customer_id) {
      await (tx as any).execute(sql`
        INSERT INTO rm_golf_customer_play (
          id, tenant_id, customer_id, customer_name,
          total_rounds, total_revenue, last_played_at,
          total_party_size, avg_party_size, updated_at
        ) VALUES (
          ${generateUlid()}, ${event.tenantId}, ${fact.customer_id}, ${fact.customer_name ?? null},
          1, 0, ${completedAt},
          ${partySize}, ${partySize}, NOW()
        )
        ON CONFLICT (tenant_id, customer_id)
        DO UPDATE SET
          customer_name = COALESCE(${fact.customer_name ?? null}, rm_golf_customer_play.customer_name),
          total_rounds = rm_golf_customer_play.total_rounds + 1,
          last_played_at = ${completedAt},
          total_party_size = rm_golf_customer_play.total_party_size + ${partySize},
          avg_party_size = (rm_golf_customer_play.total_party_size + ${partySize})::numeric / (rm_golf_customer_play.total_rounds + 1),
          updated_at = NOW()
      `);
    }
  });
}
