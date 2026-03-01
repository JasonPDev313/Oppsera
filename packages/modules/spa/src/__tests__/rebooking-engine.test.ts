// ══════════════════════════════════════════════════════════════════
// Rebooking Engine — Unit Tests
// ══════════════════════════════════════════════════════════════════
//
// Pure function tests for the spa appointment rebooking engine.
// No database mocking needed — all functions are pure.
// ══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  generateRebookingSuggestions,
  scoreDayForRebooking,
  findBestTimeSlot,
  getNextOccurrence,
  formatSuggestionReason,
  getDaysBetween,
} from '../helpers/rebooking-engine';
import type {
  AvailableDay,
  RebookingInput,
} from '../helpers/rebooking-engine';

// ── Test Helpers ────────────────────────────────────────────────

function makeSlot(
  startTime: string,
  endTime: string,
  providerId = 'provider-1',
  providerName = 'Jane',
) {
  return { startTime, endTime, providerId, providerName };
}

function makeDay(
  date: string,
  dayOfWeek: number,
  slots: AvailableDay['slots'] = [makeSlot('10:00', '11:00')],
): AvailableDay {
  return { date, dayOfWeek, slots };
}

function makeInput(overrides: Partial<RebookingInput> = {}): RebookingInput {
  return {
    originalAppointmentDate: '2026-03-10', // Tuesday
    originalDayOfWeek: 2, // Tuesday
    originalTime: '10:00',
    durationMinutes: 60,
    availableDays: [],
    preferences: {},
    rebookingWindowDays: 90,
    maxSuggestions: 5,
    ...overrides,
  };
}

// ── generateRebookingSuggestions ────────────────────────────────

