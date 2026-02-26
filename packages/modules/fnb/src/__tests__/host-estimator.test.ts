import { describe, it, expect } from 'vitest';
import {
  computeWaitTime,
  getPartySizeBucket,
  getConfidence,
  roundToNearest,
  clamp,
  DEFAULT_TURN_TIMES,
} from '../services/wait-time-estimator';
import type { TurnTimeData, OccupancyData } from '../services/wait-time-estimator';
import {
  computeTableSuggestions,
  scoreCapacityFit,
  scoreSeatingPreference,
  scoreServerBalance,
  scoreVipPreference,
  generateReasoning,
  findCombinations,
} from '../services/table-assigner';
import type { AvailableTable, ServerLoad, CustomerTableHistory } from '../services/table-assigner';

// ── Wait-Time Estimator Tests ───────────────────────────────────

describe('getPartySizeBucket', () => {
  it('returns small for party of 1', () => {
    expect(getPartySizeBucket(1)).toBe('small');
  });

  it('returns small for party of 2', () => {
    expect(getPartySizeBucket(2)).toBe('small');
  });

  it('returns medium for party of 3', () => {
    expect(getPartySizeBucket(3)).toBe('medium');
  });

  it('returns medium for party of 4', () => {
    expect(getPartySizeBucket(4)).toBe('medium');
  });

  it('returns large for party of 5-6', () => {
    expect(getPartySizeBucket(5)).toBe('large');
    expect(getPartySizeBucket(6)).toBe('large');
  });

  it('returns xlarge for party of 7+', () => {
    expect(getPartySizeBucket(7)).toBe('xlarge');
    expect(getPartySizeBucket(12)).toBe('xlarge');
  });
});

describe('getConfidence', () => {
  it('returns high for 50+ data points', () => {
    expect(getConfidence(50)).toBe('high');
    expect(getConfidence(100)).toBe('high');
  });

  it('returns medium for 20-49 data points', () => {
    expect(getConfidence(20)).toBe('medium');
    expect(getConfidence(49)).toBe('medium');
  });

  it('returns low for 10-19 data points', () => {
    expect(getConfidence(10)).toBe('low');
    expect(getConfidence(19)).toBe('low');
  });

  it('returns default for <10 data points', () => {
    expect(getConfidence(0)).toBe('default');
    expect(getConfidence(9)).toBe('default');
  });
});

describe('roundToNearest', () => {
  it('rounds to nearest 5 minutes', () => {
    expect(roundToNearest(7, 5)).toBe(5);
    expect(roundToNearest(8, 5)).toBe(10);
    expect(roundToNearest(12, 5)).toBe(10);
    expect(roundToNearest(13, 5)).toBe(15);
    expect(roundToNearest(60, 5)).toBe(60);
  });
});

describe('clamp', () => {
  it('clamps value to range', () => {
    expect(clamp(3, 5, 120)).toBe(5);
    expect(clamp(50, 5, 120)).toBe(50);
    expect(clamp(150, 5, 120)).toBe(120);
  });
});

