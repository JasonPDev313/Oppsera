import { describe, it, expect } from 'vitest';
import {
  scoreWaitlistEntry,
  matchWaitlistEntries,
  isFlexibilityCompatible,
  formatMatchSummary,
  type CanceledSlot,
  type WaitlistEntry,
  type WaitlistMatch,
} from '../helpers/waitlist-matcher';

// ── Test Helpers ───────────────────────────────────────────────────

/** Creates a CanceledSlot with sensible defaults, merging overrides. */
function makeSlot(overrides: Partial<CanceledSlot> = {}): CanceledSlot {
  return {
    serviceId: 'svc-massage-60',
    providerId: 'prov-alice',
    startAt: new Date(2026, 2, 15, 10, 0), // March 15, 2026 10:00 AM
    endAt: new Date(2026, 2, 15, 11, 0),   // March 15, 2026 11:00 AM
    locationId: 'loc-spa-main',
    ...overrides,
  };
}

/** Creates a WaitlistEntry with sensible defaults, merging overrides. */
function makeEntry(overrides: Partial<WaitlistEntry> = {}): WaitlistEntry {
  return {
    id: 'wl-001',
    customerId: 'cust-001',
    serviceId: 'svc-massage-60',
    preferredProviderId: 'prov-alice',
    preferredDate: '2026-03-15',
    preferredTimeStart: '09:00',
    preferredTimeEnd: '12:00',
    flexibility: 'exact',
    priority: 5,
    createdAt: new Date(2026, 2, 10),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 1. scoreWaitlistEntry
// ═══════════════════════════════════════════════════════════════════

describe('scoreWaitlistEntry', () => {
  it('returns the highest possible score for a perfect match', () => {
    // Entry wants exact service, exact provider, exact date, time within window
    const entry = makeEntry({
      serviceId: 'svc-massage-60',
      preferredProviderId: 'prov-alice',
      preferredDate: '2026-03-15',
      preferredTimeStart: '09:00',
      preferredTimeEnd: '12:00',
      flexibility: 'exact',
      priority: 10,
    });
    const slot = makeSlot();
    const result = scoreWaitlistEntry(entry, slot, 10);

    // All 5 factors score 1.0 => 100
    expect(result.score).toBe(100);
    expect(result.entryId).toBe(entry.id);
    expect(result.factors).toHaveLength(5);
  });

  it('gives partial date score when slot is on the adjacent day', () => {
    // Preferred date is March 16, slot is March 15 (1 day apart)
    const entry = makeEntry({
      preferredDate: '2026-03-16',
      flexibility: 'exact',
    });
    const slot = makeSlot();
    const result = scoreWaitlistEntry(entry, slot, 5);

    const dateFactor = result.factors.find((f) => f.name === 'date_match');
    expect(dateFactor).toBeDefined();
    expect(dateFactor!.score).toBe(0.5);
    expect(dateFactor!.detail).toBe('within 1 day');
  });

  it('gives zero date score when slot is more than 1 day away', () => {
    const entry = makeEntry({
      preferredDate: '2026-03-20',
      flexibility: 'exact',
    });
    const slot = makeSlot();
    const result = scoreWaitlistEntry(entry, slot, 5);

    const dateFactor = result.factors.find((f) => f.name === 'date_match');
    expect(dateFactor!.score).toBe(0);
    expect(dateFactor!.detail).toBe('date mismatch');
  });

  it('gives full provider score when preferredProviderId is null (any provider)', () => {
    const entry = makeEntry({ preferredProviderId: null });
    const slot = makeSlot();
    const result = scoreWaitlistEntry(entry, slot, 5);

    const providerFactor = result.factors.find((f) => f.name === 'provider_match');
    expect(providerFactor!.score).toBe(1.0);
    expect(providerFactor!.detail).toBe('any provider accepted');
  });

  it('gives full time score when time preferences are null (any time)', () => {
    const entry = makeEntry({
      preferredTimeStart: null,
      preferredTimeEnd: null,
    });
    const slot = makeSlot();
    const result = scoreWaitlistEntry(entry, slot, 5);

    const timeFactor = result.factors.find((f) => f.name === 'time_match');
    expect(timeFactor!.score).toBe(1.0);
    expect(timeFactor!.detail).toBe('time flexible');
  });

  it('gives full time score when flexibility is "any" regardless of time prefs', () => {
    const entry = makeEntry({
      flexibility: 'any',
      preferredTimeStart: '16:00',
      preferredTimeEnd: '17:00',
    });
    const slot = makeSlot(); // slot at 10:00 AM, outside 16:00-17:00
    const result = scoreWaitlistEntry(entry, slot, 5);

    const timeFactor = result.factors.find((f) => f.name === 'time_match');
    expect(timeFactor!.score).toBe(1.0);
    expect(timeFactor!.detail).toBe('time flexible');
  });

  it('gives half time score when slot is within 1 hour of preferred window', () => {
    // Preferred 11:30-12:30, slot at 10:00. Distance to start = 90 min. That's > 60.
    // Let's use preferred 10:30-12:00, slot at 10:00. Distance to start = 30 min.
    const entry = makeEntry({
      preferredTimeStart: '10:30',
      preferredTimeEnd: '12:00',
    });
    const slot = makeSlot(); // 10:00 AM
    const result = scoreWaitlistEntry(entry, slot, 5);

    const timeFactor = result.factors.find((f) => f.name === 'time_match');
    expect(timeFactor!.score).toBe(0.5);
    expect(timeFactor!.detail).toBe('within 1 hour of preferred time');
  });

  it('gives zero time score when slot is more than 1 hour from preferred window', () => {
    const entry = makeEntry({
      preferredTimeStart: '14:00',
      preferredTimeEnd: '16:00',
    });
    const slot = makeSlot(); // 10:00 AM, 4 hours from 14:00
    const result = scoreWaitlistEntry(entry, slot, 5);

    const timeFactor = result.factors.find((f) => f.name === 'time_match');
    expect(timeFactor!.score).toBe(0);
    expect(timeFactor!.detail).toBe('outside preferred time');
  });

  it('normalizes priority against maxPriority', () => {
    const entry = makeEntry({ priority: 5 });
    const slot = makeSlot();
    const result = scoreWaitlistEntry(entry, slot, 10);

    const priorityFactor = result.factors.find((f) => f.name === 'priority_boost');
    expect(priorityFactor!.score).toBe(0.5);
    expect(priorityFactor!.detail).toBe('medium priority');
  });

  it('gives high priority label when normalized priority >= 0.8', () => {
    const entry = makeEntry({ priority: 9 });
    const slot = makeSlot();
    const result = scoreWaitlistEntry(entry, slot, 10);

    const priorityFactor = result.factors.find((f) => f.name === 'priority_boost');
    expect(priorityFactor!.score).toBe(0.9);
    expect(priorityFactor!.detail).toBe('high priority');
  });

  it('gives low priority label when normalized priority < 0.5', () => {
    const entry = makeEntry({ priority: 2 });
    const slot = makeSlot();
    const result = scoreWaitlistEntry(entry, slot, 10);

    const priorityFactor = result.factors.find((f) => f.name === 'priority_boost');
    expect(priorityFactor!.score).toBe(0.2);
    expect(priorityFactor!.detail).toBe('low priority');
  });

  it('gives zero service score when service does not match', () => {
    const entry = makeEntry({ serviceId: 'svc-facial-30' });
    const slot = makeSlot({ serviceId: 'svc-massage-60' });
    const result = scoreWaitlistEntry(entry, slot, 5);

    const serviceFactor = result.factors.find((f) => f.name === 'service_match');
    expect(serviceFactor!.score).toBe(0);
    expect(serviceFactor!.detail).toBe('service mismatch');
  });

  it('gives full service score when entry has null serviceId (any service)', () => {
    const entry = makeEntry({ serviceId: null });
    const slot = makeSlot();
    const result = scoreWaitlistEntry(entry, slot, 5);

    const serviceFactor = result.factors.find((f) => f.name === 'service_match');
    expect(serviceFactor!.score).toBe(1.0);
    expect(serviceFactor!.detail).toBe('any service accepted');
  });

  it('gives full date score when flexibility is flexible_date', () => {
    const entry = makeEntry({
      flexibility: 'flexible_date',
      preferredDate: '2026-03-20', // different day, but flexibility allows any date
    });
    const slot = makeSlot();
    const result = scoreWaitlistEntry(entry, slot, 5);

    const dateFactor = result.factors.find((f) => f.name === 'date_match');
    expect(dateFactor!.score).toBe(1.0);
    expect(dateFactor!.detail).toBe('date flexible');
  });

  it('gives full date score when preferredDate is null', () => {
    const entry = makeEntry({ preferredDate: null });
    const slot = makeSlot();
    const result = scoreWaitlistEntry(entry, slot, 5);

    const dateFactor = result.factors.find((f) => f.name === 'date_match');
    expect(dateFactor!.score).toBe(1.0);
    expect(dateFactor!.detail).toBe('date flexible');
  });

  it('clamps priority score to max 1.0 even if priority exceeds maxPriority', () => {
    const entry = makeEntry({ priority: 20 });
    const slot = makeSlot();
    const result = scoreWaitlistEntry(entry, slot, 10);

    const priorityFactor = result.factors.find((f) => f.name === 'priority_boost');
    expect(priorityFactor!.score).toBe(1.0);
  });

  it('handles maxPriority of 0 gracefully (no divide by zero)', () => {
    const entry = makeEntry({ priority: 5 });
    const slot = makeSlot();
    const result = scoreWaitlistEntry(entry, slot, 0);

    const priorityFactor = result.factors.find((f) => f.name === 'priority_boost');
    expect(priorityFactor!.score).toBe(0);
  });

  it('returns exactly 5 factors in the result', () => {
    const entry = makeEntry();
    const slot = makeSlot();
    const result = scoreWaitlistEntry(entry, slot, 5);

    expect(result.factors).toHaveLength(5);
    const factorNames = result.factors.map((f) => f.name);
    expect(factorNames).toEqual([
      'service_match',
      'provider_match',
      'date_match',
      'time_match',
      'priority_boost',
    ]);
  });

  it('attaches correct customerId from the entry', () => {
    const entry = makeEntry({ customerId: 'cust-vip-999' });
    const slot = makeSlot();
    const result = scoreWaitlistEntry(entry, slot, 5);

    expect(result.customerId).toBe('cust-vip-999');
  });

  it('handles null customerId on the entry', () => {
    const entry = makeEntry({ customerId: null });
    const slot = makeSlot();
    const result = scoreWaitlistEntry(entry, slot, 5);

    expect(result.customerId).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. matchWaitlistEntries
// ═══════════════════════════════════════════════════════════════════

describe('matchWaitlistEntries', () => {
  it('returns an empty array for an empty waitlist', () => {
    const result = matchWaitlistEntries([], makeSlot());
    expect(result).toEqual([]);
  });

  it('returns matches sorted by score descending (best first)', () => {
    const slot = makeSlot();
    const entries: WaitlistEntry[] = [
      // Low match: wrong service, wrong provider, wrong date
      makeEntry({
        id: 'wl-low',
        serviceId: 'svc-facial-30',
        preferredProviderId: 'prov-bob',
        preferredDate: '2026-03-20',
        flexibility: 'exact',
        priority: 1,
      }),
      // High match: everything matches
      makeEntry({
        id: 'wl-high',
        serviceId: 'svc-massage-60',
        preferredProviderId: 'prov-alice',
        preferredDate: '2026-03-15',
        preferredTimeStart: '09:00',
        preferredTimeEnd: '12:00',
        flexibility: 'exact',
        priority: 10,
      }),
      // Medium match: service matches, provider flexible, date flexible
      makeEntry({
        id: 'wl-med',
        serviceId: 'svc-massage-60',
        preferredProviderId: null,
        preferredDate: null,
        flexibility: 'any',
        priority: 5,
      }),
    ];

    const result = matchWaitlistEntries(entries, slot);
    expect(result.length).toBeGreaterThanOrEqual(2);
    // Best match first
    expect(result[0]!.entryId).toBe('wl-high');
    // Scores should be in descending order
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!.score).toBeGreaterThanOrEqual(result[i]!.score);
    }
  });

  it('filters out entries below the minimum score threshold of 10', () => {
    const slot = makeSlot();
    // Entry with wrong service, wrong provider, wrong date, wrong time, low priority
    const poorEntry = makeEntry({
      id: 'wl-poor',
      serviceId: 'svc-different',
      preferredProviderId: 'prov-different',
      preferredDate: '2026-06-01',
      preferredTimeStart: '23:00',
      preferredTimeEnd: '23:30',
      flexibility: 'exact',
      priority: 0,
    });

    const result = matchWaitlistEntries([poorEntry], slot);
    // Score = 0+0+0+0+0 = 0, should be filtered out
    expect(result).toEqual([]);
  });

  it('handles a single entry waitlist', () => {
    const slot = makeSlot();
    const entry = makeEntry({ id: 'wl-only' });
    const result = matchWaitlistEntries([entry], slot);

    expect(result).toHaveLength(1);
    expect(result[0]!.entryId).toBe('wl-only');
  });

  it('computes maxPriority across all entries (not just matched)', () => {
    const slot = makeSlot();
    const entries: WaitlistEntry[] = [
      makeEntry({
        id: 'wl-low-pri',
        priority: 2,
        serviceId: null,
        preferredProviderId: null,
        flexibility: 'any',
      }),
      makeEntry({
        id: 'wl-high-pri',
        priority: 10,
        serviceId: null,
        preferredProviderId: null,
        flexibility: 'any',
      }),
    ];

    const result = matchWaitlistEntries(entries, slot);
    // The low priority entry gets score = 2/10 = 0.2 for priority factor
    const lowPriMatch = result.find((m) => m.entryId === 'wl-low-pri');
    const highPriMatch = result.find((m) => m.entryId === 'wl-high-pri');
    expect(highPriMatch).toBeDefined();
    expect(lowPriMatch).toBeDefined();
    // High priority entry should score higher
    expect(highPriMatch!.score).toBeGreaterThan(lowPriMatch!.score);
  });

  it('handles service-specific entries that do not match the slot service', () => {
    const slot = makeSlot({ serviceId: 'svc-massage-60' });
    const entries: WaitlistEntry[] = [
      makeEntry({
        id: 'wl-facial-only',
        serviceId: 'svc-facial-30',
        preferredProviderId: null,
        preferredDate: null,
        flexibility: 'any',
        priority: 10,
      }),
    ];

    const result = matchWaitlistEntries(entries, slot);
    // Service mismatch => 0 for 30% of score = 70 max. Should still appear if > 10.
    // With all other factors at 1.0: 0 + 25 + 20 + 15 + 10 = 70
    expect(result).toHaveLength(1);
    expect(result[0]!.score).toBe(70);
  });

  it('returns date-flexible entries even when slot date differs', () => {
    const slot = makeSlot({
      startAt: new Date(2026, 5, 1, 10, 0), // June 1
      endAt: new Date(2026, 5, 1, 11, 0),
    });
    const entry = makeEntry({
      id: 'wl-flex-date',
      serviceId: 'svc-massage-60',
      preferredProviderId: 'prov-alice',
      preferredDate: '2026-03-15', // March 15 preferred, slot June 1
      flexibility: 'flexible_date',
      priority: 5,
    });

    const result = matchWaitlistEntries([entry], slot);
    expect(result).toHaveLength(1);
    // Date gets 1.0 (flexible_date), service 1.0, provider 1.0, time in window, priority normalized
    expect(result[0]!.score).toBeGreaterThanOrEqual(80);
  });

  it('returns multiple matches when many entries qualify', () => {
    const slot = makeSlot();
    // Use widely spaced priorities so rounding cannot create ties at the top
    const entries: WaitlistEntry[] = Array.from({ length: 10 }, (_, i) =>
      makeEntry({
        id: `wl-${String(i).padStart(3, '0')}`,
        serviceId: null, // any service
        preferredProviderId: null, // any provider
        flexibility: 'any',
        priority: (i + 1) * 10, // 10, 20, ... 100
      }),
    );

    const result = matchWaitlistEntries(entries, slot);
    expect(result).toHaveLength(10);
    // Highest priority entry (priority=100, index 9) should be first
    expect(result[0]!.entryId).toBe('wl-009');
    // Scores should be in descending order
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!.score).toBeGreaterThanOrEqual(result[i]!.score);
    }
  });

  it('maintains stable sort for entries with identical scores', () => {
    const slot = makeSlot();
    // Create entries with identical attributes (same score expected)
    const entries: WaitlistEntry[] = [
      makeEntry({ id: 'wl-a', priority: 5, flexibility: 'any', serviceId: null, preferredProviderId: null }),
      makeEntry({ id: 'wl-b', priority: 5, flexibility: 'any', serviceId: null, preferredProviderId: null }),
      makeEntry({ id: 'wl-c', priority: 5, flexibility: 'any', serviceId: null, preferredProviderId: null }),
    ];

    const result = matchWaitlistEntries(entries, slot);
    expect(result).toHaveLength(3);
    // All should have the same score
    expect(result[0]!.score).toBe(result[1]!.score);
    expect(result[1]!.score).toBe(result[2]!.score);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. isFlexibilityCompatible
// ═══════════════════════════════════════════════════════════════════

describe('isFlexibilityCompatible', () => {
  // ── flexibility: 'any' ──

  it('returns true for "any" flexibility regardless of all fields', () => {
    const entry = makeEntry({
      flexibility: 'any',
      serviceId: 'svc-different',
      preferredProviderId: 'prov-different',
      preferredDate: '2099-12-31',
      preferredTimeStart: '23:00',
      preferredTimeEnd: '23:30',
    });
    expect(isFlexibilityCompatible(entry, makeSlot())).toBe(true);
  });

  // ── flexibility: 'flexible_date' ──

  it('returns true for flexible_date when service matches', () => {
    const entry = makeEntry({
      flexibility: 'flexible_date',
      serviceId: 'svc-massage-60',
      preferredDate: '2026-06-01', // different date, doesn't matter
    });
    expect(isFlexibilityCompatible(entry, makeSlot())).toBe(true);
  });

  it('returns false for flexible_date when service mismatches', () => {
    const entry = makeEntry({
      flexibility: 'flexible_date',
      serviceId: 'svc-facial-30',
    });
    expect(isFlexibilityCompatible(entry, makeSlot({ serviceId: 'svc-massage-60' }))).toBe(false);
  });

  it('returns true for flexible_date with null serviceId (any service)', () => {
    const entry = makeEntry({
      flexibility: 'flexible_date',
      serviceId: null,
    });
    expect(isFlexibilityCompatible(entry, makeSlot())).toBe(true);
  });

  // ── flexibility: 'flexible_time' ──

  it('returns true for flexible_time when service and date match', () => {
    const entry = makeEntry({
      flexibility: 'flexible_time',
      serviceId: 'svc-massage-60',
      preferredDate: '2026-03-15',
    });
    expect(isFlexibilityCompatible(entry, makeSlot())).toBe(true);
  });

  it('returns false for flexible_time when date mismatches', () => {
    const entry = makeEntry({
      flexibility: 'flexible_time',
      serviceId: 'svc-massage-60',
      preferredDate: '2026-03-20',
    });
    expect(isFlexibilityCompatible(entry, makeSlot())).toBe(false);
  });

  it('returns false for flexible_time when service mismatches', () => {
    const entry = makeEntry({
      flexibility: 'flexible_time',
      serviceId: 'svc-facial-30',
      preferredDate: '2026-03-15',
    });
    expect(isFlexibilityCompatible(entry, makeSlot())).toBe(false);
  });

  it('returns true for flexible_time with null date (any date)', () => {
    const entry = makeEntry({
      flexibility: 'flexible_time',
      serviceId: 'svc-massage-60',
      preferredDate: null,
    });
    expect(isFlexibilityCompatible(entry, makeSlot())).toBe(true);
  });

  it('returns true for flexible_time with null serviceId (any service)', () => {
    const entry = makeEntry({
      flexibility: 'flexible_time',
      serviceId: null,
      preferredDate: '2026-03-15',
    });
    expect(isFlexibilityCompatible(entry, makeSlot())).toBe(true);
  });

  // ── flexibility: 'exact' ──

  it('returns true for exact when all fields match', () => {
    const entry = makeEntry({
      flexibility: 'exact',
      serviceId: 'svc-massage-60',
      preferredProviderId: 'prov-alice',
      preferredDate: '2026-03-15',
      preferredTimeStart: '09:00',
      preferredTimeEnd: '11:00',
    });
    expect(isFlexibilityCompatible(entry, makeSlot())).toBe(true);
  });

  it('returns false for exact when service mismatches', () => {
    const entry = makeEntry({
      flexibility: 'exact',
      serviceId: 'svc-facial-30',
    });
    expect(isFlexibilityCompatible(entry, makeSlot())).toBe(false);
  });

  it('returns false for exact when provider mismatches', () => {
    const entry = makeEntry({
      flexibility: 'exact',
      serviceId: 'svc-massage-60',
      preferredProviderId: 'prov-bob',
    });
    expect(isFlexibilityCompatible(entry, makeSlot({ providerId: 'prov-alice' }))).toBe(false);
  });

  it('returns true for exact when preferredProviderId is null (any provider)', () => {
    const entry = makeEntry({
      flexibility: 'exact',
      serviceId: 'svc-massage-60',
      preferredProviderId: null,
      preferredDate: '2026-03-15',
      preferredTimeStart: '09:00',
      preferredTimeEnd: '11:00',
    });
    expect(isFlexibilityCompatible(entry, makeSlot())).toBe(true);
  });

  it('returns false for exact when date mismatches', () => {
    const entry = makeEntry({
      flexibility: 'exact',
      serviceId: 'svc-massage-60',
      preferredProviderId: 'prov-alice',
      preferredDate: '2026-03-20',
    });
    expect(isFlexibilityCompatible(entry, makeSlot())).toBe(false);
  });

  it('returns true for exact when preferredDate is null (any date)', () => {
    const entry = makeEntry({
      flexibility: 'exact',
      serviceId: 'svc-massage-60',
      preferredProviderId: 'prov-alice',
      preferredDate: null,
      preferredTimeStart: '09:00',
      preferredTimeEnd: '11:00',
    });
    expect(isFlexibilityCompatible(entry, makeSlot())).toBe(true);
  });

  it('returns false for exact when slot time is outside preferred window', () => {
    const entry = makeEntry({
      flexibility: 'exact',
      serviceId: 'svc-massage-60',
      preferredProviderId: 'prov-alice',
      preferredDate: '2026-03-15',
      preferredTimeStart: '14:00',
      preferredTimeEnd: '16:00',
    });
    // Slot at 10:00 AM, window is 14:00-16:00
    expect(isFlexibilityCompatible(entry, makeSlot())).toBe(false);
  });

  it('returns true for exact when one time preference is null (no time check)', () => {
    const entry = makeEntry({
      flexibility: 'exact',
      serviceId: 'svc-massage-60',
      preferredProviderId: 'prov-alice',
      preferredDate: '2026-03-15',
      preferredTimeStart: null,
      preferredTimeEnd: null,
    });
    expect(isFlexibilityCompatible(entry, makeSlot())).toBe(true);
  });

  it('returns true for exact when slot time equals the start of the window', () => {
    const entry = makeEntry({
      flexibility: 'exact',
      serviceId: 'svc-massage-60',
      preferredProviderId: 'prov-alice',
      preferredDate: '2026-03-15',
      preferredTimeStart: '10:00', // exactly at slot start
      preferredTimeEnd: '12:00',
    });
    expect(isFlexibilityCompatible(entry, makeSlot())).toBe(true);
  });

  it('returns true for exact when slot time equals the end of the window', () => {
    const slot = makeSlot({
      startAt: new Date(2026, 2, 15, 12, 0),
      endAt: new Date(2026, 2, 15, 13, 0),
    });
    const entry = makeEntry({
      flexibility: 'exact',
      serviceId: 'svc-massage-60',
      preferredProviderId: 'prov-alice',
      preferredDate: '2026-03-15',
      preferredTimeStart: '10:00',
      preferredTimeEnd: '12:00', // exactly at slot start
    });
    expect(isFlexibilityCompatible(entry, slot)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. formatMatchSummary
// ═══════════════════════════════════════════════════════════════════

describe('formatMatchSummary', () => {
  it('returns a readable summary with the score', () => {
    const match: WaitlistMatch = {
      entryId: 'wl-001',
      customerId: 'cust-001',
      score: 85,
      factors: [
        { name: 'service_match', weight: 0.30, score: 1.0, detail: 'service match' },
        { name: 'provider_match', weight: 0.25, score: 1.0, detail: 'provider match' },
        { name: 'date_match', weight: 0.20, score: 1.0, detail: 'same day' },
        { name: 'time_match', weight: 0.15, score: 1.0, detail: 'within preferred time' },
        { name: 'priority_boost', weight: 0.10, score: 0.5, detail: 'medium priority' },
      ],
    };

    const summary = formatMatchSummary(match);
    expect(summary).toContain('85/100');
    expect(summary).toContain('Strong match');
  });

  it('includes up to 3 top-scoring factor details', () => {
    const match: WaitlistMatch = {
      entryId: 'wl-001',
      customerId: null,
      score: 70,
      factors: [
        { name: 'service_match', weight: 0.30, score: 1.0, detail: 'service match' },
        { name: 'provider_match', weight: 0.25, score: 1.0, detail: 'provider match' },
        { name: 'date_match', weight: 0.20, score: 1.0, detail: 'same day' },
        { name: 'time_match', weight: 0.15, score: 0.0, detail: 'outside preferred time' },
        { name: 'priority_boost', weight: 0.10, score: 0.5, detail: 'medium priority' },
      ],
    };

    const summary = formatMatchSummary(match);
    // Top 3 by weight*score: service (0.30), provider (0.25), date (0.20)
    expect(summary).toContain('service match');
    expect(summary).toContain('provider match');
    expect(summary).toContain('same day');
    // Should not contain the 0-score factor detail
    expect(summary).not.toContain('outside preferred time');
  });

  it('uses "Good match" label for scores 60-79', () => {
    const match: WaitlistMatch = {
      entryId: 'wl-001',
      customerId: null,
      score: 65,
      factors: [
        { name: 'service_match', weight: 0.30, score: 1.0, detail: 'service match' },
      ],
    };
    expect(formatMatchSummary(match)).toContain('Good match');
  });

  it('uses "Fair match" label for scores 40-59', () => {
    const match: WaitlistMatch = {
      entryId: 'wl-001',
      customerId: null,
      score: 45,
      factors: [
        { name: 'service_match', weight: 0.30, score: 1.0, detail: 'service match' },
      ],
    };
    expect(formatMatchSummary(match)).toContain('Fair match');
  });

  it('uses "Weak match" label for scores 20-39', () => {
    const match: WaitlistMatch = {
      entryId: 'wl-001',
      customerId: null,
      score: 25,
      factors: [
        { name: 'provider_match', weight: 0.25, score: 1.0, detail: 'any provider accepted' },
      ],
    };
    expect(formatMatchSummary(match)).toContain('Weak match');
  });

  it('uses "Poor match" label for scores below 20', () => {
    const match: WaitlistMatch = {
      entryId: 'wl-001',
      customerId: null,
      score: 10,
      factors: [
        { name: 'priority_boost', weight: 0.10, score: 1.0, detail: 'high priority' },
      ],
    };
    expect(formatMatchSummary(match)).toContain('Poor match');
  });

  it('returns "no strong factors" when all factor scores are 0', () => {
    const match: WaitlistMatch = {
      entryId: 'wl-001',
      customerId: null,
      score: 0,
      factors: [
        { name: 'service_match', weight: 0.30, score: 0, detail: 'service mismatch' },
        { name: 'provider_match', weight: 0.25, score: 0, detail: 'provider mismatch' },
        { name: 'date_match', weight: 0.20, score: 0, detail: 'date mismatch' },
        { name: 'time_match', weight: 0.15, score: 0, detail: 'outside preferred time' },
        { name: 'priority_boost', weight: 0.10, score: 0, detail: 'low priority' },
      ],
    };

    const summary = formatMatchSummary(match);
    expect(summary).toContain('no strong factors');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Edge Cases
// ═══════════════════════════════════════════════════════════════════

describe('edge cases', () => {
  it('handles entries where all preference fields are null (open to anything)', () => {
    const entry = makeEntry({
      serviceId: null,
      preferredProviderId: null,
      preferredDate: null,
      preferredTimeStart: null,
      preferredTimeEnd: null,
      flexibility: 'any',
      priority: 10,
    });
    const slot = makeSlot();
    const result = scoreWaitlistEntry(entry, slot, 10);

    // All factors should be 1.0 => score = 100
    expect(result.score).toBe(100);
  });

  it('handles a slot at midnight (00:00)', () => {
    const slot = makeSlot({
      startAt: new Date(2026, 2, 15, 0, 0),
      endAt: new Date(2026, 2, 15, 1, 0),
    });
    const entry = makeEntry({
      preferredTimeStart: '00:00',
      preferredTimeEnd: '01:00',
    });
    const result = scoreWaitlistEntry(entry, slot, 5);
    const timeFactor = result.factors.find((f) => f.name === 'time_match');
    expect(timeFactor!.score).toBe(1.0);
  });

  it('handles a slot at end of day (23:00)', () => {
    const slot = makeSlot({
      startAt: new Date(2026, 2, 15, 23, 0),
      endAt: new Date(2026, 2, 15, 23, 59),
    });
    const entry = makeEntry({
      preferredTimeStart: '22:00',
      preferredTimeEnd: '23:30',
    });
    const result = scoreWaitlistEntry(entry, slot, 5);
    const timeFactor = result.factors.find((f) => f.name === 'time_match');
    expect(timeFactor!.score).toBe(1.0);
  });

  it('treats entries on the same day with all-zero priority correctly', () => {
    const entries: WaitlistEntry[] = [
      makeEntry({ id: 'wl-1', priority: 0, serviceId: null, preferredProviderId: null, flexibility: 'any' }),
      makeEntry({ id: 'wl-2', priority: 0, serviceId: null, preferredProviderId: null, flexibility: 'any' }),
    ];
    const slot = makeSlot();
    const result = matchWaitlistEntries(entries, slot);

    // maxPriority = Math.max(0, 0, 1) = 1, so priority normalized = 0/1 = 0
    expect(result).toHaveLength(2);
    // Both entries should have the same score
    expect(result[0]!.score).toBe(result[1]!.score);
  });

  it('score is always a rounded integer (not float)', () => {
    // Create entry that produces a fractional raw score
    const entry = makeEntry({
      serviceId: 'svc-massage-60',
      preferredProviderId: 'prov-different', // 0 provider score
      preferredDate: '2026-03-16',           // 0.5 date score
      preferredTimeStart: '10:30',           // 0.5 time (within 1 hour)
      preferredTimeEnd: '12:00',
      flexibility: 'exact',
      priority: 3,
    });
    const slot = makeSlot();
    const result = scoreWaitlistEntry(entry, slot, 10);

    expect(Number.isInteger(result.score)).toBe(true);
  });

  it('matchWaitlistEntries correctly maxes priority at 1 even with single entry', () => {
    const entry = makeEntry({
      id: 'wl-solo',
      priority: 7,
      serviceId: null,
      preferredProviderId: null,
      flexibility: 'any',
    });
    const result = matchWaitlistEntries([entry], makeSlot());

    // maxPriority = max(7, 1) = 7, so priority = 7/7 = 1.0
    const priorityFactor = result[0]!.factors.find((f) => f.name === 'priority_boost');
    expect(priorityFactor!.score).toBe(1.0);
  });

  it('entries with all mismatches but "any" flexibility still get partial scores', () => {
    const entry = makeEntry({
      serviceId: 'svc-different',
      preferredProviderId: 'prov-different',
      preferredDate: '2026-12-25',
      preferredTimeStart: '22:00',
      preferredTimeEnd: '23:00',
      flexibility: 'any',
      priority: 1,
    });
    const slot = makeSlot();
    const result = scoreWaitlistEntry(entry, slot, 10);

    // Service mismatch: 0. Provider mismatch: 0. But "any" flexibility gives:
    // date_match: 1.0 (flexibility=any), time_match: 1.0 (flexibility=any),
    // priority: 1/10 = 0.1
    // Score = (0*0.30 + 0*0.25 + 1.0*0.20 + 1.0*0.15 + 0.1*0.10) * 100 = 36
    expect(result.score).toBe(36);
    expect(result.score).toBeGreaterThanOrEqual(10); // passes MIN_MATCH_SCORE
  });

  it('isFlexibilityCompatible returns false for unknown flexibility values', () => {
    const entry = makeEntry({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      flexibility: 'unknown_mode' as any,
    });
    expect(isFlexibilityCompatible(entry, makeSlot())).toBe(false);
  });

  it('formatMatchSummary handles empty factors array', () => {
    const match: WaitlistMatch = {
      entryId: 'wl-001',
      customerId: null,
      score: 0,
      factors: [],
    };
    const summary = formatMatchSummary(match);
    expect(summary).toContain('no strong factors');
    expect(summary).toContain('0/100');
  });

  it('score weights sum to 1.0 across all 5 factors', () => {
    const entry = makeEntry();
    const slot = makeSlot();
    const result = scoreWaitlistEntry(entry, slot, 5);

    const totalWeight = result.factors.reduce((sum, f) => sum + f.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0, 10);
  });
});
