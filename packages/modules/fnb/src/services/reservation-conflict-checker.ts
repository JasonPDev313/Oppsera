/**
 * Pure conflict-detection helpers for F&B reservations.
 *
 * NO database access — all comparisons are done on in-memory data that callers
 * have already fetched.  This makes the logic trivially unit-testable and keeps
 * it reusable from any execution context (API route, cron, realtime feed, etc.).
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProposedReservation {
  /** Table IDs the guest will occupy. */
  tableIds: string[];
  /** ISO date: YYYY-MM-DD */
  date: string;
  /** 24-hour clock: HH:MM */
  startTime: string;
  durationMinutes: number;
}

export interface ExistingReservation {
  id: string;
  /** Legacy single-table column (may be null when multi-table join is used). */
  assignedTableId: string | null;
  /** Multi-table array (nullable when legacy schema row). */
  tableIds: string[] | null;
  /** 24-hour clock: HH:MM */
  startTime: string;
  /** 24-hour clock: HH:MM — already stored on the row (end_time column) */
  endTime: string;
  partySize: number;
  guestName: string;
}

export interface ConflictResult {
  reservationId: string;
  tableId: string;
  guestName: string;
  /** Actual overlap in minutes (always ≥ 1 if a conflict is reported). */
  overlapMinutes: number;
  existingStartTime: string;
  existingEndTime: string;
}

