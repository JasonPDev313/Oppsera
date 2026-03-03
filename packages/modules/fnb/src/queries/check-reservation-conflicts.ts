import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { detectConflicts } from '../services/reservation-conflict-checker';
import type { ExistingReservation, ConflictResult } from '../services/reservation-conflict-checker';

// ── Input / Output ────────────────────────────────────────────────────────────

export interface CheckReservationConflictsInput {
  tenantId: string;
  locationId: string;
  /** ISO date: YYYY-MM-DD */
  date: string;
  /** 24-hour clock: HH:MM */
  startTime: string;
  durationMinutes: number;
  /** One or more table IDs to check against the existing schedule. */
  tableIds: string[];
  /**
   * When editing an existing reservation, pass its ID here so we don't flag
   * the reservation as conflicting with itself.
   */
  excludeReservationId?: string;
  /**
   * Minimum turnaround gap in minutes required between reservations on the
   * same table.  Defaults to 10 when omitted.
   */
  bufferMinutes?: number;
}

export type { ConflictResult };

// ── Query ─────────────────────────────────────────────────────────────────────

/**
 * Fetch all active reservations for the given date/location and delegate to
 * `detectConflicts` for pure in-memory overlap calculation.
 *
 * Active = any status that still occupies a table:
 *   booked | confirmed | checked_in | partially_seated | seated
 *
 * Canceled / no_show / completed reservations are excluded because they no
 * longer hold the table.
 */
export async function checkReservationConflicts(
  input: CheckReservationConflictsInput,
): Promise<ConflictResult[]> {
  const bufferMinutes = input.bufferMinutes ?? 10;

  return withTenant(input.tenantId, async (tx) => {
    // Build the conditions incrementally so the exclude clause is optional.
    const baseConditions = sql`
      tenant_id    = ${input.tenantId}
      AND location_id = ${input.locationId}
      AND reservation_date = ${input.date}
      AND status NOT IN ('canceled', 'no_show', 'completed')
    `;

    const rows = input.excludeReservationId
      ? await tx.execute(sql`
          SELECT
            id,
            guest_name,
            party_size,
            assigned_table_id,
            table_ids,
            reservation_time  AS start_time,
            COALESCE(end_time,
              to_char(
                (reservation_time::time + (duration_minutes || ' minutes')::interval),
                'HH24:MI'
              )
            )                 AS end_time
          FROM fnb_reservations
          WHERE ${baseConditions}
            AND id != ${input.excludeReservationId}
          ORDER BY reservation_time ASC
        `)
      : await tx.execute(sql`
          SELECT
            id,
            guest_name,
            party_size,
            assigned_table_id,
            table_ids,
            reservation_time  AS start_time,
            COALESCE(end_time,
              to_char(
                (reservation_time::time + (duration_minutes || ' minutes')::interval),
                'HH24:MI'
              )
            )                 AS end_time
          FROM fnb_reservations
          WHERE ${baseConditions}
          ORDER BY reservation_time ASC
        `);

    const existing: ExistingReservation[] = Array.from(
      rows as Iterable<Record<string, unknown>>,
    ).map((row) => ({
      id: String(row.id),
      guestName: String(row.guest_name),
      partySize: Number(row.party_size ?? 1),
      assignedTableId: row.assigned_table_id ? String(row.assigned_table_id) : null,
      tableIds: Array.isArray(row.table_ids)
        ? (row.table_ids as unknown[]).map(String)
        : row.table_ids
          ? String(row.table_ids)
              .replace(/[{}"]/g, '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : null,
      startTime: String(row.start_time),
      endTime: String(row.end_time),
    }));

    return detectConflicts(
      {
        tableIds: input.tableIds,
        date: input.date,
        startTime: input.startTime,
        durationMinutes: input.durationMinutes,
      },
      existing,
      bufferMinutes,
    );
  });
}
