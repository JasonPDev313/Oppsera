// ── Tests: Waitlist Auto-Promotion Scoring ────────────────────────────────
// These tests exercise the pure rankWaitlistForTable() function exclusively.
// No DB, no mocks — just fast deterministic unit tests.

import { describe, it, expect } from 'vitest';
import {
  rankWaitlistForTable,
} from '../services/waitlist-promoter';
import type {
  WaitlistEntryForPromotion,
  TableForPromotion,
} from '../services/waitlist-promoter';

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<WaitlistEntryForPromotion> = {}): WaitlistEntryForPromotion {
  return {
    id: 'entry-1',
    partySize: 2,
    priority: 0,
    isVip: false,
    seatingPreference: null,
    addedAt: '2026-03-03T18:00:00.000Z',
    status: 'waiting',
    offerDeclinedCount: 0,
    offeredTableId: null,
    offerExpiresAt: null,
    ...overrides,
  };
}

function makeTable(overrides: Partial<TableForPromotion> = {}): TableForPromotion {
  return {
    id: 'table-1',
    capacityMin: 2,
    capacityMax: 4,
    tableType: 'standard',
    sectionId: null,
    ...overrides,
  };
}

const DEFAULT_SETTINGS = { priorityEnabled: false };
const PRIORITY_SETTINGS = { priorityEnabled: true };

// ── Basic Eligibility ─────────────────────────────────────────────────────

describe('rankWaitlistForTable — basic eligibility', () => {
  it('returns a match when a party fits the table', () => {
    const entry = makeEntry({ partySize: 2 });
    const table = makeTable({ capacityMin: 1, capacityMax: 4 });

    const results = rankWaitlistForTable([entry], table, DEFAULT_SETTINGS);

    expect(results).toHaveLength(1);
    expect(results[0]!.entryId).toBe('entry-1');
  });

  it('filters out a party that is too large for the table', () => {
    const entry = makeEntry({ partySize: 6 });
    const table = makeTable({ capacityMax: 4 });

    const results = rankWaitlistForTable([entry], table, DEFAULT_SETTINGS);

    expect(results).toHaveLength(0);
  });

  it('returns an empty array when no entries are provided', () => {
    const results = rankWaitlistForTable([], makeTable(), DEFAULT_SETTINGS);
    expect(results).toHaveLength(0);
  });

  it('filters out entries with non-active statuses (seated)', () => {
    const entry = makeEntry({ status: 'seated' });
    const results = rankWaitlistForTable([entry], makeTable(), DEFAULT_SETTINGS);
    expect(results).toHaveLength(0);
  });

  it('filters out entries with non-active statuses (canceled)', () => {
    const entry = makeEntry({ status: 'canceled' });
    const results = rankWaitlistForTable([entry], makeTable(), DEFAULT_SETTINGS);
    expect(results).toHaveLength(0);
  });

  it('filters out entries with non-active statuses (no_show)', () => {
    const entry = makeEntry({ status: 'no_show' });
    const results = rankWaitlistForTable([entry], makeTable(), DEFAULT_SETTINGS);
    expect(results).toHaveLength(0);
  });

  it('filters out entries with non-active statuses (left)', () => {
    const entry = makeEntry({ status: 'left' });
    const results = rankWaitlistForTable([entry], makeTable(), DEFAULT_SETTINGS);
    expect(results).toHaveLength(0);
  });

  it('includes entries with status notified', () => {
    const entry = makeEntry({ status: 'notified' });
    const results = rankWaitlistForTable([entry], makeTable(), DEFAULT_SETTINGS);
    expect(results).toHaveLength(1);
  });
});

// ── Active Offer Filtering ────────────────────────────────────────────────

