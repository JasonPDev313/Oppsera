import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Setup ───────────────────────────────────────────────────
// All vi.mock calls must appear before any imports that use them.

const mockWithTenant = vi.fn();

vi.mock('@oppsera/db', () => ({
  withTenant: (...args: unknown[]) => mockWithTenant(...args),
  orderLines: {
    id: 'id',
    tenantId: 'tenant_id',
    orderId: 'order_id',
    catalogItemId: 'catalog_item_id',
    catalogItemName: 'catalog_item_name',
    subDepartmentId: 'sub_department_id',
    qty: 'qty',
    modifiers: 'modifiers',
    specialInstructions: 'special_instructions',
    seatNumber: 'seat_number',
    itemType: 'item_type',
  },
  fnbKitchenTicketItems: {
    tenantId: 'tenant_id',
    orderLineId: 'order_line_id',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  inArray: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
}));

vi.mock('@oppsera/core/observability', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockResolveStationRouting = vi.fn();
const mockEnrichRoutableItems = vi.fn();

vi.mock('../services/kds-routing-engine', () => ({
  resolveStationRouting: (...args: unknown[]) => mockResolveStationRouting(...args),
  enrichRoutableItems: (...args: unknown[]) => mockEnrichRoutableItems(...args),
}));

const mockCreateKitchenTicket = vi.fn();

// send-order-lines-to-kds imports createKitchenTicket from './create-kitchen-ticket'
vi.mock('../commands/create-kitchen-ticket', () => ({
  createKitchenTicket: (...args: unknown[]) => mockCreateKitchenTicket(...args),
}));

// handle-order-placed-for-kds imports createKitchenTicket from '../commands/create-kitchen-ticket'
// The same mock above covers both since vi.mock resolves to the same module path.

vi.mock('@oppsera/shared', () => ({
  AppError: class AppError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
      this.name = 'AppError';
    }
  },
}));

// ── Imports (after mocks) ────────────────────────────────────────

import { sendOrderLinesToKds } from '../commands/send-order-lines-to-kds';
import { handleOrderPlacedForKds } from '../consumers/handle-order-placed-for-kds';
import { logger } from '@oppsera/core/observability';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { EventEnvelope } from '@oppsera/shared/types/events';

// ── Fixtures ─────────────────────────────────────────────────────

function makeCtx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    tenantId: 'tenant-1',
    locationId: 'loc-1',
    user: { id: 'user-1', email: 'user@test.com', role: 'manager' },
    requestId: 'req-1',
    isPlatformAdmin: false,
    ...overrides,
  } as unknown as RequestContext;
}

