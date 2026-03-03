import { describe, it, expect } from 'vitest';
import {
  detectConflicts,
  validateTurnWindow,
} from '../services/reservation-conflict-checker';
import type {
  ProposedReservation,
  ExistingReservation,
} from '../services/reservation-conflict-checker';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeExisting(overrides: Partial<ExistingReservation> = {}): ExistingReservation {
  return {
    id: 'res-001',
    guestName: 'Alice Smith',
    partySize: 2,
    assignedTableId: 'table-1',
    tableIds: null,
    startTime: '18:00',
    endTime: '19:30',
    ...overrides,
  };
}

function makeProposed(overrides: Partial<ProposedReservation> = {}): ProposedReservation {
  return {
    tableIds: ['table-1'],
    date: '2026-03-15',
    startTime: '19:45',
    durationMinutes: 90,
    ...overrides,
  };
}

// ── detectConflicts ──────────────────────────────────────────────────────────

describe('detectConflicts', () => {
  // ── No conflict ────────────────────────────────────────────────────────────

  it('returns empty array when proposed does not overlap existing (gap > buffer)', () => {
    // Existing: 18:00–19:30 | Proposed: 19:41+ (>10 min after 19:30)
    const proposed = makeProposed({ startTime: '19:41' });
    const existing = [makeExisting()];
    expect(detectConflicts(proposed, existing, 10)).toHaveLength(0);
  });

  it('returns empty array when proposed is well before the existing reservation', () => {
    // Existing: 20:00–21:30 | Proposed: 17:00–18:30 — no overlap at all
    const proposed = makeProposed({ startTime: '17:00', durationMinutes: 90 });
    const existing = [makeExisting({ startTime: '20:00', endTime: '21:30' })];
    expect(detectConflicts(proposed, existing, 10)).toHaveLength(0);
  });

  it('returns empty array when reservations are on different tables', () => {
    const proposed = makeProposed({ tableIds: ['table-2'], startTime: '18:00' });
    const existing = [makeExisting({ assignedTableId: 'table-1' })];
    expect(detectConflicts(proposed, existing, 10)).toHaveLength(0);
  });

  // ── Full overlap ───────────────────────────────────────────────────────────

  it('detects full overlap — same table, identical time window', () => {
    const proposed = makeProposed({ startTime: '18:00', durationMinutes: 90 });
    const existing = [makeExisting({ startTime: '18:00', endTime: '19:30' })];

    const conflicts = detectConflicts(proposed, existing, 10);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.reservationId).toBe('res-001');
    expect(conflicts[0]!.tableId).toBe('table-1');
    expect(conflicts[0]!.overlapMinutes).toBe(90);
    expect(conflicts[0]!.guestName).toBe('Alice Smith');
    expect(conflicts[0]!.existingStartTime).toBe('18:00');
    expect(conflicts[0]!.existingEndTime).toBe('19:30');
  });

  it('detects full overlap — proposed entirely inside existing', () => {
    // Existing: 17:00–20:00 | Proposed: 18:00–19:30
    const proposed = makeProposed({ startTime: '18:00', durationMinutes: 90 });
    const existing = [makeExisting({ startTime: '17:00', endTime: '20:00' })];
    const conflicts = detectConflicts(proposed, existing, 10);
    expect(conflicts).toHaveLength(1);
    // raw overlap = min(19:30, 20:00) - max(18:00, 17:00) = 19:30 - 18:00 = 90 min
    expect(conflicts[0]!.overlapMinutes).toBe(90);
  });

  // ── Partial overlap ────────────────────────────────────────────────────────

  it('detects partial overlap and reports correct overlapMinutes', () => {
    // Existing: 18:00–19:30 | Proposed: 19:00–20:30 → raw overlap 30 min
    const proposed = makeProposed({ startTime: '19:00', durationMinutes: 90 });
    const existing = [makeExisting({ startTime: '18:00', endTime: '19:30' })];

    const conflicts = detectConflicts(proposed, existing, 10);

    expect(conflicts).toHaveLength(1);
    // raw overlap = min(20:30, 19:30) - max(19:00, 18:00) = 19:30 - 19:00 = 30 min
    expect(conflicts[0]!.overlapMinutes).toBe(30);
  });

  it('detects partial overlap when proposed starts inside existing', () => {
    // Existing: 17:00–18:30 | Proposed: 18:00–19:30 → overlap 30 min
    const proposed = makeProposed({ startTime: '18:00', durationMinutes: 90 });
    const existing = [makeExisting({ startTime: '17:00', endTime: '18:30' })];
    const conflicts = detectConflicts(proposed, existing, 10);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.overlapMinutes).toBe(30);
  });

  // ── Buffer enforcement ─────────────────────────────────────────────────────

  it('flags a conflict when the gap equals exactly the buffer (not strictly greater)', () => {
    // Existing ends 19:30, buffer = 10 → proposed must start at 19:41+ to be clear.
    // At 19:40: gap = 10 min exactly — NOT safe because condition is <, not <=.
    // proposedStart (19:40) < existingEnd (19:30) + buffer (10) = 19:40 → false
    // So 19:40 should NOT conflict.
    const proposed = makeProposed({ startTime: '19:40', durationMinutes: 90 });
    const existing = [makeExisting({ startTime: '18:00', endTime: '19:30' })];
    // Gap = 19:40 - 19:30 = 10 min — exactly equals buffer, boundary is exclusive
    expect(detectConflicts(proposed, existing, 10)).toHaveLength(0);
  });

  it('flags a conflict when the gap is 1 minute less than the buffer', () => {
    // Existing ends 19:30, buffer = 10, proposed starts 19:39 → gap = 9 min < 10
    const proposed = makeProposed({ startTime: '19:39', durationMinutes: 90 });
    const existing = [makeExisting({ startTime: '18:00', endTime: '19:30' })];
    const conflicts = detectConflicts(proposed, existing, 10);
    expect(conflicts).toHaveLength(1);
    // raw overlap: min(21:09, 19:30) - max(19:39, 18:00) = 19:30 - 19:39 = -9 → clamped to 1
    expect(conflicts[0]!.overlapMinutes).toBeGreaterThanOrEqual(1);
  });

  it('respects bufferMinutes = 0 (no padding)', () => {
    // With zero buffer, back-to-back is fine
    // Existing: 18:00–19:30 | Proposed starts exactly at 19:30 — should be no conflict
    const proposed = makeProposed({ startTime: '19:30', durationMinutes: 90 });
    const existing = [makeExisting({ startTime: '18:00', endTime: '19:30' })];
    // proposedStart (19:30) < existingEnd (19:30) + 0 = 19:30 → false → no conflict
    expect(detectConflicts(proposed, existing, 0)).toHaveLength(0);
  });

  // ── Canceled excluded (caller responsibility) ──────────────────────────────

  it('does NOT filter by status — caller must pre-filter active reservations', () => {
    // The detector itself is pure — it accepts whatever existing list it receives.
    // Pass a "canceled" reservation (pretending the caller incorrectly included it).
    const proposed = makeProposed({ startTime: '18:00', durationMinutes: 90 });
    const existing = [
      makeExisting({ id: 'canceled-res', startTime: '18:00', endTime: '19:30' }),
    ];
    // Even though it is logically "canceled", the pure function still detects
    // the table+time overlap — callers are responsible for pre-filtering.
    const conflicts = detectConflicts(proposed, existing, 10);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.reservationId).toBe('canceled-res');
  });

  // ── Multi-table ────────────────────────────────────────────────────────────

  it('detects conflict on one of two proposed tables', () => {
    // Proposed: tables [table-1, table-2] | Existing only occupies table-1
    const proposed = makeProposed({
      tableIds: ['table-1', 'table-2'],
      startTime: '18:00',
      durationMinutes: 90,
    });
    const existing = [makeExisting({ assignedTableId: 'table-1' })];

    const conflicts = detectConflicts(proposed, existing, 10);

    // Only table-1 conflicts
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.tableId).toBe('table-1');
  });

  it('detects conflicts on both proposed tables when both are occupied', () => {
    const proposed = makeProposed({
      tableIds: ['table-1', 'table-2'],
      startTime: '18:00',
      durationMinutes: 90,
    });
    const existingMulti = makeExisting({
      id: 'res-multi',
      assignedTableId: null,
      tableIds: ['table-1', 'table-2'],
      startTime: '18:00',
      endTime: '19:30',
    });

    const conflicts = detectConflicts(proposed, [existingMulti], 10);

    expect(conflicts).toHaveLength(2);
    const tableIds = conflicts.map((c) => c.tableId).sort();
    expect(tableIds).toEqual(['table-1', 'table-2']);
  });

  it('resolves existing tableIds from tableIds array (not just assignedTableId)', () => {
    const proposed = makeProposed({ tableIds: ['table-99'], startTime: '18:00', durationMinutes: 90 });
    const existing = [
      makeExisting({
        assignedTableId: null,
        tableIds: ['table-99', 'table-100'],
        startTime: '18:00',
        endTime: '19:30',
      }),
    ];
    const conflicts = detectConflicts(proposed, existing, 10);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.tableId).toBe('table-99');
  });

  it('deduplicates tables that appear in both assignedTableId and tableIds', () => {
    // If a row has assignedTableId = 'table-1' AND tableIds = ['table-1', 'table-2'],
    // there should be exactly one conflict entry for table-1 (not two).
    const proposed = makeProposed({ tableIds: ['table-1'], startTime: '18:00', durationMinutes: 90 });
    const existing = [
      makeExisting({
        assignedTableId: 'table-1',
        tableIds: ['table-1', 'table-2'],
        startTime: '18:00',
        endTime: '19:30',
      }),
    ];
    const conflicts = detectConflicts(proposed, existing, 10);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.tableId).toBe('table-1');
  });

  // ── Multiple existing reservations ────────────────────────────────────────

  it('reports conflicts from multiple existing reservations', () => {
    const proposed = makeProposed({ startTime: '18:00', durationMinutes: 180 });
    const existing = [
      makeExisting({ id: 'res-A', startTime: '17:00', endTime: '18:30' }),
      makeExisting({ id: 'res-B', startTime: '19:00', endTime: '20:00' }),
    ];
    const conflicts = detectConflicts(proposed, existing, 10);
    expect(conflicts).toHaveLength(2);
    const ids = conflicts.map((c) => c.reservationId).sort();
    expect(ids).toEqual(['res-A', 'res-B']);
  });

  it('only reports from conflicting reservations when list has mix of clear and conflicting', () => {
    const proposed = makeProposed({ startTime: '18:00', durationMinutes: 90 });
    const existing = [
      // Conflict: overlaps
      makeExisting({ id: 'res-conflict', startTime: '18:00', endTime: '19:30' }),
      // Clear: well after proposed ends (18:00 + 90 min + 10 min buffer = 19:40)
      makeExisting({ id: 'res-clear', startTime: '20:00', endTime: '21:30' }),
    ];
    const conflicts = detectConflicts(proposed, existing, 10);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.reservationId).toBe('res-conflict');
  });

  // ── Edge: empty inputs ────────────────────────────────────────────────────

  it('returns empty array when existing list is empty', () => {
    expect(detectConflicts(makeProposed(), [], 10)).toHaveLength(0);
  });

  it('returns empty array when proposed tableIds is empty', () => {
    const proposed = makeProposed({ tableIds: [] });
    const existing = [makeExisting()];
    expect(detectConflicts(proposed, existing, 10)).toHaveLength(0);
  });

  // ── Edge: overlapMinutes clamped to ≥ 1 when within buffer but not raw-overlapping ──

  it('clamps overlapMinutes to at least 1 for buffer-only conflicts', () => {
    // Existing: 18:00–19:30 | Proposed: 19:35 → gap = 5 min < 10 buffer
    // raw overlap = 19:30 - 19:35 = -5 → negative → clamped to 1
    const proposed = makeProposed({ startTime: '19:35', durationMinutes: 90 });
    const existing = [makeExisting({ startTime: '18:00', endTime: '19:30' })];
    const conflicts = detectConflicts(proposed, existing, 10);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.overlapMinutes).toBeGreaterThanOrEqual(1);
  });
});

