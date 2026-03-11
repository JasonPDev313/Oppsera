/* eslint-disable @typescript-eslint/consistent-type-imports -- vitest dynamic import mocks use typeof import() */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Drizzle chainable mock ─────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock factory returns dynamic chain
function createChainableMock(returnValue: unknown[] = []): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- internal mock chain
  const chain: Record<string, any> = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(returnValue));
  chain.update = vi.fn(() => chain);
  chain.set = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.values = vi.fn(() => chain);
  chain.returning = vi.fn(() => Promise.resolve(returnValue));
  chain.execute = vi.fn(() => Promise.resolve(returnValue));
  return chain;
}

let mockTx = createChainableMock();

// ── Module mocks ───────────────────────────────────────────────

vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock passes tx through
  publishWithOutbox: vi.fn(async (_ctx: unknown, fn: (tx: any) => any) => {
    const { result } = await fn(mockTx);
    return result;
  }),
}));

vi.mock('@oppsera/core/events/build-event', () => ({
  buildEventFromContext: vi.fn(() => ({
    id: 'evt-stub',
    type: 'fnb.kds.stub.v1',
    payload: {},
  })),
}));

vi.mock('@oppsera/core/audit/helpers', () => ({
  auditLogDeferred: vi.fn(),
}));

vi.mock('@oppsera/core/helpers/idempotency', () => ({
  checkIdempotency: vi.fn(async () => ({ isDuplicate: false })),
  saveIdempotencyKey: vi.fn(async () => undefined),
}));

vi.mock('@oppsera/core/observability', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ _tag: 'eq', val })),
  and: vi.fn((...conds: unknown[]) => ({ _tag: 'and', conds })),
  ne: vi.fn((_col: unknown, val: unknown) => ({ _tag: 'ne', val })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    { join: vi.fn(), raw: vi.fn((s: string) => s) },
  ),
}));

vi.mock('@oppsera/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@oppsera/shared')>();
  return { ...actual, generateUlid: vi.fn(() => 'new-item-id') };
});

vi.mock('@oppsera/db', () => ({
  fnbKitchenTicketItems: {
    id: 'fnbKitchenTicketItems.id',
    tenantId: 'fnbKitchenTicketItems.tenantId',
    ticketId: 'fnbKitchenTicketItems.ticketId',
    itemStatus: 'fnbKitchenTicketItems.itemStatus',
  },
  fnbKitchenTickets: {
    id: 'fnbKitchenTickets.id',
    tenantId: 'fnbKitchenTickets.tenantId',
    version: 'fnbKitchenTickets.version',
  },
  fnbKitchenStations: {
    id: 'fnbKitchenStations.id',
    tenantId: 'fnbKitchenStations.tenantId',
    autoBumpOnAllReady: 'fnbKitchenStations.autoBumpOnAllReady',
  },
}));

// ── Helpers ────────────────────────────────────────────────────

import type { RequestContext } from '@oppsera/core/auth/context';

function makeCtx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    tenantId: 'tenant-1',
    locationId: 'loc-1',
    user: { id: 'user-1', email: 'test@example.com', role: 'manager' },
    ...overrides,
  } as RequestContext;
}

function makeTicketItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ti-1',
    tenantId: 'tenant-1',
    ticketId: 'tk-1',
    itemStatus: 'pending',
    startedAt: null,
    readyAt: null,
    bumpedBy: null,
    ...overrides,
  };
}

function makeTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tk-1',
    tenantId: 'tenant-1',
    locationId: 'loc-1',
    tabId: 'tab-1',
    status: 'pending',
    version: 1,
    startedAt: null,
    readyAt: null,
    servedAt: null,
    bumpedAt: null,
    bumpedBy: null,
    isHeld: false,
    ...overrides,
  };
}

function makeStation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'station-1',
    autoBumpOnAllReady: false,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────

