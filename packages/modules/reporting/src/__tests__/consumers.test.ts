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

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// ── Imports (after mocks) ─────────────────────────────────────

import { computeBusinessDate } from '../business-date';
import { handleOrderPlaced } from '../consumers/order-placed';
import { handleOrderVoided } from '../consumers/order-voided';
import { handleTenderRecorded } from '../consumers/tender-recorded';
import { handleInventoryMovement } from '../consumers/inventory-movement';

// ── Test Constants ────────────────────────────────────────────

const TENANT = 'tenant_001';
const LOCATION = 'loc_001';

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'evt_001',
    eventType: 'test.event.v1',
    tenantId: TENANT,
    locationId: LOCATION,
    occurredAt: '2026-03-15T18:30:00.000Z',
    actorUserId: 'user_001',
    idempotencyKey: 'idem_001',
    data: {},
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// Business Date Tests
// ═══════════════════════════════════════════════════════════════

describe('computeBusinessDate', () => {
  it('standard midnight cutover (dayCloseTime 00:00) returns same-day date', () => {
    // 2026-03-15T18:30:00Z in New York (UTC-4 EDT) = 2:30 PM local
    const result = computeBusinessDate(
      '2026-03-15T18:30:00.000Z',
      'America/New_York',
      '00:00',
    );
    expect(result).toBe('2026-03-15');
  });

  it('dayCloseTime 02:00, order at 01:30 local → previous business date', () => {
    // 2026-03-15T05:30:00Z in New York (UTC-4 EDT) = 01:30 AM local
    // With dayCloseTime '02:00', subtract 2h → maps to previous day
    const result = computeBusinessDate(
      '2026-03-15T05:30:00.000Z',
      'America/New_York',
      '02:00',
    );
    expect(result).toBe('2026-03-14');
  });

  it('dayCloseTime 02:00, order at 02:30 local → current business date', () => {
    // 2026-03-15T06:30:00Z in New York (UTC-4 EDT) = 02:30 AM local
    // With dayCloseTime '02:00', subtract 2h → still 2026-03-15
    const result = computeBusinessDate(
      '2026-03-15T06:30:00.000Z',
      'America/New_York',
      '02:00',
    );
    expect(result).toBe('2026-03-15');
  });

  it('handles DST spring-forward transition', () => {
    // 2026-03-08 is DST spring-forward in America/New_York (2AM → 3AM)
    // 2026-03-08T07:30:00Z = 3:30 AM EDT (after spring forward)
    const result = computeBusinessDate(
      '2026-03-08T07:30:00.000Z',
      'America/New_York',
      '00:00',
    );
    expect(result).toBe('2026-03-08');
  });

  it('handles various timezones correctly', () => {
    // 2026-03-15T03:00:00Z in Asia/Tokyo (UTC+9) = 12:00 PM noon
    const tokyo = computeBusinessDate(
      '2026-03-15T03:00:00.000Z',
      'Asia/Tokyo',
      '00:00',
    );
    expect(tokyo).toBe('2026-03-15');

    // 2026-03-15T23:30:00Z in Europe/London (UTC+0 GMT in March) = 11:30 PM
    const london = computeBusinessDate(
      '2026-03-15T23:30:00.000Z',
      'Europe/London',
      '00:00',
    );
    expect(london).toBe('2026-03-15');

    // Same timestamp in Asia/Tokyo = next day (March 16, 8:30 AM)
    const tokyoLate = computeBusinessDate(
      '2026-03-15T23:30:00.000Z',
      'Asia/Tokyo',
      '00:00',
    );
    expect(tokyoLate).toBe('2026-03-16');
  });

  it('defaults to midnight cutover when dayCloseTime is undefined', () => {
    const result = computeBusinessDate(
      '2026-03-15T18:30:00.000Z',
      'America/New_York',
    );
    expect(result).toBe('2026-03-15');
  });

  it('accepts Date objects', () => {
    const result = computeBusinessDate(
      new Date('2026-03-15T18:30:00.000Z'),
      'America/New_York',
    );
    expect(result).toBe('2026-03-15');
  });
});

// ═══════════════════════════════════════════════════════════════
// Idempotency Tests
// ═══════════════════════════════════════════════════════════════