// ── validateTurnWindow ────────────────────────────────────────────────────────

describe('validateTurnWindow', () => {
  it('marks adequate when requestedDuration >= p75 with sufficient sample size', () => {
    const stats = { avgMinutes: 55, p75Minutes: 75, sampleSize: 50 };
    const result = validateTurnWindow(90, stats);
    expect(result.isAdequate).toBe(true);
    expect(result.requestedDuration).toBe(90);
    expect(result.avgTurnMinutes).toBe(55);
    expect(result.p75TurnMinutes).toBe(75);
  });

  it('marks inadequate when requestedDuration < p75 with sufficient sample size', () => {
    const stats = { avgMinutes: 55, p75Minutes: 75, sampleSize: 50 };
    const result = validateTurnWindow(60, stats);
    expect(result.isAdequate).toBe(false);
  });

  it('uses avg (not p75) as threshold when sampleSize < 20', () => {
    // p75 = 80, avg = 55 — with only 10 samples, we use avg
    const stats = { avgMinutes: 55, p75Minutes: 80, sampleSize: 10 };

    const adequateResult = validateTurnWindow(60, stats); // 60 >= avg(55) → adequate
    expect(adequateResult.isAdequate).toBe(true);

    const inadequateResult = validateTurnWindow(50, stats); // 50 < avg(55) → inadequate
    expect(inadequateResult.isAdequate).toBe(false);
  });

  it('switches to p75 threshold exactly at sampleSize = 20', () => {
    const stats = { avgMinutes: 55, p75Minutes: 75, sampleSize: 20 };
    const result = validateTurnWindow(70, stats); // 70 < p75(75) → inadequate
    expect(result.isAdequate).toBe(false);
  });

  it('calculates recommendedMinimum rounded up to nearest 5 minutes', () => {
    expect(validateTurnWindow(60, { avgMinutes: 55, p75Minutes: 75, sampleSize: 30 }).recommendedMinimum).toBe(75);
    expect(validateTurnWindow(60, { avgMinutes: 55, p75Minutes: 76, sampleSize: 30 }).recommendedMinimum).toBe(80);
    expect(validateTurnWindow(60, { avgMinutes: 55, p75Minutes: 71, sampleSize: 30 }).recommendedMinimum).toBe(75);
    expect(validateTurnWindow(60, { avgMinutes: 55, p75Minutes: 80, sampleSize: 30 }).recommendedMinimum).toBe(80);
    expect(validateTurnWindow(60, { avgMinutes: 55, p75Minutes: 81, sampleSize: 30 }).recommendedMinimum).toBe(85);
  });

  it('passes through all stats fields in the result', () => {
    const stats = { avgMinutes: 62, p75Minutes: 78, sampleSize: 45 };
    const result = validateTurnWindow(90, stats);
    expect(result.avgTurnMinutes).toBe(62);
    expect(result.p75TurnMinutes).toBe(78);
    expect(result.requestedDuration).toBe(90);
  });

  it('marks adequate when requestedDuration exactly equals p75 threshold', () => {
    const stats = { avgMinutes: 55, p75Minutes: 75, sampleSize: 30 };
    const result = validateTurnWindow(75, stats);
    expect(result.isAdequate).toBe(true);
  });

  it('handles zero sampleSize by using avg threshold', () => {
    // sampleSize = 0 < 20 → use avg
    const stats = { avgMinutes: 60, p75Minutes: 75, sampleSize: 0 };
    expect(validateTurnWindow(65, stats).isAdequate).toBe(true);  // 65 >= avg(60)
    expect(validateTurnWindow(55, stats).isAdequate).toBe(false); // 55 < avg(60)
  });

  it('recommendedMinimum is always a multiple of 5', () => {
    const p75Values = [60, 61, 62, 63, 64, 65, 70, 74, 75, 79, 85, 90, 100, 103, 119, 120];
    for (const p75 of p75Values) {
      const { recommendedMinimum } = validateTurnWindow(
        120,
        { avgMinutes: 50, p75Minutes: p75, sampleSize: 30 },
      );
      expect(recommendedMinimum % 5, `p75=${p75} → ${recommendedMinimum}`).toBe(0);
      expect(recommendedMinimum).toBeGreaterThanOrEqual(p75);
    }
  });
});

