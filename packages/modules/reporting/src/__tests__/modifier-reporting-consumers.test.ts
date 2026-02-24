import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────
const { mockExecute, mockSelect, mockWithTenant } = vi.hoisted(() => {
  function makeSelectChain(result: unknown[] = []) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
    return chain;
  }

  const mockExecute = vi.fn();
  const mockSelect = vi.fn(() => makeSelectChain());

  const mockWithTenant = vi.fn(
    async (_tid: string, fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        execute: mockExecute,
        select: mockSelect,
      };
      return fn(tx);
    },
  );

  return { mockExecute, mockSelect, mockWithTenant };
});

// ── Chain helpers ─────────────────────────────────────────────

function makeSelectChain(result: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
  return chain;
}

function mockSelectReturns(data: unknown[]) {
  mockSelect.mockReturnValueOnce(makeSelectChain(data));
}

/** Simulate idempotency insert returning a row (event NOT yet processed). */
function mockIdempotencyNew() {
  mockExecute.mockResolvedValueOnce([{ id: 'PE_001' }]);
}

/** Simulate idempotency insert returning empty (event ALREADY processed). */
function mockIdempotencyDuplicate() {
  mockExecute.mockResolvedValueOnce([]);
}

/** Simulate a SQL upsert (no meaningful return). */
function mockUpsert() {
  mockExecute.mockResolvedValueOnce([]);
}

// ── Module mocks ──────────────────────────────────────────────

vi.mock('@oppsera/db', () => ({
  withTenant: mockWithTenant,
  locations: Symbol('locations'),
  processedEvents: Symbol('processedEvents'),
  sql: Object.assign(vi.fn((...args: unknown[]) => args), {
    raw: vi.fn((s: string) => s),
  }),
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => 'ULID_TEST_001'),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  sql: Object.assign(vi.fn((...args: unknown[]) => args), {
    raw: vi.fn((s: string) => s),
    join: vi.fn(),
  }),
}));

