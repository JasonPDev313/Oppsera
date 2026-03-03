import { describe, it, expect } from 'vitest';
import {
  aggregateGuestProfile,
  computeReliabilityScore,
  deriveGuestSegment,
  mergeVisitData,
} from '../services/guest-profile-aggregator';
import type {
  GuestReservationData,
  GuestTabData,
  GuestProfileSummary,
  NewVisitData,
} from '../services/guest-profile-aggregator';

// ── Helpers ──────────────────────────────────────────────────────────

const makeReservation = (
  status: string,
  date = '2026-01-15',
  partySize = 2,
  overrides: Partial<GuestReservationData> = {},
): GuestReservationData => ({
  status,
  date,
  partySize,
  ...overrides,
});

const makeTab = (
  totalCents: number,
  overrides: Partial<GuestTabData> = {},
): GuestTabData => ({
  totalCents,
  items: [],
  ...overrides,
});

// ── aggregateGuestProfile ────────────────────────────────────────────

describe('aggregateGuestProfile — first visit', () => {
  it('computes visitCount=1 for a single completed reservation and no tabs', () => {
    const reservations = [makeReservation('completed', '2026-01-15')];
    const tabs: GuestTabData[] = [];

    const profile = aggregateGuestProfile(reservations, tabs);

    expect(profile.visitCount).toBe(1);
  });

  it('computes visitCount=1 for a single tab (no reservations)', () => {
    const reservations: GuestReservationData[] = [];
    const tabs = [makeTab(4500)];

    const profile = aggregateGuestProfile(reservations, tabs);

    expect(profile.visitCount).toBe(1);
    expect(profile.totalSpendCents).toBe(4500);
  });

  it('sets firstVisitDate and lastVisitDate from completed reservation', () => {
    const reservations = [makeReservation('completed', '2026-01-15')];
    const tabs: GuestTabData[] = [];

    const profile = aggregateGuestProfile(reservations, tabs);

    expect(profile.firstVisitDate).toBe('2026-01-15');
    expect(profile.lastVisitDate).toBe('2026-01-15');
  });
});

describe('aggregateGuestProfile — repeat guest', () => {
  it('increments visitCount across multiple completed reservations and tabs', () => {
    const reservations = [
      makeReservation('completed', '2026-01-10'),
      makeReservation('completed', '2026-01-20'),
      makeReservation('seated', '2026-02-01'),
    ];
    const tabs = [makeTab(3000), makeTab(5000)];

    const profile = aggregateGuestProfile(reservations, tabs);

    // 3 completed/seated reservations + 2 tabs
    expect(profile.visitCount).toBe(5);
  });

  it('accumulates totalSpendCents across all tabs', () => {
    const reservations: GuestReservationData[] = [];
    const tabs = [makeTab(2000), makeTab(3000), makeTab(5000)];

    const profile = aggregateGuestProfile(reservations, tabs);

    expect(profile.totalSpendCents).toBe(10_000);
  });

  it('computes avgTicketCents as total / tab count', () => {
    const reservations: GuestReservationData[] = [];
    const tabs = [makeTab(3000), makeTab(5000)]; // avg = 4000

    const profile = aggregateGuestProfile(reservations, tabs);

    expect(profile.avgTicketCents).toBe(4000);
  });

  it('sets firstVisitDate to earliest completed reservation date', () => {
    const reservations = [
      makeReservation('completed', '2026-03-01'),
      makeReservation('completed', '2025-12-15'),
      makeReservation('completed', '2026-01-20'),
    ];

    const profile = aggregateGuestProfile(reservations, []);

    expect(profile.firstVisitDate).toBe('2025-12-15');
    expect(profile.lastVisitDate).toBe('2026-03-01');
  });
});

