import { describe, it, expect } from 'vitest';
import { recommendServer } from '../services/server-recommender';
import type {
  ServerLoadSnapshot,
  SectionAssignment,
  RecommendServerSettings,
} from '../services/server-recommender';

// ── Helpers ──────────────────────────────────────────────────────

function makeServer(
  serverUserId: string,
  overrides: Partial<Omit<ServerLoadSnapshot, 'serverUserId'>> = {},
): ServerLoadSnapshot {
  return {
    serverUserId,
    openTabCount: 0,
    activeSeatedCount: 0,
    totalCoverCount: 0,
    avgTicketCents: 0,
    sectionId: null,
    sectionCapacity: null,
    ...overrides,
  };
}

function makeSection(
  sectionId: string,
  serverUserId: string,
  tableIds: string[],
): SectionAssignment {
  return { sectionId, serverUserId, tableIds };
}

const DEFAULT_SETTINGS: RecommendServerSettings = {
  method: 'cover_balance',
  maxCoverDifference: 3,
};

const ROUND_ROBIN_SETTINGS: RecommendServerSettings = {
  method: 'round_robin',
  maxCoverDifference: 3,
};

const MANUAL_SETTINGS: RecommendServerSettings = {
  method: 'manual',
  maxCoverDifference: 3,
};

// ── Tests ─────────────────────────────────────────────────────────

describe('recommendServer — no servers', () => {
  it('returns null when serverLoads is empty', () => {
    const result = recommendServer('table-1', [], [], DEFAULT_SETTINGS);
    expect(result).toBeNull();
  });
});

describe('recommendServer — manual mode', () => {
  it('returns null regardless of available servers', () => {
    const servers = [makeServer('server-a', { totalCoverCount: 2 })];
    const result = recommendServer('table-1', servers, [], MANUAL_SETTINGS);
    expect(result).toBeNull();
  });

  it('returns null even with section assignments present', () => {
    const servers = [makeServer('server-a'), makeServer('server-b')];
    const sections = [makeSection('sec-1', 'server-a', ['table-1'])];
    const result = recommendServer('table-1', servers, sections, MANUAL_SETTINGS);
    expect(result).toBeNull();
  });
});

describe('recommendServer — cover balance', () => {
  it('prefers the server with fewest covers when no section affinity', () => {
    const servers = [
      makeServer('server-a', { totalCoverCount: 10, openTabCount: 3 }),
      makeServer('server-b', { totalCoverCount: 4, openTabCount: 1 }),
      makeServer('server-c', { totalCoverCount: 7, openTabCount: 2 }),
    ];
    const result = recommendServer('table-x', servers, [], DEFAULT_SETTINGS);
    expect(result).not.toBeNull();
    expect(result!.serverUserId).toBe('server-b');
  });

  it('returns a recommendation with a reason string', () => {
    const servers = [
      makeServer('server-a', { totalCoverCount: 5 }),
      makeServer('server-b', { totalCoverCount: 2 }),
    ];
    const result = recommendServer('table-x', servers, [], DEFAULT_SETTINGS);
    expect(result).not.toBeNull();
    expect(typeof result!.reason).toBe('string');
    expect(result!.reason.length).toBeGreaterThan(0);
  });

  it('returns a positive score', () => {
    const servers = [makeServer('server-a', { totalCoverCount: 3 })];
    const result = recommendServer('table-x', servers, [], DEFAULT_SETTINGS);
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(0);
  });
});

describe('recommendServer — section affinity', () => {
  it('prefers a server assigned to the same section as the table', () => {
    // server-b has slightly fewer covers but server-a has section affinity (+50)
    // cover gap is 2 which is within maxCoverDifference=3, so section wins
    const servers = [
      makeServer('server-a', { totalCoverCount: 6 }),
      makeServer('server-b', { totalCoverCount: 4 }),
    ];
    const sections = [
      makeSection('sec-A', 'server-a', ['table-1', 'table-2']),
      makeSection('sec-B', 'server-b', ['table-3', 'table-4']),
    ];
    // table-1 is in sec-A → server-a has +50 affinity
    // cover gap (2) <= maxCoverDifference (3) → section affinity dominates
    const result = recommendServer('table-1', servers, sections, DEFAULT_SETTINGS);
    expect(result).not.toBeNull();
    expect(result!.serverUserId).toBe('server-a');
    expect(result!.reason).toContain('section match');
  });

  it('falls back to cover balance when table has no section assignment', () => {
    const servers = [
      makeServer('server-a', { totalCoverCount: 8 }),
      makeServer('server-b', { totalCoverCount: 2 }),
    ];
    const sections = [
      makeSection('sec-A', 'server-a', ['table-10', 'table-11']),
    ];
    // table-99 has no section assignment → pure cover balance
    const result = recommendServer('table-99', servers, sections, DEFAULT_SETTINGS);
    expect(result).not.toBeNull();
    expect(result!.serverUserId).toBe('server-b');
  });
});

