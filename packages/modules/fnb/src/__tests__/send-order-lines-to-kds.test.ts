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
  fnbKitchenTickets: {
    id: 'id',
    tenantId: 'tenant_id',
    locationId: 'location_id',
    orderId: 'order_id',
    ticketNumber: 'ticket_number',
    status: 'status',
    businessDate: 'business_date',
    sentBy: 'sent_by',
    priorityLevel: 'priority_level',
    orderType: 'order_type',
    channel: 'channel',
    estimatedPickupAt: 'estimated_pickup_at',
    version: 'version',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  inArray: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
  sql: Object.assign(
    vi.fn((...args: unknown[]) => ({ type: 'sql', args })),
    { join: vi.fn(() => ({ type: 'sql_join' })) },
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

const mockPublishWithOutbox = vi.fn();
vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
  publishWithOutbox: (...args: unknown[]) => mockPublishWithOutbox(...args),
}));

const mockBuildEventFromContext = vi.fn();
vi.mock('@oppsera/core/events/build-event', () => ({
  buildEventFromContext: (...args: unknown[]) => mockBuildEventFromContext(...args),
}));

const mockCheckIdempotency = vi.fn();
const mockSaveIdempotencyKey = vi.fn();
vi.mock('@oppsera/core/helpers/idempotency', () => ({
  checkIdempotency: (...args: unknown[]) => mockCheckIdempotency(...args),
  saveIdempotencyKey: (...args: unknown[]) => mockSaveIdempotencyKey(...args),
}));

const mockResolveStationRouting = vi.fn();
const mockEnrichRoutableItems = vi.fn();
const mockGetStationPrepTimesForItems = vi.fn();
const mockResolveKdsLocationId = vi.fn();

vi.mock('../services/kds-routing-engine', () => ({
  resolveStationRouting: async (...args: unknown[]) => {
    const raw = await mockResolveStationRouting(...args);
    // Allow tests to pass a plain array (legacy) — wrap into RoutingResultSet shape
    if (Array.isArray(raw)) return { results: raw, stationNames: new Map(), diagnosis: [] };
    return raw;
  },
  enrichRoutableItems: (...args: unknown[]) => mockEnrichRoutableItems(...args),
  getStationPrepTimesForItems: (...args: unknown[]) => mockGetStationPrepTimesForItems(...args),
  resolveKdsLocationId: (...args: unknown[]) => mockResolveKdsLocationId(...args),
}));

const mockRecordDispatchAttempt = vi.fn();
vi.mock('../commands/dispatch-course-to-kds', () => ({
  recordDispatchAttempt: (...args: unknown[]) => mockRecordDispatchAttempt(...args),
  emptyDispatchResult: () => ({
    attemptId: null,
    status: 'started',
    failureStage: null,
    ticketsCreated: 0,
    ticketsFailed: 0,
    itemsRouted: 0,
    itemsUnrouted: 0,
    itemCount: 0,
    effectiveKdsLocationId: null,
    ticketIds: [],
    stationIds: [],
    orderId: null,
    tabType: null,
    businessDate: null,
    errors: [],
    diagnosis: [],
  }),
}));

vi.mock('../helpers/kds-modifier-helpers', () => ({
  extractModifierIds: (modifiers: unknown) => {
    if (!Array.isArray(modifiers)) return [];
    return (modifiers as Array<{ modifierId?: string }>)
      .map((m) => m?.modifierId)
      .filter(Boolean);
  },
  formatModifierSummary: (modifiers: unknown) => {
    if (!Array.isArray(modifiers) || modifiers.length === 0) return null;
    return (modifiers as Array<{ name?: string }>).map((m) => m?.name).filter(Boolean).join(', ') || null;
  },
}));

vi.mock('../events/types', () => ({
  FNB_EVENTS: {
    TICKET_CREATED: 'fnb.ticket.created.v1',
  },
}));

const mockCreateKitchenTicket = vi.fn();
vi.mock('../commands/create-kitchen-ticket', () => ({
  createKitchenTicket: (...args: unknown[]) => mockCreateKitchenTicket(...args),
}));