describe('KDS Bump State Machine — bumpItem', () => {
  let bumpItem: typeof import('../commands/bump-item').bumpItem;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockTx = createChainableMock();
    const mod = await import('../commands/bump-item');
    bumpItem = mod.bumpItem;
  });

  const baseInput = { ticketItemId: 'ti-1', stationId: 'station-1', clientRequestId: 'req-1' };

  it('bumpItem: pending item → ready', async () => {
    const station = makeStation();
    const item = makeTicketItem({ itemStatus: 'pending' });
    const updatedItem = { ...item, itemStatus: 'ready', readyAt: expect.any(Date) };
    const ticket = makeTicket({ status: 'in_progress' });

    mockTx.limit
      .mockResolvedValueOnce([station])  // station lookup
      .mockResolvedValueOnce([item])     // fetch item
      .mockResolvedValueOnce([ticket]);  // fetch ticket
    // pending→in_progress auto-progress won't fire (ticket already in_progress)
    mockTx.returning.mockResolvedValueOnce([updatedItem]); // item bump

    const result = await bumpItem(makeCtx(), baseInput);
    expect(result.itemStatus).toBe('ready');
  });

  it('bumpItem: pending item on pending ticket → auto-progresses ticket to in_progress', async () => {
    const station = makeStation();
    const item = makeTicketItem({ itemStatus: 'pending' });
    const updatedItem = { ...item, itemStatus: 'ready', readyAt: expect.any(Date) };
    const ticket = makeTicket({ status: 'pending' });
    const progressedTicket = { ...ticket, status: 'in_progress', version: 2 };

    mockTx.limit
      .mockResolvedValueOnce([station])
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket]);
    mockTx.returning
      .mockResolvedValueOnce([progressedTicket])  // ticket pending→in_progress
      .mockResolvedValueOnce([updatedItem]);       // item bump

    const result = await bumpItem(makeCtx(), baseInput);
    expect(result.itemStatus).toBe('ready');
  });

  it('bumpItem: in_progress item → ready', async () => {
    const station = makeStation();
    const item = makeTicketItem({ itemStatus: 'in_progress', startedAt: new Date() });
    const updatedItem = { ...item, itemStatus: 'ready' };
    const ticket = makeTicket({ status: 'in_progress' });

    mockTx.limit
      .mockResolvedValueOnce([station])
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket]);
    mockTx.returning.mockResolvedValueOnce([updatedItem]);

    const result = await bumpItem(makeCtx(), baseInput);
    expect(result.itemStatus).toBe('ready');
  });

  it('bumpItem: ready item → throws TicketItemStatusConflictError', async () => {
    const station = makeStation();
    const item = makeTicketItem({ itemStatus: 'ready' });
    const ticket = makeTicket({ status: 'in_progress' });

    mockTx.limit
      .mockResolvedValueOnce([station])
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket]);

    await expect(bumpItem(makeCtx(), baseInput)).rejects.toThrow(/Cannot bump item .+ in status 'ready'/);
  });

  it('bumpItem: served item → throws TicketItemStatusConflictError', async () => {
    const station = makeStation();
    const item = makeTicketItem({ itemStatus: 'served' });
    const ticket = makeTicket({ status: 'in_progress' });

    mockTx.limit
      .mockResolvedValueOnce([station])
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket]);

    await expect(bumpItem(makeCtx(), baseInput)).rejects.toThrow(/Cannot bump item .+ in status 'served'/);
  });

  it('bumpItem: voided item → throws TicketItemStatusConflictError', async () => {
    const station = makeStation();
    const item = makeTicketItem({ itemStatus: 'voided' });
    const ticket = makeTicket({ status: 'in_progress' });

    mockTx.limit
      .mockResolvedValueOnce([station])
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket]);

    await expect(bumpItem(makeCtx(), baseInput)).rejects.toThrow(/Cannot bump item .+ in status 'voided'/);
  });

  it('bumpItem: item on voided ticket → throws TicketStatusConflictError', async () => {
    const station = makeStation();
    const item = makeTicketItem({ itemStatus: 'pending' });
    const ticket = makeTicket({ status: 'voided' });

    mockTx.limit
      .mockResolvedValueOnce([station])
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket]);

    await expect(bumpItem(makeCtx(), baseInput)).rejects.toThrow(/Cannot bump item.*ticket .+ in status 'voided'/);
  });

  it('bumpItem: item on served ticket → throws TicketStatusConflictError', async () => {
    const station = makeStation();
    const item = makeTicketItem({ itemStatus: 'pending' });
    const ticket = makeTicket({ status: 'served' });

    mockTx.limit
      .mockResolvedValueOnce([station])
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket]);

    await expect(bumpItem(makeCtx(), baseInput)).rejects.toThrow(/Cannot bump item.*ticket .+ in status 'served'/);
  });

  it('bumpItem: sets startedAt if not already set', async () => {
    const station = makeStation();
    const item = makeTicketItem({ itemStatus: 'pending', startedAt: null });
    const ticket = makeTicket({ status: 'in_progress' });

    mockTx.limit
      .mockResolvedValueOnce([station])
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket]);

    const updatedItem = { ...item, itemStatus: 'ready', startedAt: new Date(), readyAt: new Date() };
    mockTx.returning.mockResolvedValueOnce([updatedItem]);

    await bumpItem(makeCtx(), baseInput);

    // The .set() call should include startedAt since item had no startedAt
    const setCall = mockTx.set.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(setCall).toBeDefined();
    expect(setCall?.startedAt).toBeInstanceOf(Date);
    expect(setCall?.readyAt).toBeInstanceOf(Date);
    expect(setCall?.bumpedBy).toBe('user-1');
  });

  it('bumpItem: does NOT overwrite existing startedAt', async () => {
    const station = makeStation();
    const existingStart = new Date('2026-01-01T12:00:00Z');
    const item = makeTicketItem({ itemStatus: 'in_progress', startedAt: existingStart });
    const ticket = makeTicket({ status: 'in_progress' });

    mockTx.limit
      .mockResolvedValueOnce([station])
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket]);
    mockTx.returning.mockResolvedValueOnce([{ ...item, itemStatus: 'ready' }]);

    await bumpItem(makeCtx(), baseInput);

    const setCall = mockTx.set.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(setCall).toBeDefined();
    // startedAt should NOT be in the update data since item already had it
    expect(setCall?.startedAt).toBeUndefined();
  });
});

describe('KDS Bump State Machine — bumpTicket (prep station)', () => {
  let bumpTicket: typeof import('../commands/bump-ticket').bumpTicket;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockTx = createChainableMock();
    const mod = await import('../commands/bump-ticket');
    bumpTicket = mod.bumpTicket;
  });

  const prepInput = { ticketId: 'tk-1', stationId: 'station-prep', clientRequestId: 'req-1' };

  it('bumpTicket prep: all items ready, ticket pending → ticket becomes ready', async () => {
    const ticket = makeTicket({ status: 'pending' });
    const updatedTicket = { ...ticket, status: 'ready' };

    // 1. select ticket
    mockTx.limit.mockResolvedValueOnce([ticket]);
    // 2. resolveIsExpoBump → station lookup
    mockTx.execute.mockResolvedValueOnce([{ station_type: 'prep' }]);
    // 3. select all items (no .limit(), direct where → returns array)
    mockTx.where.mockImplementation(function (this: unknown) {
      // After the items select, .where() resolves directly (no .limit())
      return Object.assign(Promise.resolve([
        { itemStatus: 'ready' },
        { itemStatus: 'ready' },
      ]), mockTx);
    });
    // 4. update ticket returning
    mockTx.returning.mockResolvedValueOnce([updatedTicket]);

    const result = await bumpTicket(makeCtx(), prepInput);
    expect(result.status).toBe('ready');
  });

  it('bumpTicket prep: all items ready, ticket in_progress → ticket becomes ready', async () => {
    const ticket = makeTicket({ status: 'in_progress' });
    const updatedTicket = { ...ticket, status: 'ready' };

    mockTx.limit.mockResolvedValueOnce([ticket]);
    mockTx.execute.mockResolvedValueOnce([{ station_type: 'prep' }]);
    mockTx.where.mockImplementation(function () {
      return Object.assign(Promise.resolve([
        { itemStatus: 'ready' },
      ]), mockTx);
    });
    mockTx.returning.mockResolvedValueOnce([updatedTicket]);

    const result = await bumpTicket(makeCtx(), prepInput);
    expect(result.status).toBe('ready');
  });

  it('bumpTicket prep: ticket already ready → throws (already sent to expo)', async () => {
    const ticket = makeTicket({ status: 'ready' });

    mockTx.limit.mockResolvedValueOnce([ticket]);
    mockTx.execute.mockResolvedValueOnce([{ station_type: 'prep' }]);

    await expect(bumpTicket(makeCtx(), prepInput)).rejects.toThrow(/Cannot bump.*ticket .+ in status 'ready'/);
  });

  it('bumpTicket prep: ticket already served → throws', async () => {
    const ticket = makeTicket({ status: 'served' });

    mockTx.limit.mockResolvedValueOnce([ticket]);
    mockTx.execute.mockResolvedValueOnce([{ station_type: 'prep' }]);

    await expect(bumpTicket(makeCtx(), prepInput)).rejects.toThrow(/Cannot bump ticket .+ in status 'served'/);
  });

  it('bumpTicket prep: ticket voided → throws', async () => {
    const ticket = makeTicket({ status: 'voided' });

    mockTx.limit.mockResolvedValueOnce([ticket]);
    mockTx.execute.mockResolvedValueOnce([{ station_type: 'prep' }]);

    await expect(bumpTicket(makeCtx(), prepInput)).rejects.toThrow(/Cannot bump ticket .+ in status 'voided'/);
  });

  it('bumpTicket prep: not all items ready → throws TicketNotReadyError', async () => {
    const ticket = makeTicket({ status: 'pending' });

    mockTx.limit.mockResolvedValueOnce([ticket]);
    mockTx.execute.mockResolvedValueOnce([{ station_type: 'prep' }]);
    mockTx.where.mockImplementation(function () {
      return Object.assign(Promise.resolve([
        { itemStatus: 'ready' },
        { itemStatus: 'pending' },
      ]), mockTx);
    });

    await expect(bumpTicket(makeCtx(), prepInput)).rejects.toThrow(/Not all items on ticket .+ are ready/);
  });
});