describe('recommendServer — equal loads', () => {
  it('returns the first server (stable sort) when all metrics are equal', () => {
    const servers = [
      makeServer('server-a', { totalCoverCount: 4, openTabCount: 2 }),
      makeServer('server-b', { totalCoverCount: 4, openTabCount: 2 }),
    ];
    const result = recommendServer('table-x', servers, [], DEFAULT_SETTINGS);
    expect(result).not.toBeNull();
    // Both score identically — top result after sort-desc is deterministic
    // but either server is acceptable; just ensure a result is returned
    expect(['server-a', 'server-b']).toContain(result!.serverUserId);
  });

  it('breaks ties with round_robin rotation bonus toward fewer covers', () => {
    const servers = [
      makeServer('server-a', { totalCoverCount: 4 }),
      makeServer('server-b', { totalCoverCount: 4 }),
    ];
    const result = recommendServer('table-x', servers, [], ROUND_ROBIN_SETTINGS);
    expect(result).not.toBeNull();
    // Both tied on covers → both get rotation bonus → tie remains, any is fine
    expect(['server-a', 'server-b']).toContain(result!.serverUserId);
  });
});

describe('recommendServer — max cover difference override', () => {
  it('overrides section affinity when cover gap exceeds maxCoverDifference', () => {
    // server-a has section affinity but is carrying 20 covers
    // server-b has no section affinity but only 2 covers — gap is 18 > 3
    const servers = [
      makeServer('server-a', { totalCoverCount: 20 }),
      makeServer('server-b', { totalCoverCount: 2 }),
    ];
    const sections = [makeSection('sec-A', 'server-a', ['table-1'])];
    const result = recommendServer('table-1', servers, sections, DEFAULT_SETTINGS);
    expect(result).not.toBeNull();
    expect(result!.serverUserId).toBe('server-b');
    expect(result!.reason).toContain('cover rebalance');
  });

  it('does not trigger override when gap is within maxCoverDifference', () => {
    // gap is 2 which is <= 3 → section affinity still wins
    const servers = [
      makeServer('server-a', { totalCoverCount: 6 }),
      makeServer('server-b', { totalCoverCount: 4 }),
    ];
    const sections = [makeSection('sec-A', 'server-a', ['table-1'])];
    const result = recommendServer('table-1', servers, sections, DEFAULT_SETTINGS);
    expect(result).not.toBeNull();
    expect(result!.serverUserId).toBe('server-a');
  });

  it('respects a custom maxCoverDifference threshold', () => {
    const servers = [
      makeServer('server-a', { totalCoverCount: 10 }),
      makeServer('server-b', { totalCoverCount: 5 }),
    ];
    const sections = [makeSection('sec-A', 'server-a', ['table-1'])];

    // gap is 5; with threshold=6 section affinity still wins
    const noOverride = recommendServer('table-1', servers, sections, {
      method: 'cover_balance',
      maxCoverDifference: 6,
    });
    expect(noOverride!.serverUserId).toBe('server-a');

    // gap is 5; with threshold=4 override kicks in
    const withOverride = recommendServer('table-1', servers, sections, {
      method: 'cover_balance',
      maxCoverDifference: 4,
    });
    expect(withOverride!.serverUserId).toBe('server-b');
    expect(withOverride!.reason).toContain('cover rebalance');
  });
});

describe('recommendServer — round_robin rotation bonus', () => {
  it('adds rotation bonus to servers with the minimum cover count', () => {
    const servers = [
      makeServer('server-a', { totalCoverCount: 2 }),
      makeServer('server-b', { totalCoverCount: 6 }),
    ];
    const result = recommendServer('table-x', servers, [], ROUND_ROBIN_SETTINGS);
    expect(result).not.toBeNull();
    expect(result!.serverUserId).toBe('server-a');
    expect(result!.reason).toContain('next in rotation');
  });

  it('does not include rotation bonus for cover_balance method', () => {
    const servers = [
      makeServer('server-a', { totalCoverCount: 2 }),
      makeServer('server-b', { totalCoverCount: 6 }),
    ];
    const result = recommendServer('table-x', servers, [], DEFAULT_SETTINGS);
    expect(result).not.toBeNull();
    // Still picks the lighter-loaded server but reason won't mention rotation
    expect(result!.serverUserId).toBe('server-a');
    expect(result!.reason).not.toContain('next in rotation');
  });
});