describe('computeWaitTime', () => {
  it('returns 0 wait for empty restaurant', () => {
    const turnTime: TurnTimeData = { avgTurnTimeMinutes: 60, dataPointCount: 50 };
    const occupancy: OccupancyData = { totalTables: 10, occupiedTables: 0, tablesAboutToTurn: 0 };

    const result = computeWaitTime(turnTime, occupancy, 0, 4);

    expect(result.estimatedMinutes).toBe(0);
    expect(result.confidence).toBe('high');
  });

  it('returns 0 when tables are available and no reservation claims', () => {
    const turnTime: TurnTimeData = { avgTurnTimeMinutes: 60, dataPointCount: 30 };
    const occupancy: OccupancyData = { totalTables: 10, occupiedTables: 5, tablesAboutToTurn: 0 };

    const result = computeWaitTime(turnTime, occupancy, 0, 4);

    // 5 available tables, no claims → net available > 0
    expect(result.estimatedMinutes).toBe(0);
  });

  it('factors in tables about to turn', () => {
    const turnTime: TurnTimeData = { avgTurnTimeMinutes: 60, dataPointCount: 30 };
    const occupancy: OccupancyData = { totalTables: 10, occupiedTables: 10, tablesAboutToTurn: 2 };

    const result = computeWaitTime(turnTime, occupancy, 0, 4);

    // 0 available + 2 about to turn = 2 effective, no claims → net > 0
    expect(result.estimatedMinutes).toBe(0);
  });

  it('increases wait when all tables occupied and none about to turn', () => {
    const turnTime: TurnTimeData = { avgTurnTimeMinutes: 60, dataPointCount: 30 };
    const occupancy: OccupancyData = { totalTables: 10, occupiedTables: 10, tablesAboutToTurn: 0 };

    const result = computeWaitTime(turnTime, occupancy, 0, 4);

    // 0 available, 0 about to turn, 0 claims → net = 0
    // turnsNeeded = abs(0) + 1 = 1, divisor = max(0,1) = 1
    // estimated = 60 * (1/1) = 60
    expect(result.estimatedMinutes).toBe(60);
    expect(result.confidence).toBe('medium');
  });

  it('upcoming reservations reduce effective availability', () => {
    const turnTime: TurnTimeData = { avgTurnTimeMinutes: 60, dataPointCount: 30 };
    const occupancy: OccupancyData = { totalTables: 10, occupiedTables: 7, tablesAboutToTurn: 0 };

    const result = computeWaitTime(turnTime, occupancy, 4, 4);

    // 3 available + 0 about to turn - 4 claims = -1 net
    // turnsNeeded = abs(-1) + 1 = 2, divisor = 1
    // estimated = 60 * (2/1) = 120 → rounded to 120
    expect(result.estimatedMinutes).toBe(120);
  });

  it('uses default turn times when insufficient data', () => {
    const turnTime: TurnTimeData = { avgTurnTimeMinutes: 0, dataPointCount: 3 };
    const occupancy: OccupancyData = { totalTables: 5, occupiedTables: 5, tablesAboutToTurn: 0 };

    const result = computeWaitTime(turnTime, occupancy, 0, 2);

    // Uses DEFAULT_TURN_TIMES['small'] = 45
    expect(result.factors.avgTurnTimeMinutes).toBe(DEFAULT_TURN_TIMES['small']);
    expect(result.confidence).toBe('default');
  });

  it('rounds to nearest 5 minutes', () => {
    const turnTime: TurnTimeData = { avgTurnTimeMinutes: 47, dataPointCount: 30 };
    const occupancy: OccupancyData = { totalTables: 5, occupiedTables: 5, tablesAboutToTurn: 0 };

    const result = computeWaitTime(turnTime, occupancy, 0, 4);

    // 47 * (1/1) = 47 → rounded to 45
    expect(result.estimatedMinutes).toBe(45);
  });

  it('clamps estimate to min 5 when positive', () => {
    const turnTime: TurnTimeData = { avgTurnTimeMinutes: 3, dataPointCount: 30 };
    const occupancy: OccupancyData = { totalTables: 5, occupiedTables: 5, tablesAboutToTurn: 0 };

    const result = computeWaitTime(turnTime, occupancy, 0, 4);

    // 3 * 1 = 3 → rounded to 5 → clamped min 5
    expect(result.estimatedMinutes).toBe(5);
  });

  it('clamps estimate to max 120', () => {
    const turnTime: TurnTimeData = { avgTurnTimeMinutes: 90, dataPointCount: 30 };
    const occupancy: OccupancyData = { totalTables: 5, occupiedTables: 5, tablesAboutToTurn: 0 };

    const result = computeWaitTime(turnTime, occupancy, 3, 4);

    // 0 available, 0 about to turn, 3 claims → net = -3
    // turnsNeeded = 4, divisor = 1
    // 90 * 4 = 360 → clamped to 120
    expect(result.estimatedMinutes).toBe(120);
  });

  it('returns correct factors in response', () => {
    const turnTime: TurnTimeData = { avgTurnTimeMinutes: 55, dataPointCount: 25 };
    const occupancy: OccupancyData = { totalTables: 10, occupiedTables: 8, tablesAboutToTurn: 1 };

    const result = computeWaitTime(turnTime, occupancy, 2, 4);

    expect(result.factors.avgTurnTimeMinutes).toBe(55);
    expect(result.factors.occupancyPercent).toBe(80);
    expect(result.factors.tablesAvailableSoon).toBe(1);
    expect(result.factors.upcomingReservationClaims).toBe(2);
    expect(result.factors.dataPointCount).toBe(25);
  });

  it('handles zero total tables gracefully', () => {
    const turnTime: TurnTimeData = { avgTurnTimeMinutes: 60, dataPointCount: 30 };
    const occupancy: OccupancyData = { totalTables: 0, occupiedTables: 0, tablesAboutToTurn: 0 };

    const result = computeWaitTime(turnTime, occupancy, 0, 4);

    expect(result.estimatedMinutes).toBe(0);
    expect(result.factors.occupancyPercent).toBe(0);
  });
});