describe('KDS Bump State Machine — bumpTicket (expo — no stationId)', () => {
  let bumpTicket: typeof import('../commands/bump-ticket').bumpTicket;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockTx = createChainableMock();
    const mod = await import('../commands/bump-ticket');
    bumpTicket = mod.bumpTicket;
  });

  const expoInput = { ticketId: 'tk-1', clientRequestId: 'req-2' }; // no stationId → expo

  it('bumpTicket expo: all items ready, ticket ready → ticket becomes served', async () => {
    const ticket = makeTicket({ status: 'ready' });
    const updatedTicket = { ...ticket, status: 'served' };

    mockTx.limit.mockResolvedValueOnce([ticket]);
    // No station lookup for expo (no stationId → resolveIsExpoBump returns true immediately)
    mockTx.where.mockImplementation(function () {
      return Object.assign(Promise.resolve([
        { itemStatus: 'ready' },
        { itemStatus: 'ready' },
      ]), mockTx);
    });
    // update ticket returning
    mockTx.returning
      .mockResolvedValueOnce([updatedTicket])  // ticket update
      .mockResolvedValueOnce([]);              // items update (no returning used, but mock chain)

    const result = await bumpTicket(makeCtx(), expoInput);
    expect(result.status).toBe('served');
  });

  it('bumpTicket expo: all items ready, ticket pending → ticket becomes served (direct expo bump)', async () => {
    const ticket = makeTicket({ status: 'pending' });
    const updatedTicket = { ...ticket, status: 'served' };

    mockTx.limit.mockResolvedValueOnce([ticket]);
    mockTx.where.mockImplementation(function () {
      return Object.assign(Promise.resolve([
        { itemStatus: 'ready' },
      ]), mockTx);
    });
    mockTx.returning
      .mockResolvedValueOnce([updatedTicket])
      .mockResolvedValueOnce([]);

    const result = await bumpTicket(makeCtx(), expoInput);
    expect(result.status).toBe('served');
  });

  it('bumpTicket expo: ticket already served → throws', async () => {
    const ticket = makeTicket({ status: 'served' });

    mockTx.limit.mockResolvedValueOnce([ticket]);

    await expect(bumpTicket(makeCtx(), expoInput)).rejects.toThrow(/Cannot bump ticket .+ in status 'served'/);
  });

  it('bumpTicket expo: ticket voided → throws', async () => {
    const ticket = makeTicket({ status: 'voided' });

    mockTx.limit.mockResolvedValueOnce([ticket]);

    await expect(bumpTicket(makeCtx(), expoInput)).rejects.toThrow(/Cannot bump ticket .+ in status 'voided'/);
  });

  it('bumpTicket expo: not all items ready → throws TicketNotReadyError', async () => {
    const ticket = makeTicket({ status: 'ready' });

    mockTx.limit.mockResolvedValueOnce([ticket]);
    mockTx.where.mockImplementation(function () {
      return Object.assign(Promise.resolve([
        { itemStatus: 'ready' },
        { itemStatus: 'in_progress' },
      ]), mockTx);
    });

    await expect(bumpTicket(makeCtx(), expoInput)).rejects.toThrow(/Not all items on ticket .+ are ready/);
  });
});

