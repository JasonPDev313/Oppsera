import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────
const { mockExecute, mockSelect: _mockSelect, mockWithTenant } = vi.hoisted(() => {
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

// ── Module mocks ──────────────────────────────────────────────

vi.mock('@oppsera/db', () => ({
  withTenant: mockWithTenant,
  locations: Symbol('locations'),
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => 'ULID_TEST_001'),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  sql: Object.assign(vi.fn((...args: unknown[]) => args), {
    raw: vi.fn((s: string) => s),
  }),
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// ── Imports (after mocks) ─────────────────────────────────────

import { handleOrderPlaced } from '../consumers/order-placed';
import { handleOrderVoided } from '../consumers/order-voided';
import { handleTenderRecorded } from '../consumers/tender-recorded';
import { handleInventoryMovement } from '../consumers/inventory-movement';

// ── Test Constants ────────────────────────────────────────────

const TENANT = 'tenant_001';

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'evt_001',
    eventType: 'test.event.v1',
    tenantId: TENANT,
    locationId: 'loc_001',
    occurredAt: '2026-03-15T18:30:00.000Z',
    actorUserId: 'user_001',
    idempotencyKey: 'idem_001',
    data: {},
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// CRITICAL-4: Zod validation rejects corrupt payloads
// ═══════════════════════════════════════════════════════════════

describe('CRITICAL-4: handleOrderPlaced — Zod validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects payload where subtotal is a string (NaN corruption)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handleOrderPlaced(
      makeEvent({
        data: {
          orderId: 'ord-1',
          locationId: 'loc-1',
          subtotal: 'not-a-number', // string → z.number() fails
          taxTotal: 100,
          total: 1100,
          lines: [],
        },
      }),
    );

    // Should NOT call withTenant (skipped due to validation failure)
    expect(mockWithTenant).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid event payload'),
      expect.anything(),
    );
    consoleError.mockRestore();
  });

  it('rejects payload where total is undefined (NaN corruption)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handleOrderPlaced(
      makeEvent({
        data: {
          orderId: 'ord-1',
          locationId: 'loc-1',
          subtotal: 1000,
          taxTotal: 80,
          // total: missing → z.number() fails
          lines: [],
        },
      }),
    );

    expect(mockWithTenant).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('rejects payload where lines is not an array', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handleOrderPlaced(
      makeEvent({
        data: {
          orderId: 'ord-1',
          locationId: 'loc-1',
          subtotal: 1000,
          taxTotal: 80,
          total: 1080,
          lines: 'not-an-array',
        },
      }),
    );

    expect(mockWithTenant).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('accepts valid payload and processes normally', async () => {
    // Mock idempotency insert (new event)
    mockExecute.mockResolvedValueOnce([{ id: 'PE_001' }]);
    // Mock upsert calls
    mockExecute.mockResolvedValue([]);

    await handleOrderPlaced(
      makeEvent({
        data: {
          orderId: 'ord-1',
          locationId: 'loc-1',
          subtotal: 1000,
          taxTotal: 80,
          total: 1080,
          lines: [
            {
              catalogItemId: 'item-1',
              catalogItemName: 'Widget',
              qty: 1,
              lineTotal: 1000,
            },
          ],
        },
      }),
    );

    expect(mockWithTenant).toHaveBeenCalled();
  });
});

describe('CRITICAL-4: handleOrderVoided — Zod validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects payload where total is a string', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handleOrderVoided(
      makeEvent({
        data: {
          orderId: 'ord-1',
          locationId: 'loc-1',
          total: 'abc', // string → z.number() fails
        },
      }),
    );

    expect(mockWithTenant).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('rejects payload where orderId is missing', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handleOrderVoided(
      makeEvent({
        data: {
          locationId: 'loc-1',
          total: 1080,
          // orderId: missing
        },
      }),
    );

    expect(mockWithTenant).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('CRITICAL-4: handleTenderRecorded — Zod validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects payload where amount is undefined', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handleTenderRecorded(
      makeEvent({
        data: {
          orderId: 'ord-1',
          locationId: 'loc-1',
          tenderType: 'cash',
          // amount: missing → z.number() fails
        },
      }),
    );

    expect(mockWithTenant).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('rejects payload where amount is NaN-producing string', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handleTenderRecorded(
      makeEvent({
        data: {
          orderId: 'ord-1',
          locationId: 'loc-1',
          tenderType: 'cash',
          amount: 'not_a_number',
        },
      }),
    );

    expect(mockWithTenant).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('CRITICAL-4: handleInventoryMovement — Zod validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects payload where delta is a string', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handleInventoryMovement(
      makeEvent({
        data: {
          inventoryItemId: 'inv-1',
          locationId: 'loc-1',
          itemName: 'Widget',
          delta: 'five', // string → z.number() fails
        },
      }),
    );

    expect(mockWithTenant).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('accepts payload where itemName is missing (optional field)', async () => {
    // itemName is z.string().optional() — missing is valid, consumer falls back to DB lookup
    mockExecute.mockResolvedValueOnce([{ id: 'PE_001' }]);
    mockExecute.mockResolvedValueOnce([{ rp: 10, item_name: 'Fallback Widget' }]);
    mockExecute.mockResolvedValueOnce([]);

    await handleInventoryMovement(
      makeEvent({
        data: {
          inventoryItemId: 'inv-1',
          locationId: 'loc-1',
          delta: -3,
        },
      }),
    );

    expect(mockWithTenant).toHaveBeenCalled();
  });

  it('accepts valid payload with optional newOnHand', async () => {
    // Mock idempotency insert (new event)
    mockExecute.mockResolvedValueOnce([{ id: 'PE_001' }]);
    // Mock reorder point query
    mockExecute.mockResolvedValueOnce([{ rp: 10 }]);
    // Mock upsert
    mockExecute.mockResolvedValueOnce([]);

    await handleInventoryMovement(
      makeEvent({
        data: {
          inventoryItemId: 'inv-1',
          locationId: 'loc-1',
          itemName: 'Widget',
          delta: -3,
          newOnHand: 7,
        },
      }),
    );

    expect(mockWithTenant).toHaveBeenCalled();
  });
});