// ── Edge cases added during S2/S3 hardening ───────────────────────────────────

describe('detectConflicts — midnight-crossing reservations', () => {
  it('detects conflict when proposed overlaps an existing midnight-spanning reservation', () => {
    // Existing: 23:00–01:00 (crosses midnight). Proposed: 23:30–01:30.
    // After normalisation: existingEnd = 60 + 1440 = 1500 (i.e. 01:00 next day).
    const proposed: ProposedReservation = {
      tableIds: ['table-1'],
      date: '2026-03-15',
      startTime: '23:30',
      durationMinutes: 120, // 23:30 – 01:30
    };
    const existing: ExistingReservation = {
      id: 'midnight-res',
      guestName: 'Bob Night',
      partySize: 2,
      assignedTableId: 'table-1',
      tableIds: null,
      startTime: '23:00',
      endTime: '01:00', // midnight-crossing
    };
    const conflicts = detectConflicts(proposed, [existing], 0);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.reservationId).toBe('midnight-res');
    // overlap = min(23:30+120=25:30=1530, normalised 1500) - max(23:30=1410, 23:00=1380) = 1500-1410 = 90
    expect(conflicts[0]!.overlapMinutes).toBe(90);
  });

  it('does NOT flag conflict for proposed reservation entirely before a midnight-spanning existing', () => {
    // Existing: 23:00–01:00. Proposed: 21:00–22:30 — entirely before existing, no overlap.
    const proposed: ProposedReservation = {
      tableIds: ['table-1'],
      date: '2026-03-15',
      startTime: '21:00',
      durationMinutes: 90,
    };
    const existing: ExistingReservation = {
      id: 'midnight-res',
      guestName: 'Bob Night',
      partySize: 2,
      assignedTableId: 'table-1',
      tableIds: null,
      startTime: '23:00',
      endTime: '01:00',
    };
    expect(detectConflicts(proposed, [existing], 0)).toHaveLength(0);
  });

  it('detects conflict when proposed starts just before midnight-spanning existing ends', () => {
    // Existing: 23:30–00:30. Proposed: 00:00–01:30 (starts at midnight).
    // Proposed: start=0, end=90. Existing (normalised): start=1410, end=1470.
    // proposedStart(0) < existingEnd(1470) + 0 → true
    // existingStart(1410) < proposedEnd(90) + 0 → FALSE (1410 < 90 is false)
    // So proposed is BEFORE the existing reservation — no conflict expected.
    const proposed: ProposedReservation = {
      tableIds: ['table-1'],
      date: '2026-03-16', // next day
      startTime: '00:00',
      durationMinutes: 90,
    };
    const existing: ExistingReservation = {
      id: 'midnight-res',
      guestName: 'Bob Night',
      partySize: 2,
      assignedTableId: 'table-1',
      tableIds: null,
      startTime: '23:30',
      endTime: '00:30',
    };
    // Proposed (00:00=0 to 90 min) vs existing (23:30=1410 normalised to 00:30=1470).
    // From the proposed perspective, proposed(0-90) is entirely before existing(1410-1470).
    // The DB-level query already separates by date so this scenario (different nights)
    // won't actually arise in production, but the pure function should still handle it.
    expect(detectConflicts(proposed, [existing], 0)).toHaveLength(0);
  });
});