describe('KDS Bump State Machine — resolveIsExpoBump', () => {
  let bumpTicket: typeof import('../commands/bump-ticket').bumpTicket;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockTx = createChainableMock();
    const mod = await import('../commands/bump-ticket');
    bumpTicket = mod.bumpTicket;
  });

  // resolveIsExpoBump is not exported, so we test it indirectly through bumpTicket behavior.
  // The key signal is whether the ticket ends up as 'ready' (prep) or 'served' (expo).

  it('no stationId → expo bump (ticket → served)', async () => {
    const ticket = makeTicket({ status: 'pending' });
    const updatedTicket = { ...ticket, status: 'served' };

    mockTx.limit.mockResolvedValueOnce([ticket]);
    mockTx.where.mockImplementation(function () {
      return Object.assign(Promise.resolve([{ itemStatus: 'ready' }]), mockTx);
    });
    mockTx.returning.mockResolvedValueOnce([updatedTicket]).mockResolvedValueOnce([]);

    const result = await bumpTicket(makeCtx(), { ticketId: 'tk-1', clientRequestId: 'req-1' });
    expect(result.status).toBe('served');
  });

  it('stationId with station_type=prep → prep bump (ticket → ready)', async () => {
    const ticket = makeTicket({ status: 'pending' });
    const updatedTicket = { ...ticket, status: 'ready' };

    mockTx.limit.mockResolvedValueOnce([ticket]);
    mockTx.execute.mockResolvedValueOnce([{ station_type: 'prep' }]);
    mockTx.where.mockImplementation(function () {
      return Object.assign(Promise.resolve([{ itemStatus: 'ready' }]), mockTx);
    });
    mockTx.returning.mockResolvedValueOnce([updatedTicket]);

    const result = await bumpTicket(makeCtx(), { ticketId: 'tk-1', stationId: 'station-prep', clientRequestId: 'req-1' });
    expect(result.status).toBe('ready');
  });

  it('stationId with station_type=expo → expo bump (ticket → served)', async () => {
    const ticket = makeTicket({ status: 'pending' });
    const updatedTicket = { ...ticket, status: 'served' };

    mockTx.limit.mockResolvedValueOnce([ticket]);
    mockTx.execute.mockResolvedValueOnce([{ station_type: 'expo' }]);
    mockTx.where.mockImplementation(function () {
      return Object.assign(Promise.resolve([{ itemStatus: 'ready' }]), mockTx);
    });
    mockTx.returning.mockResolvedValueOnce([updatedTicket]).mockResolvedValueOnce([]);

    const result = await bumpTicket(makeCtx(), { ticketId: 'tk-1', stationId: 'station-expo', clientRequestId: 'req-1' });
    expect(result.status).toBe('served');
  });

  it('stationId not found in DB → safe fallback to expo bump (ticket → served)', async () => {
    const ticket = makeTicket({ status: 'pending' });
    const updatedTicket = { ...ticket, status: 'served' };

    mockTx.limit.mockResolvedValueOnce([ticket]);
    mockTx.execute.mockResolvedValueOnce([]); // station not found
    mockTx.where.mockImplementation(function () {
      return Object.assign(Promise.resolve([{ itemStatus: 'ready' }]), mockTx);
    });
    mockTx.returning.mockResolvedValueOnce([updatedTicket]).mockResolvedValueOnce([]);

    const result = await bumpTicket(makeCtx(), { ticketId: 'tk-1', stationId: 'station-ghost', clientRequestId: 'req-1' });
    expect(result.status).toBe('served');
  });
});

describe('KDS Bump State Machine — refireItem', () => {
  let refireItem: typeof import('../commands/refire-item').refireItem;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockTx = createChainableMock();
    const mod = await import('../commands/refire-item');
    refireItem = mod.refireItem;
  });

  function makeFullItem(overrides: Record<string, unknown> = {}) {
    return {
      id: 'ti-1',
      tenantId: 'tenant-1',
      ticketId: 'tk-1',
      orderLineId: 'ol-1',
      stationId: 'station-1',
      itemName: 'Burger',
      kitchenLabel: null,
      modifierSummary: null,
      specialInstructions: null,
      quantity: 1,
      seatNumber: null,
      courseName: null,
      itemStatus: 'cooking',
      isRush: false,
      isAllergy: false,
      isVip: false,
      priorityLevel: 0,
      estimatedPrepSeconds: 300,
      routingRuleId: null,
      itemColor: null,
      ...overrides,
    };
  }

  const baseInput = { ticketItemId: 'ti-1', clientRequestId: 'req-refire-1' };

  it('refireItem: cooking item → voids original, creates remake', async () => {
    const item = makeFullItem({ itemStatus: 'cooking' });
    const voidedItem = { ...item, itemStatus: 'voided' };
    const newItem = { ...item, id: 'new-item-id', itemStatus: 'pending', isRush: true };
    const ticket = makeTicket({ status: 'in_progress' });

    mockTx.limit
      .mockResolvedValueOnce([item])     // fetch item
      .mockResolvedValueOnce([ticket])   // location check (parentTicket)
      .mockResolvedValueOnce([ticket]);  // fetch ticket for revert check
    mockTx.returning
      .mockResolvedValueOnce([voidedItem])  // void update
      .mockResolvedValueOnce([newItem]);    // insert new item

    const result = await refireItem(makeCtx(), baseInput);
    expect(result.id).toBe('new-item-id');
  });

  it('refireItem: ready item → voids original, reverts ticket to in_progress', async () => {
    const item = makeFullItem({ itemStatus: 'ready' });
    const voidedItem = { ...item, itemStatus: 'voided' };
    const newItem = { ...item, id: 'new-item-id', itemStatus: 'pending', isRush: true };
    const ticket = makeTicket({ status: 'ready', version: 2 });
    const revertedTicket = { ...ticket, status: 'in_progress', version: 3 };

    mockTx.limit
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket])   // location check
      .mockResolvedValueOnce([ticket]);  // fetch ticket for revert
    mockTx.returning
      .mockResolvedValueOnce([voidedItem])    // void update
      .mockResolvedValueOnce([newItem])       // insert new item
      .mockResolvedValueOnce([revertedTicket]); // ticket revert

    const result = await refireItem(makeCtx(), baseInput);
    expect(result.id).toBe('new-item-id');
  });

  it('refireItem: served item → voids original, reverts ticket to in_progress', async () => {
    const item = makeFullItem({ itemStatus: 'served' });
    const voidedItem = { ...item, itemStatus: 'voided' };
    const newItem = { ...item, id: 'new-item-id', itemStatus: 'pending', isRush: true };
    const ticket = makeTicket({ status: 'served', version: 1 });
    const revertedTicket = { ...ticket, status: 'in_progress', version: 2 };

    mockTx.limit
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket])   // location check
      .mockResolvedValueOnce([ticket]);  // fetch ticket for revert
    mockTx.returning
      .mockResolvedValueOnce([voidedItem])
      .mockResolvedValueOnce([newItem])
      .mockResolvedValueOnce([revertedTicket]);

    const result = await refireItem(makeCtx(), baseInput);
    expect(result.id).toBe('new-item-id');
  });

  it('refireItem: pending item → throws TicketItemStatusConflictError', async () => {
    const item = makeFullItem({ itemStatus: 'pending' });
    const ticket = makeTicket({ status: 'in_progress' });

    mockTx.limit
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket]);  // location check

    await expect(refireItem(makeCtx(), baseInput)).rejects.toThrow(/Cannot .+ item .+ in status 'pending'/);
  });

  it('refireItem: voided item → throws TicketItemStatusConflictError', async () => {
    const item = makeFullItem({ itemStatus: 'voided' });
    const ticket = makeTicket({ status: 'in_progress' });

    mockTx.limit
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket]);  // location check

    await expect(refireItem(makeCtx(), baseInput)).rejects.toThrow(/Cannot .+ item .+ in status 'voided'/);
  });

  it('refireItem: ticket version conflict on revert → throws TicketVersionConflictError', async () => {
    const item = makeFullItem({ itemStatus: 'ready' });
    const voidedItem = { ...item, itemStatus: 'voided' };
    const newItem = { ...item, id: 'new-item-id', itemStatus: 'pending' };
    const ticket = makeTicket({ status: 'ready', version: 1 });

    mockTx.limit
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket])   // location check
      .mockResolvedValueOnce([ticket]);  // fetch ticket for revert
    mockTx.returning
      .mockResolvedValueOnce([voidedItem])   // void update
      .mockResolvedValueOnce([newItem])      // insert new item
      .mockResolvedValueOnce([]);            // ticket revert → empty = conflict

    await expect(refireItem(makeCtx(), baseInput)).rejects.toThrow(/has been modified by another user/);
  });

  it('refireItem: ticket in_progress → does NOT revert (no need)', async () => {
    const item = makeFullItem({ itemStatus: 'cooking' });
    const voidedItem = { ...item, itemStatus: 'voided' };
    const newItem = { ...item, id: 'new-item-id', itemStatus: 'pending', isRush: true };
    const ticket = makeTicket({ status: 'in_progress', version: 1 });

    mockTx.limit
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket])   // location check
      .mockResolvedValueOnce([ticket]);  // fetch ticket for revert check
    mockTx.returning
      .mockResolvedValueOnce([voidedItem])
      .mockResolvedValueOnce([newItem]);

    const result = await refireItem(makeCtx(), baseInput);
    expect(result.id).toBe('new-item-id');
    // Ticket update should NOT be called (only 2 returning calls: void + insert)
    expect(mockTx.returning).toHaveBeenCalledTimes(2);
  });

  it('refireItem: item not found → throws TicketItemNotFoundError', async () => {
    mockTx.limit.mockResolvedValueOnce([]); // no item

    await expect(refireItem(makeCtx(), baseInput)).rejects.toThrow(/not found/);
  });

  it('refireItem: with reason → prepends REMAKE: {reason} to specialInstructions', async () => {
    const item = makeFullItem({ itemStatus: 'cooking', specialInstructions: 'No onions' });
    const voidedItem = { ...item, itemStatus: 'voided' };
    const newItem = { ...item, id: 'new-item-id', itemStatus: 'pending', isRush: true };
    const ticket = makeTicket({ status: 'in_progress' });

    mockTx.limit
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket])   // location check
      .mockResolvedValueOnce([ticket]);  // fetch ticket for revert check
    mockTx.returning
      .mockResolvedValueOnce([voidedItem])
      .mockResolvedValueOnce([newItem]);

    await refireItem(makeCtx(), { ...baseInput, reason: 'burnt' });

    const insertValues = mockTx.values.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(insertValues).toBeDefined();
    expect(insertValues?.specialInstructions).toBe('REMAKE: burnt | No onions');
    expect(insertValues?.isRush).toBe(true);
  });

  it('refireItem: boosts priorityLevel to at least 1', async () => {
    const item = makeFullItem({ itemStatus: 'cooking', priorityLevel: 0 });
    const voidedItem = { ...item, itemStatus: 'voided' };
    const newItem = { ...item, id: 'new-item-id', itemStatus: 'pending' };
    const ticket = makeTicket({ status: 'in_progress' });

    mockTx.limit
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket])   // location check
      .mockResolvedValueOnce([ticket]);  // fetch ticket for revert check
    mockTx.returning
      .mockResolvedValueOnce([voidedItem])
      .mockResolvedValueOnce([newItem]);

    await refireItem(makeCtx(), baseInput);

    const insertValues = mockTx.values.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(insertValues?.priorityLevel).toBe(1);
  });

  it('refireItem: preserves high priorityLevel if already > 1', async () => {
    const item = makeFullItem({ itemStatus: 'cooking', priorityLevel: 5 });
    const voidedItem = { ...item, itemStatus: 'voided' };
    const newItem = { ...item, id: 'new-item-id', itemStatus: 'pending' };
    const ticket = makeTicket({ status: 'in_progress' });

    mockTx.limit
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket])   // location check
      .mockResolvedValueOnce([ticket]);  // fetch ticket for revert check
    mockTx.returning
      .mockResolvedValueOnce([voidedItem])
      .mockResolvedValueOnce([newItem]);

    await refireItem(makeCtx(), baseInput);

    const insertValues = mockTx.values.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(insertValues?.priorityLevel).toBe(5);
  });
});