describe('aggregateGuestProfile — no-show tracking', () => {
  it('tracks noShowCount from reservations with status no_show', () => {
    const reservations = [
      makeReservation('completed', '2026-01-01'),
      makeReservation('no_show', '2026-01-08'),
      makeReservation('no_show', '2026-01-15'),
    ];

    const profile = aggregateGuestProfile(reservations, []);

    expect(profile.noShowCount).toBe(2);
  });

  it('computes noShowRate = noShowCount / (visitCount + noShowCount)', () => {
    const reservations = [
      makeReservation('completed', '2026-01-01'),
      makeReservation('completed', '2026-01-08'),
      makeReservation('no_show', '2026-01-15'),
    ];

    const profile = aggregateGuestProfile(reservations, []);

    // visitCount=2, noShowCount=1, total=3
    expect(profile.noShowRate).toBeCloseTo(1 / 3, 5);
  });

  it('computes noShowRate=0 when no no-shows', () => {
    const reservations = [
      makeReservation('completed', '2026-01-01'),
      makeReservation('completed', '2026-01-08'),
    ];

    const profile = aggregateGuestProfile(reservations, []);

    expect(profile.noShowRate).toBe(0);
  });

  it('computes noShowRate=1 when all are no-shows', () => {
    const reservations = [
      makeReservation('no_show', '2026-01-01'),
      makeReservation('no_show', '2026-01-08'),
    ];

    const profile = aggregateGuestProfile(reservations, []);

    // visitCount=0, noShowCount=2 → rate = 2/(0+2) = 1
    expect(profile.noShowRate).toBe(1);
  });

  it('tracks cancelCount separately from noShowCount', () => {
    const reservations = [
      makeReservation('canceled', '2026-01-01'),
      makeReservation('canceled', '2026-01-08'),
      makeReservation('no_show', '2026-01-15'),
    ];

    const profile = aggregateGuestProfile(reservations, []);

    expect(profile.cancelCount).toBe(2);
    expect(profile.noShowCount).toBe(1);
  });

  it('returns noShowRate=0 when no reservations and no tabs', () => {
    const profile = aggregateGuestProfile([], []);
    expect(profile.noShowRate).toBe(0);
  });
});

describe('aggregateGuestProfile — frequent items (top 5)', () => {
  it('aggregates item quantities across multiple tabs', () => {
    const tabs = [
      makeTab(2000, {
        items: [
          { catalogItemId: 'item-1', name: 'Burger', qty: 2 },
          { catalogItemId: 'item-2', name: 'Fries', qty: 1 },
        ],
      }),
      makeTab(3000, {
        items: [
          { catalogItemId: 'item-1', name: 'Burger', qty: 1 },
          { catalogItemId: 'item-3', name: 'Soda', qty: 3 },
        ],
      }),
    ];

    const profile = aggregateGuestProfile([], tabs);

    const burger = profile.frequentItems.find((i) => i.catalogItemId === 'item-1');
    expect(burger).toBeDefined();
    expect(burger!.count).toBe(3); // 2 + 1
    expect(burger!.name).toBe('Burger');
  });

  it('returns top 5 items only, ordered by count descending', () => {
    const items = Array.from({ length: 8 }, (_, i) => ({
      catalogItemId: `item-${i}`,
      name: `Item ${i}`,
      qty: 8 - i, // item-0 has qty 8, item-7 has qty 1
    }));

    const tabs = [makeTab(10_000, { items })];
    const profile = aggregateGuestProfile([], tabs);

    expect(profile.frequentItems).toHaveLength(5);
    // Should be item-0 (8), item-1 (7), item-2 (6), item-3 (5), item-4 (4)
    expect(profile.frequentItems[0]!.catalogItemId).toBe('item-0');
    expect(profile.frequentItems[0]!.count).toBe(8);
    expect(profile.frequentItems[4]!.catalogItemId).toBe('item-4');
  });

  it('returns empty frequentItems when no tabs', () => {
    const profile = aggregateGuestProfile([], []);
    expect(profile.frequentItems).toHaveLength(0);
  });

  it('returns empty frequentItems when tabs have no items', () => {
    const tabs = [makeTab(2000, { items: [] }), makeTab(3000, { items: [] })];
    const profile = aggregateGuestProfile([], tabs);
    expect(profile.frequentItems).toHaveLength(0);
  });
});

