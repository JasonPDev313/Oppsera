import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

/**
 * Consumer: fnb.tab.closed.v1
 * When an F&B tab is closed, find the associated table turn log entry
 * and mark it ready for turn completion.
 */
export interface TabClosedConsumerData {
  tenantId: string;
  locationId: string;
  tabId: string;
  tableId?: string;
}

export async function handleTabClosedForHost(data: TabClosedConsumerData): Promise<void> {
  if (!data.tableId) return;

  await withTenant(data.tenantId, async (tx) => {
    // Find the open turn log entry for this table and close it
    const rows = await tx.execute(sql`
      UPDATE fnb_table_turn_log
      SET cleared_at = now(),
          turn_time_minutes = EXTRACT(EPOCH FROM (now() - seated_at)) / 60
      WHERE tenant_id = ${data.tenantId}
        AND table_id = ${data.tableId}
        AND cleared_at IS NULL
      RETURNING id
    `);

    const updated = Array.from(rows as Iterable<Record<string, unknown>>);
    if (updated.length > 0) {
      // Turn completed — analytics data recorded
    }
  });
}

/**
 * Consumer: fnb.table.turn_completed.v1
 * Records analytics data when a table turn completes.
 * The turn log entry is already updated by the command that emitted this event.
 * This consumer can enrich with additional analytics if needed.
 */
export interface TurnCompletedConsumerData {
  tenantId: string;
  locationId: string;
  tableId: string;
  turnLogId: string;
  turnTimeMinutes: number;
  partySize: number;
  mealPeriod: string;
  wasReservation: boolean;
}

export async function handleTurnCompletedForHost(data: TurnCompletedConsumerData): Promise<void> {
  // For V1, the turn log entry is already fully populated by the command.
  // This consumer exists as a hook for future analytics enrichment
  // (e.g., updating wait time history, triggering table availability notifications).

  // Record to wait time history for the estimator (HOST-02)
  // Use DB server time via SQL to avoid UTC offset issues on Vercel
  await withTenant(data.tenantId, async (tx) => {
    await tx.execute(sql`
      INSERT INTO fnb_wait_time_history (
        id, tenant_id, location_id, business_date,
        party_size, actual_wait_minutes, seating_preference,
        day_of_week, hour_of_day, was_reservation
      ) VALUES (
        gen_random_uuid()::text, ${data.tenantId}, ${data.locationId},
        CURRENT_DATE::text,
        ${data.partySize}, ${data.turnTimeMinutes}, ${null},
        EXTRACT(DOW FROM now())::int, EXTRACT(HOUR FROM now())::int,
        ${data.wasReservation}
      )
    `);
  });
}