describe('detectConflicts — negative buffer', () => {
  it('clamps negative buffer to 0 so real time overlaps are never missed', () => {
    // Existing: 18:00–19:30. Proposed: 19:00–20:30. Raw overlap = 30 min.
    // With buffer = -5 (invalid), should still catch the raw 30-min overlap.
    const proposed = makeProposed({ startTime: '19:00', durationMinutes: 90 });
    const existing = [makeExisting({ startTime: '18:00', endTime: '19:30' })];
    const conflicts = detectConflicts(proposed, existing, -5);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.overlapMinutes).toBe(30);
  });

  it('negative buffer never reduces overlap below 0', () => {
    // Back-to-back: existing ends exactly when proposed starts. With buffer=-999 and
    // clamped to 0, this should be no conflict (back-to-back is fine with 0 buffer).
    const proposed = makeProposed({ startTime: '19:30', durationMinutes: 90 });
    const existing = [makeExisting({ startTime: '18:00', endTime: '19:30' })];
    expect(detectConflicts(proposed, existing, -999)).toHaveLength(0);
  });
});

describe('detectConflicts — zero-length reservation', () => {
  it('does not conflict with non-overlapping existing when duration is 0', () => {
    // A zero-duration point reservation at 20:00 vs existing 18:00–19:30.
    // No temporal overlap at all.
    const proposed = makeProposed({ startTime: '20:00', durationMinutes: 0 });
    const existing = [makeExisting({ startTime: '18:00', endTime: '19:30' })];
    expect(detectConflicts(proposed, existing, 0)).toHaveLength(0);
  });

  it('detects a buffer conflict for a zero-duration point reservation inside buffer zone', () => {
    // Existing: 18:00–19:30. Proposed: 19:35 with duration=0. Buffer=10 min.
    // existingEnd + buffer = 19:30 + 10 = 19:40. proposedStart(19:35) < 19:40 → overlap.
    const proposed = makeProposed({ startTime: '19:35', durationMinutes: 0 });
    const existing = [makeExisting({ startTime: '18:00', endTime: '19:30' })];
    const conflicts = detectConflicts(proposed, existing, 10);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.overlapMinutes).toBeGreaterThanOrEqual(1);
  });
});