const mockRecordKdsSend = vi.fn();
const mockMarkKdsSendSent = vi.fn();
vi.mock('../commands/record-kds-send', () => ({
  recordKdsSend: (...args: unknown[]) => mockRecordKdsSend(...args),
  markKdsSendSent: (...args: unknown[]) => mockMarkKdsSendSent(...args),
}));

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
    // resetAllMocks clears call history AND once-queues, preventing bleed between tests
    vi.resetAllMocks();
    // Re-establish persistent defaults after reset
    mockEnrichRoutableItems.mockImplementation(async (_tid: string, items: unknown[]) => ({
      items,
      chainMap: new Map(),
    }));
    mockResolveKdsLocationId.mockImplementation(async (_tenantId: string, locationId: string) => ({ locationId, resolved: false, warning: null }));
    mockGetStationPrepTimesForItems.mockResolvedValue(new Map());
    mockRecordDispatchAttempt.mockResolvedValue(undefined);
    mockBuildEventFromContext.mockReturnValue({ type: 'fnb.ticket.created.v1' });
    mockCheckIdempotency.mockResolvedValue({ isDuplicate: false });
    mockSaveIdempotencyKey.mockResolvedValue(undefined);
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
    // Single withTenant call returns { lines: [], alreadySentIds: new Set() }
    mockWithTenant.mockResolvedValueOnce({ lines: [], alreadySentIds: new Set() });

    const ctx = makeCtx();
    const result = await sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE, 'dine_in');

    expect(result.sentCount).toBe(0);
    expect(result.failedCount).toBe(0);
    // totalStations is -1 when no lines found
    expect(result.totalStations).toBe(-1);
    expect(result.dispatch).toBeDefined();
    expect(mockWithTenant).toHaveBeenCalledTimes(1);
    expect(mockPublishWithOutbox).not.toHaveBeenCalled();
  });

  it('returns sentCount 0 and logs when all lines are already sent to KDS', async () => {
    const line1 = makeOrderLine({ id: 'line-1' });
    const line2 = makeOrderLine({ id: 'line-2', catalogItemName: 'Fries' });

    // Single withTenant call returns both lines but both already sent
    mockWithTenant.mockResolvedValueOnce({
      lines: [line1, line2],
      alreadySentIds: new Set(['line-1', 'line-2']),
    });

    const ctx = makeCtx();
    const result = await sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE, 'dine_in');

    expect(result.sentCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(result.totalStations).toBe(-1);
    expect(mockWithTenant).toHaveBeenCalledTimes(1);
    expect(mockPublishWithOutbox).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('all lines already sent'),
      expect.objectContaining({ orderId: ORDER_ID, tenantId: TENANT }),
    );
  });

  it('returns sentCount 0 when no stations resolve for any line', async () => {
    const line = makeOrderLine({ id: 'line-1' });

    // Phase 1 read: lines + alreadySentIds
    mockWithTenant.mockResolvedValueOnce({
      lines: [line],
      alreadySentIds: new Set(),
    });
    // Phase 1.5: station names (only reached when stationGroups.size > 0, but routing returns null so no stations)
    // No need to mock — routing returns null for all, stationGroups stays empty, we return before station names

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', null),
    ]);

    const ctx = makeCtx();
    const result = await sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE);

    expect(result.sentCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(result.totalStations).toBe(0);
    expect(result.dispatch.status).toBe('routing_failed');
    expect(mockPublishWithOutbox).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('no stations resolved'),
      expect.objectContaining({ orderId: ORDER_ID }),
    );
  });

  // ── Happy path ─────────────────────────────────────────────────

  it('routes new lines and creates tickets via publishWithOutbox for a single station', async () => {
    const line = makeOrderLine({ id: 'line-1', catalogItemName: 'Burger', qty: '2' });

    // Phase 1: lines + already-sent
    mockWithTenant.mockResolvedValueOnce({
      lines: [line],
      alreadySentIds: new Set(),
    });
    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
    ]);

    // publishWithOutbox returns the result object (what the callback's `result` field would be)
    mockPublishWithOutbox.mockResolvedValueOnce({ ticketIds: ['ticket-1'], totalItems: 1, isDuplicate: false });

    const ctx = makeCtx();
    const result = await sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE, 'dine_in');

    expect(result.sentCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.totalStations).toBe(1);
    expect(result.dispatch).toBeDefined();
    expect(mockPublishWithOutbox).toHaveBeenCalledTimes(1);
    expect(mockPublishWithOutbox).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, locationId: 'loc-1' }),
      expect.any(Function),
    );
  });

  it('groups items by station and creates tickets for each station', async () => {
    const line1 = makeOrderLine({ id: 'line-1', catalogItemName: 'Burger' });
    const line2 = makeOrderLine({ id: 'line-2', catalogItemName: 'Salad', catalogItemId: 'item-salad' });

    mockWithTenant.mockResolvedValueOnce({
      lines: [line1, line2],
      alreadySentIds: new Set(),
    });

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
      makeRoutingResult('line-2', 'station-salad'),
    ]);

    mockPublishWithOutbox.mockResolvedValueOnce({ ticketIds: ['ticket-1', 'ticket-2'], totalItems: 2, isDuplicate: false });

    const ctx = makeCtx();
    const result = await sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE, 'dine_in');

    expect(result.sentCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(result.totalStations).toBe(2);
    expect(mockPublishWithOutbox).toHaveBeenCalledTimes(1);
  });

  // ── Dispatch result ────────────────────────────────────────────

  it('returns dispatch object with succeeded status on success', async () => {
    const line = makeOrderLine({ id: 'line-1' });

    mockWithTenant.mockResolvedValueOnce({
      lines: [line],
      alreadySentIds: new Set(),
    });

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
    ]);

    mockPublishWithOutbox.mockResolvedValueOnce({ ticketIds: ['ticket-1'], totalItems: 1, isDuplicate: false });

    const ctx = makeCtx();
    const result = await sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE);

    expect(result.dispatch.status).toBe('succeeded');
    expect(result.dispatch.ticketIds).toEqual(['ticket-1']);
    expect(result.dispatch.ticketsCreated).toBe(1);
  });

  it('handles idempotency duplicate — returns sentCount 0 with succeeded status', async () => {
    const line = makeOrderLine({ id: 'line-1' });

    mockWithTenant.mockResolvedValueOnce({
      lines: [line],
      alreadySentIds: new Set(),
    });

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
    ]);

    mockPublishWithOutbox.mockResolvedValueOnce({ ticketIds: [], totalItems: 0, isDuplicate: true });

    const ctx = makeCtx();
    const result = await sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE);

    expect(result.sentCount).toBe(0);
    expect(result.dispatch.status).toBe('succeeded');
  });

  // ── Transaction failure ────────────────────────────────────────

  it('returns failedCount equal to stationCount when publishWithOutbox throws', async () => {
    const line = makeOrderLine({ id: 'line-1' });

    mockWithTenant.mockResolvedValueOnce({
      lines: [line],
      alreadySentIds: new Set(),
    });

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
    ]);

    mockPublishWithOutbox.mockRejectedValueOnce(new Error('DB timeout'));

    const ctx = makeCtx();
    const result = await sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE);

    expect(result.sentCount).toBe(0);
    expect(result.failedCount).toBe(1); // 1 station
    expect(result.totalStations).toBe(1);
    expect(result.dispatch.status).toBe('ticket_create_failed');
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('atomic transaction failed'),
      expect.objectContaining({ orderId: ORDER_ID }),
    );
  });

  it('does not throw when publishWithOutbox fails', async () => {
    const line = makeOrderLine({ id: 'line-1' });

    mockWithTenant.mockResolvedValueOnce({
      lines: [line],
      alreadySentIds: new Set(),
    });

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
    ]);

    mockPublishWithOutbox.mockRejectedValueOnce(new Error('Connection refused'));

    const ctx = makeCtx();
    // Must not throw
    await expect(sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE)).resolves.toBeDefined();
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

    mockWithTenant.mockResolvedValueOnce({
      lines: [line],
      alreadySentIds: new Set(),
    });

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
    ]);
    mockPublishWithOutbox.mockResolvedValueOnce({ ticketIds: ['ticket-1'], totalItems: 1, isDuplicate: false });

    const ctx = makeCtx();
    await sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE);

    expect(mockEnrichRoutableItems).toHaveBeenCalledWith(
      TENANT,
      expect.arrayContaining([
        expect.objectContaining({
          orderLineId: 'line-1',
          modifierIds: ['mod-spicy', 'mod-no-onion'],
        }),
      ]),
      { returnChainMap: true },
    );
  });

  it('handles line with null/non-array modifiers by passing empty modifierIds', async () => {
    const lineNoMods = makeOrderLine({ id: 'line-1', modifiers: null });

    mockWithTenant.mockResolvedValueOnce({
      lines: [lineNoMods],
      alreadySentIds: new Set(),
    });

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
    ]);
    mockPublishWithOutbox.mockResolvedValueOnce({ ticketIds: ['ticket-1'], totalItems: 1, isDuplicate: false });

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
      { returnChainMap: true },
    );
  });

  // ── Filtering already-sent lines ──────────────────────────────

  it('only routes lines not already in KDS ticket items', async () => {
    const line1 = makeOrderLine({ id: 'line-1', catalogItemName: 'Burger' });
    const line2 = makeOrderLine({ id: 'line-2', catalogItemName: 'Fries', catalogItemId: 'item-fries' });

    // line-1 already sent
    mockWithTenant.mockResolvedValueOnce({
      lines: [line1, line2],
      alreadySentIds: new Set(['line-1']),
    });

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-2', 'station-fry'),
    ]);
    mockPublishWithOutbox.mockResolvedValueOnce({ ticketIds: ['ticket-1'], totalItems: 1, isDuplicate: false });

    const ctx = makeCtx();
    const result = await sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE);

    // Only line-2 was new → enriched and routed
    expect(mockEnrichRoutableItems).toHaveBeenCalledWith(
      TENANT,
      [expect.objectContaining({ orderLineId: 'line-2' })],
      { returnChainMap: true },
    );
    expect(result.sentCount).toBe(1);
    expect(result.totalStations).toBe(1);
  });

  // ── Routing context ────────────────────────────────────────────

  it('calls resolveStationRouting with pos channel, orderType, and correct tenantId/locationId', async () => {
    const line = makeOrderLine({ id: 'line-1' });

    mockWithTenant.mockResolvedValueOnce({
      lines: [line],
      alreadySentIds: new Set(),
    });

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
    ]);
    mockPublishWithOutbox.mockResolvedValueOnce({ ticketIds: ['ticket-1'], totalItems: 1, isDuplicate: false });

    const ctx = makeCtx({ tenantId: 'tenant-abc', locationId: 'loc-xyz' });
    await sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE, 'dine_in');

    expect(mockResolveStationRouting).toHaveBeenCalledWith(
      { tenantId: 'tenant-abc', locationId: 'loc-xyz', orderType: 'dine_in', channel: 'pos' },
      expect.any(Array),
    );
  });

  // ── Unrouted items warning ─────────────────────────────────────

  it('logs a warning for items that could not be routed to any station', async () => {
    const line1 = makeOrderLine({ id: 'line-1', catalogItemName: 'Burger' });
    const line2 = makeOrderLine({ id: 'line-2', catalogItemName: 'Mystery Item' });

    mockWithTenant.mockResolvedValueOnce({
      lines: [line1, line2],
      alreadySentIds: new Set(),
    });

    // line-1 routed, line-2 unrouted
    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
      makeRoutingResult('line-2', null),
    ]);
    mockPublishWithOutbox.mockResolvedValueOnce({ ticketIds: ['ticket-1'], totalItems: 1, isDuplicate: false });

    const ctx = makeCtx();
    await sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('unroutable items'),
      expect.objectContaining({ unroutedCount: 1, totalLines: 2 }),
    );
  });

  // ── recordDispatchAttempt ──────────────────────────────────────

  it('calls recordDispatchAttempt after successful dispatch', async () => {
    const line = makeOrderLine({ id: 'line-1' });

    mockWithTenant.mockResolvedValueOnce({
      lines: [line],
      alreadySentIds: new Set(),
    });

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
    ]);
    mockPublishWithOutbox.mockResolvedValueOnce({ ticketIds: ['ticket-1'], totalItems: 1, isDuplicate: false });

    const ctx = makeCtx();
    await sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE);

    expect(mockRecordDispatchAttempt).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ orderId: ORDER_ID, source: 'retail_kds_send' }),
      expect.any(Object),
      expect.any(Number),
    );
  });

  it('calls recordDispatchAttempt even when no stations resolve (routing_failed)', async () => {
    const line = makeOrderLine({ id: 'line-1' });

    mockWithTenant.mockResolvedValueOnce({
      lines: [line],
      alreadySentIds: new Set(),
    });
    // No station names withTenant needed — early return before that

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', null),
    ]);

    const ctx = makeCtx();
    await sendOrderLinesToKds(ctx, ORDER_ID, BUSINESS_DATE);

    expect(mockRecordDispatchAttempt).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ orderId: ORDER_ID, source: 'retail_kds_send' }),
      expect.objectContaining({ status: 'routing_failed' }),
      expect.any(Number),
    );
  });
});