export interface TurnTimeValidation {
  requestedDuration: number;
  avgTurnMinutes: number;
  p75TurnMinutes: number;
  isAdequate: boolean;
  /** Recommended minimum rounded up to nearest 5 minutes. */
  recommendedMinimum: number;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Convert an "HH:MM" (or "HH:MM:SS") string to total minutes since midnight.
 * Returns 0 for malformed strings so callers are never thrown an exception
 * deep inside comparison logic.
 *
 * NOTE: Values outside the valid range (hours 0-23, minutes 0-59) are accepted
 * as-is so that callers working with computed times from the DB are not silently
 * zeroed out.  Midnight-crossing reservations (end_time < start_time) must be
 * handled by the caller — see the midnight-wrap normalisation in detectConflicts.
 */
function toMinutes(time: string): number {
  const parts = time.split(':');
  const hours = parseInt(parts[0] ?? '0', 10);
  const minutes = parseInt(parts[1] ?? '0', 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
  return hours * 60 + minutes;
}

/**
 * Normalise an end-time that crosses midnight so it is always expressed as
 * minutes ≥ startMinutes.  For example:
 *   start = 23:00 (1380 min), end = 01:00 (60 min)  → normalised end = 1500 min
 *
 * This is necessary because Postgres stores time-of-day values without a date
 * component, so a reservation that starts at 23:00 and lasts 90 minutes would
 * have end_time = 00:30 (60 min), which is numerically less than start_time.
 */
function normalisedEnd(startMinutes: number, endMinutes: number): number {
  if (endMinutes < startMinutes) {
    // The reservation crosses midnight — add one full day to the end.
    return endMinutes + 24 * 60;
  }
  return endMinutes;
}

/**
 * Collect all table IDs referenced by an existing reservation, covering both
 * the legacy `assigned_table_id` column and the newer `table_ids` array column.
 */
function resolveExistingTableIds(existing: ExistingReservation): string[] {
  const ids = new Set<string>();
  if (existing.assignedTableId) ids.add(existing.assignedTableId);
  if (existing.tableIds) {
    for (const id of existing.tableIds) {
      if (id) ids.add(id);
    }
  }
  return Array.from(ids);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Detect time-window overlaps between a proposed reservation and a list of
 * existing (already-fetched, active) reservations.
 *
 * Buffer logic: we treat the proposed window as
 *   [proposedStart, proposedEnd + bufferMinutes)
 * and the existing window as
 *   [existingStart, existingEnd + bufferMinutes)
 * A conflict occurs when those two half-open intervals intersect AND the two
 * reservations share at least one table.
 *
 * The returned overlapMinutes reflects the *raw* time overlap (without buffer)
 * so UIs can display a meaningful message.
 *
 * @param proposed       - The reservation being evaluated.
 * @param existing       - Active reservations already on the same date/location
 *                         (the caller MUST pre-filter by date and active status).
 * @param bufferMinutes  - Minimum turnaround gap required between reservations
 *                         on the same table (default 10).
 */
export function detectConflicts(
  proposed: ProposedReservation,
  existing: ExistingReservation[],
  bufferMinutes = 10,
): ConflictResult[] {
  // Clamp negative buffer to 0 — a negative buffer would shrink the comparison
  // window below the raw time overlap, causing real conflicts to be missed.
  const effectiveBuffer = Math.max(0, bufferMinutes);

  const proposedStart = toMinutes(proposed.startTime);
  // Clamp durationMinutes to ≥ 0 so zero-length point-in-time reservations
  // are handled without arithmetic errors.
  const effectiveDuration = Math.max(0, proposed.durationMinutes);
  const proposedEnd = proposedStart + effectiveDuration;

  const conflicts: ConflictResult[] = [];

  for (const res of existing) {
    const existingStart = toMinutes(res.startTime);
    // Normalise the end time to handle midnight-crossing reservations
    // (e.g. start=23:00=1380, end=01:00=60 → normalisedEnd=1500).
    const existingEnd = normalisedEnd(existingStart, toMinutes(res.endTime));

    // ── Table overlap check ───────────────────────────────────────────────
    const existingTables = resolveExistingTableIds(res);
    const sharedTables = proposed.tableIds.filter((id) => existingTables.includes(id));
    if (sharedTables.length === 0) continue;

    // ── Time overlap check (buffered) ─────────────────────────────────────
    // With buffer: proposed occupies [proposedStart, proposedEnd + buffer)
    //              existing occupies [existingStart, existingEnd + buffer)
    // Overlap when: proposedStart < existingEnd + buffer
    //           AND existingStart < proposedEnd + buffer
    const proposedOverlapsExisting =
      proposedStart < existingEnd + effectiveBuffer &&
      existingStart < proposedEnd + effectiveBuffer;

    if (!proposedOverlapsExisting) continue;

    // ── Calculate actual (un-buffered) overlap for UX display ─────────────
    const rawOverlapMinutes =
      Math.min(proposedEnd, existingEnd) - Math.max(proposedStart, existingStart);

    // Report one ConflictResult per conflicting table so callers can surface
    // granular information (e.g. "Table 4 conflicts with John Smith 7:00–8:30").
    for (const tableId of sharedTables) {
      conflicts.push({
        reservationId: res.id,
        tableId,
        guestName: res.guestName,
        overlapMinutes: Math.max(rawOverlapMinutes, 1),
        existingStartTime: res.startTime,
        existingEndTime: res.endTime,
      });
    }
  }

  return conflicts;
}

/**
 * Determine whether a proposed duration satisfies historical turn-time data.
 *
 * - When `sampleSize >= 20`, we use the P75 as the adequacy threshold — this
 *   is the value that 75 % of real turns finished within, so it's a reasonable
 *   minimum.
 * - When `sampleSize < 20`, we fall back to the mean to avoid being penalised
 *   by noisy P75 estimates from small samples.
 * - `recommendedMinimum` is always rounded up to the nearest 5 minutes so that
 *   suggestions to staff look clean (e.g. 80 → 80 stays 80, 81 → 85).
 */
export function validateTurnWindow(
  requestedDuration: number,
  turnTimeStats: { avgMinutes: number; p75Minutes: number; sampleSize: number },
): TurnTimeValidation {
  const { avgMinutes, p75Minutes, sampleSize } = turnTimeStats;

  const threshold = sampleSize >= 20 ? p75Minutes : avgMinutes;
  const isAdequate = requestedDuration >= threshold;
  const recommendedMinimum = Math.ceil(p75Minutes / 5) * 5;

  return {
    requestedDuration,
    avgTurnMinutes: avgMinutes,
    p75TurnMinutes: p75Minutes,
    isAdequate,
    recommendedMinimum,
  };
}