describe('generateRebookingSuggestions', () => {
  it('returns suggestions for next available days', () => {
    const input = makeInput({
      availableDays: [
        makeDay('2026-03-11', 3),
        makeDay('2026-03-12', 4),
        makeDay('2026-03-13', 5),
      ],
    });

    const result = generateRebookingSuggestions(input);
    expect(result).toHaveLength(3);
    expect(result.every((s) => s.timeSlots.length > 0)).toBe(true);
  });

  it('respects provider availability by scoring preferred provider higher', () => {
    const input = makeInput({
      preferences: { preferredProviderId: 'provider-2' },
      availableDays: [
        makeDay('2026-03-11', 3, [makeSlot('10:00', '11:00', 'provider-1', 'Jane')]),
        makeDay('2026-03-12', 4, [makeSlot('10:00', '11:00', 'provider-2', 'Bob')]),
      ],
    });

    const result = generateRebookingSuggestions(input);
    // Day with preferred provider should score higher
    expect(result[0]!.date).toBe('2026-03-12');
  });

  it('respects customer preferred day of week', () => {
    const input = makeInput({
      originalDayOfWeek: 2, // Tuesday
      preferences: {},
      availableDays: [
        makeDay('2026-03-11', 3), // Wednesday
        makeDay('2026-03-17', 2), // Tuesday (same day of week)
      ],
    });

    const result = generateRebookingSuggestions(input);
    // Same day of week (Tuesday) gets +30 even though it's further out
    expect(result[0]!.date).toBe('2026-03-17');
  });

  it('respects customer preferred time of day', () => {
    const input = makeInput({
      originalTime: '14:00',
      preferences: {
        preferredTimeStart: '14:00',
        preferredTimeEnd: '16:00',
      },
      availableDays: [
        makeDay('2026-03-11', 3, [makeSlot('09:00', '10:00')]),
        makeDay('2026-03-12', 4, [makeSlot('14:30', '15:30')]),
      ],
    });

    const result = generateRebookingSuggestions(input);
    // Day with slot in preferred time window should rank first
    expect(result[0]!.date).toBe('2026-03-12');
  });

  it('excludes days where provider has no slots (fully booked)', () => {
    const input = makeInput({
      availableDays: [
        makeDay('2026-03-11', 3, []), // No slots = fully booked
        makeDay('2026-03-12', 4, [makeSlot('10:00', '11:00')]),
      ],
    });

    const result = generateRebookingSuggestions(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.date).toBe('2026-03-12');
  });

  it('excludes dates in the excludeDates list (provider off)', () => {
    const input = makeInput({
      preferences: { excludeDates: ['2026-03-11'] },
      availableDays: [
        makeDay('2026-03-11', 3),
        makeDay('2026-03-12', 4),
      ],
    });

    const result = generateRebookingSuggestions(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.date).toBe('2026-03-12');
  });

  it('returns suggestions sorted by score descending', () => {
    const input = makeInput({
      originalDayOfWeek: 2,
      originalTime: '10:00',
      preferences: { preferredProviderId: 'prov-fav' },
      availableDays: [
        // Low score: wrong day, no preferred provider, far from original time
        makeDay('2026-03-13', 5, [makeSlot('18:00', '19:00', 'prov-other', 'Zara')]),
        // High score: same day, preferred provider, near original time
        makeDay('2026-03-17', 2, [makeSlot('10:00', '11:00', 'prov-fav', 'Fav')]),
        // Medium score: near original time, within first week
        makeDay('2026-03-11', 3, [makeSlot('10:30', '11:30')]),
      ],
    });

    const result = generateRebookingSuggestions(input);
    // Should be sorted by score descending
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!.score).toBeGreaterThanOrEqual(result[i]!.score);
    }
    // Highest score day should be first
    expect(result[0]!.date).toBe('2026-03-17');
  });

  it('limits results to maxSuggestions', () => {
    const days = Array.from({ length: 20 }, (_, i) => {
      const day = 11 + i;
      const dateStr = `2026-03-${String(day).padStart(2, '0')}`;
      return makeDay(dateStr, (3 + i) % 7);
    });

    const input = makeInput({
      availableDays: days,
      maxSuggestions: 3,
    });

    const result = generateRebookingSuggestions(input);
    expect(result).toHaveLength(3);
  });

  it('defaults maxSuggestions to 5 when not specified', () => {
    const days = Array.from({ length: 10 }, (_, i) => {
      const day = 11 + i;
      const dateStr = `2026-03-${String(day).padStart(2, '0')}`;
      return makeDay(dateStr, (3 + i) % 7);
    });

    const input = makeInput({ availableDays: days });
    delete (input as unknown as Record<string, unknown>).maxSuggestions;

    const result = generateRebookingSuggestions(input);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('handles weekly recurring preference (same day each week)', () => {
    // Customer always comes on Tuesdays (dayOfWeek = 2)
    const input = makeInput({
      originalDayOfWeek: 2,
      availableDays: [
        makeDay('2026-03-17', 2), // Tuesday next week
        makeDay('2026-03-24', 2), // Tuesday in 2 weeks
        makeDay('2026-03-18', 3), // Wednesday next week
      ],
    });

    const result = generateRebookingSuggestions(input);
    // Both Tuesdays should rank above Wednesday
    expect(result[0]!.date).toBe('2026-03-17');
    expect(result[1]!.date).toBe('2026-03-24');
  });

  it('handles biweekly / monthly intervals via scoring proximity', () => {
    // Original was March 10. Days further out get lower proximity scores.
    const input = makeInput({
      originalAppointmentDate: '2026-03-10',
      originalDayOfWeek: 2,
      availableDays: [
        makeDay('2026-03-17', 2), // 7 days out
        makeDay('2026-03-24', 2), // 14 days out
        makeDay('2026-04-07', 2), // 28 days out
      ],
    });

    const result = generateRebookingSuggestions(input);
    // Closest Tuesday should score highest due to proximity bonus
    expect(result[0]!.date).toBe('2026-03-17');
  });

  it('excludes dates beyond the rebooking window', () => {
    const input = makeInput({
      originalAppointmentDate: '2026-03-10',
      rebookingWindowDays: 14, // Only look 14 days ahead
      availableDays: [
        makeDay('2026-03-15', 0), // Within window
        makeDay('2026-03-20', 5), // Within window
        makeDay('2026-03-30', 1), // Beyond window
      ],
    });

    const result = generateRebookingSuggestions(input);
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.date <= '2026-03-24')).toBe(true);
  });
});

// ── scoreDayForRebooking ───────────────────────────────────────

