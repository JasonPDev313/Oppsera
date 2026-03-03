import { describe, it, expect } from 'vitest';
import {
  evaluatePacing,
  computePacingAvailability,
  type PacingRule,
} from '../services/pacing-evaluator';

// ── Test fixtures ─────────────────────────────────────────────────

function makeRule(overrides: Partial<PacingRule> = {}): PacingRule {
  return {
    id: 'rule-1',
    mealPeriod: null,
    dayOfWeek: null,
    intervalStartTime: null,
    intervalEndTime: null,
    maxCovers: 20,
    maxReservations: null,
    minPartySize: null,
    priority: 0,
    isActive: true,
    ...overrides,
  };
}

// ── evaluatePacing ────────────────────────────────────────────────

describe('evaluatePacing', () => {
  describe('no matching rules', () => {
    it('allows booking when no rules are defined', () => {
      const result = evaluatePacing([], [], {
        time: '18:00',
        partySize: 4,
        mealPeriod: 'dinner',
        dayOfWeek: 5,
      });
      expect(result.allowed).toBe(true);
      expect(result.remainingCapacity).toBe(Infinity);
      expect(result.appliedRule).toBeNull();
    });

    it('allows booking when no rules match due to meal period mismatch', () => {
      const rule = makeRule({ mealPeriod: 'lunch', maxCovers: 10 });
      const result = evaluatePacing([rule], [], {
        time: '18:00',
        partySize: 4,
        mealPeriod: 'dinner',
        dayOfWeek: 1,
      });
      expect(result.allowed).toBe(true);
      expect(result.appliedRule).toBeNull();
    });

    it('allows booking when no rules match due to day-of-week mismatch', () => {
      const rule = makeRule({ dayOfWeek: 0, maxCovers: 10 }); // Sunday only
      const result = evaluatePacing([rule], [], {
        time: '12:00',
        partySize: 2,
        mealPeriod: 'lunch',
        dayOfWeek: 3, // Wednesday
      });
      expect(result.allowed).toBe(true);
      expect(result.appliedRule).toBeNull();
    });

    it('allows booking when no rules match due to time window exclusion', () => {
      const rule = makeRule({
        intervalStartTime: '12:00',
        intervalEndTime: '14:00',
        maxCovers: 10,
      });
      const result = evaluatePacing([rule], [], {
        time: '18:00', // outside window
        partySize: 2,
        mealPeriod: 'dinner',
        dayOfWeek: 1,
      });
      expect(result.allowed).toBe(true);
      expect(result.appliedRule).toBeNull();
    });
  });

  describe('within limits', () => {
    it('allows booking when covers are below limit', () => {
      const rule = makeRule({ maxCovers: 20, intervalStartTime: '18:00', intervalEndTime: '20:00' });
      const existing = [
        { time: '18:00', covers: 4 },
        { time: '18:30', covers: 6 },
      ];
      const result = evaluatePacing([rule], existing, {
        time: '19:00',
        partySize: 4,
        mealPeriod: 'dinner',
        dayOfWeek: 5,
      });
      expect(result.allowed).toBe(true);
      expect(result.remainingCapacity).toBe(10); // 20 - (4 + 6) = 10
      expect(result.appliedRule?.id).toBe('rule-1');
      expect(result.reason).toBeUndefined();
    });

    it('allows booking exactly at the limit boundary', () => {
      const rule = makeRule({ maxCovers: 10 });
      const existing = [{ time: '18:00', covers: 6 }];
      const result = evaluatePacing([rule], existing, {
        time: '18:30',
        partySize: 4, // 6 + 4 = 10 (exactly at limit)
        mealPeriod: 'dinner',
        dayOfWeek: 5,
      });
      expect(result.allowed).toBe(true);
      expect(result.remainingCapacity).toBe(4);
    });

    it('returns correct remainingCapacity when no existing covers', () => {
      const rule = makeRule({ maxCovers: 30 });
      const result = evaluatePacing([rule], [], {
        time: '12:00',
        partySize: 5,
        mealPeriod: 'lunch',
        dayOfWeek: 2,
      });
      expect(result.allowed).toBe(true);
      expect(result.remainingCapacity).toBe(30);
    });
  });

  describe('at capacity — booking rejected', () => {
    it('rejects booking when covers would exceed limit', () => {
      const rule = makeRule({ maxCovers: 10, intervalStartTime: '18:00', intervalEndTime: '20:00' });
      const existing = [{ time: '18:00', covers: 8 }];
      const result = evaluatePacing([rule], existing, {
        time: '18:30',
        partySize: 4, // 8 + 4 = 12 > 10
        mealPeriod: 'dinner',
        dayOfWeek: 5,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('12/10');
      expect(result.appliedRule?.id).toBe('rule-1');
    });

    it('provides correct pacing limit message', () => {
      const rule = makeRule({ maxCovers: 5, id: 'strict-rule' });
      const existing = [{ time: '12:00', covers: 5 }];
      const result = evaluatePacing([rule], existing, {
        time: '12:15',
        partySize: 2,
        mealPeriod: 'lunch',
        dayOfWeek: 1,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Pacing limit reached: 7/5 covers in this interval');
    });

    it('rejects when a single large party exceeds remaining capacity', () => {
      const rule = makeRule({ maxCovers: 10 });
      const existing = [{ time: '18:00', covers: 8 }];
      const result = evaluatePacing([rule], existing, {
        time: '18:00',
        partySize: 3,
        mealPeriod: 'dinner',
        dayOfWeek: 3,
      });
      expect(result.allowed).toBe(false);
      expect(result.remainingCapacity).toBe(2);
    });
  });

  describe('meal period scoping', () => {
    it('applies rule matching the exact meal period', () => {
      const dinnerRule = makeRule({ id: 'dinner', mealPeriod: 'dinner', maxCovers: 15 });
      const lunchRule = makeRule({ id: 'lunch', mealPeriod: 'lunch', maxCovers: 5 });
      const existing = [{ time: '12:00', covers: 4 }];
      const result = evaluatePacing([dinnerRule, lunchRule], existing, {
        time: '12:00',
        partySize: 2,
        mealPeriod: 'lunch',
        dayOfWeek: 2,
      });
      // lunchRule matches; 4 + 2 = 6 > 5
      expect(result.allowed).toBe(false);
      expect(result.appliedRule?.id).toBe('lunch');
    });

    it('applies wildcard (null) meal period rule when no specific rule matches', () => {
      const wildcard = makeRule({ id: 'wildcard', mealPeriod: null, maxCovers: 50 });
      const result = evaluatePacing([wildcard], [], {
        time: '20:00',
        partySize: 5,
        mealPeriod: 'dinner',
        dayOfWeek: 6,
      });
      expect(result.allowed).toBe(true);
      expect(result.appliedRule?.id).toBe('wildcard');
    });

    it('ignores rules with non-matching meal period', () => {
      const brunchRule = makeRule({ id: 'brunch-only', mealPeriod: 'brunch', maxCovers: 5 });
      const existing = Array.from({ length: 10 }, () => ({ time: '09:00', covers: 1 }));
      const result = evaluatePacing([brunchRule], existing, {
        time: '09:00',
        partySize: 2,
        mealPeriod: 'breakfast',
        dayOfWeek: 0,
      });
      // brunchRule doesn't match breakfast, so no rule applies
      expect(result.allowed).toBe(true);
      expect(result.appliedRule).toBeNull();
    });
  });

  describe('day-of-week scoping', () => {
    it('applies rule for exact matching day of week', () => {
      const fridayRule = makeRule({ id: 'friday', dayOfWeek: 5, maxCovers: 8 });
      const existing = [{ time: '18:00', covers: 6 }];
      const result = evaluatePacing([fridayRule], existing, {
        time: '18:00',
        partySize: 4, // 6 + 4 = 10 > 8
        mealPeriod: 'dinner',
        dayOfWeek: 5, // Friday
      });
      expect(result.allowed).toBe(false);
      expect(result.appliedRule?.id).toBe('friday');
    });

    it('does not apply rule when day of week does not match', () => {
      const fridayRule = makeRule({ id: 'friday', dayOfWeek: 5, maxCovers: 8 });
      const existing = [{ time: '18:00', covers: 7 }];
      const result = evaluatePacing([fridayRule], existing, {
        time: '18:00',
        partySize: 4,
        mealPeriod: 'dinner',
        dayOfWeek: 3, // Wednesday — no match
      });
      expect(result.allowed).toBe(true);
      expect(result.appliedRule).toBeNull();
    });

    it('applies wildcard day-of-week rule to any day', () => {
      const anydayRule = makeRule({ id: 'anyday', dayOfWeek: null, maxCovers: 5 });
      for (const dow of [0, 1, 2, 3, 4, 5, 6]) {
        const result = evaluatePacing([anydayRule], [], {
          time: '12:00',
          partySize: 3,
          mealPeriod: 'lunch',
          dayOfWeek: dow,
        });
        expect(result.allowed).toBe(true);
        expect(result.appliedRule?.id).toBe('anyday');
      }
    });
  });

  describe('priority resolution', () => {
    it('applies highest priority rule when multiple rules match', () => {
      const lowPriority = makeRule({ id: 'low', priority: 0, maxCovers: 100 });
      const highPriority = makeRule({ id: 'high', priority: 10, maxCovers: 5 });
      const existing = [{ time: '18:00', covers: 4 }];
      const result = evaluatePacing([lowPriority, highPriority], existing, {
        time: '18:00',
        partySize: 3, // 4 + 3 = 7 > 5 (high) but ≤ 100 (low)
        mealPeriod: 'dinner',
        dayOfWeek: 5,
      });
      expect(result.allowed).toBe(false); // high-priority rule (maxCovers=5) wins
      expect(result.appliedRule?.id).toBe('high');
    });

    it('falls back to lower priority rule when no higher one matches', () => {
      const mondayHighPriority = makeRule({
        id: 'monday-strict', priority: 10, dayOfWeek: 1, maxCovers: 3,
      });
      const wildcard = makeRule({ id: 'wildcard', priority: 0, maxCovers: 50 });
      // Testing on a Wednesday — mondayHighPriority doesn't match
      const result = evaluatePacing([mondayHighPriority, wildcard], [], {
        time: '12:00',
        partySize: 5,
        mealPeriod: 'lunch',
        dayOfWeek: 3, // Wednesday
      });
      expect(result.allowed).toBe(true);
      expect(result.appliedRule?.id).toBe('wildcard');
    });

    it('handles equal priority by returning first in sorted order', () => {
      const ruleA = makeRule({ id: 'a', priority: 5, maxCovers: 10 });
      const ruleB = makeRule({ id: 'b', priority: 5, maxCovers: 20 });
      const result = evaluatePacing([ruleA, ruleB], [], {
        time: '12:00',
        partySize: 2,
        mealPeriod: 'lunch',
        dayOfWeek: 2,
      });
      // Both have the same priority; one of them is applied
      expect(result.appliedRule).not.toBeNull();
      expect(['a', 'b']).toContain(result.appliedRule?.id);
    });
  });

  describe('inactive rules', () => {
    it('ignores inactive rules entirely', () => {
      const inactive = makeRule({ id: 'inactive', isActive: false, maxCovers: 1 });
      const existing = [{ time: '18:00', covers: 0 }];
      const result = evaluatePacing([inactive], existing, {
        time: '18:00',
        partySize: 2,
        mealPeriod: 'dinner',
        dayOfWeek: 5,
      });
      expect(result.allowed).toBe(true); // inactive rule not applied
      expect(result.appliedRule).toBeNull();
    });

    it('uses active rule when both active and inactive rules exist', () => {
      const inactive = makeRule({ id: 'inactive', isActive: false, maxCovers: 100 });
      const active = makeRule({ id: 'active', isActive: true, maxCovers: 5, priority: 0 });
      const existing = [{ time: '12:00', covers: 4 }];
      const result = evaluatePacing([inactive, active], existing, {
        time: '12:00',
        partySize: 3, // 4 + 3 = 7 > 5
        mealPeriod: 'lunch',
        dayOfWeek: 2,
      });
      expect(result.allowed).toBe(false);
      expect(result.appliedRule?.id).toBe('active');
    });
  });

  describe('time window cover counting', () => {
    it('only counts covers within the rule time window', () => {
      const rule = makeRule({
        intervalStartTime: '18:00',
        intervalEndTime: '19:00',
        maxCovers: 10,
      });
      const existing = [
        { time: '17:30', covers: 8 }, // outside window — not counted
        { time: '18:15', covers: 3 }, // inside window
        { time: '19:30', covers: 5 }, // outside window — not counted
      ];
      const result = evaluatePacing([rule], existing, {
        time: '18:30',
        partySize: 4, // only 3 existing in-window; 3+4=7 ≤ 10
        mealPeriod: 'dinner',
        dayOfWeek: 5,
      });
      expect(result.allowed).toBe(true);
      expect(result.remainingCapacity).toBe(7); // 10 - 3
    });

    it('counts all covers when rule has no time window bounds', () => {
      const rule = makeRule({ maxCovers: 15 }); // null start/end = unbounded
      const existing = [
        { time: '10:00', covers: 5 },
        { time: '14:00', covers: 5 },
        { time: '20:00', covers: 5 },
      ];
      const result = evaluatePacing([rule], existing, {
        time: '12:00',
        partySize: 2, // 15 + 2 = 17 > 15
        mealPeriod: 'lunch',
        dayOfWeek: 2,
      });
      expect(result.allowed).toBe(false);
      expect(result.remainingCapacity).toBe(0);
    });
  });

  describe('minPartySize filtering', () => {
    it('does not apply rule when party is below minPartySize', () => {
      const rule = makeRule({ id: 'large-party', minPartySize: 6, maxCovers: 5 });
      const result = evaluatePacing([rule], [], {
        time: '18:00',
        partySize: 2, // below minPartySize of 6
        mealPeriod: 'dinner',
        dayOfWeek: 5,
      });
      // Rule requires minPartySize 6; party of 2 doesn't match
      expect(result.allowed).toBe(true);
      expect(result.appliedRule).toBeNull();
    });

    it('applies rule when party size meets minPartySize', () => {
      const rule = makeRule({ id: 'large-party', minPartySize: 4, maxCovers: 3 });
      const existing = [{ time: '18:00', covers: 2 }];
      const result = evaluatePacing([rule], existing, {
        time: '18:00',
        partySize: 4, // meets minPartySize; 2+4=6 > 3
        mealPeriod: 'dinner',
        dayOfWeek: 5,
      });
      expect(result.allowed).toBe(false);
      expect(result.appliedRule?.id).toBe('large-party');
    });
  });
});

// ── computePacingAvailability ─────────────────────────────────────

describe('computePacingAvailability', () => {
  it('returns empty array when no active rules exist', () => {
    const inactive = makeRule({ isActive: false, mealPeriod: 'dinner' });
    const result = computePacingAvailability([inactive], [], 'dinner', 5);
    expect(result).toHaveLength(0);
  });

  it('returns one slot per matching rule', () => {
    const rule1 = makeRule({
      id: 'slot1',
      intervalStartTime: '18:00',
      intervalEndTime: '18:30',
      maxCovers: 10,
      mealPeriod: 'dinner',
    });
    const rule2 = makeRule({
      id: 'slot2',
      intervalStartTime: '18:30',
      intervalEndTime: '19:00',
      maxCovers: 12,
      mealPeriod: 'dinner',
    });
    const result = computePacingAvailability([rule1, rule2], [], 'dinner', 5);
    expect(result).toHaveLength(2);
    expect(result[0]!.intervalStart).toBe('18:00');
    expect(result[0]!.intervalEnd).toBe('18:30');
    expect(result[0]!.maxCovers).toBe(10);
    expect(result[0]!.bookedCovers).toBe(0);
    expect(result[0]!.remaining).toBe(10);
    expect(result[1]!.maxCovers).toBe(12);
  });

  it('computes booked covers from existing reservations within each slot', () => {
    const rule = makeRule({
      intervalStartTime: '18:00',
      intervalEndTime: '19:00',
      maxCovers: 20,
      mealPeriod: 'dinner',
    });
    const existing = [
      { time: '18:15', covers: 3 },
      { time: '18:45', covers: 5 },
      { time: '17:30', covers: 10 }, // outside window
    ];
    const result = computePacingAvailability([rule], existing, 'dinner', 5);
    expect(result).toHaveLength(1);
    expect(result[0]!.bookedCovers).toBe(8); // 3 + 5
    expect(result[0]!.remaining).toBe(12); // 20 - 8
  });

  it('remaining is clamped to 0 when over-booked', () => {
    const rule = makeRule({ maxCovers: 5, mealPeriod: 'dinner' });
    const existing = [{ time: '18:00', covers: 8 }]; // over-booked
    const result = computePacingAvailability([rule], existing, 'dinner', 5);
    expect(result[0]!.bookedCovers).toBe(8);
    expect(result[0]!.remaining).toBe(0); // clamped to 0
  });

  it('filters by meal period — ignores rules for other meal periods', () => {
    const lunchRule = makeRule({ id: 'lunch', mealPeriod: 'lunch', maxCovers: 10 });
    const dinnerRule = makeRule({ id: 'dinner', mealPeriod: 'dinner', maxCovers: 20 });
    const result = computePacingAvailability([lunchRule, dinnerRule], [], 'dinner', 5);
    expect(result).toHaveLength(1);
    expect(result[0]!.maxCovers).toBe(20);
  });

  it('includes wildcard meal period rules', () => {
    const wildcard = makeRule({ id: 'wildcard', mealPeriod: null, maxCovers: 30 });
    const result = computePacingAvailability([wildcard], [], 'brunch', 0);
    expect(result).toHaveLength(1);
    expect(result[0]!.maxCovers).toBe(30);
  });

  it('filters by day of week', () => {
    const saturdayRule = makeRule({ id: 'sat', dayOfWeek: 6, maxCovers: 15, mealPeriod: 'dinner' });
    const anydayRule = makeRule({ id: 'anyday', dayOfWeek: null, maxCovers: 25, mealPeriod: 'dinner' });
    // Test on Tuesday (dayOfWeek=2)
    const result = computePacingAvailability([saturdayRule, anydayRule], [], 'dinner', 2);
    expect(result).toHaveLength(1); // only anydayRule matches
    expect(result[0]!.maxCovers).toBe(25);
  });

  it('uses 00:00 / 23:59 as fallback bounds for null interval times', () => {
    const rule = makeRule({
      id: 'unbounded',
      intervalStartTime: null,
      intervalEndTime: null,
      maxCovers: 50,
      mealPeriod: 'dinner',
    });
    const result = computePacingAvailability([rule], [], 'dinner', 5);
    expect(result[0]!.intervalStart).toBe('00:00');
    expect(result[0]!.intervalEnd).toBe('23:59');
  });

  it('handles multiple rules on the same day with different windows', () => {
    const earlySlot = makeRule({
      id: 'early',
      intervalStartTime: '17:00',
      intervalEndTime: '18:00',
      maxCovers: 10,
      mealPeriod: 'dinner',
    });
    const lateSlot = makeRule({
      id: 'late',
      intervalStartTime: '20:00',
      intervalEndTime: '21:00',
      maxCovers: 8,
      mealPeriod: 'dinner',
    });
    const existing = [
      { time: '17:30', covers: 4 },
      { time: '20:30', covers: 6 },
    ];
    const result = computePacingAvailability([earlySlot, lateSlot], existing, 'dinner', 5);
    expect(result).toHaveLength(2);
    const early = result.find((s) => s.intervalStart === '17:00')!;
    const late = result.find((s) => s.intervalStart === '20:00')!;
    expect(early.bookedCovers).toBe(4);
    expect(early.remaining).toBe(6);
    expect(late.bookedCovers).toBe(6);
    expect(late.remaining).toBe(2);
  });
});

// ── Edge cases added during S2/S3 hardening ───────────────────────────────────

describe('evaluatePacing — maxCovers edge cases', () => {
  it('blocks all bookings when maxCovers is 0', () => {
    // A rule with maxCovers=0 acts as a hard block regardless of existing covers.
    const rule = makeRule({ id: 'zero-cap', maxCovers: 0 });
    const result = evaluatePacing([rule], [], {
      time: '12:00',
      partySize: 1,
      mealPeriod: 'lunch',
      dayOfWeek: 2,
    });
    expect(result.allowed).toBe(false);
    expect(result.remainingCapacity).toBe(0);
    expect(result.reason).toContain('1/0');
  });

  it('allows exactly 1 cover when maxCovers=1 and no existing covers (single seating)', () => {
    const rule = makeRule({ id: 'single-seat', maxCovers: 1 });
    const result = evaluatePacing([rule], [], {
      time: '19:00',
      partySize: 1,
      mealPeriod: 'dinner',
      dayOfWeek: 5,
    });
    expect(result.allowed).toBe(true);
    expect(result.remainingCapacity).toBe(1);
  });

  it('blocks the next booking when maxCovers=1 and 1 cover already exists', () => {
    const rule = makeRule({ id: 'single-seat', maxCovers: 1 });
    const existing = [{ time: '19:00', covers: 1 }];
    const result = evaluatePacing([rule], existing, {
      time: '19:00',
      partySize: 1,
      mealPeriod: 'dinner',
      dayOfWeek: 5,
    });
    expect(result.allowed).toBe(false);
    expect(result.remainingCapacity).toBe(0);
  });

  it('reports remainingCapacity of 0 (not negative) when already over-booked', () => {
    // If the venue is somehow overbooked (e.g. via an admin override), remaining
    // should be 0, not negative, to avoid confusing UIs.
    const rule = makeRule({ id: 'overbooked', maxCovers: 5 });
    const existing = [{ time: '18:00', covers: 8 }]; // 8 > maxCovers(5)
    const result = evaluatePacing([rule], existing, {
      time: '18:00',
      partySize: 1,
      mealPeriod: 'dinner',
      dayOfWeek: 5,
    });
    expect(result.allowed).toBe(false);
    expect(result.remainingCapacity).toBe(0); // clamped — not -3
    expect(result.reason).toContain('9/5');
  });
});

describe('evaluatePacing — priority tie-breaking', () => {
  it('resolves tie deterministically by id ASC when priorities are equal', () => {
    // Two rules with the same priority — rule 'a' has a lower id so it wins.
    const ruleA = makeRule({ id: 'a', priority: 5, maxCovers: 3 });
    const ruleB = makeRule({ id: 'b', priority: 5, maxCovers: 100 });
    const existing = [{ time: '18:00', covers: 3 }]; // exactly at limit for ruleA

    // With ruleA winning (id 'a' < 'b'), covers=3+1=4 > 3 → blocked.
    const result = evaluatePacing([ruleB, ruleA], existing, {
      time: '18:00',
      partySize: 1,
      mealPeriod: 'dinner',
      dayOfWeek: 5,
    });
    expect(result.appliedRule?.id).toBe('a');
    expect(result.allowed).toBe(false);
  });

  it('resolves tie correctly regardless of input array order', () => {
    // Pass ruleA before ruleB and ruleB before ruleA — result must be the same.
    const ruleA = makeRule({ id: 'alpha', priority: 5, maxCovers: 2 });
    const ruleB = makeRule({ id: 'beta', priority: 5, maxCovers: 100 });

    const input = { time: '12:00', partySize: 1, mealPeriod: 'lunch', dayOfWeek: 1 };
    const r1 = evaluatePacing([ruleA, ruleB], [], input);
    const r2 = evaluatePacing([ruleB, ruleA], [], input);

    expect(r1.appliedRule?.id).toBe('alpha');
    expect(r2.appliedRule?.id).toBe('alpha');
  });

  it('applies multiple rules with same priority consistently across 100 randomised orderings', () => {
    // Shuffle 5 rules all with priority=1 and verify the lowest id always wins.
    const rules: PacingRule[] = [
      makeRule({ id: 'e', priority: 1, maxCovers: 50 }),
      makeRule({ id: 'b', priority: 1, maxCovers: 50 }),
      makeRule({ id: 'd', priority: 1, maxCovers: 50 }),
      makeRule({ id: 'a', priority: 1, maxCovers: 50 }), // lowest id — should always win
      makeRule({ id: 'c', priority: 1, maxCovers: 50 }),
    ];
    for (let i = 0; i < 100; i++) {
      // Fisher-Yates shuffle
      const shuffled = [...rules];
      for (let j = shuffled.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [shuffled[j], shuffled[k]] = [shuffled[k]!, shuffled[j]!];
      }
      const result = evaluatePacing(shuffled, [], {
        time: '12:00', partySize: 1, mealPeriod: 'lunch', dayOfWeek: 1,
      });
      expect(result.appliedRule?.id, `iteration ${i}`).toBe('a');
    }
  });
});

describe('evaluatePacing — time window boundary conditions', () => {
  it('allows booking at exactly the window start (inclusive boundary)', () => {
    const rule = makeRule({ intervalStartTime: '18:00', intervalEndTime: '20:00', maxCovers: 10 });
    const result = evaluatePacing([rule], [], {
      time: '18:00',
      partySize: 2,
      mealPeriod: 'dinner',
      dayOfWeek: 5,
    });
    expect(result.allowed).toBe(true);
    expect(result.appliedRule).not.toBeNull();
  });

  it('allows booking at exactly the window end (inclusive boundary)', () => {
    const rule = makeRule({ intervalStartTime: '18:00', intervalEndTime: '20:00', maxCovers: 10 });
    const result = evaluatePacing([rule], [], {
      time: '20:00',
      partySize: 2,
      mealPeriod: 'dinner',
      dayOfWeek: 5,
    });
    expect(result.allowed).toBe(true);
    expect(result.appliedRule).not.toBeNull();
  });

  it('does not apply rule when booking is 1 minute before window start', () => {
    const rule = makeRule({ intervalStartTime: '18:00', intervalEndTime: '20:00', maxCovers: 10 });
    const result = evaluatePacing([rule], [], {
      time: '17:59',
      partySize: 2,
      mealPeriod: 'dinner',
      dayOfWeek: 5,
    });
    expect(result.appliedRule).toBeNull();
    expect(result.allowed).toBe(true); // no rule applies → allowed
  });

  it('does not apply rule when booking is 1 minute after window end', () => {
    const rule = makeRule({ intervalStartTime: '18:00', intervalEndTime: '20:00', maxCovers: 10 });
    const result = evaluatePacing([rule], [], {
      time: '20:01',
      partySize: 2,
      mealPeriod: 'dinner',
      dayOfWeek: 5,
    });
    expect(result.appliedRule).toBeNull();
    expect(result.allowed).toBe(true);
  });

  it('applies rule with identical start and end (point-in-time window)', () => {
    // A rule that only applies at exactly 18:00 — start == end.
    const rule = makeRule({ intervalStartTime: '18:00', intervalEndTime: '18:00', maxCovers: 1 });
    const atWindow = evaluatePacing([rule], [], {
      time: '18:00', partySize: 1, mealPeriod: 'dinner', dayOfWeek: 5,
    });
    expect(atWindow.appliedRule).not.toBeNull();

    const beforeWindow = evaluatePacing([rule], [], {
      time: '17:59', partySize: 1, mealPeriod: 'dinner', dayOfWeek: 5,
    });
    expect(beforeWindow.appliedRule).toBeNull();

    const afterWindow = evaluatePacing([rule], [], {
      time: '18:01', partySize: 1, mealPeriod: 'dinner', dayOfWeek: 5,
    });
    expect(afterWindow.appliedRule).toBeNull();
  });

  it('applies rule with null start but defined end (open start)', () => {
    const rule = makeRule({ intervalStartTime: null, intervalEndTime: '14:00', maxCovers: 5 });
    const result = evaluatePacing([rule], [], {
      time: '08:00', partySize: 2, mealPeriod: 'breakfast', dayOfWeek: 1,
    });
    expect(result.appliedRule).not.toBeNull();
  });

  it('applies rule with defined start but null end (open end)', () => {
    const rule = makeRule({ intervalStartTime: '22:00', intervalEndTime: null, maxCovers: 5 });
    const result = evaluatePacing([rule], [], {
      time: '23:30', partySize: 2, mealPeriod: 'late-night', dayOfWeek: 5,
    });
    expect(result.appliedRule).not.toBeNull();
  });

  it('covers with time exactly on window boundary are counted in the window', () => {
    // Rule: 18:00–19:00. Existing cover AT 18:00 (start boundary) should be counted.
    const rule = makeRule({ intervalStartTime: '18:00', intervalEndTime: '19:00', maxCovers: 3 });
    const existing = [{ time: '18:00', covers: 3 }]; // exactly at start — must be in-window
    const result = evaluatePacing([rule], existing, {
      time: '18:30', partySize: 1, mealPeriod: 'dinner', dayOfWeek: 5,
    });
    expect(result.allowed).toBe(false); // 3 + 1 = 4 > 3
    expect(result.remainingCapacity).toBe(0);
  });
});

describe('evaluatePacing — minPartySize edge cases', () => {
  it('does not apply rule to party of 1 when minPartySize is 2', () => {
    const rule = makeRule({ id: 'large-rule', minPartySize: 2, maxCovers: 0 }); // zero cap
    const result = evaluatePacing([rule], [], {
      time: '18:00', partySize: 1, mealPeriod: 'dinner', dayOfWeek: 5,
    });
    // Rule requires partySize >= 2; party of 1 doesn't match → no rule applies → allowed
    expect(result.allowed).toBe(true);
    expect(result.appliedRule).toBeNull();
  });

  it('does apply rule to party exactly equal to minPartySize', () => {
    const rule = makeRule({ id: 'min2', minPartySize: 2, maxCovers: 1 });
    const existing = [{ time: '18:00', covers: 1 }];
    const result = evaluatePacing([rule], existing, {
      time: '18:00', partySize: 2, mealPeriod: 'dinner', dayOfWeek: 5,
    });
    // 1 existing + 2 proposed = 3 > maxCovers(1) → blocked
    expect(result.allowed).toBe(false);
    expect(result.appliedRule?.id).toBe('min2');
  });
});

describe('evaluatePacing — malformed time strings', () => {
  it('treats malformed time as 00:00 and still evaluates correctly', () => {
    // A rule with intervalStartTime = "??" falls back via toMinutes to 0 (00:00).
    // Booking at "00:00" falls within [0, 1200] → rule applies.
    const rule = makeRule({ intervalStartTime: '??', intervalEndTime: '20:00', maxCovers: 5 });
    const result = evaluatePacing([rule], [], {
      time: '00:00', partySize: 3, mealPeriod: 'dinner', dayOfWeek: 5,
    });
    // toMinutes('??') → 0, toMinutes('00:00') → 0, toMinutes('20:00') → 1200
    // isWithinWindow: t(0) >= start(0) and t(0) <= end(1200) → true → rule applies
    expect(result.appliedRule).not.toBeNull();
    expect(result.allowed).toBe(true); // 0 existing + 3 <= 5
  });
});

describe('computePacingAvailability — null time bounds display', () => {
  it('shows 00:00/23:59 for null start/end when there are existing covers', () => {
    const rule = makeRule({
      intervalStartTime: null,
      intervalEndTime: null,
      maxCovers: 10,
      mealPeriod: 'dinner',
    });
    const existing = [{ time: '12:00', covers: 3 }];
    const result = computePacingAvailability([rule], existing, 'dinner', 1);
    expect(result[0]!.intervalStart).toBe('00:00');
    expect(result[0]!.intervalEnd).toBe('23:59');
    expect(result[0]!.bookedCovers).toBe(3);
    expect(result[0]!.remaining).toBe(7);
  });
});
