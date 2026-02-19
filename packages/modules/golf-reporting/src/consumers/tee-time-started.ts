import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import type { TeeTimeStartedData } from '../events';

const CONSUMER_NAME = 'golf-reporting.teeTimeStarted';

/**
 * Handles tee_time.started.v1 events.
 *
 * Atomically (single transaction):
 * 1. Insert processed_events (idempotency guard)
 * 2. SELECT fact row (get start_at for delay calc)
 * 3. Compute startDelayMin, isLateStart (>5 min)
 * 4. UPDATE fact (status='started', startedAt, startDelayMin, isLateStart)
 * 5. UPSERT rm_golf_ops_daily (startsCount++, delay aggregation, compliance)
 */
export async function handleTeeTimeStarted(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as TeeTimeStartedData;

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
      SELECT start_at, course_id, business_date
      FROM rm_golf_tee_time_fact
      WHERE tenant_id = ${event.tenantId} AND reservation_id = ${data.teeTimeId}
      LIMIT 1
    `);
    const factRows = Array.from(factResult as Iterable<{ start_at: string; course_id: string; business_date: string }>);
    if (factRows.length === 0) return; // No fact row — skip

    const fact = factRows[0]!;
    const startedAt = data.startedAt ?? data.actualStartAt;

    // Step 3: Compute start delay
    const scheduledMs = new Date(fact.start_at).getTime();
    const actualMs = new Date(startedAt).getTime();
    const startDelayMin = Math.round((actualMs - scheduledMs) / 60000);
    const isLateStart = startDelayMin > 5;

    // Step 4: UPDATE fact
    await (tx as any).execute(sql`
      UPDATE rm_golf_tee_time_fact
      SET status = 'started',
          started_at = ${startedAt},
          start_delay_min = ${startDelayMin},
          is_late_start = ${isLateStart},
          updated_at = NOW()
      WHERE tenant_id = ${event.tenantId} AND reservation_id = ${data.teeTimeId}
    `);

    // Step 5: UPSERT rm_golf_ops_daily
    const lateInc = isLateStart ? 1 : 0;
    await (tx as any).execute(sql`
      INSERT INTO rm_golf_ops_daily (
        id, tenant_id, course_id, business_date,
        starts_count, late_starts_count, total_start_delay_min,
        avg_start_delay_min, interval_compliance_pct, updated_at
      ) VALUES (
        ${generateUlid()}, ${event.tenantId}, ${fact.course_id}, ${fact.business_date},
        1, ${lateInc}, ${startDelayMin},
        ${startDelayMin}, ${isLateStart ? 0 : 10000}, NOW()
      )
      ON CONFLICT (tenant_id, course_id, business_date)
      DO UPDATE SET
        starts_count = rm_golf_ops_daily.starts_count + 1,
        late_starts_count = rm_golf_ops_daily.late_starts_count + ${lateInc},
        total_start_delay_min = rm_golf_ops_daily.total_start_delay_min + ${startDelayMin},
        avg_start_delay_min = (rm_golf_ops_daily.total_start_delay_min + ${startDelayMin})::numeric / (rm_golf_ops_daily.starts_count + 1),
        interval_compliance_pct = ((rm_golf_ops_daily.starts_count + 1 - rm_golf_ops_daily.late_starts_count - ${lateInc}) * 10000) / (rm_golf_ops_daily.starts_count + 1),
        updated_at = NOW()
    `);
  });
}