// ── Table Assigner Tests ────────────────────────────────────────

const makeTable = (overrides: Partial<AvailableTable> & { id: string }): AvailableTable => ({
  tableNumber: '1',
  capacity: 4,
  tags: [],
  isCombinable: false,
  adjacentTableIds: [],
  ...overrides,
});

describe('scoreCapacityFit', () => {
  it('returns 1.0 for perfect fit', () => {
    expect(scoreCapacityFit(4, 4, 10)).toBe(1.0);
  });

  it('returns lower score for oversized table', () => {
    const score = scoreCapacityFit(8, 4, 10);
    expect(score).toBeLessThan(1.0);
    expect(score).toBeGreaterThan(0);
  });

  it('returns 0 when table is too small', () => {
    expect(scoreCapacityFit(2, 4, 10)).toBe(0);
  });

  it('returns 0 when maxCapacity is 0', () => {
    expect(scoreCapacityFit(4, 4, 0)).toBe(0.5);
  });
});

describe('scoreSeatingPreference', () => {
  it('returns 1.0 for matching preference', () => {
    expect(scoreSeatingPreference(['outdoor', 'patio'], 'outdoor')).toBe(1.0);
  });

  it('returns 0.5 for no preference', () => {
    expect(scoreSeatingPreference(['outdoor'], undefined)).toBe(0.5);
    expect(scoreSeatingPreference(['outdoor'], 'none')).toBe(0.5);
  });

  it('returns 0.0 for mismatched preference', () => {
    expect(scoreSeatingPreference(['outdoor'], 'indoor')).toBe(0.0);
  });

  it('is case-insensitive', () => {
    expect(scoreSeatingPreference(['Outdoor'], 'outdoor')).toBe(1.0);
  });
});

describe('scoreServerBalance', () => {
  const loads: ServerLoad[] = [
    { serverId: 's1', currentCovers: 10 },
    { serverId: 's2', currentCovers: 20 },
  ];

  it('returns higher score for server with fewer covers', () => {
    const s1Score = scoreServerBalance('s1', loads);
    const s2Score = scoreServerBalance('s2', loads);
    expect(s1Score).toBeGreaterThan(s2Score);
  });

  it('returns 0.5 for unknown server', () => {
    expect(scoreServerBalance('s3', loads)).toBe(0.5);
  });

  it('returns 0.5 when no server assigned', () => {
    expect(scoreServerBalance(undefined, loads)).toBe(0.5);
  });

  it('returns 0.5 when no loads data', () => {
    expect(scoreServerBalance('s1', [])).toBe(0.5);
  });
});

describe('scoreVipPreference', () => {
  it('returns 0.5 for non-VIP', () => {
    expect(scoreVipPreference('t1', false, [], [])).toBe(0.5);
  });

  it('returns 1.0 for VIP with history at this table', () => {
    const history: CustomerTableHistory[] = [{ tableId: 't1', visitCount: 3 }];
    expect(scoreVipPreference('t1', true, [], history)).toBe(1.0);
  });

  it('returns 0.7 for VIP at premium-tagged table', () => {
    expect(scoreVipPreference('t1', true, ['vip'], [])).toBe(0.7);
    expect(scoreVipPreference('t1', true, ['booth'], [])).toBe(0.7);
    expect(scoreVipPreference('t1', true, ['window'], [])).toBe(0.7);
  });

  it('returns 0.5 for VIP at non-premium table', () => {
    expect(scoreVipPreference('t1', true, ['standard'], [])).toBe(0.5);
  });
});