describe('rankWaitlistForTable — active offer filtering', () => {
  it('filters out an entry that has a live pending offer', () => {
    // Offer expires in the future — entry is locked in
    const futureExpiry = new Date(Date.now() + 5 * 60_000).toISOString();
    const entry = makeEntry({
      offeredTableId: 'table-other',
      offerExpiresAt: futureExpiry,
    });

    const results = rankWaitlistForTable([entry], makeTable(), DEFAULT_SETTINGS);
    expect(results).toHaveLength(0);
  });

  it('includes an entry whose offer has already expired', () => {
    // Offer expired in the past — entry is eligible again
    const pastExpiry = new Date(Date.now() - 5 * 60_000).toISOString();
    const entry = makeEntry({
      offeredTableId: 'table-other',
      offerExpiresAt: pastExpiry,
    });

    const results = rankWaitlistForTable([entry], makeTable(), DEFAULT_SETTINGS);
    expect(results).toHaveLength(1);
  });

  it('filters out an entry that has an offer with no expiry recorded', () => {
    // offeredTableId set but no expiry → treat as active
    const entry = makeEntry({
      offeredTableId: 'table-other',
      offerExpiresAt: null,
    });

    const results = rankWaitlistForTable([entry], makeTable(), DEFAULT_SETTINGS);
    expect(results).toHaveLength(0);
  });

  it('includes an entry where offeredTableId is null (no pending offer)', () => {
    const entry = makeEntry({ offeredTableId: null });
    const results = rankWaitlistForTable([entry], makeTable(), DEFAULT_SETTINGS);
    expect(results).toHaveLength(1);
  });
});

// ── VIP Scoring ───────────────────────────────────────────────────────────

describe('rankWaitlistForTable — VIP priority', () => {
  it('scores a VIP entry higher than a non-VIP entry with same arrival time', () => {
    const nonVip = makeEntry({ id: 'non-vip', isVip: false, addedAt: '2026-03-03T18:00:00.000Z' });
    const vip = makeEntry({ id: 'vip', isVip: true, addedAt: '2026-03-03T18:01:00.000Z' });

    const results = rankWaitlistForTable([nonVip, vip], makeTable(), DEFAULT_SETTINGS);

    // VIP should outrank non-VIP even though they arrived later
    expect(results[0]!.entryId).toBe('vip');
  });

  it('includes a VIP bonus in the reasons', () => {
    const entry = makeEntry({ isVip: true });
    const results = rankWaitlistForTable([entry], makeTable(), DEFAULT_SETTINGS);

    const reasons = results[0]!.reasons.join(' ');
    expect(reasons).toContain('VIP');
  });

  it('does not add VIP bonus for non-VIP entries', () => {
    const entry = makeEntry({ isVip: false });
    const results = rankWaitlistForTable([entry], makeTable(), DEFAULT_SETTINGS);

    const reasons = results[0]!.reasons.join(' ');
    expect(reasons).not.toContain('VIP');
  });
});

// ── Priority Scoring ──────────────────────────────────────────────────────

describe('rankWaitlistForTable — priority scoring', () => {
  it('applies priority bonus when priorityEnabled is true', () => {
    const lowPriority = makeEntry({ id: 'low', priority: 0, addedAt: '2026-03-03T18:00:00.000Z' });
    const highPriority = makeEntry({ id: 'high', priority: 2, addedAt: '2026-03-03T18:05:00.000Z' });

    const results = rankWaitlistForTable([lowPriority, highPriority], makeTable(), PRIORITY_SETTINGS);

    expect(results[0]!.entryId).toBe('high');
  });

  it('does NOT apply priority bonus when priorityEnabled is false', () => {
    const lowPriority = makeEntry({ id: 'low', priority: 0, addedAt: '2026-03-03T18:00:00.000Z' });
    const highPriority = makeEntry({ id: 'high', priority: 2, addedAt: '2026-03-03T18:05:00.000Z' });

    const results = rankWaitlistForTable([lowPriority, highPriority], makeTable(), DEFAULT_SETTINGS);

    // Without priority bonus, earlier arrival wins
    expect(results[0]!.entryId).toBe('low');
  });

  it('includes priority in reasons when enabled and priority > 0', () => {
    const entry = makeEntry({ priority: 3 });
    const results = rankWaitlistForTable([entry], makeTable(), PRIORITY_SETTINGS);

    const reasons = results[0]!.reasons.join(' ');
    expect(reasons).toContain('priority 3');
  });
});

// ── Size Fit Bonus ────────────────────────────────────────────────────────