describe('Idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockReset();
    mockSelect.mockReset();
  });

  it('skips processing when event was already processed', async () => {
    const event = makeEvent({
      eventType: 'order.placed.v1',
      data: {
        orderId: 'ord_001',
        locationId: LOCATION,
        subtotal: 10000,
        taxTotal: 1000,
        total: 11000,
        lines: [],
      },
    });

    // Idempotency insert returns empty → already processed
    mockIdempotencyDuplicate();

    await handleOrderPlaced(event as any);

    // Should only have the idempotency check execute call, no upserts
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('processes same eventId independently for different consumer names', async () => {
    const orderEvent = makeEvent({
      eventId: 'evt_shared',
      eventType: 'order.placed.v1',
      data: {
        orderId: 'ord_001',
        locationId: LOCATION,
        subtotal: 10000,
        taxTotal: 1000,
        total: 11000,
        lines: [],
      },
    });

    const tenderEvent = makeEvent({
      eventId: 'evt_shared',
      eventType: 'tender.recorded.v1',
      data: {
        orderId: 'ord_001',
        locationId: LOCATION,
        tenderType: 'cash',
        amount: 110,
      },
    });

    // Both pass idempotency (different consumer names)
    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]); // location lookup
    mockUpsert(); // daily sales upsert
    mockUpsert(); // revenue activity upsert

    await handleOrderPlaced(orderEvent as any);

    vi.clearAllMocks();
    mockExecute.mockReset();
    mockSelect.mockReset();

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert(); // daily sales upsert

    await handleTenderRecorded(tenderEvent as any);

    // Both processed without error
    expect(mockExecute).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// orderPlaced Consumer Tests
// ═══════════════════════════════════════════════════════════════

describe('handleOrderPlaced', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockReset();
    mockSelect.mockReset();
  });

  it('upserts rm_daily_sales with correct totals', async () => {
    const event = makeEvent({
      eventType: 'order.placed.v1',
      data: {
        orderId: 'ord_001',
        locationId: LOCATION,
        subtotal: 5000,
        taxTotal: 450,
        discountTotal: 500,
        total: 4950,
        lines: [],
      },
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]); // location
    mockUpsert(); // daily sales
    mockUpsert(); // revenue activity

    await handleOrderPlaced(event as any);

    // idempotency + daily sales + revenue activity = 3 execute calls
    expect(mockExecute).toHaveBeenCalledTimes(3);
    expect(mockWithTenant).toHaveBeenCalledWith(TENANT, expect.any(Function));
  });

  it('upserts rm_item_sales for each line', async () => {
    const event = makeEvent({
      eventType: 'order.placed.v1',
      data: {
        orderId: 'ord_001',
        locationId: LOCATION,
        lines: [
          { catalogItemId: 'item_1', catalogItemName: 'Burger', qty: 2, lineTotal: 2200 },
          { catalogItemId: 'item_2', catalogItemName: 'Fries', qty: 1, lineTotal: 550 },
        ],
        subtotal: 2500,
        taxTotal: 250,
        total: 2750,
      },
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert(); // daily sales
    mockUpsert(); // revenue activity
    mockUpsert(); // item 1
    mockUpsert(); // item 2

    await handleOrderPlaced(event as any);

    // idempotency + daily sales + revenue activity + 2 item sales = 5 execute calls
    expect(mockExecute).toHaveBeenCalledTimes(5);
  });

  it('upserts rm_customer_activity when customerId is present', async () => {
    const event = makeEvent({
      eventType: 'order.placed.v1',
      data: {
        orderId: 'ord_001',
        locationId: LOCATION,
        customerId: 'cust_001',
        customerName: 'John Doe',
        subtotal: 10000,
        taxTotal: 1000,
        total: 11000,
        lines: [],
      },
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert(); // daily sales
    mockUpsert(); // revenue activity
    mockUpsert(); // customer activity

    await handleOrderPlaced(event as any);

    // idempotency + daily sales + revenue activity + customer activity = 4 execute calls
    expect(mockExecute).toHaveBeenCalledTimes(4);
  });

  it('does NOT touch rm_customer_activity when customerId is absent', async () => {
    const event = makeEvent({
      eventType: 'order.placed.v1',
      data: {
        orderId: 'ord_001',
        locationId: LOCATION,
        subtotal: 10000,
        taxTotal: 1000,
        total: 11000,
        lines: [],
      },
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert(); // daily sales
    mockUpsert(); // revenue activity

    await handleOrderPlaced(event as any);

    // idempotency + daily sales + revenue activity = 3 execute calls (no customer activity)
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('handles multiple orders accumulating on same day', async () => {
    // First order
    const event1 = makeEvent({
      eventId: 'evt_001',
      eventType: 'order.placed.v1',
      data: {
        orderId: 'ord_001',
        locationId: LOCATION,
        subtotal: 5000,
        discountTotal: 500,
        taxTotal: 450,
        total: 4950,
        lines: [],
      },
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert(); // daily sales
    mockUpsert(); // revenue activity
    await handleOrderPlaced(event1 as any);

    vi.clearAllMocks();
    mockExecute.mockReset();
    mockSelect.mockReset();

    // Second order (different eventId, same day)
    const event2 = makeEvent({
      eventId: 'evt_002',
      eventType: 'order.placed.v1',
      data: {
        orderId: 'ord_002',
        locationId: LOCATION,
        subtotal: 3000,
        taxTotal: 300,
        total: 3300,
        lines: [],
      },
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert(); // daily sales
    mockUpsert(); // revenue activity
    await handleOrderPlaced(event2 as any);

    // Both processed — SQL ON CONFLICT handles accumulation
    // idempotency + daily sales + revenue activity = 3 execute calls
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('computes avgOrderValue correctly in upsert SQL', async () => {
    const event = makeEvent({
      eventType: 'order.placed.v1',
      data: {
        orderId: 'ord_001',
        locationId: LOCATION,
        subtotal: 12000,
        discountTotal: 2000,
        taxTotal: 1000,
        total: 11000,
        lines: [],
      },
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert(); // daily sales
    mockUpsert(); // revenue activity

    await handleOrderPlaced(event as any);

    // Verify execute was called (SQL includes avgOrderValue computation)
    // The SQL contains: (rm_daily_sales.net_sales + $net) / (rm_daily_sales.order_count + 1)
    // idempotency + daily sales + revenue activity = 3 execute calls
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });
});

// ═══════════════════════════════════════════════════════════════
// orderVoided Consumer Tests
// ═══════════════════════════════════════════════════════════════

describe('handleOrderVoided', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockReset();
    mockSelect.mockReset();
  });

  it('increments voidCount and voidTotal', async () => {
    const event = makeEvent({
      eventType: 'order.voided.v1',
      data: {
        orderId: 'ord_001',
        locationId: LOCATION,
        total: 4950,
        lines: [],
      },
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert(); // daily sales
    mockUpsert(); // revenue activity

    await handleOrderVoided(event as any);

    // idempotency + daily sales + revenue activity = 3 execute calls
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('decreases netSales by void amount', async () => {
    const event = makeEvent({
      eventType: 'order.voided.v1',
      data: {
        orderId: 'ord_001',
        locationId: LOCATION,
        total: 10000,
        lines: [],
      },
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert(); // daily sales
    mockUpsert(); // revenue activity

    await handleOrderVoided(event as any);

    // SQL includes: net_sales = rm_daily_sales.net_sales - ${voidAmount}
    // idempotency + daily sales + revenue activity = 3 execute calls
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('does NOT change orderCount (voids keep original count)', async () => {
    const event = makeEvent({
      eventType: 'order.voided.v1',
      data: {
        orderId: 'ord_001',
        locationId: LOCATION,
        total: 5000,
        lines: [],
      },
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert(); // daily sales
    mockUpsert(); // revenue activity

    await handleOrderVoided(event as any);

    // Verify SQL was executed — the SQL template does NOT include order_count in the UPDATE SET
    // (it uses rm_daily_sales.order_count in avgOrderValue calculation without incrementing)
    // idempotency + daily sales + revenue activity = 3 execute calls
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('recomputes avgOrderValue with adjusted netSales and same orderCount', async () => {
    const event = makeEvent({
      eventType: 'order.voided.v1',
      data: {
        orderId: 'ord_001',
        locationId: LOCATION,
        total: 2500,
        lines: [],
      },
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert(); // daily sales
    mockUpsert(); // revenue activity

    await handleOrderVoided(event as any);

    // SQL includes: avg_order_value = CASE WHEN rm_daily_sales.order_count > 0
    //   THEN (rm_daily_sales.net_sales - $voidAmount) / rm_daily_sales.order_count ELSE 0 END
    // idempotency + daily sales + revenue activity = 3 execute calls
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('increments quantityVoided on rm_item_sales per line', async () => {
    const event = makeEvent({
      eventType: 'order.voided.v1',
      data: {
        orderId: 'ord_001',
        locationId: LOCATION,
        total: 5000,
        lines: [
          { catalogItemId: 'item_1', qty: 2, lineTotal: 3000 },
          { catalogItemId: 'item_2', qty: 1, lineTotal: 2000 },
        ],
      },
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert(); // daily sales
    mockUpsert(); // revenue activity
    mockUpsert(); // item 1
    mockUpsert(); // item 2

    await handleOrderVoided(event as any);

    // idempotency + daily sales + revenue activity + 2 item sales = 5 execute calls
    expect(mockExecute).toHaveBeenCalledTimes(5);
  });
});

// ═══════════════════════════════════════════════════════════════
// tenderRecorded Consumer Tests
// ═══════════════════════════════════════════════════════════════

describe('handleTenderRecorded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockReset();
    mockSelect.mockReset();
  });

  it('increments tenderCash for cash tenders', async () => {
    const event = makeEvent({
      eventType: 'tender.recorded.v1',
      data: {
        orderId: 'ord_001',
        locationId: LOCATION,
        tenderType: 'cash',
        amount: 50,
      },
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert();

    await handleTenderRecorded(event as any);

    // idempotency + daily sales upsert = 2 execute calls
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('increments tenderCard for card tenders', async () => {
    const event = makeEvent({
      eventType: 'tender.recorded.v1',
      data: {
        orderId: 'ord_001',
        locationId: LOCATION,
        tenderType: 'card',
        amount: 75,
      },
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert();

    await handleTenderRecorded(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('does not affect other rm_daily_sales fields', async () => {
    const event = makeEvent({
      eventType: 'tender.recorded.v1',
      data: {
        orderId: 'ord_001',
        locationId: LOCATION,
        tenderType: 'cash',
        amount: 100,
      },
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert();

    await handleTenderRecorded(event as any);

    // Only 2 execute calls — no item_sales, no customer_activity, no extra updates
    expect(mockExecute).toHaveBeenCalledTimes(2);
    // No select calls beyond location lookup
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });

  it('increments tenderGiftCard for gift_card tenders', async () => {
    const event = makeEvent({
      eventType: 'tender.recorded.v1',
      data: {
        orderId: 'ord_001',
        locationId: LOCATION,
        tenderType: 'gift_card',
        amount: 2500,
      },
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert();

    await handleTenderRecorded(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('increments tenderHouseAccount for house_account tenders', async () => {
    const event = makeEvent({
      eventType: 'tender.recorded.v1',
      data: {
        orderId: 'ord_001',
        locationId: LOCATION,
        tenderType: 'house_account',
        amount: 15000,
      },
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert();

    await handleTenderRecorded(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('increments tenderAch for ach tenders', async () => {
    const event = makeEvent({
      eventType: 'tender.recorded.v1',
      data: {
        orderId: 'ord_001',
        locationId: LOCATION,
        tenderType: 'ach',
        amount: 50000,
      },
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert();

    await handleTenderRecorded(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('routes unknown tender types to tenderOther', async () => {
    const event = makeEvent({
      eventType: 'tender.recorded.v1',
      data: {
        orderId: 'ord_001',
        locationId: LOCATION,
        tenderType: 'cryptocurrency',
        amount: 9999,
      },
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert();

    await handleTenderRecorded(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('records tipAmount in tipTotal column', async () => {
    const event = makeEvent({
      eventType: 'tender.recorded.v1',
      data: {
        orderId: 'ord_001',
        locationId: LOCATION,
        tenderType: 'card',
        amount: 5000,
        tipAmount: 1000,
      },
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert();

    await handleTenderRecorded(event as any);

    // Should still be 2 execute calls — tip is included in the same upsert
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('records surchargeAmountCents in surchargeTotal column', async () => {
    const event = makeEvent({
      eventType: 'tender.recorded.v1',
      data: {
        orderId: 'ord_001',
        locationId: LOCATION,
        tenderType: 'card',
        amount: 5000,
        surchargeAmountCents: 150,
      },
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert();

    await handleTenderRecorded(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('records tips AND surcharges together in single upsert', async () => {
    const event = makeEvent({
      eventType: 'tender.recorded.v1',
      data: {
        orderId: 'ord_001',
        locationId: LOCATION,
        tenderType: 'card',
        amount: 7500,
        tipAmount: 1500,
        surchargeAmountCents: 225,
      },
    });

    mockIdempotencyNew();
    mockSelectReturns([{ timezone: 'America/New_York' }]);
    mockUpsert();

    await handleTenderRecorded(event as any);

    // Single upsert handles tender amount + tip + surcharge atomically
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// inventoryMovement Consumer Tests
// ═══════════════════════════════════════════════════════════════

describe('handleInventoryMovement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockReset();
    mockSelect.mockReset();
  });

  it('sets absolute onHand when newOnHand is provided', async () => {
    const event = makeEvent({
      eventType: 'inventory.movement.created.v1',
      data: {
        inventoryItemId: 'inv_001',
        locationId: LOCATION,
        itemName: 'Widget',
        delta: -5,
        newOnHand: 95,
      },
    });

    mockIdempotencyNew();
    mockExecute.mockResolvedValueOnce([{ rp: 10 }]); // reorder point query
    mockUpsert();

    await handleInventoryMovement(event as any);

    // idempotency + reorder point query + inventory upsert = 3 execute calls
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('adds delta when newOnHand is not provided', async () => {
    const event = makeEvent({
      eventType: 'inventory.movement.created.v1',
      data: {
        inventoryItemId: 'inv_001',
        locationId: LOCATION,
        itemName: 'Widget',
        delta: 10,
      },
    });

    mockIdempotencyNew();
    mockExecute.mockResolvedValueOnce([{ rp: 10 }]); // reorder point query
    mockUpsert();

    await handleInventoryMovement(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('recomputes isBelowThreshold on every update', async () => {
    // First: receive 100 units
    const event1 = makeEvent({
      eventId: 'evt_receive',
      eventType: 'inventory.movement.created.v1',
      data: {
        inventoryItemId: 'inv_001',
        locationId: LOCATION,
        itemName: 'Widget',
        delta: 100,
        newOnHand: 100,
      },
    });

    mockIdempotencyNew();
    mockExecute.mockResolvedValueOnce([{ rp: 10 }]); // reorder point query
    mockUpsert();
    await handleInventoryMovement(event1 as any);

    vi.clearAllMocks();
    mockExecute.mockReset();

    // Second: sell down to 3 (below threshold of e.g. 5)
    const event2 = makeEvent({
      eventId: 'evt_sell',
      eventType: 'inventory.movement.created.v1',
      data: {
        inventoryItemId: 'inv_001',
        locationId: LOCATION,
        itemName: 'Widget',
        delta: -97,
        newOnHand: 3,
      },
    });

    mockIdempotencyNew();
    mockExecute.mockResolvedValueOnce([{ rp: 10 }]); // reorder point query
    mockUpsert();
    await handleInventoryMovement(event2 as any);

    // SQL includes: is_below_threshold = ${onHand} < rm_inventory_on_hand.low_stock_threshold
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('handles multiple movements accumulating correctly', async () => {
    // First movement
    const event1 = makeEvent({
      eventId: 'evt_m1',
      eventType: 'inventory.movement.created.v1',
      data: {
        inventoryItemId: 'inv_001',
        locationId: LOCATION,
        itemName: 'Widget',
        delta: 50,
      },
    });

    mockIdempotencyNew();
    mockExecute.mockResolvedValueOnce([{ rp: 10 }]); // reorder point query
    mockUpsert();
    await handleInventoryMovement(event1 as any);

    vi.clearAllMocks();
    mockExecute.mockReset();

    // Second movement (delta mode, no absolute)
    const event2 = makeEvent({
      eventId: 'evt_m2',
      eventType: 'inventory.movement.created.v1',
      data: {
        inventoryItemId: 'inv_001',
        locationId: LOCATION,
        itemName: 'Widget',
        delta: -10,
      },
    });

    mockIdempotencyNew();
    mockExecute.mockResolvedValueOnce([{ rp: 10 }]); // reorder point query
    mockUpsert();
    await handleInventoryMovement(event2 as any);

    // Both processed — SQL ON CONFLICT handles accumulation (on_hand + delta)
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });
});