describe('aggregateGuestProfile — preferred table detection', () => {
  it('returns most frequent tableId as first in preferredTables', () => {
    const tabs = [
      makeTab(2000, { tableId: 'table-5' }),
      makeTab(3000, { tableId: 'table-5' }),
      makeTab(1500, { tableId: 'table-3' }),
    ];

    const profile = aggregateGuestProfile([], tabs);

    // table-5 visited twice, table-3 once
    expect(profile.preferredTables).toContain('table-5');
    expect(profile.preferredTables.split(',')[0]).toBe('table-5');
  });

  it('returns empty string when no tabs have tableId', () => {
    const tabs = [makeTab(2000), makeTab(3000)];
    const profile = aggregateGuestProfile([], tabs);
    expect(profile.preferredTables).toBe('');
  });

  it('comma-separates multiple preferred tables ordered by frequency', () => {
    const tabs = [
      makeTab(1000, { tableId: 'table-A' }),
      makeTab(1000, { tableId: 'table-B' }),
      makeTab(1000, { tableId: 'table-A' }),
      makeTab(1000, { tableId: 'table-C' }),
      makeTab(1000, { tableId: 'table-B' }),
      makeTab(1000, { tableId: 'table-A' }),
    ];

    const profile = aggregateGuestProfile([], tabs);

    const parts = profile.preferredTables.split(',');
    // table-A: 3, table-B: 2, table-C: 1
    expect(parts[0]).toBe('table-A');
    expect(parts[1]).toBe('table-B');
    expect(parts[2]).toBe('table-C');
  });
});

describe('aggregateGuestProfile — preferred server', () => {
  it('returns most frequent serverUserId', () => {
    const tabs = [
      makeTab(2000, { serverUserId: 'server-1' }),
      makeTab(3000, { serverUserId: 'server-1' }),
      makeTab(1500, { serverUserId: 'server-2' }),
    ];

    const profile = aggregateGuestProfile([], tabs);

    expect(profile.preferredServer).toBe('server-1');
  });

  it('returns null when no tabs have serverUserId', () => {
    const tabs = [makeTab(2000), makeTab(3000)];
    const profile = aggregateGuestProfile([], tabs);
    expect(profile.preferredServer).toBeNull();
  });
});

describe('aggregateGuestProfile — no data', () => {
  it('returns all zeros and nulls when given empty inputs', () => {
    const profile = aggregateGuestProfile([], []);

    expect(profile.visitCount).toBe(0);
    expect(profile.noShowCount).toBe(0);
    expect(profile.cancelCount).toBe(0);
    expect(profile.avgTicketCents).toBe(0);
    expect(profile.totalSpendCents).toBe(0);
    expect(profile.lastVisitDate).toBeNull();
    expect(profile.firstVisitDate).toBeNull();
    expect(profile.preferredTables).toBe('');
    expect(profile.preferredServer).toBeNull();
    expect(profile.frequentItems).toHaveLength(0);
    expect(profile.noShowRate).toBe(0);
  });

  it('does not count canceled or unknown statuses in visitCount', () => {
    const reservations = [
      makeReservation('canceled', '2026-01-01'),
      makeReservation('pending', '2026-01-08'),
      makeReservation('confirmed', '2026-01-15'),
    ];

    const profile = aggregateGuestProfile(reservations, []);

    // None of these are 'completed' or 'seated'
    expect(profile.visitCount).toBe(0);
    expect(profile.cancelCount).toBe(1);
  });

  it('avgTicketCents is 0 when there are no tabs', () => {
    const reservations = [makeReservation('completed', '2026-01-01')];
    const profile = aggregateGuestProfile(reservations, []);
    expect(profile.avgTicketCents).toBe(0);
  });
});