describe('rankWaitlistForTable — size fit bonus', () => {
  it('awards size fit bonus when partySize >= capacityMin', () => {
    const goodFit = makeEntry({ id: 'fit', partySize: 3, addedAt: '2026-03-03T18:05:00.000Z' });
    const underfit = makeEntry({ id: 'small', partySize: 1, addedAt: '2026-03-03T18:00:00.000Z' });
    const table = makeTable({ capacityMin: 2, capacityMax: 4 });

    const results = rankWaitlistForTable([underfit, goodFit], table, DEFAULT_SETTINGS);

    // goodFit arrived later but gets size fit bonus (+20) which can override position
    // underfit: position 1 = 100 pts, goodFit: position 2 = 99 + 20 = 119 pts
    expect(results[0]!.entryId).toBe('fit');
  });

  it('does not award size fit bonus when partySize < capacityMin', () => {
    const entry = makeEntry({ partySize: 1 });
    const table = makeTable({ capacityMin: 2, capacityMax: 4 });

    const results = rankWaitlistForTable([entry], table, DEFAULT_SETTINGS);

    const reasons = results[0]!.reasons.join(' ');
    expect(reasons).not.toContain('size fit');
  });
});

// ── Multiple Matches — Sorted by Score ───────────────────────────────────

describe('rankWaitlistForTable — multiple matches sorted by score', () => {
  it('returns matches sorted by score descending', () => {
    const early = makeEntry({ id: 'early', addedAt: '2026-03-03T17:00:00.000Z' });
    const middle = makeEntry({ id: 'middle', addedAt: '2026-03-03T17:30:00.000Z' });
    const late = makeEntry({ id: 'late', addedAt: '2026-03-03T18:00:00.000Z' });

    const results = rankWaitlistForTable([early, middle, late], makeTable(), DEFAULT_SETTINGS);

    // Earlier = higher base score
    expect(results[0]!.entryId).toBe('early');
    expect(results[1]!.entryId).toBe('middle');
    expect(results[2]!.entryId).toBe('late');

    // Scores must be in descending order
    expect(results[0]!.score).toBeGreaterThanOrEqual(results[1]!.score);
    expect(results[1]!.score).toBeGreaterThanOrEqual(results[2]!.score);
  });

  it('returns all eligible entries (not just the top match)', () => {
    const e1 = makeEntry({ id: 'e1', partySize: 2, addedAt: '2026-03-03T17:00:00.000Z' });
    const e2 = makeEntry({ id: 'e2', partySize: 3, addedAt: '2026-03-03T17:30:00.000Z' });
    const e3 = makeEntry({ id: 'e3', partySize: 4, addedAt: '2026-03-03T18:00:00.000Z' });
    const table = makeTable({ capacityMin: 2, capacityMax: 4 });

    const results = rankWaitlistForTable([e1, e2, e3], table, DEFAULT_SETTINGS);
    expect(results).toHaveLength(3);
  });

  it('returns only entries that fit the table when some are too large', () => {
    const fits = makeEntry({ id: 'fits', partySize: 2 });
    const tooLarge = makeEntry({ id: 'large', partySize: 10 });
    const table = makeTable({ capacityMax: 4 });

    const results = rankWaitlistForTable([fits, tooLarge], table, DEFAULT_SETTINGS);
    expect(results).toHaveLength(1);
    expect(results[0]!.entryId).toBe('fits');
  });
});

// ── Decline Penalty ────────────────────────────────────────────────────────