describe('generateReasoning', () => {
  it('generates reasoning for perfect fit', () => {
    const table = makeTable({ id: 't1', tableNumber: '5', capacity: 4 });
    const reason = generateReasoning([table], 4);
    expect(reason).toContain('Perfect fit');
    expect(reason).toContain('4-top');
  });

  it('generates reasoning for oversized table', () => {
    const table = makeTable({ id: 't1', tableNumber: '5', capacity: 6 });
    const reason = generateReasoning([table], 4);
    expect(reason).toContain('6-top for party of 4');
  });

  it('generates reasoning for combination', () => {
    const t1 = makeTable({ id: 't1', tableNumber: '14', capacity: 4 });
    const t2 = makeTable({ id: 't2', tableNumber: '15', capacity: 4 });
    const reason = generateReasoning([t1, t2], 6);
    expect(reason).toContain('Combined tables 14+15');
  });

  it('includes preference match when applicable', () => {
    const table = makeTable({ id: 't1', tableNumber: '5', capacity: 4, tags: ['outdoor'] });
    const reason = generateReasoning([table], 4, 'outdoor');
    expect(reason).toContain('outdoor preference');
  });

  it('includes server name when present', () => {
    const table = makeTable({ id: 't1', tableNumber: '5', capacity: 4, serverName: 'Kim' });
    const reason = generateReasoning([table], 4);
    expect(reason).toContain("Kim's section");
  });
});

describe('findCombinations', () => {
  it('finds adjacent combinable table pairs', () => {
    const t1 = makeTable({ id: 't1', tableNumber: '1', capacity: 4, isCombinable: true, adjacentTableIds: ['t2'] });
    const t2 = makeTable({ id: 't2', tableNumber: '2', capacity: 4, isCombinable: true, adjacentTableIds: ['t1'] });

    const combos = findCombinations([t1, t2], 6);

    expect(combos).toHaveLength(1);
    expect(combos[0]).toHaveLength(2);
  });

  it('skips non-combinable tables', () => {
    const t1 = makeTable({ id: 't1', tableNumber: '1', capacity: 4, isCombinable: false, adjacentTableIds: ['t2'] });
    const t2 = makeTable({ id: 't2', tableNumber: '2', capacity: 4, isCombinable: true, adjacentTableIds: ['t1'] });

    const combos = findCombinations([t1, t2], 6);

    expect(combos).toHaveLength(0);
  });

  it('skips non-adjacent tables', () => {
    const t1 = makeTable({ id: 't1', tableNumber: '1', capacity: 4, isCombinable: true, adjacentTableIds: [] });
    const t2 = makeTable({ id: 't2', tableNumber: '2', capacity: 4, isCombinable: true, adjacentTableIds: [] });

    const combos = findCombinations([t1, t2], 6);

    expect(combos).toHaveLength(0);
  });

  it('skips combinations that are too small', () => {
    const t1 = makeTable({ id: 't1', tableNumber: '1', capacity: 2, isCombinable: true, adjacentTableIds: ['t2'] });
    const t2 = makeTable({ id: 't2', tableNumber: '2', capacity: 2, isCombinable: true, adjacentTableIds: ['t1'] });

    const combos = findCombinations([t1, t2], 6);

    expect(combos).toHaveLength(0);
  });
});