describe('aggregateGuestProfile — mixed scenarios', () => {
  it('handles guest with long history: many visits, some no-shows, rich item data', () => {
    const reservations = [
      makeReservation('completed', '2025-06-01'),
      makeReservation('completed', '2025-07-15'),
      makeReservation('no_show', '2025-08-01'),
      makeReservation('completed', '2025-09-10'),
      makeReservation('canceled', '2025-10-20'),
      makeReservation('seated', '2025-11-05'),
    ];

    const tabs = [
      makeTab(8500, {
        tableId: 'table-7',
        serverUserId: 'server-A',
        items: [
          { catalogItemId: 'steak', name: 'Ribeye', qty: 1 },
          { catalogItemId: 'wine', name: 'Cabernet', qty: 2 },
        ],
      }),
      makeTab(12000, {
        tableId: 'table-7',
        serverUserId: 'server-A',
        items: [
          { catalogItemId: 'steak', name: 'Ribeye', qty: 2 },
          { catalogItemId: 'salad', name: 'Caesar', qty: 1 },
        ],
      }),
      makeTab(9500, {
        tableId: 'table-3',
        serverUserId: 'server-B',
        items: [
          { catalogItemId: 'pasta', name: 'Carbonara', qty: 1 },
        ],
      }),
    ];

    const profile = aggregateGuestProfile(reservations, tabs);

    // visitCount: 4 completed/seated + 3 tabs = 7
    expect(profile.visitCount).toBe(7);
    expect(profile.noShowCount).toBe(1);
    expect(profile.cancelCount).toBe(1);

    // totalSpend = 8500 + 12000 + 9500 = 30000
    expect(profile.totalSpendCents).toBe(30_000);
    // avgTicket = 30000 / 3 = 10000
    expect(profile.avgTicketCents).toBe(10_000);

    // noShowRate = 1 / (7 + 1) = 0.125
    expect(profile.noShowRate).toBeCloseTo(0.125, 5);

    // preferredTables: table-7 (2), table-3 (1)
    expect(profile.preferredTables.split(',')[0]).toBe('table-7');

    // preferredServer: server-A (2), server-B (1)
    expect(profile.preferredServer).toBe('server-A');

    // frequentItems: steak(3), wine(2), salad(1), pasta(1)
    expect(profile.frequentItems[0]!.catalogItemId).toBe('steak');
    expect(profile.frequentItems[0]!.count).toBe(3);
  });
});

// ── Helpers for new functions ─────────────────────────────────────────────────

function makeProfile(overrides: Partial<GuestProfileSummary> = {}): GuestProfileSummary {
  return {
    visitCount: 0,
    noShowCount: 0,
    cancelCount: 0,
    totalSpendCents: 0,
    avgTicketCents: null,
    lastVisitDate: null,
    firstVisitDate: null,
    preferredTables: null,
    preferredServer: null,
    ...overrides,
  };
}

function makeVisit(overrides: Partial<NewVisitData> = {}): NewVisitData {
  return {
    visitDate: '2026-03-01',
    spendCents: 5000,
    ...overrides,
  };
}

// ── computeReliabilityScore ──────────────────────────────────────────────────

describe('computeReliabilityScore', () => {
  it('returns 100 for a guest with zero visits (no history = assume reliable)', () => {
    expect(computeReliabilityScore(0, 0, 0)).toBe(100);
  });

  it('returns 100 for a guest with perfect attendance (0 no-shows, 0 cancels)', () => {
    expect(computeReliabilityScore(10, 0, 0)).toBe(100);
  });

  it('penalizes no-shows heavily (60 points per unit rate)', () => {
    // 5 visits, 5 no-shows → noShowRate = 5/10 = 0.5 → score = 100 - 0.5*60 = 70
    expect(computeReliabilityScore(5, 5, 0)).toBe(70);
  });

  it('penalizes cancels lightly (20 points per unit rate)', () => {
    // 8 visits, 0 no-shows, 2 cancels → cancelRate = 2/10 = 0.2 → score = 100 - 0.2*20 = 96
    expect(computeReliabilityScore(8, 0, 2)).toBe(96);
  });

  it('applies both no-show and cancel penalties together', () => {
    // 6 visits, 2 no-shows, 2 cancels → total=10
    // noShowRate = 2/10 = 0.2 → penalty = 12
    // cancelRate = 2/10 = 0.2 → penalty = 4
    // score = 100 - 12 - 4 = 84
    expect(computeReliabilityScore(6, 2, 2)).toBe(84);
  });

  it('score is always clamped within [0, 100]', () => {
    const cases: [number, number, number][] = [
      [0, 0, 0],
      [100, 0, 0],
      [0, 100, 0],
      [0, 0, 100],
      [10, 5, 3],
      [1, 50, 50],
    ];

    for (const [v, ns, c] of cases) {
      const score = computeReliabilityScore(v, ns, c);
      expect(score, `visits=${v}, noShows=${ns}, cancels=${c}`).toBeGreaterThanOrEqual(0);
      expect(score, `visits=${v}, noShows=${ns}, cancels=${c}`).toBeLessThanOrEqual(100);
    }
  });

  it('penalizes 100% no-show rate to 40 (100 - 1.0*60)', () => {
    // 0 visits, 10 no-shows → noShowRate = 1.0 → score = 100 - 60 = 40
    expect(computeReliabilityScore(0, 10, 0)).toBe(40);
  });
});