// ── recallItem Tests ──────────────────────────────────────────

describe('KDS Bump State Machine — recallItem', () => {
  let recallItem: typeof import('../commands/recall-item').recallItem;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockTx = createChainableMock();
    const mod = await import('../commands/recall-item');
    recallItem = mod.recallItem;
  });

  const baseInput = { ticketItemId: 'ti-1', stationId: 'station-1', clientRequestId: 'req-recall-1' };

  it('recallItem: ready item → cooking, clears timestamps', async () => {
    const item = makeTicketItem({ itemStatus: 'ready', readyAt: new Date(), startedAt: new Date(), bumpedBy: 'user-2' });
    const recalled = { ...item, itemStatus: 'cooking', readyAt: null, servedAt: null, startedAt: null, bumpedBy: null };
    const ticket = makeTicket({ status: 'in_progress' });

    mockTx.limit
      .mockResolvedValueOnce([item])     // fetch item
      .mockResolvedValueOnce([ticket])   // location check (parentTicket)
      .mockResolvedValueOnce([ticket]);  // fetch ticket for revert check
    mockTx.returning.mockResolvedValueOnce([recalled]); // recall update

    const result = await recallItem(makeCtx(), baseInput);
    expect(result.itemStatus).toBe('cooking');

    // Verify set() clears all bump data
    const setCall = mockTx.set.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(setCall?.itemStatus).toBe('cooking');
    expect(setCall?.readyAt).toBeNull();
    expect(setCall?.servedAt).toBeNull();
    expect(setCall?.startedAt).toBeNull();
    expect(setCall?.bumpedBy).toBeNull();
  });

  it('recallItem: served item → cooking', async () => {
    const item = makeTicketItem({ itemStatus: 'served', readyAt: new Date(), servedAt: new Date() });
    const recalled = { ...item, itemStatus: 'cooking' };
    const ticket = makeTicket({ status: 'served', version: 2 });
    const revertedTicket = { ...ticket, status: 'in_progress', version: 3 };

    mockTx.limit
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket])   // location check
      .mockResolvedValueOnce([ticket]);  // fetch ticket for revert
    mockTx.returning
      .mockResolvedValueOnce([recalled])        // recall item
      .mockResolvedValueOnce([revertedTicket]); // revert ticket

    const result = await recallItem(makeCtx(), baseInput);
    expect(result.itemStatus).toBe('cooking');
  });

  it('recallItem: ready item with ready ticket → reverts ticket to in_progress', async () => {
    const item = makeTicketItem({ itemStatus: 'ready' });
    const recalled = { ...item, itemStatus: 'cooking' };
    const ticket = makeTicket({ status: 'ready', version: 1 });
    const revertedTicket = { ...ticket, status: 'in_progress', version: 2 };

    mockTx.limit
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket])   // location check
      .mockResolvedValueOnce([ticket]);  // fetch ticket for revert
    mockTx.returning
      .mockResolvedValueOnce([recalled])
      .mockResolvedValueOnce([revertedTicket]);

    await recallItem(makeCtx(), baseInput);
    // Ticket should have been updated (2 returning calls: item + ticket)
    expect(mockTx.returning).toHaveBeenCalledTimes(2);
  });

  it('recallItem: ticket in_progress → does NOT revert ticket', async () => {
    const item = makeTicketItem({ itemStatus: 'ready' });
    const recalled = { ...item, itemStatus: 'cooking' };
    const ticket = makeTicket({ status: 'in_progress' });

    mockTx.limit
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket])   // location check
      .mockResolvedValueOnce([ticket]);  // fetch ticket for revert check
    mockTx.returning.mockResolvedValueOnce([recalled]);

    await recallItem(makeCtx(), baseInput);
    // Only 1 returning call (item recall only, no ticket revert)
    expect(mockTx.returning).toHaveBeenCalledTimes(1);
  });

  it('recallItem: pending item → throws TicketItemStatusConflictError', async () => {
    const item = makeTicketItem({ itemStatus: 'pending' });
    mockTx.limit.mockResolvedValueOnce([item]);

    await expect(recallItem(makeCtx(), baseInput)).rejects.toThrow(/Cannot recall item .+ in status 'pending'/);
  });

  it('recallItem: voided item → throws TicketItemStatusConflictError', async () => {
    const item = makeTicketItem({ itemStatus: 'voided' });
    mockTx.limit.mockResolvedValueOnce([item]);

    await expect(recallItem(makeCtx(), baseInput)).rejects.toThrow(/Cannot recall item .+ in status 'voided'/);
  });

  it('recallItem: cooking item → throws TicketItemStatusConflictError', async () => {
    const item = makeTicketItem({ itemStatus: 'cooking' });
    mockTx.limit.mockResolvedValueOnce([item]);

    await expect(recallItem(makeCtx(), baseInput)).rejects.toThrow(/Cannot recall item .+ in status 'cooking'/);
  });

  it('recallItem: item not found → throws TicketItemNotFoundError', async () => {
    mockTx.limit.mockResolvedValueOnce([]); // no item

    await expect(recallItem(makeCtx(), baseInput)).rejects.toThrow(/not found/);
  });

  it('recallItem: concurrent recall → throws (optimistic lock)', async () => {
    const item = makeTicketItem({ itemStatus: 'ready' });
    const ticket = makeTicket({ status: 'in_progress' });

    mockTx.limit
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket]);  // location check
    mockTx.returning.mockResolvedValueOnce([]); // optimistic lock fails

    await expect(recallItem(makeCtx(), baseInput)).rejects.toThrow(/Cannot recall \(concurrent\)/);
  });

  it('recallItem: ticket version conflict on revert → throws', async () => {
    const item = makeTicketItem({ itemStatus: 'ready' });
    const recalled = { ...item, itemStatus: 'cooking' };
    const ticket = makeTicket({ status: 'ready', version: 1 });

    mockTx.limit
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket])   // location check
      .mockResolvedValueOnce([ticket]);  // fetch ticket for revert
    mockTx.returning
      .mockResolvedValueOnce([recalled]) // item recall OK
      .mockResolvedValueOnce([]);        // ticket revert fails

    await expect(recallItem(makeCtx(), baseInput)).rejects.toThrow(/has been modified by another user/);
  });
});