function makeOrderLine(overrides: Partial<{
  id: string;
  catalogItemId: string;
  catalogItemName: string;
  subDepartmentId: string | null;
  qty: string;
  modifiers: unknown;
  specialInstructions: string | null;
  seatNumber: number | null;
}> = {}) {
  return {
    id: 'line-1',
    catalogItemId: 'item-burger',
    catalogItemName: 'Classic Burger',
    subDepartmentId: 'subdept-hot-food',
    qty: '1',
    modifiers: [],
    specialInstructions: null,
    seatNumber: null,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<{
  tenantId: string;
  actorUserId: string;
  data: Record<string, unknown>;
}> = {}): EventEnvelope {
  return {
    id: 'evt-1',
    type: 'order.placed.v1',
    tenantId: 'tenant-1',
    actorUserId: 'actor-1',
    occurredAt: '2026-03-06T12:00:00Z',
    data: {
      orderId: 'order-1',
      locationId: 'loc-1',
      businessDate: '2026-03-06',
      customerName: 'Alice',
      employeeId: 'emp-1',
    },
    ...overrides,
  } as unknown as EventEnvelope;
}

function makeRoutingResult(orderLineId: string, stationId: string | null) {
  return { orderLineId, stationId, matchType: stationId ? 'category' : null, routingRuleId: null };
}

// ── sendOrderLinesToKds ──────────────────────────────────────────

describe('sendOrderLinesToKds', () => {
  const TENANT = 'tenant-1';
  const ORDER_ID = 'order-1';
  const BUSINESS_DATE = '2026-03-06';

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: enrich passes items through unchanged
    mockEnrichRoutableItems.mockImplementation(async (_tid: string, items: unknown[]) => items);
    // Default: createKitchenTicket succeeds
    mockCreateKitchenTicket.mockResolvedValue({ id: 'ticket-1' });
  });

  // ── Guard: locationId ──────────────────────────────────────────

  it('throws AppError LOCATION_REQUIRED when ctx.locationId is missing', async () => {
    const ctx = makeCtx({ locationId: undefined });
    await expect(sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE)).rejects.toMatchObject({
      code: 'LOCATION_REQUIRED',
      status: 400,
    });
    expect(mockWithTenant).not.toHaveBeenCalled();
  });

  // ── Early returns ──────────────────────────────────────────────

  it('returns sentCount 0 when no food/beverage lines exist for the order', async () => {
    // First withTenant call: order lines query → empty
    mockWithTenant.mockImplementationOnce(async () => []);

    const ctx = makeCtx();
    const result = await sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE);

    expect(result).toEqual({ sentCount: 0 });
    // Should not query existing ticket items when there are no lines
    expect(mockWithTenant).toHaveBeenCalledTimes(1);
    expect(mockCreateKitchenTicket).not.toHaveBeenCalled();
  });

  it('returns sentCount 0 and logs when all lines are already sent to KDS', async () => {
    const line1 = makeOrderLine({ id: 'line-1' });
    const line2 = makeOrderLine({ id: 'line-2', catalogItemName: 'Fries' });

    // Call 1: order lines
    mockWithTenant.mockImplementationOnce(async () => [line1, line2]);
    // Call 2: existing ticket items — both lines already sent
    mockWithTenant.mockImplementationOnce(async () => [
      { orderLineId: 'line-1' },
      { orderLineId: 'line-2' },
    ]);

    const ctx = makeCtx();
    const result = await sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE);

    expect(result).toEqual({ sentCount: 0 });
    expect(mockWithTenant).toHaveBeenCalledTimes(2);
    expect(mockCreateKitchenTicket).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('all lines already sent'),
      expect.objectContaining({ orderId: ORDER_ID, tenantId: TENANT }),
    );
  });

  it('returns sentCount 0 when no stations resolve for any line', async () => {
    const line = makeOrderLine({ id: 'line-1' });

    mockWithTenant.mockImplementationOnce(async () => [line]);
    mockWithTenant.mockImplementationOnce(async () => []); // no existing tickets

    // routing engine returns null stationId for all items
    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', null),
    ]);

    const ctx = makeCtx();
    const result = await sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE);

    expect(result).toEqual({ sentCount: 0 });
    expect(mockCreateKitchenTicket).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('no stations resolved'),
      expect.objectContaining({ orderId: ORDER_ID }),
    );
  });

  // ── Happy path ─────────────────────────────────────────────────

  it('routes new lines and creates one ticket when single station resolves', async () => {
    const line = makeOrderLine({ id: 'line-1', catalogItemName: 'Burger', qty: '2' });

    mockWithTenant.mockImplementationOnce(async () => [line]);
    mockWithTenant.mockImplementationOnce(async () => []); // no existing tickets

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
    ]);

    const ctx = makeCtx();
    const result = await sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE);

    expect(result).toEqual({ sentCount: 1 });
    expect(mockCreateKitchenTicket).toHaveBeenCalledTimes(1);
    expect(mockCreateKitchenTicket).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        orderId: ORDER_ID,
        businessDate: BUSINESS_DATE,
        channel: 'pos',
        items: expect.arrayContaining([
          expect.objectContaining({
            orderLineId: 'line-1',
            itemName: 'Burger',
            quantity: 2,
            stationId: 'station-grill',
          }),
        ]),
      }),
    );
  });

  it('groups items by station and creates one ticket per station', async () => {
    const line1 = makeOrderLine({ id: 'line-1', catalogItemName: 'Burger' });
    const line2 = makeOrderLine({ id: 'line-2', catalogItemName: 'Salad', catalogItemId: 'item-salad' });

    mockWithTenant.mockImplementationOnce(async () => [line1, line2]);
    mockWithTenant.mockImplementationOnce(async () => []);

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
      makeRoutingResult('line-2', 'station-salad'),
    ]);

    const ctx = makeCtx();
    const result = await sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE);

    expect(result).toEqual({ sentCount: 2 });
    expect(mockCreateKitchenTicket).toHaveBeenCalledTimes(2);

    // Verify tickets were created for each station
    const calls = mockCreateKitchenTicket.mock.calls;
    const stationIds = calls.map((c) => (c[1] as { items: Array<{ stationId: string }> }).items[0]?.stationId);
    expect(stationIds).toContain('station-grill');
    expect(stationIds).toContain('station-salad');
  });

  // ── Idempotency key format ─────────────────────────────────────

  it('generates idempotency key with sorted line IDs: retail-kds-send-{orderId}-{stationId}-{sortedLineIds}', async () => {
    const line1 = makeOrderLine({ id: 'line-zzz', catalogItemName: 'Item A' });
    const line2 = makeOrderLine({ id: 'line-aaa', catalogItemName: 'Item B' });

    mockWithTenant.mockImplementationOnce(async () => [line1, line2]);
    mockWithTenant.mockImplementationOnce(async () => []);

    // Both lines route to the same station
    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-zzz', 'station-grill'),
      makeRoutingResult('line-aaa', 'station-grill'),
    ]);

    const ctx = makeCtx();
    await sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE);

    // Sorted: line-aaa, line-zzz
    expect(mockCreateKitchenTicket).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        clientRequestId: `retail-kds-send-${ORDER_ID}-station-grill-line-aaa,line-zzz`,
      }),
    );
  });

  // ── Partial failure / resilience ──────────────────────────────

  it('handles partial ticket creation failure gracefully and returns partial sentCount', async () => {
    const line1 = makeOrderLine({ id: 'line-1', catalogItemName: 'Burger' });
    const line2 = makeOrderLine({ id: 'line-2', catalogItemName: 'Salad', catalogItemId: 'item-salad' });

    mockWithTenant.mockImplementationOnce(async () => [line1, line2]);
    mockWithTenant.mockImplementationOnce(async () => []);

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
      makeRoutingResult('line-2', 'station-salad'),
    ]);

    // First ticket (station-grill) fails; second (station-salad) succeeds
    mockCreateKitchenTicket
      .mockRejectedValueOnce(new Error('DB timeout'))
      .mockResolvedValueOnce({ id: 'ticket-2' });

    const ctx = makeCtx();
    // Must not throw
    const result = await sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE);

    // Only the second station's item was sent successfully
    expect(result.sentCount).toBe(1);
    expect(mockCreateKitchenTicket).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('failed to create ticket for station'),
      expect.objectContaining({ orderId: ORDER_ID }),
    );
  });

  it('does not throw when createKitchenTicket fails for all stations', async () => {
    const line = makeOrderLine({ id: 'line-1' });

    mockWithTenant.mockImplementationOnce(async () => [line]);
    mockWithTenant.mockImplementationOnce(async () => []);

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
    ]);

    mockCreateKitchenTicket.mockRejectedValueOnce(new Error('Connection refused'));

    const ctx = makeCtx();
    const result = await sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE);

    expect(result).toEqual({ sentCount: 0 });
  });

  // ── Modifier extraction ────────────────────────────────────────

  it('extracts modifier IDs from JSONB modifiers and passes them to enrichRoutableItems', async () => {
    const line = makeOrderLine({
      id: 'line-1',
      modifiers: [
        { modifierId: 'mod-spicy', name: 'Spicy' },
        { modifierId: 'mod-no-onion', name: 'No Onion' },
      ],
    });

    mockWithTenant.mockImplementationOnce(async () => [line]);
    mockWithTenant.mockImplementationOnce(async () => []);

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
    ]);

    const ctx = makeCtx();
    await sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE);

    // enrichRoutableItems should have been called with the extracted modifier IDs
    expect(mockEnrichRoutableItems).toHaveBeenCalledWith(
      TENANT,
      expect.arrayContaining([
        expect.objectContaining({
          orderLineId: 'line-1',
          modifierIds: ['mod-spicy', 'mod-no-onion'],
        }),
      ]),
    );
  });

  it('handles line with null/non-array modifiers by passing empty modifierIds', async () => {
    const lineNoMods = makeOrderLine({ id: 'line-1', modifiers: null });

    mockWithTenant.mockImplementationOnce(async () => [lineNoMods]);
    mockWithTenant.mockImplementationOnce(async () => []);

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
    ]);

    const ctx = makeCtx();
    await sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE);

    expect(mockEnrichRoutableItems).toHaveBeenCalledWith(
      TENANT,
      expect.arrayContaining([
        expect.objectContaining({
          orderLineId: 'line-1',
          modifierIds: [],
        }),
      ]),
    );
  });

  // ── Filtering already-sent lines ──────────────────────────────

  it('only routes lines not already in KDS ticket items', async () => {
    const line1 = makeOrderLine({ id: 'line-1', catalogItemName: 'Burger' });
    const line2 = makeOrderLine({ id: 'line-2', catalogItemName: 'Fries', catalogItemId: 'item-fries' });

    mockWithTenant.mockImplementationOnce(async () => [line1, line2]);
    // line-1 already sent
    mockWithTenant.mockImplementationOnce(async () => [{ orderLineId: 'line-1' }]);

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-2', 'station-fry'),
    ]);

    const ctx = makeCtx();
    const result = await sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE);

    // Only line-2 was new → enriched and routed
    expect(mockEnrichRoutableItems).toHaveBeenCalledWith(
      TENANT,
      [expect.objectContaining({ orderLineId: 'line-2' })],
    );
    expect(result).toEqual({ sentCount: 1 });
  });

  // ── Routing context ────────────────────────────────────────────

  it('calls resolveStationRouting with pos channel and correct tenantId/locationId', async () => {
    const line = makeOrderLine({ id: 'line-1' });

    mockWithTenant.mockImplementationOnce(async () => [line]);
    mockWithTenant.mockImplementationOnce(async () => []);

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
    ]);

    const ctx = makeCtx({ tenantId: 'tenant-abc', locationId: 'loc-xyz' });
    await sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE);

    expect(mockResolveStationRouting).toHaveBeenCalledWith(
      { tenantId: 'tenant-abc', locationId: 'loc-xyz', channel: 'pos' },
      expect.any(Array),
    );
  });

  // ── Unrouted items warning ─────────────────────────────────────

  it('logs a warning for items that could not be routed to any station', async () => {
    const line1 = makeOrderLine({ id: 'line-1', catalogItemName: 'Burger' });
    const line2 = makeOrderLine({ id: 'line-2', catalogItemName: 'Mystery Item' });

    mockWithTenant.mockImplementationOnce(async () => [line1, line2]);
    mockWithTenant.mockImplementationOnce(async () => []);

    // line-1 routed, line-2 unrouted
    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
      makeRoutingResult('line-2', null),
    ]);

    const ctx = makeCtx();
    await sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('unroutable items'),
      expect.objectContaining({ unroutedCount: 1, totalLines: 2 }),
    );
  });

  // ── Quantity parsing ───────────────────────────────────────────

  it('converts string qty to number in ticket items, defaulting to 1 for invalid values', async () => {
    const line = makeOrderLine({ id: 'line-1', qty: 'invalid' });

    mockWithTenant.mockImplementationOnce(async () => [line]);
    mockWithTenant.mockImplementationOnce(async () => []);

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
    ]);

    await sendOrderLinesToKds(makeCtx(), ORDER_ID, BUSINESS_DATE);

    expect(mockCreateKitchenTicket).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        items: [expect.objectContaining({ quantity: 1 })],
      }),
    );
  });
});