// ── deriveGuestSegment ───────────────────────────────────────────────────────

describe('deriveGuestSegment', () => {
  it("returns 'new' for a guest with 1 visit", () => {
    expect(deriveGuestSegment(1, 0)).toBe('new');
  });

  it("returns 'new' for a guest with 2 visits", () => {
    expect(deriveGuestSegment(2, 0)).toBe('new');
  });

  it("returns 'regular' for a guest with 3 visits", () => {
    expect(deriveGuestSegment(3, 0)).toBe('regular');
  });

  it("returns 'regular' for a guest with 5 visits", () => {
    expect(deriveGuestSegment(5, 1000)).toBe('regular');
  });

  it("returns 'regular' for a guest with 10 visits", () => {
    expect(deriveGuestSegment(10, 0)).toBe('regular');
  });

  it("returns 'loyal' for a guest with 11 visits", () => {
    expect(deriveGuestSegment(11, 0)).toBe('loyal');
  });

  it("returns 'loyal' for a guest with 15 visits", () => {
    expect(deriveGuestSegment(15, 2000)).toBe('loyal');
  });

  it("returns 'loyal' for a guest with 25 visits", () => {
    expect(deriveGuestSegment(25, 0)).toBe('loyal');
  });

  it("returns 'vip' for a guest with 26 visits (>25)", () => {
    expect(deriveGuestSegment(26, 0)).toBe('vip');
  });

  it("returns 'vip' for a guest with high lifetime spend at default threshold", () => {
    // totalSpendCents = 50000 (=$500) at default vipThreshold → vip
    expect(deriveGuestSegment(3, 50000)).toBe('vip');
  });

  it("returns 'regular' when spend is just below default vipThreshold", () => {
    expect(deriveGuestSegment(5, 49999)).toBe('regular');
  });

  it('respects custom vipThresholdCents override', () => {
    // custom threshold = 10000 (=$100)
    expect(deriveGuestSegment(2, 10000, 10000)).toBe('vip');
    expect(deriveGuestSegment(2, 9999, 10000)).toBe('new');
  });

  it("returns 'new' for zero visits and zero spend", () => {
    expect(deriveGuestSegment(0, 0)).toBe('new');
  });
});

// ── mergeVisitData ───────────────────────────────────────────────────────────