// ── callBackToStation Tests ───────────────────────────────────

describe('KDS Bump State Machine — callBackToStation', () => {
  let callBackToStation: typeof import('../commands/call-back-to-station').callBackToStation;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockTx = createChainableMock();
    const mod = await import('../commands/call-back-to-station');
    callBackToStation = mod.callBackToStation;
  });

  const baseInput = { ticketItemId: 'ti-1', stationId: 'station-grill', clientRequestId: 'req-cb-1' };

  it('callBack: ready item → cooking at new station', async () => {
    const item = makeTicketItem({ itemStatus: 'ready', stationId: 'station-fry' });
    const calledBack = { ...item, itemStatus: 'cooking', stationId: 'station-grill' };
    const ticket = makeTicket({ status: 'in_progress' });

    mockTx.limit
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket]);
    mockTx.returning.mockResolvedValueOnce([calledBack]);

    const result = await callBackToStation(makeCtx(), baseInput);
    expect(result.itemStatus).toBe('cooking');

    // Verify stationId is reassigned
    const setCall = mockTx.set.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(setCall?.stationId).toBe('station-grill');
    expect(setCall?.readyAt).toBeNull();
    expect(setCall?.servedAt).toBeNull();
  });

  it('callBack: served item → cooking, reverts ticket', async () => {
    const item = makeTicketItem({ itemStatus: 'served' });
    const calledBack = { ...item, itemStatus: 'cooking' };
    const ticket = makeTicket({ status: 'served', version: 3 });
    const revertedTicket = { ...ticket, status: 'in_progress', version: 4 };

    mockTx.limit
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket]);
    mockTx.returning
      .mockResolvedValueOnce([calledBack])
      .mockResolvedValueOnce([revertedTicket]);

    const result = await callBackToStation(makeCtx(), baseInput);
    expect(result.itemStatus).toBe('cooking');
    expect(mockTx.returning).toHaveBeenCalledTimes(2); // item + ticket
  });

  it('callBack: cooking item → cooking at different station (re-route)', async () => {
    const item = makeTicketItem({ itemStatus: 'cooking', stationId: 'station-fry' });
    const calledBack = { ...item, itemStatus: 'cooking', stationId: 'station-grill' };
    const ticket = makeTicket({ status: 'in_progress' });

    mockTx.limit
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket]);
    mockTx.returning.mockResolvedValueOnce([calledBack]);

    const result = await callBackToStation(makeCtx(), baseInput);
    expect(result.itemStatus).toBe('cooking');
    // Ticket not reverted (already in_progress)
    expect(mockTx.returning).toHaveBeenCalledTimes(1);
  });

  it('callBack: pending item → throws TicketItemStatusConflictError', async () => {
    const item = makeTicketItem({ itemStatus: 'pending' });
    mockTx.limit.mockResolvedValueOnce([item]);

    await expect(callBackToStation(makeCtx(), baseInput)).rejects.toThrow(/Cannot call back item .+ in status 'pending'/);
  });

  it('callBack: voided item → throws TicketItemStatusConflictError', async () => {
    const item = makeTicketItem({ itemStatus: 'voided' });
    mockTx.limit.mockResolvedValueOnce([item]);

    await expect(callBackToStation(makeCtx(), baseInput)).rejects.toThrow(/Cannot call back item .+ in status 'voided'/);
  });

  it('callBack: item not found → throws TicketItemNotFoundError', async () => {
    mockTx.limit.mockResolvedValueOnce([]);

    await expect(callBackToStation(makeCtx(), baseInput)).rejects.toThrow(/not found/);
  });

  it('callBack: concurrent update → throws (optimistic lock)', async () => {
    const item = makeTicketItem({ itemStatus: 'ready' });

    mockTx.limit.mockResolvedValueOnce([item]);
    mockTx.returning.mockResolvedValueOnce([]); // optimistic lock fails

    await expect(callBackToStation(makeCtx(), baseInput)).rejects.toThrow(/Cannot call back \(concurrent\)/);
  });

  it('callBack: ticket version conflict on revert → throws', async () => {
    const item = makeTicketItem({ itemStatus: 'ready' });
    const calledBack = { ...item, itemStatus: 'cooking' };
    const ticket = makeTicket({ status: 'ready', version: 1 });

    mockTx.limit
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket]);
    mockTx.returning
      .mockResolvedValueOnce([calledBack]) // item OK
      .mockResolvedValueOnce([]);          // ticket revert fails

    await expect(callBackToStation(makeCtx(), baseInput)).rejects.toThrow(/has been modified by another user/);
  });

  it('callBack: ready ticket → reverts to in_progress', async () => {
    const item = makeTicketItem({ itemStatus: 'ready' });
    const calledBack = { ...item, itemStatus: 'cooking' };
    const ticket = makeTicket({ status: 'ready', version: 2 });
    const revertedTicket = { ...ticket, status: 'in_progress', version: 3 };

    mockTx.limit
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket]);
    mockTx.returning
      .mockResolvedValueOnce([calledBack])
      .mockResolvedValueOnce([revertedTicket]);

    await callBackToStation(makeCtx(), baseInput);

    // Verify ticket revert set() call
    const ticketSetCall = mockTx.set.mock.calls[1]?.[0] as Record<string, unknown> | undefined;
    expect(ticketSetCall?.status).toBe('in_progress');
    expect(ticketSetCall?.servedAt).toBeNull();
    expect(ticketSetCall?.readyAt).toBeNull();
    expect(ticketSetCall?.version).toBe(3);
  });
});