describe('recommendServer — single server', () => {
  it('always recommends the only available server', () => {
    const servers = [makeServer('server-only', { totalCoverCount: 15, openTabCount: 5 })];
    const result = recommendServer('table-x', servers, [], DEFAULT_SETTINGS);
    expect(result).not.toBeNull();
    expect(result!.serverUserId).toBe('server-only');
  });
});

describe('recommendServer — tab balance', () => {
  it('factors open tab count into scoring when covers are equal', () => {
    const servers = [
      makeServer('server-a', { totalCoverCount: 4, openTabCount: 5 }),
      makeServer('server-b', { totalCoverCount: 4, openTabCount: 1 }),
    ];
    const result = recommendServer('table-x', servers, [], DEFAULT_SETTINGS);
    expect(result).not.toBeNull();
    // server-b has fewer tabs → higher tab balance score
    expect(result!.serverUserId).toBe('server-b');
  });
});

// ── Edge-case additions (hardening pass) ──────────────────────────────────────

describe('recommendServer — single server with 0 tabs', () => {
  it('returns the single server even when they have 0 tabs and 0 covers', () => {
    // When the only server has zeros across the board, both maxCovers and maxTabs
    // are floored to 1 (Math.max(..., 1)), so division is safe and score is 0.
    const servers = [makeServer('server-only', { totalCoverCount: 0, openTabCount: 0 })];
    const result = recommendServer('table-1', servers, [], DEFAULT_SETTINGS);

    expect(result).not.toBeNull();
    expect(result!.serverUserId).toBe('server-only');
    // score can be 0; it must be finite and non-negative
    expect(result!.score).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(result!.score)).toBe(true);
    expect(result!.reason.length).toBeGreaterThan(0);
  });

  it('returns the single server with 0 tabs in round_robin mode', () => {
    const servers = [makeServer('server-only', { totalCoverCount: 0, openTabCount: 0 })];
    const result = recommendServer('table-1', servers, [], ROUND_ROBIN_SETTINGS);

    expect(result).not.toBeNull();
    expect(result!.serverUserId).toBe('server-only');
    // In round_robin, the lone server is always at the minimum → gets rotation bonus
    expect(result!.reason).toContain('next in rotation');
  });

  it('does not produce NaN or Infinity scores with all-zero metrics', () => {
    const servers = [
      makeServer('s1', { totalCoverCount: 0, openTabCount: 0 }),
      makeServer('s2', { totalCoverCount: 0, openTabCount: 0 }),
      makeServer('s3', { totalCoverCount: 0, openTabCount: 0 }),
    ];
    const result = recommendServer('table-x', servers, [], DEFAULT_SETTINGS);

    expect(result).not.toBeNull();
    expect(Number.isFinite(result!.score)).toBe(true);
    expect(Number.isNaN(result!.score)).toBe(false);
  });
});

describe('recommendServer — identical scores tie-breaking', () => {
  it('returns a consistent recommendation when all three servers score identically', () => {
    // All servers have the same covers and tabs — scores are identical.
    // The algorithm must return exactly one (not null, not throw).
    const servers = [
      makeServer('server-a', { totalCoverCount: 5, openTabCount: 2 }),
      makeServer('server-b', { totalCoverCount: 5, openTabCount: 2 }),
      makeServer('server-c', { totalCoverCount: 5, openTabCount: 2 }),
    ];
    const result = recommendServer('table-x', servers, [], DEFAULT_SETTINGS);

    expect(result).not.toBeNull();
    expect(['server-a', 'server-b', 'server-c']).toContain(result!.serverUserId);
  });

  it('rebalance logic does not trigger when top two have equal cover counts', () => {
    // gap = 0, which is not > maxCoverDifference (3) → normal scoring path used
    const servers = [
      makeServer('server-a', { totalCoverCount: 8, openTabCount: 1 }),
      makeServer('server-b', { totalCoverCount: 8, openTabCount: 3 }),
    ];
    const result = recommendServer('table-x', servers, [], DEFAULT_SETTINGS);

    expect(result).not.toBeNull();
    // server-a wins on tab balance
    expect(result!.serverUserId).toBe('server-a');
    expect(result!.reason).not.toContain('cover rebalance');
  });
});

describe('recommendServer — score non-negativity', () => {
  it('never returns a negative score', () => {
    // Pathological case: one server carries extreme load vs another at zero
    const servers = [
      makeServer('heavy', { totalCoverCount: 1000, openTabCount: 500 }),
      makeServer('light', { totalCoverCount: 0, openTabCount: 0 }),
    ];
    const result = recommendServer('table-x', servers, [], DEFAULT_SETTINGS);

    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(0);
  });
});