// ── handleOrderPlacedForKds ──────────────────────────────────────

describe('handleOrderPlacedForKds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnrichRoutableItems.mockImplementation(async (_tid: string, items: unknown[]) => items);
    mockCreateKitchenTicket.mockResolvedValue({ id: 'ticket-1' });
  });

  // ── Guard: missing required fields ────────────────────────────

  it('returns early without DB calls when event data has no orderId', async () => {
    const event = makeEvent({ data: { locationId: 'loc-1', businessDate: '2026-03-06' } } as never);
    await handleOrderPlacedForKds(event);
    expect(mockWithTenant).not.toHaveBeenCalled();
  });

  it('returns early without DB calls when event data has no locationId', async () => {
    const event = makeEvent({ data: { orderId: 'order-1', businessDate: '2026-03-06' } } as never);
    await handleOrderPlacedForKds(event);
    expect(mockWithTenant).not.toHaveBeenCalled();
  });

  it('returns early without DB calls when event has no tenantId', async () => {
    const event = makeEvent({ tenantId: undefined as never });
    await handleOrderPlacedForKds(event);
    expect(mockWithTenant).not.toHaveBeenCalled();
  });

  // ── Never throws ──────────────────────────────────────────────

  it('never throws — catches and logs unhandled errors from withTenant', async () => {
    mockWithTenant.mockRejectedValueOnce(new Error('pool exhausted'));

    const event = makeEvent();
    // Must resolve, never reject
    await expect(handleOrderPlacedForKds(event)).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('unhandled error'),
      expect.objectContaining({
        error: expect.objectContaining({ message: 'pool exhausted' }),
      }),
    );
  });

  it('never throws — catches and logs errors from resolveStationRouting', async () => {
    const line = makeOrderLine({ id: 'line-1' });
    mockWithTenant.mockImplementationOnce(async () => [line]);
    mockWithTenant.mockImplementationOnce(async () => []);
    mockResolveStationRouting.mockRejectedValueOnce(new Error('routing engine failure'));

    const event = makeEvent();
    await expect(handleOrderPlacedForKds(event)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  // ── Early returns (no lines) ───────────────────────────────────

  it('returns early when no food/beverage lines exist for the order', async () => {
    mockWithTenant.mockImplementationOnce(async () => []);

    const event = makeEvent();
    await handleOrderPlacedForKds(event);

    expect(mockWithTenant).toHaveBeenCalledTimes(1);
    expect(mockCreateKitchenTicket).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('no food/bev lines found'),
      expect.objectContaining({ orderId: 'order-1' }),
    );
  });

  it('returns early when all lines already have ticket items', async () => {
    const line = makeOrderLine({ id: 'line-1' });
    mockWithTenant.mockImplementationOnce(async () => [line]);
    // All lines already sent
    mockWithTenant.mockImplementationOnce(async () => [{ orderLineId: 'line-1' }]);

    const event = makeEvent();
    await handleOrderPlacedForKds(event);

    expect(mockCreateKitchenTicket).not.toHaveBeenCalled();
  });

  // ── Filtering already-sent lines ──────────────────────────────

  it('filters out lines already sent to KDS and only routes the new ones', async () => {
    const line1 = makeOrderLine({ id: 'line-1', catalogItemName: 'Burger' });
    const line2 = makeOrderLine({ id: 'line-2', catalogItemName: 'Soda', catalogItemId: 'item-soda' });

    mockWithTenant.mockImplementationOnce(async () => [line1, line2]);
    // line-1 already sent to KDS via manual send-to-kds flow
    mockWithTenant.mockImplementationOnce(async () => [{ orderLineId: 'line-1' }]);

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-2', 'station-bar'),
    ]);

    const event = makeEvent();
    await handleOrderPlacedForKds(event);

    // enrichRoutableItems should only have received line-2
    expect(mockEnrichRoutableItems).toHaveBeenCalledWith(
      'tenant-1',
      [expect.objectContaining({ orderLineId: 'line-2' })],
    );
    expect(mockCreateKitchenTicket).toHaveBeenCalledTimes(1);
  });

  // ── Synthetic ctx construction ────────────────────────────────

  it('creates synthetic RequestContext using event.employeeId as user.id', async () => {
    const line = makeOrderLine({ id: 'line-1' });
    mockWithTenant.mockImplementationOnce(async () => [line]);
    mockWithTenant.mockImplementationOnce(async () => []);

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
    ]);

    const event = makeEvent({
      data: {
        orderId: 'order-1',
        locationId: 'loc-1',
        businessDate: '2026-03-06',
        employeeId: 'emp-42',
      },
    } as never);

    await handleOrderPlacedForKds(event);

    expect(mockCreateKitchenTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ id: 'emp-42' }),
        tenantId: 'tenant-1',
        locationId: 'loc-1',
      }),
      expect.anything(),
    );
  });

  it('falls back to actorUserId when employeeId is absent', async () => {
    const line = makeOrderLine({ id: 'line-1' });
    mockWithTenant.mockImplementationOnce(async () => [line]);
    mockWithTenant.mockImplementationOnce(async () => []);

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
    ]);

    const event = makeEvent({
      actorUserId: 'actor-99',
      data: {
        orderId: 'order-1',
        locationId: 'loc-1',
        businessDate: '2026-03-06',
        // no employeeId
      },
    } as never);

    await handleOrderPlacedForKds(event);

    expect(mockCreateKitchenTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ id: 'actor-99' }),
      }),
      expect.anything(),
    );
  });

  it('falls back to "system" when both employeeId and actorUserId are absent', async () => {
    const line = makeOrderLine({ id: 'line-1' });
    mockWithTenant.mockImplementationOnce(async () => [line]);
    mockWithTenant.mockImplementationOnce(async () => []);

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
    ]);

    const event = makeEvent({
      actorUserId: undefined as never,
      data: {
        orderId: 'order-1',
        locationId: 'loc-1',
        businessDate: '2026-03-06',
        // no employeeId, no actorUserId
      },
    } as never);

    await handleOrderPlacedForKds(event);

    expect(mockCreateKitchenTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ id: 'system' }),
      }),
      expect.anything(),
    );
  });

  // ── Idempotency key format ────────────────────────────────────

  it('uses idempotency key format: retail-kds-{orderId}-{stationId} (no line IDs)', async () => {
    const line = makeOrderLine({ id: 'line-1' });
    mockWithTenant.mockImplementationOnce(async () => [line]);
    mockWithTenant.mockImplementationOnce(async () => []);

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
    ]);

    const event = makeEvent();
    await handleOrderPlacedForKds(event);

    expect(mockCreateKitchenTicket).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        clientRequestId: 'retail-kds-order-1-station-grill',
      }),
    );
  });

  it('generates a separate idempotency key for each station', async () => {
    const line1 = makeOrderLine({ id: 'line-1', catalogItemName: 'Burger' });
    const line2 = makeOrderLine({ id: 'line-2', catalogItemName: 'Beer', catalogItemId: 'item-beer' });

    mockWithTenant.mockImplementationOnce(async () => [line1, line2]);
    mockWithTenant.mockImplementationOnce(async () => []);

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-kitchen'),
      makeRoutingResult('line-2', 'station-bar'),
    ]);

    const event = makeEvent();
    await handleOrderPlacedForKds(event);

    const clientRequestIds = mockCreateKitchenTicket.mock.calls.map(
      (c) => (c[1] as { clientRequestId: string }).clientRequestId,
    );
    expect(clientRequestIds).toContain('retail-kds-order-1-station-kitchen');
    expect(clientRequestIds).toContain('retail-kds-order-1-station-bar');
  });

  // ── Ticket creation ───────────────────────────────────────────

  it('creates tickets with correct orderId, businessDate, channel, and customerName', async () => {
    const line = makeOrderLine({ id: 'line-1' });
    mockWithTenant.mockImplementationOnce(async () => [line]);
    mockWithTenant.mockImplementationOnce(async () => []);

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
    ]);

    const event = makeEvent({
      data: {
        orderId: 'order-99',
        locationId: 'loc-1',
        businessDate: '2026-03-07',
        customerName: 'Bob Jones',
        employeeId: 'emp-1',
      },
    } as never);

    await handleOrderPlacedForKds(event);

    expect(mockCreateKitchenTicket).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orderId: 'order-99',
        businessDate: '2026-03-07',
        channel: 'pos',
        customerName: 'Bob Jones',
      }),
    );
  });

  it('handles null customerName gracefully (passes undefined, not null)', async () => {
    const line = makeOrderLine({ id: 'line-1' });
    mockWithTenant.mockImplementationOnce(async () => [line]);
    mockWithTenant.mockImplementationOnce(async () => []);

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
    ]);

    const event = makeEvent({
      data: {
        orderId: 'order-1',
        locationId: 'loc-1',
        businessDate: '2026-03-06',
        customerName: null,
        employeeId: 'emp-1',
      },
    } as never);

    await handleOrderPlacedForKds(event);

    expect(mockCreateKitchenTicket).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        // null ?? undefined → undefined
        customerName: undefined,
      }),
    );
  });

  // ── Per-station ticket failure ────────────────────────────────

  it('continues creating tickets for remaining stations after one fails', async () => {
    const line1 = makeOrderLine({ id: 'line-1', catalogItemName: 'Burger' });
    const line2 = makeOrderLine({ id: 'line-2', catalogItemName: 'Beer', catalogItemId: 'item-beer' });

    mockWithTenant.mockImplementationOnce(async () => [line1, line2]);
    mockWithTenant.mockImplementationOnce(async () => []);

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-kitchen'),
      makeRoutingResult('line-2', 'station-bar'),
    ]);

    // First station fails
    mockCreateKitchenTicket
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ id: 'ticket-2' });

    const event = makeEvent();
    // Must not throw
    await expect(handleOrderPlacedForKds(event)).resolves.toBeUndefined();
    expect(mockCreateKitchenTicket).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('failed to create ticket for station'),
      expect.objectContaining({ orderId: 'order-1' }),
    );
  });

  // ── Unrouted items warning ────────────────────────────────────

  it('logs a warning when some items cannot be routed', async () => {
    const line1 = makeOrderLine({ id: 'line-1' });
    const line2 = makeOrderLine({ id: 'line-2', catalogItemName: 'Unknown Item' });

    mockWithTenant.mockImplementationOnce(async () => [line1, line2]);
    mockWithTenant.mockImplementationOnce(async () => []);

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
      makeRoutingResult('line-2', null),
    ]);

    await handleOrderPlacedForKds(makeEvent());

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('unroutable items'),
      expect.objectContaining({ unroutedCount: 1, totalLines: 2 }),
    );
  });

  // ── Enrichment ────────────────────────────────────────────────

  it('calls enrichRoutableItems before resolveStationRouting', async () => {
    const line = makeOrderLine({ id: 'line-1' });
    mockWithTenant.mockImplementationOnce(async () => [line]);
    mockWithTenant.mockImplementationOnce(async () => []);

    const enrichedItems = [
      {
        orderLineId: 'line-1',
        catalogItemId: 'item-burger',
        subDepartmentId: 'subdept-hot-food',
        modifierIds: [],
        categoryId: 'cat-burgers',
        departmentId: 'dept-food',
      },
    ];
    mockEnrichRoutableItems.mockResolvedValueOnce(enrichedItems);

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
    ]);

    await handleOrderPlacedForKds(makeEvent());

    // Verify enrich is called first with tenantId
    expect(mockEnrichRoutableItems).toHaveBeenCalledWith('tenant-1', expect.any(Array));
    // Verify resolve is called with the enriched items
    expect(mockResolveStationRouting).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
      enrichedItems,
    );
  });
});