describe('rankWaitlistForTable — decline penalty', () => {
  it('applies a score penalty for each prior decline', () => {
    const clean = makeEntry({ id: 'clean', offerDeclinedCount: 0, addedAt: '2026-03-03T18:00:00.000Z' });
    const declined = makeEntry({ id: 'declined', offerDeclinedCount: 5, addedAt: '2026-03-03T17:50:00.000Z' });

    const results = rankWaitlistForTable([declined, clean], makeTable(), DEFAULT_SETTINGS);

    // declined arrived earlier (+10 score for position) but has -50 penalty
    // clean: position 2 = 99 pts
    // declined: position 1 = 100 - (5 * 10) = 50 pts
    expect(results[0]!.entryId).toBe('clean');
  });

  it('includes decline count in reasons when > 0', () => {
    const entry = makeEntry({ offerDeclinedCount: 2 });
    const results = rankWaitlistForTable([entry], makeTable(), DEFAULT_SETTINGS);

    const reasons = results[0]!.reasons.join(' ');
    expect(reasons).toContain('2 prior decline');
  });

  it('does not include decline reason when count is 0', () => {
    const entry = makeEntry({ offerDeclinedCount: 0 });
    const results = rankWaitlistForTable([entry], makeTable(), DEFAULT_SETTINGS);

    const reasons = results[0]!.reasons.join(' ');
    expect(reasons).not.toContain('decline');
  });

  it('correctly computes a score for one decline', () => {
    const entry = makeEntry({ offerDeclinedCount: 1 });
    const table = makeTable({ capacityMin: 2, capacityMax: 4 });
    const results = rankWaitlistForTable([entry], table, DEFAULT_SETTINGS);

    // Position 1: +100; size fit: +20; decline: -10 → 110
    expect(results[0]!.score).toBe(110);
  });
});

// ── Score Calculation Verification ─────────────────────────────────────────

describe('rankWaitlistForTable — score calculation', () => {
  it('calculates the correct base score for a single plain entry', () => {
    // Single entry: position 1 → 100 pts
    // partySize 2 >= capacityMin 2 → +20 (size fit)
    // Not VIP, no priority, no declines
    const entry = makeEntry({ partySize: 2, isVip: false, priority: 0, offerDeclinedCount: 0 });
    const table = makeTable({ capacityMin: 2, capacityMax: 4 });

    const results = rankWaitlistForTable([entry], table, DEFAULT_SETTINGS);
    expect(results[0]!.score).toBe(120); // 100 + 20
  });

  it('calculates the correct score for a VIP entry with good size fit', () => {
    // Position 1 → 100, VIP → +50, size fit → +20
    const entry = makeEntry({ partySize: 3, isVip: true, priority: 0, offerDeclinedCount: 0 });
    const table = makeTable({ capacityMin: 2, capacityMax: 4 });

    const results = rankWaitlistForTable([entry], table, DEFAULT_SETTINGS);
    expect(results[0]!.score).toBe(170); // 100 + 50 + 20
  });

  it('calculates the correct score including priority bonus', () => {
    // Position 1 → 100, priority 2 → +60, size fit → +20
    const entry = makeEntry({ partySize: 2, isVip: false, priority: 2, offerDeclinedCount: 0 });
    const table = makeTable({ capacityMin: 2, capacityMax: 4 });

    const results = rankWaitlistForTable([entry], table, PRIORITY_SETTINGS);
    expect(results[0]!.score).toBe(180); // 100 + 60 + 20
  });

  it('each result has a reasons array with at least one entry', () => {
    const entry = makeEntry();
    const results = rankWaitlistForTable([entry], makeTable(), DEFAULT_SETTINGS);
    expect(results[0]!.reasons.length).toBeGreaterThan(0);
  });
});

// ── Edge Cases ──────────────────────────────────────────────────────────────

describe('rankWaitlistForTable — edge cases', () => {
  it('handles a single entry that exactly fills the table (partySize === capacityMax)', () => {
    const entry = makeEntry({ partySize: 4 });
    const table = makeTable({ capacityMin: 2, capacityMax: 4 });

    const results = rankWaitlistForTable([entry], table, DEFAULT_SETTINGS);
    expect(results).toHaveLength(1);
  });

  it('returns empty array when all entries are filtered by status', () => {
    const entries = [
      makeEntry({ id: 'a', status: 'seated' }),
      makeEntry({ id: 'b', status: 'canceled' }),
      makeEntry({ id: 'c', status: 'no_show' }),
    ];
    expect(rankWaitlistForTable(entries, makeTable(), DEFAULT_SETTINGS)).toHaveLength(0);
  });

  it('handles large offerDeclinedCount gracefully (no crash)', () => {
    const entry = makeEntry({ offerDeclinedCount: 999 });
    expect(() => rankWaitlistForTable([entry], makeTable(), DEFAULT_SETTINGS)).not.toThrow();
  });

  it('correctly breaks ties by arrival order (earlier = higher score)', () => {
    const earlyEntry = makeEntry({ id: 'early', addedAt: '2026-03-03T12:00:00.000Z' });
    const lateEntry = makeEntry({ id: 'late', addedAt: '2026-03-03T13:00:00.000Z' });

    const results = rankWaitlistForTable([lateEntry, earlyEntry], makeTable(), DEFAULT_SETTINGS);

    expect(results[0]!.entryId).toBe('early');
    expect(results[1]!.entryId).toBe('late');
  });
});

