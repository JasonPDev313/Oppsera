import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ZodIssue } from 'zod';
import type { createKdsRoutingRuleSchema } from '../validation';
type CreateKdsRoutingRuleSchemaType = typeof createKdsRoutingRuleSchema;

// ── Mocks ──────────────────────────────────────────────────────

const mockExecute = vi.fn();

vi.mock('@oppsera/db', () => ({
  withTenant: vi.fn(async (_tenantId: string, fn: (tx: unknown) => unknown) =>
    fn({ execute: mockExecute }),
  ),
}));

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    { join: vi.fn(), raw: vi.fn((s: string) => s) },
  ),
}));

vi.mock('@oppsera/core/observability', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import type { RoutingContext, RoutableItem, resolveStationRouting } from '../services/kds-routing-engine';
type ResolveStationRoutingFn = typeof resolveStationRouting;

// ── Helpers ────────────────────────────────────────────────────

function makeContext(overrides: Partial<RoutingContext> = {}): RoutingContext {
  return {
    tenantId: 'tenant-1',
    locationId: 'loc-1',
    orderType: 'dine_in',
    channel: 'pos',
    ...overrides,
  };
}

function makeItem(overrides: Partial<RoutableItem> = {}): RoutableItem {
  return {
    orderLineId: 'line-1',
    catalogItemId: 'item-steak',
    departmentId: 'dept-food',
    subDepartmentId: 'subdept-entrees',
    categoryId: 'cat-steaks',
    modifierIds: [],
    ...overrides,
  };
}

interface MockRule {
  id: string;
  rule_type: string;
  catalog_item_id: string | null;
  category_id: string | null;
  modifier_id: string | null;
  department_id: string | null;
  sub_department_id: string | null;
  station_id: string;
  priority: number;
  order_type_condition: string | null;
  channel_condition: string | null;
  time_condition_start: string | null;
  time_condition_end: string | null;
}

function makeRule(overrides: Partial<MockRule> = {}): MockRule {
  return {
    id: 'rule-1',
    rule_type: 'category',
    catalog_item_id: null,
    category_id: 'cat-steaks',
    modifier_id: null,
    department_id: null,
    sub_department_id: null,
    station_id: 'station-grill',
    priority: 10,
    order_type_condition: null,
    channel_condition: null,
    time_condition_start: null,
    time_condition_end: null,
    ...overrides,
  };
}

interface MockStation {
  id: string;
  station_type: string;
  sort_order: number;
  pause_receiving: boolean;
  allowed_order_types: string[];
  allowed_channels: string[];
}

function makeStation(overrides: Partial<MockStation> = {}): MockStation {
  return {
    id: 'station-grill',
    station_type: 'grill',
    sort_order: 1,
    pause_receiving: false,
    allowed_order_types: [],
    allowed_channels: [],
    ...overrides,
  };
}

/** Set up mockExecute to return timezone on first call, rules on second, stations on third. */
function setupMocks(rules: MockRule[], stations: MockStation[]) {
  mockExecute
    .mockResolvedValueOnce([{ timezone: 'America/New_York' }]) // 1st call: timezone lookup
    .mockResolvedValueOnce(rules)   // 2nd call: routing rules
    .mockResolvedValueOnce(stations); // 3rd call: stations
}

// ── Tests ──────────────────────────────────────────────────────

describe('KDS Routing Engine — resolveStationRouting', () => {
  let resolveStationRouting: ResolveStationRoutingFn;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Dynamic import to get fresh module with mocks applied
    const mod = await import('../services/kds-routing-engine');
    resolveStationRouting = mod.resolveStationRouting;
  });

  // ── Empty / Edge Cases ─────────────────────────────────────

  it('returns empty array for empty items', async () => {
    const results = await resolveStationRouting(makeContext(), []);
    expect(results).toEqual([]);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('returns null stationId when no stations exist', async () => {
    setupMocks([], []);
    const results = await resolveStationRouting(makeContext(), [makeItem()]);
    expect(results).toHaveLength(1);
    expect(results[0]!.stationId).toBeNull();
    expect(results[0]!.matchType).toBeNull();
  });

  // ── Priority Cascade ───────────────────────────────────────

  it('matches item-specific rule (highest priority)', async () => {
    const rules = [
      makeRule({ id: 'r-item', rule_type: 'item', catalog_item_id: 'item-steak', category_id: null, station_id: 'station-grill' }),
      makeRule({ id: 'r-cat', rule_type: 'category', category_id: 'cat-steaks', station_id: 'station-prep' }),
    ];
    const stations = [
      makeStation({ id: 'station-grill', station_type: 'grill' }),
      makeStation({ id: 'station-prep', station_type: 'prep', sort_order: 2 }),
    ];
    setupMocks(rules, stations);

    const results = await resolveStationRouting(makeContext(), [makeItem()]);
    expect(results[0]!.stationId).toBe('station-grill');
    expect(results[0]!.matchType).toBe('item');
    expect(results[0]!.routingRuleId).toBe('r-item');
  });

  it('falls through to category rule when no item rule exists', async () => {
    const rules = [
      makeRule({ id: 'r-cat', rule_type: 'category', category_id: 'cat-steaks', station_id: 'station-grill' }),
    ];
    const stations = [makeStation()];
    setupMocks(rules, stations);

    const results = await resolveStationRouting(makeContext(), [makeItem()]);
    expect(results[0]!.stationId).toBe('station-grill');
    expect(results[0]!.matchType).toBe('category');
  });

  it('falls through to sub-department rule', async () => {
    const rules = [
      makeRule({ id: 'r-sub', rule_type: 'sub_department', sub_department_id: 'subdept-entrees', category_id: null, station_id: 'station-grill' }),
    ];
    const stations = [makeStation()];
    setupMocks(rules, stations);

    const results = await resolveStationRouting(makeContext(), [makeItem()]);
    expect(results[0]!.stationId).toBe('station-grill');
    expect(results[0]!.matchType).toBe('sub_department');
  });

  it('falls through to department rule', async () => {
    const rules = [
      makeRule({ id: 'r-dept', rule_type: 'department', department_id: 'dept-food', category_id: null, station_id: 'station-grill' }),
    ];
    const stations = [makeStation()];
    setupMocks(rules, stations);

    const results = await resolveStationRouting(makeContext(), [makeItem()]);
    expect(results[0]!.stationId).toBe('station-grill');
    expect(results[0]!.matchType).toBe('department');
  });

  it('falls through to modifier rule', async () => {
    const rules = [
      makeRule({ id: 'r-mod', rule_type: 'modifier', modifier_id: 'mod-spicy', category_id: null, station_id: 'station-grill' }),
    ];
    const stations = [makeStation()];
    setupMocks(rules, stations);

    const item = makeItem({ modifierIds: ['mod-spicy'] });
    const results = await resolveStationRouting(makeContext(), [item]);
    expect(results[0]!.stationId).toBe('station-grill');
    expect(results[0]!.matchType).toBe('modifier');
  });

  it('skips modifier rule when item has no modifiers', async () => {
    const rules = [
      makeRule({ id: 'r-mod', rule_type: 'modifier', modifier_id: 'mod-spicy', category_id: null, station_id: 'station-grill' }),
    ];
    const stations = [makeStation()];
    setupMocks(rules, stations);

    const item = makeItem({ modifierIds: [] });
    const results = await resolveStationRouting(makeContext(), [item]);
    expect(results[0]!.matchType).toBe('fallback');
  });

  it('selects highest priority rule within same type', async () => {
    // Rules come pre-sorted by priority DESC from the SQL query
    const rules = [
      makeRule({ id: 'r-high', rule_type: 'category', category_id: 'cat-steaks', station_id: 'station-grill', priority: 20 }),
      makeRule({ id: 'r-low', rule_type: 'category', category_id: 'cat-steaks', station_id: 'station-prep', priority: 5 }),
    ];
    const stations = [
      makeStation({ id: 'station-grill', station_type: 'grill' }),
      makeStation({ id: 'station-prep', station_type: 'prep', sort_order: 2 }),
    ];
    setupMocks(rules, stations);

    const results = await resolveStationRouting(makeContext(), [makeItem()]);
    // Rules come pre-sorted by priority DESC from the SQL query
    // The higher-priority rule (r-high, priority=20) should appear first
    expect(results[0]!.stationId).toBe('station-grill');
    expect(results[0]!.routingRuleId).toBe('r-high');
  });

  // ── Fallback Behavior (the fix!) ───────────────────────────

  it('fallback prefers non-expo prep station over expo', async () => {
    const stations = [
      // Sorted by SQL: non-expo first (CASE WHEN expo THEN 1 ELSE 0), then sort_order
      makeStation({ id: 'station-grill', station_type: 'grill', sort_order: 1 }),
      makeStation({ id: 'station-expo', station_type: 'expo', sort_order: 0 }),
    ];
    setupMocks([], stations);

    const results = await resolveStationRouting(makeContext(), [makeItem()]);
    expect(results[0]!.stationId).toBe('station-grill');
    expect(results[0]!.matchType).toBe('fallback');
  });

  it('returns null stationId when only expo station available (expo excluded from fallback)', async () => {
    // Expo stations are explicitly excluded from fallback routing (they display bumped tickets,
    // not first-view tickets). When only expo exists, fallback returns null.
    const stations = [
      makeStation({ id: 'station-expo', station_type: 'expo', sort_order: 0 }),
    ];
    setupMocks([], stations);

    const results = await resolveStationRouting(makeContext(), [makeItem()]);
    expect(results[0]!.stationId).toBeNull();
    expect(results[0]!.matchType).toBeNull();
  });

  it('no rules and all prep stations paused → null stationId (expo excluded from fallback)', async () => {
    // Expo stations are excluded from fallback. If all non-expo stations are paused,
    // stationId is null — items are unrouted rather than sent to expo.
    const stations = [
      makeStation({ id: 'station-grill', station_type: 'grill', pause_receiving: true }),
      makeStation({ id: 'station-expo', station_type: 'expo', sort_order: 2 }),
    ];
    setupMocks([], stations);

    const results = await resolveStationRouting(makeContext(), [makeItem()]);
    expect(results[0]!.stationId).toBeNull();
  });

  // ── Condition Filtering ────────────────────────────────────

  it('rule with orderTypeCondition matches correct order type', async () => {
    const rules = [
      makeRule({ order_type_condition: 'dine_in', station_id: 'station-grill' }),
    ];
    const stations = [makeStation()];
    setupMocks(rules, stations);

    const results = await resolveStationRouting(makeContext({ orderType: 'dine_in' }), [makeItem()]);
    expect(results[0]!.matchType).toBe('category');
  });

  it('rule with orderTypeCondition rejects wrong order type', async () => {
    const rules = [
      makeRule({ order_type_condition: 'dine_in', station_id: 'station-grill' }),
    ];
    const stations = [makeStation()];
    setupMocks(rules, stations);

    const results = await resolveStationRouting(makeContext({ orderType: 'takeout' }), [makeItem()]);
    expect(results[0]!.matchType).toBe('fallback');
  });

  it('rule with orderTypeCondition rejects when context has no orderType', async () => {
    const rules = [
      makeRule({ order_type_condition: 'dine_in', station_id: 'station-grill' }),
    ];
    const stations = [makeStation()];
    setupMocks(rules, stations);

    const results = await resolveStationRouting(makeContext({ orderType: undefined }), [makeItem()]);
    expect(results[0]!.matchType).toBe('fallback');
  });

  it('rule with channelCondition matches correct channel', async () => {
    const rules = [
      makeRule({ channel_condition: 'pos', station_id: 'station-grill' }),
    ];
    const stations = [makeStation()];
    setupMocks(rules, stations);

    const results = await resolveStationRouting(makeContext({ channel: 'pos' }), [makeItem()]);
    expect(results[0]!.matchType).toBe('category');
  });

  it('rule with channelCondition rejects wrong channel', async () => {
    const rules = [
      makeRule({ channel_condition: 'online', station_id: 'station-grill' }),
    ];
    const stations = [makeStation()];
    setupMocks(rules, stations);

    const results = await resolveStationRouting(makeContext({ channel: 'pos' }), [makeItem()]);
    expect(results[0]!.matchType).toBe('fallback');
  });

  // ── Station Filtering ──────────────────────────────────────

  it('skips paused station even when rule matches', async () => {
    const rules = [
      makeRule({ station_id: 'station-grill' }),
    ];
    const stations = [
      makeStation({ id: 'station-grill', pause_receiving: true }),
      makeStation({ id: 'station-prep', station_type: 'prep', sort_order: 2 }),
    ];
    setupMocks(rules, stations);

    const results = await resolveStationRouting(makeContext(), [makeItem()]);
    // Rule targets grill but it's paused → falls through cascade → fallback to prep
    expect(results[0]!.stationId).toBe('station-prep');
    expect(results[0]!.matchType).toBe('fallback');
  });

  it('skips station with non-matching allowedOrderTypes', async () => {
    const rules = [
      makeRule({ station_id: 'station-grill' }),
    ];
    const stations = [
      makeStation({ id: 'station-grill', allowed_order_types: ['takeout'] }),
      makeStation({ id: 'station-prep', station_type: 'prep', sort_order: 2 }),
    ];
    setupMocks(rules, stations);

    const results = await resolveStationRouting(makeContext({ orderType: 'dine_in' }), [makeItem()]);
    expect(results[0]!.stationId).toBe('station-prep');
    expect(results[0]!.matchType).toBe('fallback');
  });

  it('skips station with non-matching allowedChannels', async () => {
    const rules = [
      makeRule({ station_id: 'station-grill' }),
    ];
    const stations = [
      makeStation({ id: 'station-grill', allowed_channels: ['online'] }),
      makeStation({ id: 'station-prep', station_type: 'prep', sort_order: 2 }),
    ];
    setupMocks(rules, stations);

    const results = await resolveStationRouting(makeContext({ channel: 'pos' }), [makeItem()]);
    expect(results[0]!.stationId).toBe('station-prep');
    expect(results[0]!.matchType).toBe('fallback');
  });

  it('station with matching allowedOrderTypes accepts order', async () => {
    const rules = [
      makeRule({ station_id: 'station-grill' }),
    ];
    const stations = [
      makeStation({ id: 'station-grill', allowed_order_types: ['dine_in', 'takeout'] }),
    ];
    setupMocks(rules, stations);

    const results = await resolveStationRouting(makeContext({ orderType: 'dine_in' }), [makeItem()]);
    expect(results[0]!.stationId).toBe('station-grill');
    expect(results[0]!.matchType).toBe('category');
  });

  // ── Multiple Items ─────────────────────────────────────────

  it('routes multiple items to different stations based on rules', async () => {
    const rules = [
      makeRule({ id: 'r-cat-steaks', rule_type: 'category', category_id: 'cat-steaks', station_id: 'station-grill' }),
      makeRule({ id: 'r-cat-salads', rule_type: 'category', category_id: 'cat-salads', station_id: 'station-salad', priority: 10 }),
    ];
    const stations = [
      makeStation({ id: 'station-grill', station_type: 'grill' }),
      makeStation({ id: 'station-salad', station_type: 'salad', sort_order: 2 }),
    ];
    setupMocks(rules, stations);

    const items = [
      makeItem({ orderLineId: 'line-1', catalogItemId: 'item-steak', categoryId: 'cat-steaks' }),
      makeItem({ orderLineId: 'line-2', catalogItemId: 'item-caesar', categoryId: 'cat-salads' }),
    ];
    const results = await resolveStationRouting(makeContext(), items);

    expect(results).toHaveLength(2);
    expect(results[0]!.stationId).toBe('station-grill');
    expect(results[0]!.orderLineId).toBe('line-1');
    expect(results[1]!.stationId).toBe('station-salad');
    expect(results[1]!.orderLineId).toBe('line-2');
  });

  // ── Sub-department cross-match ─────────────────────────────

  it('department rule matches sub-department ID (cross-level)', async () => {
    // A department rule whose departmentId points at a sub-department ID
    const rules = [
      makeRule({
        id: 'r-dept-cross',
        rule_type: 'department',
        department_id: 'subdept-entrees',
        category_id: null,
        station_id: 'station-grill',
      }),
    ];
    const stations = [makeStation()];
    setupMocks(rules, stations);

    const results = await resolveStationRouting(makeContext(), [makeItem()]);
    // The routing engine checks: (ruleType === 'department' && departmentId === item.subDepartmentId)
    // at the sub_department cascade level
    expect(results[0]!.stationId).toBe('station-grill');
    expect(results[0]!.matchType).toBe('sub_department');
  });
});

// ── Validation Tests ─────────────────────────────────────────

describe('KDS Routing Rule — Zod superRefine validation', () => {
  let createKdsRoutingRuleSchema: CreateKdsRoutingRuleSchemaType;

  beforeEach(async () => {
    const mod = await import('../validation');
    createKdsRoutingRuleSchema = mod.createKdsRoutingRuleSchema;
  });

  const base = { stationId: 'station-1', clientRequestId: 'req-1' };

  it('accepts category rule with categoryId', () => {
    const result = createKdsRoutingRuleSchema.safeParse({
      ...base,
      ruleType: 'category',
      categoryId: 'cat-steaks',
    });
    expect(result.success).toBe(true);
  });

  it('rejects category rule without categoryId', () => {
    const result = createKdsRoutingRuleSchema.safeParse({
      ...base,
      ruleType: 'category',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i: ZodIssue) => i.path.includes('categoryId'));
      expect(issue).toBeDefined();
      expect(issue!.message).toContain('categoryId is required');
    }
  });

  it('accepts item rule with catalogItemId', () => {
    const result = createKdsRoutingRuleSchema.safeParse({
      ...base,
      ruleType: 'item',
      catalogItemId: 'item-steak',
    });
    expect(result.success).toBe(true);
  });

  it('rejects item rule without catalogItemId', () => {
    const result = createKdsRoutingRuleSchema.safeParse({
      ...base,
      ruleType: 'item',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i: ZodIssue) => i.path.includes('catalogItemId'))).toBe(true);
    }
  });

  it('accepts modifier rule with modifierId', () => {
    const result = createKdsRoutingRuleSchema.safeParse({
      ...base,
      ruleType: 'modifier',
      modifierId: 'mod-1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects modifier rule without modifierId', () => {
    const result = createKdsRoutingRuleSchema.safeParse({
      ...base,
      ruleType: 'modifier',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i: ZodIssue) => i.path.includes('modifierId'))).toBe(true);
    }
  });

  it('accepts department rule with departmentId', () => {
    const result = createKdsRoutingRuleSchema.safeParse({
      ...base,
      ruleType: 'department',
      departmentId: 'dept-food',
    });
    expect(result.success).toBe(true);
  });

  it('rejects department rule without departmentId', () => {
    const result = createKdsRoutingRuleSchema.safeParse({
      ...base,
      ruleType: 'department',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i: ZodIssue) => i.path.includes('departmentId'))).toBe(true);
    }
  });

  it('accepts sub_department rule with subDepartmentId', () => {
    const result = createKdsRoutingRuleSchema.safeParse({
      ...base,
      ruleType: 'sub_department',
      subDepartmentId: 'subdept-entrees',
    });
    expect(result.success).toBe(true);
  });

  it('rejects sub_department rule without subDepartmentId', () => {
    const result = createKdsRoutingRuleSchema.safeParse({
      ...base,
      ruleType: 'sub_department',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i: ZodIssue) => i.path.includes('subDepartmentId'))).toBe(true);
    }
  });
});