// ── handleOrderPlacedForKds ──────────────────────────────────────

describe('handleOrderPlacedForKds', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Re-establish persistent defaults after reset
    mockEnrichRoutableItems.mockImplementation(async (_tid: string, items: unknown[]) => items);
    mockCreateKitchenTicket.mockResolvedValue({ id: 'ticket-1', ticketNumber: 1, courseNumber: null });
    mockRecordKdsSend.mockResolvedValue({ sendToken: 'token-1' });
    mockMarkKdsSendSent.mockResolvedValue(undefined);
    // Station name gen_ulid call
    mockWithTenant.mockResolvedValue([{ token: 'tok-1' }]);
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
    // First withTenant: lines
    mockWithTenant.mockResolvedValueOnce([line]);
    // Second withTenant: existing ticket items
    mockWithTenant.mockResolvedValueOnce([]);
    mockResolveStationRouting.mockRejectedValueOnce(new Error('routing engine failure'));

    const event = makeEvent();
    await expect(handleOrderPlacedForKds(event)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  // ── Early returns (no lines) ───────────────────────────────────

  it('returns early when no food/beverage lines exist for the order', async () => {
    mockWithTenant.mockResolvedValueOnce([]);

    const event = makeEvent();
    await handleOrderPlacedForKds(event);

    expect(mockWithTenant).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('no food/bev lines found'),
      expect.objectContaining({ orderId: 'order-1' }),
    );
  });

  it('returns early when all lines already have ticket items', async () => {
    const line = makeOrderLine({ id: 'line-1' });
    mockWithTenant.mockResolvedValueOnce([line]);
    // All lines already sent
    mockWithTenant.mockResolvedValueOnce([{ orderLineId: 'line-1' }]);

    const event = makeEvent();
    await handleOrderPlacedForKds(event);

    // filteredLines is empty → returns without reaching resolveStationRouting
    expect(mockResolveStationRouting).not.toHaveBeenCalled();
    expect(mockCreateKitchenTicket).not.toHaveBeenCalled();
  });

  // ── Filtering already-sent lines ──────────────────────────────

  it('filters out lines already sent to KDS and only routes the new ones', async () => {
    const line1 = makeOrderLine({ id: 'line-1', catalogItemName: 'Burger' });
    const line2 = makeOrderLine({ id: 'line-2', catalogItemName: 'Soda', catalogItemId: 'item-soda' });

    mockWithTenant.mockResolvedValueOnce([line1, line2]);
    // line-1 already sent to KDS via manual send-to-kds flow
    mockWithTenant.mockResolvedValueOnce([{ orderLineId: 'line-1' }]);
    // Station names lookup
    mockWithTenant.mockResolvedValueOnce([]);
    // gen_ulid for send token
    mockWithTenant.mockResolvedValueOnce([{ token: 'tok-1' }]);

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
    mockWithTenant.mockResolvedValueOnce([line]);
    mockWithTenant.mockResolvedValueOnce([]);
    // Station names + gen_ulid
    mockWithTenant.mockResolvedValueOnce([]);
    mockWithTenant.mockResolvedValueOnce([{ token: 'tok-1' }]);

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
    mockWithTenant.mockResolvedValueOnce([line]);
    mockWithTenant.mockResolvedValueOnce([]);
    mockWithTenant.mockResolvedValueOnce([]);
    mockWithTenant.mockResolvedValueOnce([{ token: 'tok-1' }]);

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
    mockWithTenant.mockResolvedValueOnce([line]);
    mockWithTenant.mockResolvedValueOnce([]);
    mockWithTenant.mockResolvedValueOnce([]);
    mockWithTenant.mockResolvedValueOnce([{ token: 'tok-1' }]);

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
    ]);

    const event = makeEvent({
      actorUserId: undefined as never,
      data: {
        orderId: 'order-1',
        locationId: 'loc-1',
        businessDate: '2026-03-06',
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

  it('uses idempotency key format: retail-kds-send-{orderId}-{stationId}-{sortedLineIds}', async () => {
    const line = makeOrderLine({ id: 'line-1' });
    mockWithTenant.mockResolvedValueOnce([line]);
    mockWithTenant.mockResolvedValueOnce([]);
    mockWithTenant.mockResolvedValueOnce([]);
    mockWithTenant.mockResolvedValueOnce([{ token: 'tok-1' }]);

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-grill'),
    ]);

    const event = makeEvent();
    await handleOrderPlacedForKds(event);

    expect(mockCreateKitchenTicket).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        clientRequestId: 'retail-kds-send-order-1-station-grill-line-1',
      }),
    );
  });

  it('generates a separate idempotency key for each station', async () => {
    const line1 = makeOrderLine({ id: 'line-1', catalogItemName: 'Burger' });
    const line2 = makeOrderLine({ id: 'line-2', catalogItemName: 'Beer', catalogItemId: 'item-beer' });

    mockWithTenant.mockResolvedValueOnce([line1, line2]);
    mockWithTenant.mockResolvedValueOnce([]);
    // Station names
    mockWithTenant.mockResolvedValueOnce([]);
    // gen_ulid for first station
    mockWithTenant.mockResolvedValueOnce([{ token: 'tok-1' }]);
    // gen_ulid for second station
    mockWithTenant.mockResolvedValueOnce([{ token: 'tok-2' }]);

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-kitchen'),
      makeRoutingResult('line-2', 'station-bar'),
    ]);

    const event = makeEvent();
    await handleOrderPlacedForKds(event);

    const clientRequestIds = mockCreateKitchenTicket.mock.calls.map(
      (c) => (c[1] as { clientRequestId: string }).clientRequestId,
    );
    expect(clientRequestIds).toContain('retail-kds-send-order-1-station-kitchen-line-1');
    expect(clientRequestIds).toContain('retail-kds-send-order-1-station-bar-line-2');
  });

  // ── Ticket creation ───────────────────────────────────────────

  it('creates tickets with correct orderId, businessDate, channel, and customerName', async () => {
    const line = makeOrderLine({ id: 'line-1' });
    mockWithTenant.mockResolvedValueOnce([line]);
    mockWithTenant.mockResolvedValueOnce([]);
    mockWithTenant.mockResolvedValueOnce([]);
    mockWithTenant.mockResolvedValueOnce([{ token: 'tok-1' }]);

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
    mockWithTenant.mockResolvedValueOnce([line]);
    mockWithTenant.mockResolvedValueOnce([]);
    mockWithTenant.mockResolvedValueOnce([]);
    mockWithTenant.mockResolvedValueOnce([{ token: 'tok-1' }]);

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

    mockWithTenant.mockResolvedValueOnce([line1, line2]);
    mockWithTenant.mockResolvedValueOnce([]);
    // Station names
    mockWithTenant.mockResolvedValueOnce([]);
    // gen_ulid for second station (first fails before reaching send tracking)
    mockWithTenant.mockResolvedValueOnce([{ token: 'tok-2' }]);

    mockResolveStationRouting.mockResolvedValueOnce([
      makeRoutingResult('line-1', 'station-kitchen'),
      makeRoutingResult('line-2', 'station-bar'),
    ]);

    // First station fails; second succeeds
    mockCreateKitchenTicket
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ id: 'ticket-2', ticketNumber: 2, courseNumber: null });

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

    mockWithTenant.mockResolvedValueOnce([line1, line2]);
    mockWithTenant.mockResolvedValueOnce([]);
    // Station names
    mockWithTenant.mockResolvedValueOnce([]);
    // gen_ulid
    mockWithTenant.mockResolvedValueOnce([{ token: 'tok-1' }]);

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
    mockWithTenant.mockResolvedValueOnce([line]);
    mockWithTenant.mockResolvedValueOnce([]);
    mockWithTenant.mockResolvedValueOnce([]);
    mockWithTenant.mockResolvedValueOnce([{ token: 'tok-1' }]);

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