vi.mock('../business-date', () => ({
  computeBusinessDate: vi.fn(() => '2025-01-15'),
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// ── Imports (after mocks) ─────────────────────────────────────

import { handleOrderPlacedModifiers } from '../consumers/handle-order-placed-modifiers';
import { handleOrderVoidedModifiers } from '../consumers/handle-order-voided-modifiers';

// ── SQL value extraction helper ───────────────────────────────
/**
 * The mocked `sql` tagged template returns `[TemplateStringsArray, ...interpolatedValues]`.
 * This helper extracts just the interpolated values (indices 1+) from a mock execute call arg.
 */
function extractSqlValues(mockCallArg: unknown): unknown[] {
  if (Array.isArray(mockCallArg)) {
    return mockCallArg.slice(1);
  }
  return [];
}

// ── Test Constants ────────────────────────────────────────────

const TENANT = 'tenant_001';
const LOCATION = 'loc_001';

interface ModifierEntry {
  modifierId: string;
  modifierGroupId: string | null;
  name: string;
  priceAdjustmentCents: number;
  instruction: 'none' | 'extra' | 'on_side' | null;
  isDefault: boolean;
}

interface AssignedGroup {
  modifierGroupId: string;
  groupName: string | null;
  isRequired: boolean;
}

function makeModifier(overrides: Partial<ModifierEntry> = {}): ModifierEntry {
  return {
    modifierId: 'mod_001',
    modifierGroupId: 'grp_001',
    name: 'Extra Cheese',
    priceAdjustmentCents: 150,
    instruction: 'none',
    isDefault: false,
    ...overrides,
  };
}

function makeAssignedGroup(overrides: Partial<AssignedGroup> = {}): AssignedGroup {
  return {
    modifierGroupId: 'grp_001',
    groupName: 'Toppings',
    isRequired: false,
    ...overrides,
  };
}

function makePlacedEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'evt_001',
    tenantId: TENANT,
    locationId: LOCATION,
    occurredAt: '2025-01-15T18:30:00.000Z',
    lines: [],
    ...overrides,
  };
}

function makeVoidEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'evt_void_001',
    tenantId: TENANT,
    locationId: LOCATION,
    occurredAt: '2025-01-15T18:30:00.000Z',
    lines: [],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// handleOrderPlacedModifiers
// ═══════════════════════════════════════════════════════════════

describe('handleOrderPlacedModifiers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockReset();
    mockSelect.mockReset();
  });

  it('processes a single line with one modifier — correct number of execute calls', async () => {
    // 1 idempotency + 1 item_sales upsert + 1 daypart upsert + 1 group_attach upsert = 4 execute calls
    // Plus 1 location select chain
    const event = makePlacedEvent({
      lines: [
        {
          catalogItemId: 'item_001',
          catalogItemName: 'Burger',
          qty: 1,
          modifiers: [makeModifier()],
          assignedModifierGroupIds: [makeAssignedGroup()],
        },
      ],
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert(); // rm_modifier_item_sales
    mockUpsert(); // rm_modifier_daypart
    mockUpsert(); // rm_modifier_group_attach

    await handleOrderPlacedModifiers(event as any);

    // idempotency(1) + item_sales(1) + daypart(1) + group_attach(1) = 4
    expect(mockExecute).toHaveBeenCalledTimes(4);
    expect(mockWithTenant).toHaveBeenCalledWith(TENANT, expect.any(Function));
  });

  it('processes multiple modifiers on one line — correct number of upserts', async () => {
    const event = makePlacedEvent({
      lines: [
        {
          catalogItemId: 'item_001',
          catalogItemName: 'Burger',
          qty: 1,
          modifiers: [
            makeModifier({ modifierId: 'mod_001', name: 'Extra Cheese' }),
            makeModifier({ modifierId: 'mod_002', name: 'Bacon', priceAdjustmentCents: 200 }),
            makeModifier({ modifierId: 'mod_003', name: 'Lettuce', priceAdjustmentCents: 0 }),
          ],
          assignedModifierGroupIds: [makeAssignedGroup()],
        },
      ],
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    // 3 modifiers x 2 upserts each (item_sales + daypart) = 6 + 1 group_attach = 7
    for (let i = 0; i < 7; i++) mockUpsert();

    await handleOrderPlacedModifiers(event as any);

    // idempotency(1) + 3*item_sales(3) + 3*daypart(3) + group_attach(1) = 8
    expect(mockExecute).toHaveBeenCalledTimes(8);
  });

  it('skips modifiers without modifierGroupId (null group)', async () => {
    const event = makePlacedEvent({
      lines: [
        {
          catalogItemId: 'item_001',
          catalogItemName: 'Burger',
          qty: 1,
          modifiers: [
            makeModifier({ modifierId: 'mod_001', modifierGroupId: null }),
            makeModifier({ modifierId: 'mod_002', modifierGroupId: 'grp_001' }),
          ],
          assignedModifierGroupIds: [makeAssignedGroup()],
        },
      ],
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert(); // item_sales for mod_002 only
    mockUpsert(); // daypart for mod_002 only
    mockUpsert(); // group_attach

    await handleOrderPlacedModifiers(event as any);

    // idempotency(1) + item_sales(1) + daypart(1) + group_attach(1) = 4
    // The null-group modifier is skipped
    expect(mockExecute).toHaveBeenCalledTimes(4);
  });

  it('correctly computes revenue from cents to dollars (priceAdjustmentCents * qty / 100)', async () => {
    // 350 cents * qty 2 = 700 cents = $7.00
    const event = makePlacedEvent({
      lines: [
        {
          catalogItemId: 'item_001',
          catalogItemName: 'Steak',
          qty: 2,
          modifiers: [
            makeModifier({ priceAdjustmentCents: 350 }),
          ],
          assignedModifierGroupIds: [makeAssignedGroup()],
        },
      ],
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert(); // item_sales
    mockUpsert(); // daypart
    mockUpsert(); // group_attach

    await handleOrderPlacedModifiers(event as any);

    // Verify the SQL was called — the values embedded in the sql template
    // include revenueDollars = (350 * 2) / 100 = 7.0
    const itemSalesCall = mockExecute.mock.calls[1]![0]; // second execute = item_sales upsert
    expect(itemSalesCall).toBeDefined();
    // Revenue value is embedded in the sql tagged template interpolation slots
    const sqlValues = extractSqlValues(itemSalesCall);
    // The revenue dollars value (350 * 2 / 100 = 7) should appear in the values array
    expect(sqlValues).toContain(7);
  });

  it('correctly tracks instruction counters (none, extra, on_side)', async () => {
    const event = makePlacedEvent({
      lines: [
        {
          catalogItemId: 'item_001',
          catalogItemName: 'Pasta',
          qty: 1,
          modifiers: [
            makeModifier({ modifierId: 'mod_001', instruction: 'extra' }),
            makeModifier({ modifierId: 'mod_002', instruction: 'on_side' }),
            makeModifier({ modifierId: 'mod_003', instruction: 'none' }),
            makeModifier({ modifierId: 'mod_004', instruction: null }),
          ],
          assignedModifierGroupIds: [makeAssignedGroup()],
        },
      ],
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    // 4 modifiers x 2 (item_sales + daypart) = 8 + 1 group_attach = 9
    for (let i = 0; i < 9; i++) mockUpsert();

    await handleOrderPlacedModifiers(event as any);

    // Verify 'extra' modifier: instrNone=0, instrExtra=1, instrOnSide=0
    const extraValues = extractSqlValues(mockExecute.mock.calls[1]![0]);
    expect(extraValues).toContain(1); // instrExtra = 1 (qty)

    // Verify 'on_side' modifier: instrOnSide=1
    const onSideValues = extractSqlValues(mockExecute.mock.calls[3]![0]);
    expect(onSideValues).toContain(1); // instrOnSide = 1

    // Verify 'none' instruction: instrNone=1
    const noneValues = extractSqlValues(mockExecute.mock.calls[5]![0]);
    expect(noneValues).toContain(1); // instrNone = 1

    // Verify null instruction is treated same as 'none': instrNone=1
    const nullValues = extractSqlValues(mockExecute.mock.calls[7]![0]);
    expect(nullValues).toContain(1); // instrNone = 1 (null treated as 'none')
  });

  it('correctly sets isDefault counter', async () => {
    const event = makePlacedEvent({
      lines: [
        {
          catalogItemId: 'item_001',
          catalogItemName: 'Burger',
          qty: 1,
          modifiers: [
            makeModifier({ modifierId: 'mod_001', isDefault: true }),
            makeModifier({ modifierId: 'mod_002', isDefault: false }),
          ],
          assignedModifierGroupIds: [makeAssignedGroup()],
        },
      ],
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    for (let i = 0; i < 5; i++) mockUpsert(); // 2*2 + 1 group

    await handleOrderPlacedModifiers(event as any);

    // First modifier (isDefault=true): instrDefault = 1
    const defaultValues = extractSqlValues(mockExecute.mock.calls[1]![0]);
    expect(defaultValues).toContain(1); // instrDefault = qty (1)

    // Second modifier (isDefault=false): instrDefault = 0
    const nonDefaultValues = extractSqlValues(mockExecute.mock.calls[3]![0]);
    expect(nonDefaultValues).toContain(0); // instrDefault = 0
  });

  it('handles qty > 1 (multiply all counters by qty)', async () => {
    const event = makePlacedEvent({
      lines: [
        {
          catalogItemId: 'item_001',
          catalogItemName: 'Burger',
          qty: 3,
          modifiers: [
            makeModifier({ priceAdjustmentCents: 100, instruction: 'extra', isDefault: true }),
          ],
          assignedModifierGroupIds: [makeAssignedGroup()],
        },
      ],
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert(); // item_sales
    mockUpsert(); // daypart
    mockUpsert(); // group_attach

    await handleOrderPlacedModifiers(event as any);

    const vals = extractSqlValues(mockExecute.mock.calls[1]![0]);

    // qty = 3, priceAdjustmentCents = 100
    // revenueDollars = 100 * 3 / 100 = 3
    expect(vals).toContain(3); // revenueDollars and extraRevenueDollars both = 3
    // instrExtra = 3, instrDefault = 3, times_selected = 3
    // All counters should contain 3
    const threeCount = vals.filter((v: unknown) => v === 3).length;
    expect(threeCount).toBeGreaterThanOrEqual(3); // revenueDollars, extraRevenueDollars, instrExtra, instrDefault, qty
  });

  it('skips processing when event is already processed (idempotency)', async () => {
    const event = makePlacedEvent({
      lines: [
        {
          catalogItemId: 'item_001',
          catalogItemName: 'Burger',
          qty: 1,
          modifiers: [makeModifier()],
          assignedModifierGroupIds: [makeAssignedGroup()],
        },
      ],
    });

    mockIdempotencyDuplicate();

    await handleOrderPlacedModifiers(event as any);

    // Only the idempotency check execute call, no upserts, no location lookup
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('tracks eligible lines for groups without selections (assigned but no modifiers selected)', async () => {
    // Group is assigned to the line but no modifiers from that group were selected
    const event = makePlacedEvent({
      lines: [
        {
          catalogItemId: 'item_001',
          catalogItemName: 'Burger',
          qty: 1,
          modifiers: [], // No modifiers selected
          assignedModifierGroupIds: [
            makeAssignedGroup({ modifierGroupId: 'grp_unselected', groupName: 'Sauces' }),
          ],
        },
      ],
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert(); // group_attach

    await handleOrderPlacedModifiers(event as any);

    // idempotency(1) + group_attach(1) = 2 (no item_sales or daypart since no modifiers)
    expect(mockExecute).toHaveBeenCalledTimes(2);

    // The group_attach upsert should have linesWithSelection = 0, totalModifierSelections = 0
    const groupValues = extractSqlValues(mockExecute.mock.calls[1]![0]);
    expect(groupValues).toContain(0); // linesWithSelection = 0
  });

  it('handles multiple lines with different items', async () => {
    const event = makePlacedEvent({
      lines: [
        {
          catalogItemId: 'item_001',
          catalogItemName: 'Burger',
          qty: 1,
          modifiers: [makeModifier({ modifierId: 'mod_001' })],
          assignedModifierGroupIds: [makeAssignedGroup()],
        },
        {
          catalogItemId: 'item_002',
          catalogItemName: 'Salad',
          qty: 2,
          modifiers: [
            makeModifier({ modifierId: 'mod_002', name: 'Dressing', modifierGroupId: 'grp_002', priceAdjustmentCents: 50 }),
          ],
          assignedModifierGroupIds: [
            makeAssignedGroup({ modifierGroupId: 'grp_002', groupName: 'Dressings' }),
          ],
        },
      ],
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    // Line 1: item_sales + daypart + group_attach = 3
    // Line 2: item_sales + daypart + group_attach = 3
    for (let i = 0; i < 6; i++) mockUpsert();

    await handleOrderPlacedModifiers(event as any);

    // idempotency(1) + 2 lines * (1 item_sales + 1 daypart + 1 group_attach) = 7
    expect(mockExecute).toHaveBeenCalledTimes(7);
  });

  it('correctly counts unique modifiers selected per group', async () => {
    // Two different modifiers from the same group on the same line
    const event = makePlacedEvent({
      lines: [
        {
          catalogItemId: 'item_001',
          catalogItemName: 'Burger',
          qty: 1,
          modifiers: [
            makeModifier({ modifierId: 'mod_001', modifierGroupId: 'grp_001', name: 'Cheese' }),
            makeModifier({ modifierId: 'mod_002', modifierGroupId: 'grp_001', name: 'Bacon' }),
          ],
          assignedModifierGroupIds: [makeAssignedGroup({ modifierGroupId: 'grp_001' })],
        },
      ],
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    // 2 modifiers * 2 (item_sales + daypart) = 4 + 1 group_attach = 5
    for (let i = 0; i < 5; i++) mockUpsert();

    await handleOrderPlacedModifiers(event as any);

    // The group_attach upsert is the last execute call
    const groupValues = extractSqlValues(mockExecute.mock.calls[5]![0]); // index 5 = group_attach
    // uniqueModifiersSelected = 2 (mod_001 and mod_002 are different)
    expect(groupValues).toContain(2); // uniqueModifiersSelected
  });
});

// ═══════════════════════════════════════════════════════════════
// handleOrderVoidedModifiers
// ═══════════════════════════════════════════════════════════════

describe('handleOrderVoidedModifiers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockReset();
    mockSelect.mockReset();
  });

  it('processes a void event — increments void_count and void_revenue_dollars', async () => {
    const event = makeVoidEvent({
      lines: [
        {
          catalogItemId: 'item_001',
          qty: 1,
          modifiers: [
            { modifierId: 'mod_001', modifierGroupId: 'grp_001', name: 'Extra Cheese', priceAdjustmentCents: 150 },
          ],
        },
      ],
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert(); // item_sales void
    mockUpsert(); // group_attach void

    await handleOrderVoidedModifiers(event as any);

    // idempotency(1) + item_sales(1) + group_attach(1) = 3
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('correctly computes void revenue from cents to dollars', async () => {
    // 250 cents * qty 2 = 500 cents = $5.00
    const event = makeVoidEvent({
      lines: [
        {
          catalogItemId: 'item_001',
          qty: 2,
          modifiers: [
            { modifierId: 'mod_001', modifierGroupId: 'grp_001', name: 'Bacon', priceAdjustmentCents: 250 },
          ],
        },
      ],
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert(); // item_sales
    mockUpsert(); // group_attach

    await handleOrderVoidedModifiers(event as any);

    const itemSalesValues = extractSqlValues(mockExecute.mock.calls[1]![0]);
    // voidRevenueDollars = (250 * 2) / 100 = 5
    expect(itemSalesValues).toContain(5);
  });

  it('tracks void_count at group level (rm_modifier_group_attach)', async () => {
    const event = makeVoidEvent({
      lines: [
        {
          catalogItemId: 'item_001',
          qty: 1,
          modifiers: [
            { modifierId: 'mod_001', modifierGroupId: 'grp_001', name: 'Cheese', priceAdjustmentCents: 100 },
          ],
        },
      ],
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert(); // item_sales
    mockUpsert(); // group_attach

    await handleOrderVoidedModifiers(event as any);

    // group_attach should be the 3rd execute call (index 2)
    const groupValues = extractSqlValues(mockExecute.mock.calls[2]![0]);
    expect(groupValues.length).toBeGreaterThan(0);
    // void_count = qty = 1
    expect(groupValues).toContain(1);
  });

  it('skips modifiers without modifierGroupId', async () => {
    const event = makeVoidEvent({
      lines: [
        {
          catalogItemId: 'item_001',
          qty: 1,
          modifiers: [
            { modifierId: 'mod_001', modifierGroupId: null, name: 'Ungrouped', priceAdjustmentCents: 100 },
            { modifierId: 'mod_002', modifierGroupId: 'grp_001', name: 'Grouped', priceAdjustmentCents: 200 },
          ],
        },
      ],
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert(); // item_sales for mod_002 only
    mockUpsert(); // group_attach for grp_001

    await handleOrderVoidedModifiers(event as any);

    // idempotency(1) + item_sales(1) + group_attach(1) = 3 (null-group skipped)
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('skips processing when event is already processed (idempotency)', async () => {
    const event = makeVoidEvent({
      lines: [
        {
          catalogItemId: 'item_001',
          qty: 1,
          modifiers: [
            { modifierId: 'mod_001', modifierGroupId: 'grp_001', name: 'Cheese', priceAdjustmentCents: 100 },
          ],
        },
      ],
    });

    mockIdempotencyDuplicate();

    await handleOrderVoidedModifiers(event as any);

    // Only the idempotency check, no upserts
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('handles multiple modifiers across groups — only unique groupIds get group-level void', async () => {
    const event = makeVoidEvent({
      lines: [
        {
          catalogItemId: 'item_001',
          qty: 1,
          modifiers: [
            { modifierId: 'mod_001', modifierGroupId: 'grp_001', name: 'Cheese', priceAdjustmentCents: 100 },
            { modifierId: 'mod_002', modifierGroupId: 'grp_001', name: 'Bacon', priceAdjustmentCents: 200 },
            { modifierId: 'mod_003', modifierGroupId: 'grp_002', name: 'Ranch', priceAdjustmentCents: 50 },
          ],
        },
      ],
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert(); // item_sales mod_001
    mockUpsert(); // item_sales mod_002
    mockUpsert(); // item_sales mod_003
    mockUpsert(); // group_attach grp_001 (deduped, only once)
    mockUpsert(); // group_attach grp_002

    await handleOrderVoidedModifiers(event as any);

    // idempotency(1) + 3 item_sales(3) + 2 unique group_attach(2) = 6
    expect(mockExecute).toHaveBeenCalledTimes(6);
  });

  it('handles qty > 1 for void events', async () => {
    const event = makeVoidEvent({
      lines: [
        {
          catalogItemId: 'item_001',
          qty: 4,
          modifiers: [
            { modifierId: 'mod_001', modifierGroupId: 'grp_001', name: 'Cheese', priceAdjustmentCents: 100 },
          ],
        },
      ],
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert(); // item_sales
    mockUpsert(); // group_attach

    await handleOrderVoidedModifiers(event as any);

    // void_count and void_revenue should reflect qty=4
    const itemSalesValues = extractSqlValues(mockExecute.mock.calls[1]![0]);
    // voidRevenueDollars = (100 * 4) / 100 = 4
    expect(itemSalesValues).toContain(4);

    const groupValues = extractSqlValues(mockExecute.mock.calls[2]![0]);
    // void_count = qty = 4
    expect(groupValues).toContain(4);
  });
});

// ═══════════════════════════════════════════════════════════════
// Edge Cases
// ═══════════════════════════════════════════════════════════════

describe('Edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockReset();
    mockSelect.mockReset();
  });

  it('empty lines array (placed) — only does idempotency check and location lookup', async () => {
    const event = makePlacedEvent({ lines: [] });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);

    await handleOrderPlacedModifiers(event as any);

    // idempotency(1) + no upserts = 1 execute call
    // Plus 1 select for location lookup
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });

  it('line with no modifiers and no assigned groups — no upserts', async () => {
    const event = makePlacedEvent({
      lines: [
        {
          catalogItemId: 'item_001',
          catalogItemName: 'Plain Burger',
          qty: 1,
          modifiers: [],
          assignedModifierGroupIds: [],
        },
      ],
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);

    await handleOrderPlacedModifiers(event as any);

    // idempotency(1) only, no upserts for modifiers or groups
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });
});