describe('mergeVisitData', () => {
  it('first visit creates profile with correct counts and dates', () => {
    const profile = makeProfile();
    const visit = makeVisit({ visitDate: '2026-01-15', spendCents: 7500 });

    const result = mergeVisitData(profile, visit);

    expect(result.visitCount).toBe(1);
    expect(result.noShowCount).toBe(0);
    expect(result.cancelCount).toBe(0);
    expect(result.totalSpendCents).toBe(7500);
    expect(result.avgTicketCents).toBe(7500);
    expect(result.firstVisitDate).toBe('2026-01-15');
    expect(result.lastVisitDate).toBe('2026-01-15');
  });

  it('subsequent visit increments visitCount and updates lastVisitDate', () => {
    const profile = makeProfile({
      visitCount: 3,
      totalSpendCents: 15000,
      avgTicketCents: 5000,
      firstVisitDate: '2025-10-01',
      lastVisitDate: '2026-02-01',
    });
    const visit = makeVisit({ visitDate: '2026-03-01', spendCents: 6000 });

    const result = mergeVisitData(profile, visit);

    expect(result.visitCount).toBe(4);
    expect(result.totalSpendCents).toBe(21000);
    expect(result.avgTicketCents).toBe(5250); // 21000 / 4
    expect(result.firstVisitDate).toBe('2025-10-01'); // unchanged
    expect(result.lastVisitDate).toBe('2026-03-01');
  });

  it('no-show increments noShowCount but NOT visitCount or totalSpend', () => {
    const profile = makeProfile({ visitCount: 5, totalSpendCents: 25000 });
    const visit = makeVisit({ wasNoShow: true, spendCents: 0 });

    const result = mergeVisitData(profile, visit);

    expect(result.noShowCount).toBe(1);
    expect(result.visitCount).toBe(5); // unchanged
    expect(result.totalSpendCents).toBe(25000); // unchanged
  });

  it('cancel increments cancelCount but NOT visitCount or totalSpend', () => {
    const profile = makeProfile({ visitCount: 2, totalSpendCents: 10000 });
    const visit = makeVisit({ wasCanceled: true, spendCents: 0 });

    const result = mergeVisitData(profile, visit);

    expect(result.cancelCount).toBe(1);
    expect(result.visitCount).toBe(2); // unchanged
    expect(result.totalSpendCents).toBe(10000); // unchanged
  });

  it('updates preferredTables when tableId provided for actual visit', () => {
    const profile = makeProfile({ preferredTables: 'table-old' });
    const visit = makeVisit({ tableId: 'table-5' });

    const result = mergeVisitData(profile, visit);

    expect(result.preferredTables).toBe('table-5');
  });

  it('preserves preferredTables when no tableId on actual visit', () => {
    const profile = makeProfile({ preferredTables: 'table-3' });
    const visit = makeVisit({ tableId: undefined });

    const result = mergeVisitData(profile, visit);

    expect(result.preferredTables).toBe('table-3');
  });

  it('does NOT update preferredTables on no-show even when tableId provided', () => {
    const profile = makeProfile({ preferredTables: 'table-1' });
    const visit = makeVisit({ wasNoShow: true, tableId: 'table-99' });

    const result = mergeVisitData(profile, visit);

    expect(result.preferredTables).toBe('table-1');
  });

  it('updates preferredServer when serverUserId provided for actual visit', () => {
    const profile = makeProfile({ preferredServer: 'server-old' });
    const visit = makeVisit({ serverUserId: 'server-new' });

    const result = mergeVisitData(profile, visit);

    expect(result.preferredServer).toBe('server-new');
  });

  it('does NOT update preferredServer on cancel even when serverUserId provided', () => {
    const profile = makeProfile({ preferredServer: 'server-1' });
    const visit = makeVisit({ wasCanceled: true, serverUserId: 'server-99' });

    const result = mergeVisitData(profile, visit);

    expect(result.preferredServer).toBe('server-1');
  });

  it('includes reliabilityScore in result', () => {
    const profile = makeProfile({ visitCount: 10, noShowCount: 0, cancelCount: 0 });
    const visit = makeVisit();

    const result = mergeVisitData(profile, visit);

    expect(result.reliabilityScore).toBe(100); // perfect attendance
  });

  it('includes segment in result', () => {
    const profile = makeProfile({ visitCount: 0 });
    const visit = makeVisit({ spendCents: 0 });

    const result = mergeVisitData(profile, visit);

    // 0+1 = 1 visit → 'new'
    expect(result.segment).toBe('new');
  });

  it('preserves earlier firstVisitDate when existing is earlier', () => {
    const profile = makeProfile({
      visitCount: 1,
      totalSpendCents: 5000,
      firstVisitDate: '2025-06-01',
      lastVisitDate: '2025-06-01',
    });
    const visit = makeVisit({ visitDate: '2026-01-01' });

    const result = mergeVisitData(profile, visit);

    expect(result.firstVisitDate).toBe('2025-06-01'); // earlier stays
    expect(result.lastVisitDate).toBe('2026-01-01'); // newer replaces
  });

  it('avgTicketCents is 0 when visitCount stays 0 (all no-shows)', () => {
    const profile = makeProfile({ visitCount: 0 });
    const visit = makeVisit({ wasNoShow: true, spendCents: 5000 });

    const result = mergeVisitData(profile, visit);

    expect(result.avgTicketCents).toBe(0);
    expect(result.visitCount).toBe(0);
  });
});

// ── Edge-case additions (hardening pass) ──────────────────────────────────────