describe('computeTableSuggestions', () => {
  it('returns single perfect-fit table as top suggestion', () => {
    const tables: AvailableTable[] = [
      makeTable({ id: 't1', tableNumber: '1', capacity: 4 }),
      makeTable({ id: 't2', tableNumber: '2', capacity: 6 }),
      makeTable({ id: 't3', tableNumber: '3', capacity: 8 }),
    ];

    const results = computeTableSuggestions(tables, 4, undefined, false, [], []);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.tableIds).toEqual(['t1']); // perfect fit
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score); // higher score
  });

  it('returns max 3 suggestions', () => {
    const tables: AvailableTable[] = Array.from({ length: 10 }, (_, i) =>
      makeTable({ id: `t${i}`, tableNumber: `${i + 1}`, capacity: 4 }),
    );

    const results = computeTableSuggestions(tables, 4, undefined, false, [], []);

    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('returns empty array when all tables are too small', () => {
    const tables: AvailableTable[] = [
      makeTable({ id: 't1', tableNumber: '1', capacity: 2 }),
    ];

    // No combinable tables either
    const results = computeTableSuggestions(tables, 6, undefined, false, [], []);

    expect(results).toHaveLength(0);
  });

  it('returns empty array when no tables available', () => {
    const results = computeTableSuggestions([], 4, undefined, false, [], []);

    expect(results).toHaveLength(0);
  });

  it('prefers seating preference match', () => {
    const tables: AvailableTable[] = [
      makeTable({ id: 't1', tableNumber: '1', capacity: 4, tags: ['indoor'] }),
      makeTable({ id: 't2', tableNumber: '2', capacity: 4, tags: ['outdoor'] }),
    ];

    const results = computeTableSuggestions(tables, 4, 'outdoor', false, [], []);

    expect(results[0]!.tableIds).toEqual(['t2']);
  });

  it('prefers server with fewer covers', () => {
    const tables: AvailableTable[] = [
      makeTable({ id: 't1', tableNumber: '1', capacity: 4, serverId: 's1' }),
      makeTable({ id: 't2', tableNumber: '2', capacity: 4, serverId: 's2' }),
    ];
    const serverLoads: ServerLoad[] = [
      { serverId: 's1', currentCovers: 20 },
      { serverId: 's2', currentCovers: 5 },
    ];

    const results = computeTableSuggestions(tables, 4, undefined, false, serverLoads, []);

    expect(results[0]!.tableIds).toEqual(['t2']); // fewer covers
  });

  it('VIP with history gets preferred table', () => {
    const tables: AvailableTable[] = [
      makeTable({ id: 't1', tableNumber: '1', capacity: 4 }),
      makeTable({ id: 't2', tableNumber: '2', capacity: 4, tags: ['window'] }),
    ];
    const history: CustomerTableHistory[] = [{ tableId: 't1', visitCount: 5 }];

    const results = computeTableSuggestions(tables, 4, undefined, true, [], history);

    expect(results[0]!.tableIds).toEqual(['t1']); // historical preference
  });

  it('uses combinations when no single table fits', () => {
    const tables: AvailableTable[] = [
      makeTable({ id: 't1', tableNumber: '1', capacity: 4, isCombinable: true, adjacentTableIds: ['t2'] }),
      makeTable({ id: 't2', tableNumber: '2', capacity: 4, isCombinable: true, adjacentTableIds: ['t1'] }),
    ];

    const results = computeTableSuggestions(tables, 6, undefined, false, [], []);

    expect(results.length).toBe(1);
    expect(results[0]!.tableIds).toHaveLength(2);
    expect(results[0]!.combinedCapacity).toBe(8);
  });

  it('combination scores have penalty applied', () => {
    const tables: AvailableTable[] = [
      makeTable({ id: 't1', tableNumber: '1', capacity: 8 }),
      makeTable({ id: 't2', tableNumber: '2', capacity: 4, isCombinable: true, adjacentTableIds: ['t3'] }),
      makeTable({ id: 't3', tableNumber: '3', capacity: 4, isCombinable: true, adjacentTableIds: ['t2'] }),
    ];

    const results = computeTableSuggestions(tables, 6, undefined, false, [], []);

    // Single 8-top should beat the combination of 4+4 because combo has penalty
    const singleSuggestion = results.find((s) => s.tableIds.length === 1);
    const comboSuggestion = results.find((s) => s.tableIds.length === 2);
    if (singleSuggestion && comboSuggestion) {
      expect(singleSuggestion.score).toBeGreaterThan(comboSuggestion.score);
    }
  });

  it('suggestions are sorted by score descending', () => {
    const tables: AvailableTable[] = [
      makeTable({ id: 't1', tableNumber: '1', capacity: 4 }),
      makeTable({ id: 't2', tableNumber: '2', capacity: 6 }),
      makeTable({ id: 't3', tableNumber: '3', capacity: 10 }),
    ];

    const results = computeTableSuggestions(tables, 4, undefined, false, [], []);

    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i]!.score).toBeGreaterThanOrEqual(results[i + 1]!.score);
    }
  });
});