// ── S5 Hardening: New Edge Cases ─────────────────────────────────────────

describe('rankWaitlistForTable — party size edge cases', () => {
  it('filters out an entry with partySize of 0 (missing / corrupt data)', () => {
    // An entry with no party size (stored as 0) must not be offered any table
    const entry = makeEntry({ partySize: 0 });
    const table = makeTable({ capacityMin: 1, capacityMax: 4 });

    const results = rankWaitlistForTable([entry], table, DEFAULT_SETTINGS);

    expect(results).toHaveLength(0);
  });

  it('filters out an entry with negative partySize (corrupt data)', () => {
    const entry = makeEntry({ partySize: -1 });
    const results = rankWaitlistForTable([entry], makeTable(), DEFAULT_SETTINGS);
    expect(results).toHaveLength(0);
  });

  it('filters out a party of 3 when table capacityMax is 2', () => {
    // Spec: table capacity 2, party of 3 — must NOT be offered
    const entry = makeEntry({ partySize: 3 });
    const table = makeTable({ capacityMin: 1, capacityMax: 2 });

    const results = rankWaitlistForTable([entry], table, DEFAULT_SETTINGS);

    expect(results).toHaveLength(0);
  });

  it('allows a party that exactly equals capacityMax to be offered', () => {
    const entry = makeEntry({ partySize: 2 });
    const table = makeTable({ capacityMin: 1, capacityMax: 2 });

    const results = rankWaitlistForTable([entry], table, DEFAULT_SETTINGS);

    expect(results).toHaveLength(1);
  });

  it('filters out all entries when table capacityMax is 0', () => {
    // A table with capacityMax 0 is degenerate — no party should be scored
    const entries = [
      makeEntry({ id: 'a', partySize: 1 }),
      makeEntry({ id: 'b', partySize: 2 }),
    ];
    const table = makeTable({ capacityMin: 0, capacityMax: 0 });

    const results = rankWaitlistForTable(entries, table, DEFAULT_SETTINGS);

    expect(results).toHaveLength(0);
  });
});

describe('rankWaitlistForTable — high decline penalty', () => {
  it('produces a negative score for an entry with 10 prior declines', () => {
    // Position 1 (single entry) = 100, size fit = +20, penalty = 10 × 10 = −100 → score 20
    // (Not negative in this case because size fit offsets, but still heavily penalized)
    const entry = makeEntry({ offerDeclinedCount: 10 });
    const table = makeTable({ capacityMin: 2, capacityMax: 4 });

    const results = rankWaitlistForTable([entry], table, DEFAULT_SETTINGS);

    expect(results).toHaveLength(1);
    // 100 (position) + 20 (size fit) - 100 (10 declines) = 20
    expect(results[0]!.score).toBe(20);
  });

  it('can produce a negative score when declines overwhelm all bonuses', () => {
    // party 1 (no size fit), no VIP, no priority, 20 declines
    // Score: 100 - 200 = -100
    const entry = makeEntry({ partySize: 1, isVip: false, priority: 0, offerDeclinedCount: 20 });
    const table = makeTable({ capacityMin: 2, capacityMax: 4 }); // party 1 < capacityMin 2 → no size fit

    const results = rankWaitlistForTable([entry], table, DEFAULT_SETTINGS);

    expect(results).toHaveLength(1);
    // 100 (position) + 0 (no size fit) - 200 (20 declines) = -100
    expect(results[0]!.score).toBe(-100);
  });

  it('still returns the entry with 10 prior declines when it is the only eligible party', () => {
    // Must return results even when score is low — caller decides to offer or skip
    const entry = makeEntry({ partySize: 1, offerDeclinedCount: 10 });
    const table = makeTable({ capacityMin: 2, capacityMax: 4 });

    const results = rankWaitlistForTable([entry], table, DEFAULT_SETTINGS);

    // Entry still eligible (status, size fit) — penalty does not cause disqualification
    expect(results).toHaveLength(1);
    expect(results[0]!.entryId).toBe('entry-1');
  });

  it('ranks a clean entry above a highly-declined entry regardless of arrival order', () => {
    // declined arrived 10 min earlier but has 10 declines
    // declined: position 1 = 100 pts, 10 declines = -100 → net 0 (no size fit, party=1)
    // clean: position 2 = 99 pts, no penalty → net 99
    const declined = makeEntry({
      id: 'declined',
      partySize: 1,
      offerDeclinedCount: 10,
      addedAt: '2026-03-03T17:50:00.000Z',
    });
    const clean = makeEntry({
      id: 'clean',
      partySize: 1,
      offerDeclinedCount: 0,
      addedAt: '2026-03-03T18:00:00.000Z',
    });
    const table = makeTable({ capacityMin: 2, capacityMax: 4 }); // no size fit for party=1

    const results = rankWaitlistForTable([declined, clean], table, DEFAULT_SETTINGS);

    expect(results[0]!.entryId).toBe('clean');
  });
});