describe('aggregateGuestProfile — guest with only no-shows (0 visits, 5 no-shows)', () => {
  it('computes visitCount=0 and noShowCount=5 when all reservations are no_show', () => {
    const reservations = [
      makeReservation('no_show', '2026-01-01'),
      makeReservation('no_show', '2026-01-08'),
      makeReservation('no_show', '2026-01-15'),
      makeReservation('no_show', '2026-01-22'),
      makeReservation('no_show', '2026-01-29'),
    ];

    const profile = aggregateGuestProfile(reservations, []);

    expect(profile.visitCount).toBe(0);
    expect(profile.noShowCount).toBe(5);
    expect(profile.cancelCount).toBe(0);
    expect(profile.totalSpendCents).toBe(0);
    expect(profile.avgTicketCents).toBe(0);
    expect(profile.noShowRate).toBe(1); // all encounters are no-shows
    // No actual visits → dates should be null
    expect(profile.firstVisitDate).toBeNull();
    expect(profile.lastVisitDate).toBeNull();
  });
});

describe('mergeVisitData — no-show does NOT set lastVisitDate on fresh profile', () => {
  it('leaves firstVisitDate and lastVisitDate null when the new event is a no-show', () => {
    // Guest has zero history — no-show event arrives. Dates must remain null
    // because the guest never actually showed up.
    const profile = makeProfile({
      visitCount: 0,
      firstVisitDate: null,
      lastVisitDate: null,
    });
    const noShowVisit = makeVisit({ visitDate: '2026-03-10', wasNoShow: true });

    const result = mergeVisitData(profile, noShowVisit);

    expect(result.firstVisitDate).toBeNull();
    expect(result.lastVisitDate).toBeNull();
    expect(result.noShowCount).toBe(1);
    expect(result.visitCount).toBe(0);
  });

  it('leaves lastVisitDate unchanged when the new event is a cancel', () => {
    const profile = makeProfile({
      visitCount: 2,
      totalSpendCents: 10000,
      firstVisitDate: '2026-01-01',
      lastVisitDate: '2026-02-01',
    });
    const cancelVisit = makeVisit({ visitDate: '2026-03-15', wasCanceled: true });

    const result = mergeVisitData(profile, cancelVisit);

    expect(result.lastVisitDate).toBe('2026-02-01'); // must NOT advance to cancel date
    expect(result.cancelCount).toBe(1);
  });
});

describe('deriveGuestSegment — exact boundary conditions', () => {
  it("returns 'new' for exactly 2 visits (boundary of new/regular)", () => {
    expect(deriveGuestSegment(2, 0)).toBe('new');
  });

  it("returns 'regular' for exactly 3 visits (first regular visit)", () => {
    expect(deriveGuestSegment(3, 0)).toBe('regular');
  });

  it("returns 'regular' for exactly 10 visits (top of regular range)", () => {
    expect(deriveGuestSegment(10, 0)).toBe('regular');
  });

  it("returns 'loyal' for exactly 11 visits (first loyal visit)", () => {
    expect(deriveGuestSegment(11, 0)).toBe('loyal');
  });

  it("returns 'loyal' for exactly 25 visits (top of loyal range, NOT vip)", () => {
    // Per spec: 'loyal' = 11-25, 'vip' = >25.  25 must be 'loyal'.
    expect(deriveGuestSegment(25, 0)).toBe('loyal');
  });

  it("returns 'vip' for exactly 26 visits (first vip count)", () => {
    expect(deriveGuestSegment(26, 0)).toBe('vip');
  });

  it("returns 'vip' when spend equals the threshold exactly (>= check)", () => {
    // Default threshold = 50000 cents. Exactly at threshold → 'vip'
    expect(deriveGuestSegment(5, 50000)).toBe('vip');
  });

  it("returns 'regular' when spend is exactly 1 cent below the threshold", () => {
    expect(deriveGuestSegment(5, 49999)).toBe('regular');
  });
});

describe('computeReliabilityScore — guest with only no-shows', () => {
  it('returns 40 for a guest with 0 visits and 5 no-shows (100% no-show rate)', () => {
    // noShowRate = 5/(0+5+0) = 1.0 → score = 100 - 1.0*60 = 40
    expect(computeReliabilityScore(0, 5, 0)).toBe(40);
  });

  it('returns 0 for extreme combined penalty (all no-shows + cancels)', () => {
    // 10 no-shows, 10 cancels, 0 visits → total=20
    // noShowRate=0.5 → penalty=30, cancelRate=0.5 → penalty=10
    // score = 100 - 30 - 10 = 60 → clamped to 60
    expect(computeReliabilityScore(0, 10, 10)).toBe(60);
  });
});