// ── bumpItem Edge Cases ───────────────────────────────────────

describe('KDS Bump State Machine — bumpItem edge cases', () => {
  let bumpItem: typeof import('../commands/bump-item').bumpItem;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockTx = createChainableMock();
    const mod = await import('../commands/bump-item');
    bumpItem = mod.bumpItem;
  });

  const baseInput = { ticketItemId: 'ti-1', stationId: 'station-1', clientRequestId: 'req-1' };

  it('bumpItem: station not found → throws StationNotFoundError', async () => {
    mockTx.limit.mockResolvedValueOnce([]); // no station

    await expect(bumpItem(makeCtx(), baseInput)).rejects.toThrow(/not found/);
  });

  it('bumpItem: item not found → throws TicketItemNotFoundError', async () => {
    const station = makeStation();
    mockTx.limit
      .mockResolvedValueOnce([station]) // station found
      .mockResolvedValueOnce([]);       // no item

    await expect(bumpItem(makeCtx(), baseInput)).rejects.toThrow(/not found/);
  });

  it('bumpItem: ticket not found → throws TicketNotFoundError', async () => {
    const station = makeStation();
    const item = makeTicketItem({ itemStatus: 'pending' });
    mockTx.limit
      .mockResolvedValueOnce([station])
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([]); // no ticket

    await expect(bumpItem(makeCtx(), baseInput)).rejects.toThrow(/not found/);
  });

  it('bumpItem: concurrent double-bump → throws (optimistic lock on status)', async () => {
    const station = makeStation();
    const item = makeTicketItem({ itemStatus: 'pending' });
    const ticket = makeTicket({ status: 'in_progress' });

    mockTx.limit
      .mockResolvedValueOnce([station])
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket]);
    mockTx.returning.mockResolvedValueOnce([]); // optimistic lock fails (status changed)

    await expect(bumpItem(makeCtx(), baseInput)).rejects.toThrow(/Cannot bump \(concurrent\)/);
  });

  it('bumpItem: cooking → ready (in_progress alias)', async () => {
    // 'cooking' is mapped to 'in_progress' in some flows, but the actual DB status
    // for items uses the exact value stored. If the item's DB status is literally
    // 'cooking', it should NOT match ready/served/voided guard, so bump proceeds.
    const station = makeStation();
    const item = makeTicketItem({ itemStatus: 'cooking', startedAt: new Date() });
    const updatedItem = { ...item, itemStatus: 'ready' };
    const ticket = makeTicket({ status: 'in_progress' });

    mockTx.limit
      .mockResolvedValueOnce([station])
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket]);
    mockTx.returning.mockResolvedValueOnce([updatedItem]);

    const result = await bumpItem(makeCtx(), baseInput);
    expect(result.itemStatus).toBe('ready');
  });

  it('bumpItem: idempotent duplicate → returns cached result', async () => {
    const { checkIdempotency } = await import('@oppsera/core/helpers/idempotency');
    const cachedResult = { itemStatus: 'ready', id: 'ti-1' };
    vi.mocked(checkIdempotency).mockResolvedValueOnce({
      isDuplicate: true,
      originalResult: cachedResult,
    });

    const result = await bumpItem(makeCtx(), baseInput);
    expect(result).toEqual(cachedResult);
    // No DB operations should have occurred beyond idempotency check
    expect(mockTx.update).not.toHaveBeenCalled();
  });

  it('bumpItem: held ticket blocks auto-bump', async () => {
    const station = makeStation({ autoBumpOnAllReady: true });
    const item = makeTicketItem({ itemStatus: 'pending' });
    const updatedItem = { ...item, itemStatus: 'ready' };
    const ticket = makeTicket({ status: 'in_progress', isHeld: true });

    mockTx.limit
      .mockResolvedValueOnce([station])
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([ticket]);
    mockTx.returning.mockResolvedValueOnce([updatedItem]); // item bump only

    const result = await bumpItem(makeCtx(), baseInput);
    expect(result.itemStatus).toBe('ready');
    // Only 1 returning call = item bump, no ticket auto-bump
    expect(mockTx.returning).toHaveBeenCalledTimes(1);
  });
});