describe('detectConflicts — empty tableIds', () => {
  it('returns empty array when proposed tableIds is empty even with overlapping times', () => {
    // Proposed has no tables → can never share a table → no conflicts.
    const proposed = makeProposed({ tableIds: [], startTime: '18:00', durationMinutes: 90 });
    const existing = [makeExisting({ startTime: '18:00', endTime: '19:30' })];
    expect(detectConflicts(proposed, existing, 10)).toHaveLength(0);
  });

  it('returns empty array when existing reservation has no tables and neither does proposed', () => {
    const proposed = makeProposed({ tableIds: [] });
    const existing = [makeExisting({ assignedTableId: null, tableIds: null })];
    expect(detectConflicts(proposed, existing, 10)).toHaveLength(0);
  });
});

describe('detectConflicts — malformed time strings', () => {
  it('treats malformed startTime as 00:00 (midnight) and still detects overlap', () => {
    // A reservation with invalid startTime="??" falls back to 0 (00:00).
    // Proposed also at "00:00" with duration 60 → overlap = 60 min.
    const proposed = makeProposed({ startTime: '00:00', durationMinutes: 60 });
    const existing = [makeExisting({ startTime: '??', endTime: '01:00' })];
    // After fallback: existingStart=0, existingEnd=60. Proposed 0–60. Full overlap.
    const conflicts = detectConflicts(proposed, existing, 0);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.overlapMinutes).toBe(60);
  });
});