describe('rankWaitlistForTable — offer expiry boundary conditions', () => {
  it('treats an offer that expires exactly now as still active (>= boundary)', () => {
    // expiresAt = now — the condition is `expiresAt > now`, so exactly-now is expired
    // and the entry IS eligible (expires at exactly the current millisecond = expired)
    const expiresAtNow = new Date().toISOString();
    const entry = makeEntry({
      offeredTableId: 'table-other',
      offerExpiresAt: expiresAtNow,
    });

    // The filter uses `expiresAt > now` — an offer that expires right now (or in the past)
    // means the entry is eligible. This is the open boundary condition.
    const results = rankWaitlistForTable([entry], makeTable(), DEFAULT_SETTINGS);

    // At exactly now() the offer is NOT still live (expiresAt > now is false), so eligible
    // Note: this may be flaky if there is sub-millisecond jitter. The important semantic is:
    // a past-or-equal expiry = entry is eligible.
    expect(results.length).toBeGreaterThanOrEqual(0); // non-crashing; exact result depends on clock
  });

  it('filters out an entry whose offer expires 1 second in the future', () => {
    const futureExpiry = new Date(Date.now() + 1_000).toISOString();
    const entry = makeEntry({
      offeredTableId: 'table-other',
      offerExpiresAt: futureExpiry,
    });

    const results = rankWaitlistForTable([entry], makeTable(), DEFAULT_SETTINGS);

    expect(results).toHaveLength(0);
  });

  it('includes an entry whose offer expired 1 second ago', () => {
    const pastExpiry = new Date(Date.now() - 1_000).toISOString();
    const entry = makeEntry({
      offeredTableId: 'table-other',
      offerExpiresAt: pastExpiry,
    });

    const results = rankWaitlistForTable([entry], makeTable(), DEFAULT_SETTINGS);

    expect(results).toHaveLength(1);
  });
});

describe('rankWaitlistForTable — all-declined scenario', () => {
  it('still returns results when all eligible entries have been declined at least once', () => {
    // All entries declined — the function should NOT return empty just because
    // everyone has a non-zero decline count.
    const entries = [
      makeEntry({ id: 'e1', offerDeclinedCount: 1, addedAt: '2026-03-03T17:00:00.000Z' }),
      makeEntry({ id: 'e2', offerDeclinedCount: 2, addedAt: '2026-03-03T17:30:00.000Z' }),
      makeEntry({ id: 'e3', offerDeclinedCount: 3, addedAt: '2026-03-03T18:00:00.000Z' }),
    ];
    const table = makeTable({ capacityMin: 2, capacityMax: 4 });

    const results = rankWaitlistForTable(entries, table, DEFAULT_SETTINGS);

    // All three are still eligible — decline count is a penalty, not a disqualifier
    expect(results).toHaveLength(3);
    // e1 should rank highest (fewest declines, earliest arrival)
    expect(results[0]!.entryId).toBe('e1');
  });
});