// ── bumpTicket Edge Cases ─────────────────────────────────────

describe('KDS Bump State Machine — bumpTicket edge cases', () => {
  let bumpTicket: typeof import('../commands/bump-ticket').bumpTicket;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockTx = createChainableMock();
    const mod = await import('../commands/bump-ticket');
    bumpTicket = mod.bumpTicket;
  });

  it('bumpTicket: ticket not found → throws TicketNotFoundError', async () => {
    mockTx.limit.mockResolvedValueOnce([]); // no ticket

    await expect(bumpTicket(makeCtx(), { ticketId: 'tk-ghost', clientRequestId: 'req-1' }))
      .rejects.toThrow(/not found/);
  });

  it('bumpTicket: all items voided → throws TicketNotReadyError', async () => {
    const ticket = makeTicket({ status: 'pending' });

    mockTx.limit.mockResolvedValueOnce([ticket]);
    mockTx.execute.mockResolvedValueOnce([{ station_type: 'prep' }]);
    mockTx.where.mockImplementation(function () {
      return Object.assign(Promise.resolve([
        { itemStatus: 'voided' },
        { itemStatus: 'voided' },
      ]), mockTx);
    });

    await expect(bumpTicket(makeCtx(), { ticketId: 'tk-1', stationId: 'station-1', clientRequestId: 'req-1' }))
      .rejects.toThrow(/Not all items on ticket .+ are ready/);
  });

  it('bumpTicket prep: version conflict → throws TicketVersionConflictError', async () => {
    const ticket = makeTicket({ status: 'pending', version: 5 });

    mockTx.limit.mockResolvedValueOnce([ticket]);
    mockTx.execute.mockResolvedValueOnce([{ station_type: 'prep' }]);
    mockTx.where.mockImplementation(function () {
      return Object.assign(Promise.resolve([{ itemStatus: 'ready' }]), mockTx);
    });
    mockTx.returning.mockResolvedValueOnce([]); // version conflict

    await expect(bumpTicket(makeCtx(), { ticketId: 'tk-1', stationId: 'station-1', clientRequestId: 'req-1' }))
      .rejects.toThrow(/has been modified by another user/);
  });

  it('bumpTicket expo: version conflict → throws TicketVersionConflictError', async () => {
    const ticket = makeTicket({ status: 'ready', version: 3 });

    mockTx.limit.mockResolvedValueOnce([ticket]);
    mockTx.where.mockImplementation(function () {
      return Object.assign(Promise.resolve([{ itemStatus: 'ready' }]), mockTx);
    });
    mockTx.returning.mockResolvedValueOnce([]); // version conflict

    await expect(bumpTicket(makeCtx(), { ticketId: 'tk-1', clientRequestId: 'req-1' }))
      .rejects.toThrow(/has been modified by another user/);
  });

  it('bumpTicket prep: mixed ready + served items → passes (both are "done")', async () => {
    const ticket = makeTicket({ status: 'in_progress' });
    const updatedTicket = { ...ticket, status: 'ready' };

    mockTx.limit.mockResolvedValueOnce([ticket]);
    mockTx.execute.mockResolvedValueOnce([{ station_type: 'prep' }]);
    mockTx.where.mockImplementation(function () {
      return Object.assign(Promise.resolve([
        { itemStatus: 'ready' },
        { itemStatus: 'served' }, // served counts as "done" for bump validation
        { itemStatus: 'voided' }, // voided filtered out
      ]), mockTx);
    });
    mockTx.returning.mockResolvedValueOnce([updatedTicket]);

    const result = await bumpTicket(makeCtx(), { ticketId: 'tk-1', stationId: 'station-1', clientRequestId: 'req-1' });
    expect(result.status).toBe('ready');
  });

  it('bumpTicket expo: marks all ready items as served', async () => {
    const ticket = makeTicket({ status: 'ready' });
    const updatedTicket = { ...ticket, status: 'served' };

    mockTx.limit.mockResolvedValueOnce([ticket]);
    mockTx.where.mockImplementation(function () {
      return Object.assign(Promise.resolve([
        { itemStatus: 'ready' },
        { itemStatus: 'ready' },
      ]), mockTx);
    });
    mockTx.returning
      .mockResolvedValueOnce([updatedTicket])  // ticket → served
      .mockResolvedValueOnce([]);              // items update chain

    await bumpTicket(makeCtx(), { ticketId: 'tk-1', clientRequestId: 'req-1' });

    // The second .set() call should mark items as served
    const itemSetCall = mockTx.set.mock.calls[1]?.[0] as Record<string, unknown> | undefined;
    expect(itemSetCall?.itemStatus).toBe('served');
    expect(itemSetCall?.servedAt).toBeInstanceOf(Date);
  });

  it('bumpTicket: idempotent duplicate → returns cached result', async () => {
    const { checkIdempotency } = await import('@oppsera/core/helpers/idempotency');
    const cachedResult = { status: 'served', id: 'tk-1' };
    vi.mocked(checkIdempotency).mockResolvedValueOnce({
      isDuplicate: true,
      originalResult: cachedResult,
    });

    const result = await bumpTicket(makeCtx(), { ticketId: 'tk-1', clientRequestId: 'req-dup' });
    expect(result).toEqual(cachedResult);
    expect(mockTx.update).not.toHaveBeenCalled();
  });
});