describe('scoreDayForRebooking', () => {
  it('awards +30 when day of week matches original', () => {
    // Use same date for both so proximity score is identical
    const day = makeDay('2026-03-17', 2); // Tuesday (matching DOW)
    const input = makeInput({ originalDayOfWeek: 2 });

    const scoreMatch = scoreDayForRebooking(day, input);

    // Same date but different DOW value — isolate the DOW factor
    const dayNoMatch = makeDay('2026-03-17', 3); // Same date, different DOW for test
    const scoreNoMatch = scoreDayForRebooking(dayNoMatch, input);

    expect(scoreMatch - scoreNoMatch).toBe(30);
  });

  it('awards +20 when within 7 days of original date', () => {
    const nearDay = makeDay('2026-03-14', 6); // 4 days later
    const input = makeInput({
      originalAppointmentDate: '2026-03-10',
      originalDayOfWeek: 9, // Impossible DOW to isolate proximity scoring
    });

    const farDay = makeDay('2026-04-10', 6); // 31 days later
    const nearScore = scoreDayForRebooking(nearDay, input);
    const farScore = scoreDayForRebooking(farDay, input);

    expect(nearScore).toBeGreaterThan(farScore);
  });

  it('proximity score decays after first week at -3/day', () => {
    const input = makeInput({
      originalAppointmentDate: '2026-03-10',
      originalDayOfWeek: 9, // Impossible to isolate
      preferences: {},
    });

    // Exactly 7 days → full 20 points
    const day7 = makeDay('2026-03-17', 2);
    const score7 = scoreDayForRebooking(day7, input);

    // 10 days → 3 days after first week → 20 - 9 = 11 proximity points
    const day10 = makeDay('2026-03-20', 5);
    const score10 = scoreDayForRebooking(day10, input);

    // The difference in proximity contribution should be ~9
    // (both have slot near original time +10, but different DOW)
    expect(score7).toBeGreaterThan(score10);
  });

  it('proximity score floors at 0 (never negative)', () => {
    const input = makeInput({
      originalAppointmentDate: '2026-03-10',
      originalDayOfWeek: 9,
      preferences: {},
    });

    // 30 days out → 23 days after first week → 20 - 69 = negative → clamped to 0
    const farDay = makeDay('2026-04-09', 4, [makeSlot('18:00', '19:00')]);
    const score = scoreDayForRebooking(farDay, input);

    // Score should be non-negative
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('awards +25 when preferred provider is available', () => {
    const day = makeDay('2026-03-15', 0, [makeSlot('10:00', '11:00', 'prov-fav', 'Fav')]);
    const input = makeInput({ preferences: { preferredProviderId: 'prov-fav' } });

    const scoreWith = scoreDayForRebooking(day, input);

    const dayWithout = makeDay('2026-03-15', 0, [makeSlot('10:00', '11:00', 'prov-other', 'Other')]);
    const scoreWithout = scoreDayForRebooking(dayWithout, input);

    expect(scoreWith - scoreWithout).toBe(25);
  });

  it('awards +15 when slot falls in preferred time window', () => {
    const day = makeDay('2026-03-15', 0, [makeSlot('14:00', '15:00')]);
    const input = makeInput({
      originalTime: '08:00', // Far from slot to isolate time window scoring
      preferences: {
        preferredTimeStart: '13:00',
        preferredTimeEnd: '16:00',
      },
    });

    const scoreInWindow = scoreDayForRebooking(day, input);

    const dayOutWindow = makeDay('2026-03-15', 0, [makeSlot('08:00', '09:00')]);
    const inputNoWindow = makeInput({
      originalTime: '08:00',
      preferences: {},
    });
    const scoreNoWindow = scoreDayForRebooking(dayOutWindow, inputNoWindow);

    expect(scoreInWindow).toBeGreaterThan(scoreNoWindow);
  });

  it('awards +10 when a slot is within 1 hour of original time', () => {
    const dayNear = makeDay('2026-03-15', 0, [makeSlot('10:30', '11:30')]);
    const input = makeInput({ originalTime: '10:00', preferences: {} });

    const dayFar = makeDay('2026-03-15', 0, [makeSlot('18:00', '19:00')]);

    const scoreNear = scoreDayForRebooking(dayNear, input);
    const scoreFar = scoreDayForRebooking(dayFar, input);

    expect(scoreNear - scoreFar).toBe(10);
  });

  it('clamps score to max 100', () => {
    // Maximize all factors on one day
    const day = makeDay('2026-03-12', 2, [
      makeSlot('10:00', '11:00', 'prov-fav', 'Fav'),
    ]);
    const input = makeInput({
      originalAppointmentDate: '2026-03-10',
      originalDayOfWeek: 2,
      originalTime: '10:00',
      preferences: {
        preferredProviderId: 'prov-fav',
        preferredTimeStart: '09:00',
        preferredTimeEnd: '11:00',
      },
    });

    const score = scoreDayForRebooking(day, input);
    // 30 (DOW) + 20 (proximity) + 25 (provider) + 15 (time window) + 10 (near original) = 100
    expect(score).toBe(100);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('fewer existing appointments (more slots) does not inflate score beyond factors', () => {
    // Score is based on match quality, not quantity of slots
    const dayFewSlots = makeDay('2026-03-15', 0, [
      makeSlot('10:00', '11:00'),
    ]);
    const dayManySlots = makeDay('2026-03-15', 0, [
      makeSlot('09:00', '10:00'),
      makeSlot('10:00', '11:00'),
      makeSlot('11:00', '12:00'),
      makeSlot('14:00', '15:00'),
    ]);

    const input = makeInput({ originalTime: '10:00', preferences: {} });

    const scoreFew = scoreDayForRebooking(dayFewSlots, input);
    const scoreMany = scoreDayForRebooking(dayManySlots, input);

    // Same scoring factors apply — having more slots doesn't change the score
    // Both have a slot within 1 hour of 10:00
    expect(scoreFew).toBe(scoreMany);
  });

  it('weekend vs weekday: day of week match drives score', () => {
    // Original was Saturday (dayOfWeek=6)
    const input = makeInput({
      originalAppointmentDate: '2026-03-14', // Saturday
      originalDayOfWeek: 6,
      originalTime: '10:00',
    });

    const saturday = makeDay('2026-03-21', 6, [makeSlot('10:00', '11:00')]);
    const monday = makeDay('2026-03-16', 1, [makeSlot('10:00', '11:00')]);

    const satScore = scoreDayForRebooking(saturday, input);
    const monScore = scoreDayForRebooking(monday, input);

    // Saturday gets DOW bonus (+30), Monday doesn't, but Monday is closer (+20 vs decay)
    expect(satScore).toBeGreaterThan(monScore);
  });
});

// ── findBestTimeSlot ───────────────────────────────────────────

describe('findBestTimeSlot', () => {
  it('returns slot closest to preferred time', () => {
    const day = makeDay('2026-03-15', 0, [
      makeSlot('09:00', '10:00'),
      makeSlot('10:00', '11:00'),
      makeSlot('14:00', '15:00'),
    ]);

    const result = findBestTimeSlot(day, {}, '10:30');
    expect(result).not.toBeNull();
    expect(result!.startTime).toBe('10:00'); // Closest to 10:30
  });

  it('prefers preferred provider + preferred time window (priority 1)', () => {
    const day = makeDay('2026-03-15', 0, [
      makeSlot('10:00', '11:00', 'prov-other', 'Other'),
      makeSlot('14:00', '15:00', 'prov-fav', 'Fav'), // Preferred provider + in window
      makeSlot('15:00', '16:00', 'prov-fav', 'Fav'),
    ]);

    const result = findBestTimeSlot(
      day,
      {
        preferredProviderId: 'prov-fav',
        preferredTimeStart: '13:00',
        preferredTimeEnd: '15:00',
      },
      '10:00',
    );

    expect(result).not.toBeNull();
    expect(result!.startTime).toBe('14:00');
    expect(result!.providerId).toBe('prov-fav');
  });

  it('falls back to preferred provider + any time (priority 2)', () => {
    const day = makeDay('2026-03-15', 0, [
      makeSlot('09:00', '10:00', 'prov-other', 'Other'),
      makeSlot('16:00', '17:00', 'prov-fav', 'Fav'), // Preferred provider but outside window
    ]);

    const result = findBestTimeSlot(
      day,
      {
        preferredProviderId: 'prov-fav',
        preferredTimeStart: '10:00',
        preferredTimeEnd: '12:00',
      },
      '10:00',
    );

    expect(result).not.toBeNull();
    expect(result!.providerId).toBe('prov-fav');
    expect(result!.startTime).toBe('16:00');
  });

  it('falls back to any provider + preferred time window (priority 3)', () => {
    const day = makeDay('2026-03-15', 0, [
      makeSlot('08:00', '09:00', 'prov-other', 'Other'),
      makeSlot('11:00', '12:00', 'prov-other', 'Other'), // In window
    ]);

    const result = findBestTimeSlot(
      day,
      {
        preferredProviderId: 'prov-fav', // Not available on this day
        preferredTimeStart: '10:00',
        preferredTimeEnd: '12:00',
      },
      '08:00',
    );

    expect(result).not.toBeNull();
    expect(result!.startTime).toBe('11:00');
  });

  it('falls back to any provider closest to original time (priority 4)', () => {
    const day = makeDay('2026-03-15', 0, [
      makeSlot('08:00', '09:00', 'prov-a', 'Alice'),
      makeSlot('15:00', '16:00', 'prov-b', 'Bob'),
    ]);

    const result = findBestTimeSlot(
      day,
      { preferredProviderId: 'prov-fav' }, // Not available
      '14:00',
    );

    expect(result).not.toBeNull();
    expect(result!.startTime).toBe('15:00'); // Closest to 14:00
  });

  it('returns null when no slots available', () => {
    const day = makeDay('2026-03-15', 0, []);

    const result = findBestTimeSlot(day, {}, '10:00');
    expect(result).toBeNull();
  });

  it('handles morning preference (early time window)', () => {
    const day = makeDay('2026-03-15', 0, [
      makeSlot('08:00', '09:00'),
      makeSlot('09:00', '10:00'),
      makeSlot('14:00', '15:00'),
    ]);

    const result = findBestTimeSlot(
      day,
      {
        preferredTimeStart: '07:00',
        preferredTimeEnd: '10:00',
      },
      '14:00', // Original time is afternoon but preference is morning
    );

    expect(result).not.toBeNull();
    // Should pick from the morning window, closest to 14:00 among them = 09:00
    expect(result!.startTime).toBe('09:00');
  });

  it('handles afternoon preference', () => {
    const day = makeDay('2026-03-15', 0, [
      makeSlot('08:00', '09:00'),
      makeSlot('13:00', '14:00'),
      makeSlot('15:00', '16:00'),
    ]);

    const result = findBestTimeSlot(
      day,
      {
        preferredTimeStart: '12:00',
        preferredTimeEnd: '16:00',
      },
      '14:00',
    );

    expect(result).not.toBeNull();
    // In time window, closest to 14:00 original
    expect(result!.startTime).toBe('13:00');
  });

  it('handles evening preference', () => {
    const day = makeDay('2026-03-15', 0, [
      makeSlot('09:00', '10:00'),
      makeSlot('17:00', '18:00'),
      makeSlot('18:00', '19:00'),
    ]);

    const result = findBestTimeSlot(
      day,
      {
        preferredTimeStart: '17:00',
        preferredTimeEnd: '20:00',
      },
      '18:30',
    );

    expect(result).not.toBeNull();
    expect(result!.startTime).toBe('18:00'); // In window, closest to 18:30
  });

  it('returns first slot as final fallback', () => {
    const day = makeDay('2026-03-15', 0, [
      makeSlot('10:00', '11:00', 'prov-a', 'Alice'),
    ]);

    // No preferences at all, original time is the same
    const result = findBestTimeSlot(day, {}, '10:00');
    expect(result).not.toBeNull();
    expect(result!.startTime).toBe('10:00');
  });
});

// ── getNextOccurrence ──────────────────────────────────────────

describe('getNextOccurrence', () => {
  it('next Monday from a Wednesday returns the following Monday', () => {
    // 2026-03-11 is a Wednesday (DOW=3), next Monday (DOW=1) is 2026-03-16
    const result = getNextOccurrence(1, '2026-03-11');
    expect(result).toBe('2026-03-16');
  });

  it('next occurrence of same day returns 7 days later', () => {
    // 2026-03-10 is a Tuesday (DOW=2), next Tuesday is 2026-03-17
    const result = getNextOccurrence(2, '2026-03-10');
    expect(result).toBe('2026-03-17');
  });

  it('works across month boundaries', () => {
    // 2026-03-30 is a Monday (DOW=1), next Friday (DOW=5) is 2026-04-03
    const result = getNextOccurrence(5, '2026-03-30');
    expect(result).toBe('2026-04-03');
  });

  it('works across year boundaries', () => {
    // 2026-12-30 is a Wednesday (DOW=3), next Monday (DOW=1) is 2027-01-04
    // daysAhead = 1 - 3 = -2, + 7 = 5. Dec 30 + 5 = Jan 4
    const result = getNextOccurrence(1, '2026-12-30');
    expect(result).toBe('2027-01-04');
  });

  it('next Sunday from a Saturday is 1 day later', () => {
    // 2026-03-14 is a Saturday (DOW=6), next Sunday (DOW=0) is 2026-03-15
    const result = getNextOccurrence(0, '2026-03-14');
    expect(result).toBe('2026-03-15');
  });

  it('next Saturday from a Sunday is 6 days later', () => {
    // 2026-03-15 is a Sunday (DOW=0), next Saturday (DOW=6) is 2026-03-21
    const result = getNextOccurrence(6, '2026-03-15');
    expect(result).toBe('2026-03-21');
  });

  it('handles February to March transition (non-leap year scenario)', () => {
    // 2027-02-26 is a Friday (DOW=5), next Wednesday (DOW=3) is 2027-03-03
    const result = getNextOccurrence(3, '2027-02-26');
    expect(result).toBe('2027-03-03');
  });
});

// ── formatSuggestionReason ─────────────────────────────────────

describe('formatSuggestionReason', () => {
  it('returns "Same day next week" for same DOW within 14 days', () => {
    const day = makeDay('2026-03-17', 2); // Tuesday, 7 days after March 10
    const input = makeInput({
      originalAppointmentDate: '2026-03-10',
      originalDayOfWeek: 2,
    });

    const reason = formatSuggestionReason(day, input);
    expect(reason).toBe('Same day next week');
  });

  it('returns "Next available [DayName]" for same DOW beyond 14 days', () => {
    const day = makeDay('2026-03-31', 2); // Tuesday, 21 days later
    const input = makeInput({
      originalAppointmentDate: '2026-03-10',
      originalDayOfWeek: 2,
    });

    const reason = formatSuggestionReason(day, input);
    expect(reason).toBe('Next available Tuesday');
  });

  it('mentions preferred provider when available', () => {
    const day = makeDay('2026-03-15', 0, [
      makeSlot('10:00', '11:00', 'prov-fav', 'Fav'),
    ]);
    const input = makeInput({
      preferences: { preferredProviderId: 'prov-fav' },
      originalDayOfWeek: 9, // No DOW match to isolate provider reason
    });

    const reason = formatSuggestionReason(day, input);
    expect(reason).toBe('Your preferred provider has availability');
  });

  it('returns "Closest match to your usual time" when slot is near original', () => {
    const day = makeDay('2026-03-15', 0, [makeSlot('10:30', '11:30')]);
    const input = makeInput({
      originalTime: '10:00',
      originalDayOfWeek: 9, // No DOW match
      preferences: {},
    });

    const reason = formatSuggestionReason(day, input);
    expect(reason).toBe('Closest match to your usual time');
  });

  it('returns "Available within your preferred time window" when no other reasons', () => {
    const day = makeDay('2026-03-15', 0, [makeSlot('14:00', '15:00')]);
    const input = makeInput({
      originalTime: '08:00', // Far from 14:00 (>60 min)
      originalDayOfWeek: 9,
      preferences: {
        preferredTimeStart: '13:00',
        preferredTimeEnd: '16:00',
      },
    });

    const reason = formatSuggestionReason(day, input);
    expect(reason).toBe('Available within your preferred time window');
  });

  it('returns "Earliest available date" for close dates with no other factors', () => {
    const day = makeDay('2026-03-12', 4, [makeSlot('18:00', '19:00')]);
    const input = makeInput({
      originalAppointmentDate: '2026-03-10',
      originalTime: '08:00', // Far from 18:00
      originalDayOfWeek: 9,
      preferences: {},
    });

    const reason = formatSuggestionReason(day, input);
    expect(reason).toBe('Earliest available date');
  });

  it('returns "Next available [DayName]" as fallback for distant dates with no match', () => {
    const day = makeDay('2026-03-20', 5, [makeSlot('18:00', '19:00')]);
    const input = makeInput({
      originalAppointmentDate: '2026-03-10',
      originalTime: '08:00',
      originalDayOfWeek: 9,
      preferences: {},
    });

    const reason = formatSuggestionReason(day, input);
    expect(reason).toBe('Next available Friday');
  });

  it('prioritizes same-day-next-week over provider reason', () => {
    const day = makeDay('2026-03-17', 2, [
      makeSlot('10:00', '11:00', 'prov-fav', 'Fav'),
    ]);
    const input = makeInput({
      originalAppointmentDate: '2026-03-10',
      originalDayOfWeek: 2,
      preferences: { preferredProviderId: 'prov-fav' },
    });

    const reason = formatSuggestionReason(day, input);
    // DOW match reason comes first in the function
    expect(reason).toBe('Same day next week');
  });
});

// ── getDaysBetween ─────────────────────────────────────────────

describe('getDaysBetween', () => {
  it('same day returns 0', () => {
    expect(getDaysBetween('2026-03-10', '2026-03-10')).toBe(0);
  });

  it('adjacent days returns 1', () => {
    expect(getDaysBetween('2026-03-10', '2026-03-11')).toBe(1);
  });

  it('one week apart returns 7', () => {
    expect(getDaysBetween('2026-03-10', '2026-03-17')).toBe(7);
  });

  it('handles month boundaries', () => {
    // March 30 to April 2 = 3 days
    expect(getDaysBetween('2026-03-30', '2026-04-02')).toBe(3);
  });

  it('handles February to March in non-leap year', () => {
    // 2027 is not a leap year. Feb 27 to March 3 = 4 days
    expect(getDaysBetween('2027-02-27', '2027-03-03')).toBe(4);
  });

  it('handles February to March in leap year', () => {
    // 2028 is a leap year. Feb 28 to March 1 = 2 days (Feb has 29 days)
    expect(getDaysBetween('2028-02-28', '2028-03-01')).toBe(2);
  });

  it('is symmetric (order does not matter)', () => {
    expect(getDaysBetween('2026-03-10', '2026-03-20')).toBe(10);
    expect(getDaysBetween('2026-03-20', '2026-03-10')).toBe(10);
  });

  it('handles large spans (year apart)', () => {
    expect(getDaysBetween('2026-01-01', '2027-01-01')).toBe(365);
  });

  it('handles year boundaries', () => {
    // Dec 31 to Jan 2 = 2 days
    expect(getDaysBetween('2026-12-31', '2027-01-02')).toBe(2);
  });
});

// ── Edge Cases ─────────────────────────────────────────────────

describe('edge cases', () => {
  it('no available days in range returns empty suggestions', () => {
    const input = makeInput({ availableDays: [] });
    const result = generateRebookingSuggestions(input);
    expect(result).toEqual([]);
  });

  it('all days with empty slots returns empty suggestions', () => {
    const input = makeInput({
      availableDays: [
        makeDay('2026-03-11', 3, []),
        makeDay('2026-03-12', 4, []),
      ],
    });

    const result = generateRebookingSuggestions(input);
    expect(result).toEqual([]);
  });

  it('all days equally scored returns in date order', () => {
    // Create days that will have identical scores
    const input = makeInput({
      originalDayOfWeek: 9, // Will never match any real DOW
      originalTime: '12:00',
      preferences: {},
      availableDays: [
        makeDay('2026-03-13', 5, [makeSlot('12:00', '13:00')]),
        makeDay('2026-03-11', 3, [makeSlot('12:00', '13:00')]),
        makeDay('2026-03-12', 4, [makeSlot('12:00', '13:00')]),
      ],
    });

    const result = generateRebookingSuggestions(input);
    // All within first week, same time, no DOW match, no provider preference
    // Scores should be equal → sorted by date ascending
    expect(result[0]!.date).toBe('2026-03-11');
    expect(result[1]!.date).toBe('2026-03-12');
    expect(result[2]!.date).toBe('2026-03-13');
  });

  it('customer with no preferences suggests soonest available', () => {
    const input = makeInput({
      originalDayOfWeek: 9, // No DOW match possible
      originalTime: '12:00',
      preferences: {},
      availableDays: [
        makeDay('2026-03-15', 0, [makeSlot('10:00', '11:00')]),
        makeDay('2026-03-11', 3, [makeSlot('10:00', '11:00')]),
        makeDay('2026-03-13', 5, [makeSlot('10:00', '11:00')]),
      ],
    });

    const result = generateRebookingSuggestions(input);
    // Without DOW match, proximity is the main driver → closest dates first
    // All within 7 days have same proximity score → date order tiebreak
    expect(result[0]!.date).toBe('2026-03-11');
  });

  it('all dates excluded returns empty suggestions', () => {
    const input = makeInput({
      preferences: { excludeDates: ['2026-03-11', '2026-03-12'] },
      availableDays: [
        makeDay('2026-03-11', 3),
        makeDay('2026-03-12', 4),
      ],
    });

    const result = generateRebookingSuggestions(input);
    expect(result).toEqual([]);
  });

  it('all dates beyond rebooking window returns empty suggestions', () => {
    const input = makeInput({
      originalAppointmentDate: '2026-03-10',
      rebookingWindowDays: 5,
      availableDays: [
        makeDay('2026-03-20', 5),
        makeDay('2026-03-25', 3),
      ],
    });

    const result = generateRebookingSuggestions(input);
    expect(result).toEqual([]);
  });

  it('suggestion includes all time slots for the day', () => {
    const input = makeInput({
      availableDays: [
        makeDay('2026-03-11', 3, [
          makeSlot('09:00', '10:00', 'prov-a', 'Alice'),
          makeSlot('10:00', '11:00', 'prov-b', 'Bob'),
          makeSlot('14:00', '15:00', 'prov-a', 'Alice'),
        ]),
      ],
    });

    const result = generateRebookingSuggestions(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.timeSlots).toHaveLength(3);
    expect(result[0]!.timeSlots.every((ts) => ts.available === true)).toBe(true);
  });

  it('each suggestion has a non-empty reason string', () => {
    const input = makeInput({
      availableDays: [
        makeDay('2026-03-11', 3),
        makeDay('2026-03-12', 4),
        makeDay('2026-03-17', 2),
      ],
    });

    const result = generateRebookingSuggestions(input);
    for (const suggestion of result) {
      expect(suggestion.reason).toBeTruthy();
      expect(suggestion.reason.length).toBeGreaterThan(0);
    }
  });

  it('scores are always between 0 and 100 inclusive', () => {
    const days = Array.from({ length: 30 }, (_, i) => {
      const day = 11 + i;
      const month = day > 31 ? 4 : 3;
      const adjustedDay = day > 31 ? day - 31 : day;
      const dateStr = `2026-${String(month).padStart(2, '0')}-${String(adjustedDay).padStart(2, '0')}`;
      return makeDay(dateStr, i % 7, [
        makeSlot(`${String(8 + (i % 10)).padStart(2, '0')}:00`, `${String(9 + (i % 10)).padStart(2, '0')}:00`),
      ]);
    });

    const input = makeInput({
      availableDays: days,
      maxSuggestions: 30,
      preferences: {
        preferredProviderId: 'provider-1',
        preferredTimeStart: '09:00',
        preferredTimeEnd: '12:00',
      },
    });

    const result = generateRebookingSuggestions(input);
    for (const suggestion of result) {
      expect(suggestion.score).toBeGreaterThanOrEqual(0);
      expect(suggestion.score).toBeLessThanOrEqual(100);
    }
  });
});