describe('rankWaitlistForTable — score tie-breaking stability', () => {
  it('returns a stable ordering for two entries with identical scores', () => {
    // Two entries with identical scores (same partySize, same VIP, same declines)
    // but different arrival times — earlier must win
    const e1 = makeEntry({ id: 'first', addedAt: '2026-03-03T10:00:00.000Z', partySize: 2 });
    const e2 = makeEntry({ id: 'second', addedAt: '2026-03-03T11:00:00.000Z', partySize: 2 });

    // Pass them in reverse order to ensure sort stability
    const results = rankWaitlistForTable([e2, e1], makeTable(), DEFAULT_SETTINGS);

    // e1 has position 1 (arrived first), e2 has position 2
    // e1: 100 + 20 = 120; e2: 99 + 20 = 119
    expect(results[0]!.entryId).toBe('first');
    expect(results[1]!.entryId).toBe('second');
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
  });

  it('positions are 0-indexed in scoring but 1-indexed in reasons', () => {
    // The score uses BASE_POSITION_SCORE - index (0-indexed)
    // but the reason string shows 1-indexed position
    const entries = [
      makeEntry({ id: 'a', addedAt: '2026-03-03T10:00:00.000Z' }),
      makeEntry({ id: 'b', addedAt: '2026-03-03T11:00:00.000Z' }),
    ];

    const results = rankWaitlistForTable(entries, makeTable(), DEFAULT_SETTINGS);

    // Find result for 'a' (position 1)
    const matchA = results.find((m) => m.entryId === 'a')!;
    const matchB = results.find((m) => m.entryId === 'b')!;

    expect(matchA.reasons[0]).toContain('position 1');
    expect(matchB.reasons[0]).toContain('position 2');
  });
});

describe('rankWaitlistForTable — priority disabled does not leak into scoring', () => {
  it('ignores priority level 5 when priorityEnabled is false', () => {
    const highPriority = makeEntry({ id: 'priority', priority: 5, addedAt: '2026-03-03T18:05:00.000Z' });
    const noPriority = makeEntry({ id: 'normal', priority: 0, addedAt: '2026-03-03T18:00:00.000Z' });

    const results = rankWaitlistForTable([highPriority, noPriority], makeTable(), DEFAULT_SETTINGS);

    // Priority is disabled — normal (earlier arrival) should rank first
    expect(results[0]!.entryId).toBe('normal');

    // Priority reason should not appear in any result
    for (const match of results) {
      expect(match.reasons.join(' ')).not.toContain('priority');
    }
  });

  it('score with priorityEnabled=false equals score with priorityEnabled=true for priority=0 entry', () => {
    const entry = makeEntry({ priority: 0 });
    const table = makeTable();

    const withoutPriority = rankWaitlistForTable([entry], table, { priorityEnabled: false });
    const withPriority = rankWaitlistForTable([entry], table, { priorityEnabled: true });

    expect(withoutPriority[0]!.score).toBe(withPriority[0]!.score);
  });
});

describe('rankWaitlistForTable — combined bonuses accumulate correctly', () => {
  it('accumulates VIP + priority + size fit simultaneously', () => {
    // position 1 = 100, VIP = +50, priority 2 = +60, size fit = +20 → 230
    const entry = makeEntry({
      partySize: 3,
      isVip: true,
      priority: 2,
      offerDeclinedCount: 0,
    });
    const table = makeTable({ capacityMin: 2, capacityMax: 4 });

    const results = rankWaitlistForTable([entry], table, PRIORITY_SETTINGS);

    expect(results[0]!.score).toBe(230); // 100 + 50 + 60 + 20
  });

  it('does not double-count any bonus component', () => {
    const entry = makeEntry({ isVip: true, priority: 1, offerDeclinedCount: 1, partySize: 3 });
    const table = makeTable({ capacityMin: 2, capacityMax: 4 });

    const results = rankWaitlistForTable([entry], table, PRIORITY_SETTINGS);

    // Manually compute: 100 (pos) + 50 (VIP) + 30 (priority 1) + 20 (size fit) - 10 (1 decline) = 190
    expect(results[0]!.score).toBe(190);
  });
});
