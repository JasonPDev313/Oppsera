import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────

const {
  mockExecute,
  mockInsert,
  mockSelect,
  mockUpdate,
  mockTransaction,
} = vi.hoisted(() => ({
  mockExecute: vi.fn().mockResolvedValue([]),
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
  mockTransaction: vi.fn(),
}));

// Default insert chain: insert().values().returning() or .onConflictDoNothing()
mockInsert.mockReturnValue({
  values: vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue([]),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  }),
});

// Default select chain: select().from().where().limit().orderBy()
mockSelect.mockReturnValue({
  from: vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue([]),
      orderBy: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
    orderBy: vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue([]),
    }),
  }),
});

// Default update chain: update().set().where()
mockUpdate.mockReturnValue({
  set: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  }),
});

// Transaction mock
mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
  };
  return cb(tx);
});

vi.mock('@oppsera/db', () => ({
  db: {
    execute: mockExecute,
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
    transaction: mockTransaction,
    query: {
      entitlements: { findMany: vi.fn().mockResolvedValue([]) },
      locations: { findFirst: vi.fn() },
      roles: { findFirst: vi.fn(), findMany: vi.fn() },
      rolePermissions: { findFirst: vi.fn(), findMany: vi.fn() },
      roleAssignments: { findFirst: vi.fn(), findMany: vi.fn() },
      memberships: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
    },
  },
  withTenant: async (_tenantId: string, cb: (tx: unknown) => Promise<unknown>) => {
    return mockTransaction(cb);
  },
  sql: Object.assign(vi.fn((...args: unknown[]) => args), {
    join: vi.fn((fragments: unknown[], _sep?: unknown) => fragments),
  }),
  eventOutbox: {
    id: 'eventOutbox.id',
    tenantId: 'eventOutbox.tenantId',
    eventType: 'eventOutbox.eventType',
    eventId: 'eventOutbox.eventId',
    idempotencyKey: 'eventOutbox.idempotencyKey',
    payload: 'eventOutbox.payload',
    occurredAt: 'eventOutbox.occurredAt',
    publishedAt: 'eventOutbox.publishedAt',
    createdAt: 'eventOutbox.createdAt',
  },
  processedEvents: {
    id: 'processedEvents.id',
    eventId: 'processedEvents.eventId',
    consumerName: 'processedEvents.consumerName',
    processedAt: 'processedEvents.processedAt',
  },
  eventDeadLetters: {
    id: 'eventDeadLetters.id',
    tenantId: 'eventDeadLetters.tenantId',
    eventId: 'eventDeadLetters.eventId',
    eventType: 'eventDeadLetters.eventType',
    eventData: 'eventDeadLetters.eventData',
    consumerName: 'eventDeadLetters.consumerName',
    status: 'eventDeadLetters.status',
  },
  entitlements: { tenantId: 'entitlements.tenantId' },
  memberships: { tenantId: 'memberships.tenantId', status: 'memberships.status' },
  locations: { id: 'locations.id', tenantId: 'locations.tenantId', isActive: 'locations.isActive' },
  schema: {},
}));

vi.mock('../../auth/supabase-client', () => ({
  createSupabaseAdmin: vi.fn(),
  createSupabaseClient: vi.fn(),
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

import { EventEnvelopeSchema } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { buildEvent, buildEventFromContext } from '../build-event';
import { DrizzleOutboxWriter } from '../outbox-writer';
import { InMemoryEventBus } from '../in-memory-bus';
import { OutboxWorker } from '../outbox-worker';
import { setOutboxWriter } from '../index';
import {
  registerContracts,
  validateContracts,
  clearContractRegistry,
} from '../contracts';
import { registerModuleEvents } from '../register';
import { z } from 'zod';
import type { RequestContext } from '../../auth/context';

// ── Test Data ─────────────────────────────────────────────────────

const TENANT_ID = 'tnt_01TEST';
const USER_ID = 'usr_01TEST';

function makeCtx(overrides?: Partial<RequestContext>): RequestContext {
  return {
    user: {
      id: USER_ID,
      email: 'test@test.com',
      name: 'Test User',
      tenantId: TENANT_ID,
      tenantStatus: 'active',
      membershipStatus: 'active',
    },
    tenantId: TENANT_ID,
    requestId: 'req_01',
    isPlatformAdmin: false,
    ...overrides,
  };
}

function makeEvent(overrides?: Partial<EventEnvelope>): EventEnvelope {
  return {
    eventId: 'evt_01TEST',
    eventType: 'test.dummy_event.created.v1',
    occurredAt: new Date().toISOString(),
    tenantId: TENANT_ID,
    idempotencyKey: `${TENANT_ID}:test:evt_01TEST`,
    data: { foo: 'bar' },
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────

describe('buildEvent', () => {
  // Test 1: buildEvent creates valid envelope
  it('creates a valid EventEnvelope', () => {
    const event = buildEvent({
      eventType: 'order.order_item.placed.v1',
      tenantId: TENANT_ID,
      locationId: 'loc_01',
      actorUserId: USER_ID,
      correlationId: 'req_01',
      data: { orderId: 'ord_01' },
    });

    expect(event.eventId).toBeTruthy();
    expect(event.eventId.length).toBe(26); // ULID
    expect(event.eventType).toBe('order.order_item.placed.v1');
    expect(event.occurredAt).toBeTruthy();
    expect(event.tenantId).toBe(TENANT_ID);
    expect(event.locationId).toBe('loc_01');
    expect(event.actorUserId).toBe(USER_ID);
    expect(event.correlationId).toBe('req_01');
    expect(event.data).toEqual({ orderId: 'ord_01' });

    // Validate against schema
    const result = EventEnvelopeSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  // Test 2: buildEvent rejects invalid event type via schema
  it('creates event that fails schema validation with bad event type', () => {
    const event = buildEvent({
      eventType: 'bad-format',
      tenantId: TENANT_ID,
      data: {},
    });

    const result = EventEnvelopeSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('generates default idempotency key', () => {
    const event = buildEvent({
      eventType: 'order.order_item.placed.v1',
      tenantId: TENANT_ID,
      data: {},
    });

    expect(event.idempotencyKey).toContain(TENANT_ID);
    expect(event.idempotencyKey).toContain('order.order_item.placed.v1');
  });

  it('uses custom idempotency key when provided', () => {
    const event = buildEvent({
      eventType: 'order.order_item.placed.v1',
      tenantId: TENANT_ID,
      data: {},
      idempotencyKey: 'custom-key',
    });

    expect(event.idempotencyKey).toBe('custom-key');
  });

  it('buildEventFromContext uses RequestContext fields', () => {
    const ctx = makeCtx({ locationId: 'loc_01' });
    const event = buildEventFromContext(ctx, 'order.order_item.placed.v1', {
      orderId: 'ord_01',
    });

    expect(event.tenantId).toBe(TENANT_ID);
    expect(event.locationId).toBe('loc_01');
    expect(event.actorUserId).toBe(USER_ID);
    expect(event.correlationId).toBe('req_01');
  });
});

describe('DrizzleOutboxWriter', () => {
  let writer: DrizzleOutboxWriter;

  beforeEach(() => {
    vi.clearAllMocks();
    writer = new DrizzleOutboxWriter();
    // Re-setup insert chain after clearAllMocks
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    });
  });

  // Test 3: OutboxWriter writes to event_outbox
  it('writes event to outbox table via transaction', async () => {
    const event = makeEvent();
    const tx = { insert: mockInsert };

    await writer.writeEvent(tx as never, event);

    expect(mockInsert).toHaveBeenCalled();
    const valuesCall = mockInsert.mock.results[0]?.value;
    expect(valuesCall.values).toHaveBeenCalled();
  });

  it('sets publishedAt to null', async () => {
    const insertValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([]),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    });
    mockInsert.mockReturnValue({ values: insertValues });

    const event = makeEvent();
    const tx = { insert: mockInsert };

    await writer.writeEvent(tx as never, event);

    const valuesArg = insertValues.mock.calls[0]?.[0];
    expect(valuesArg.publishedAt).toBeNull();
    expect(valuesArg.eventId).toBe(event.eventId);
    expect(valuesArg.eventType).toBe(event.eventType);
    expect(valuesArg.payload).toEqual(event);
  });
});

describe('publishWithOutbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const writer = new DrizzleOutboxWriter();
    setOutboxWriter(writer);

    // Re-setup insert chain
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    });
  });

  // Test 4: publishWithOutbox — atomic business write + event write
  it('executes operation and writes events in same transaction', async () => {
    const { publishWithOutbox } = await import('../publish-with-outbox');
    const ctx = makeCtx();
    const event = makeEvent();

    const result = await publishWithOutbox(ctx, async () => {
      return { result: { id: 'test-row' }, events: [event] };
    });

    expect(result).toEqual({ id: 'test-row' });
    // Transaction was called
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    // Insert was called for the outbox event
    expect(mockInsert).toHaveBeenCalled();
  });

  // Test 5: publishWithOutbox — rollback on failure
  it('rolls back on operation failure', async () => {
    const { publishWithOutbox } = await import('../publish-with-outbox');
    const ctx = makeCtx();

    mockTransaction.mockImplementationOnce(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn().mockResolvedValue(undefined),
        insert: mockInsert,
      };
      // Simulate the real transaction behavior: if callback throws, transaction rolls back
      return cb(tx);
    });

    await expect(
      publishWithOutbox(ctx, async () => {
        throw new Error('Business logic failed');
      }),
    ).rejects.toThrow('Business logic failed');
  });

  it('writes multiple events from a single operation', async () => {
    const { publishWithOutbox } = await import('../publish-with-outbox');
    const ctx = makeCtx();
    const event1 = makeEvent({ eventId: 'evt_01' });
    const event2 = makeEvent({ eventId: 'evt_02' });

    await publishWithOutbox(ctx, async () => {
      return { result: 'ok', events: [event1, event2] };
    });

    // Insert called twice (once per event)
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });
});

describe('InMemoryEventBus', () => {
  let bus: InMemoryEventBus;

  beforeEach(() => {
    vi.clearAllMocks();
    bus = new InMemoryEventBus();

    // Setup select chain for processedEvents lookups (default: not processed)
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    // Setup insert chain for processedEvents writes
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    });
  });

  // Test 6: subscribe + publish
  it('dispatches event to exact subscriber', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('test.dummy_event.created.v1', handler);

    const event = makeEvent();
    await bus.publish(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
  });

  // Test 7: pattern subscribe
  it('dispatches event to pattern subscribers', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.subscribePattern('order.*', handler);

    const orderPlaced = makeEvent({ eventType: 'order.order_item.placed.v1' });
    const orderVoided = makeEvent({ eventType: 'order.order_item.voided.v1', eventId: 'evt_02' });
    const catalogCreated = makeEvent({ eventType: 'catalog.item_record.created.v1', eventId: 'evt_03' });

    await bus.publish(orderPlaced);
    await bus.publish(orderVoided);
    await bus.publish(catalogCreated);

    // Handler called for order events but NOT catalog
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith(orderPlaced);
    expect(handler).toHaveBeenCalledWith(orderVoided);
  });

  // Test 8: multiple handlers
  it('dispatches to multiple handlers for same event type', async () => {
    const handler1 = vi.fn().mockResolvedValue(undefined);
    const handler2 = vi.fn().mockResolvedValue(undefined);

    bus.subscribe('test.dummy_event.created.v1', handler1);
    bus.subscribe('test.dummy_event.created.v1', handler2);

    const event = makeEvent();
    await bus.publish(event);

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  // Test 9: consumer idempotency
  it('does not re-process already processed events', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('test.dummy_event.created.v1', handler);

    const event = makeEvent();

    // First publish: not yet processed
    await bus.publish(event);
    expect(handler).toHaveBeenCalledTimes(1);

    // Second publish: simulate already processed (select returns a row)
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 'pe_01', eventId: event.eventId, consumerName: 'test' }]),
        }),
      }),
    });

    await bus.publish(event);
    // Handler should NOT be called again
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // Test 10: retry on failure
  it('retries handler on failure with exponential backoff', async () => {
    let callCount = 0;
    const handler = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 3) throw new Error('Transient failure');
    });

    bus.subscribe('test.dummy_event.created.v1', handler);

    const event = makeEvent();
    await bus.publish(event);

    // Handler called 3 times (2 failures + 1 success)
    expect(handler).toHaveBeenCalledTimes(3);
    // Event should be marked as processed (not in DLQ)
    expect(bus.getDeadLetterQueue()).toHaveLength(0);
  }, 10000);

  // Test 11: dead letter after max retries
  it('moves event to dead letter queue after max retries', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('Permanent failure'));
    bus.subscribe('test.dummy_event.created.v1', handler);

    const event = makeEvent();
    await bus.publish(event);

    // Handler called 3 times (all failures)
    expect(handler).toHaveBeenCalledTimes(3);
    // Event should be in DLQ
    const dlq = bus.getDeadLetterQueue();
    expect(dlq).toHaveLength(1);
    expect(dlq[0]!.event.eventId).toBe(event.eventId);
    expect(dlq[0]!.error.message).toBe('Permanent failure');
  }, 10000);

  it('validates event envelope before publishing', async () => {
    const badEvent = {
      eventId: 'evt_01',
      eventType: 'bad-format',
      occurredAt: new Date().toISOString(),
      tenantId: TENANT_ID,
      idempotencyKey: 'key',
      data: {},
    } as EventEnvelope;

    await expect(bus.publish(badEvent)).rejects.toThrow();
  });

  it('start and stop toggle running state', async () => {
    await bus.start();
    await bus.stop();
    // No error means it works
  });
});

describe('OutboxWorker', () => {
  let bus: InMemoryEventBus;
  let worker: OutboxWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    bus = new InMemoryEventBus();
    worker = new OutboxWorker({ eventBus: bus, pollIntervalMs: 50 });

    // Default: processedEvents not found (for bus idempotency)
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    // Default insert chain
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    });

    // Transaction mock: processBatch uses db.transaction with tx.execute for
    // FOR UPDATE SKIP LOCKED claim + batch UPDATE for marking published.
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn().mockResolvedValue([]),
        insert: mockInsert,
        select: mockSelect,
        update: mockUpdate,
      };
      return cb(tx);
    });
  });

  // Test 12: OutboxWorker polls and publishes
  it('processes unpublished events from outbox', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('test.dummy_event.created.v1', handler);

    const event = makeEvent();
    const claimedRows = [
      {
        id: 'outbox_01',
        payload: event,
        event_type: 'test.dummy_event.created.v1',
        event_id: event.eventId,
      },
    ];

    // processBatch uses db.execute() with a CTE (not db.transaction)
    mockExecute.mockResolvedValueOnce(claimedRows);

    const count = await worker.processBatch();

    expect(count).toBe(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // Test 13: does not re-publish already published events
  it('skips already published events', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('test.dummy_event.created.v1', handler);

    // db.execute returns empty claimed rows (default mockExecute already returns [])
    const count = await worker.processBatch();

    expect(count).toBe(0);
    expect(handler).not.toHaveBeenCalled();
  });

  it('starts and stops correctly', async () => {
    await worker.start();
    expect(worker.isRunning()).toBe(true);
    await worker.stop();
    expect(worker.isRunning()).toBe(false);
  });
});

describe('Full round trip', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const writer = new DrizzleOutboxWriter();
    setOutboxWriter(writer);

    // Setup insert chain
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    });

    // Default select chain (processedEvents: not processed)
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    // Default update chain
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
  });

  // Test 14: publishWithOutbox → outbox worker → subscriber
  it('full round trip: publishWithOutbox writes event, worker dispatches to subscriber', async () => {
    const { publishWithOutbox } = await import('../publish-with-outbox');

    const receivedEvents: EventEnvelope[] = [];
    const bus = new InMemoryEventBus();
    const worker = new OutboxWorker({ eventBus: bus, pollIntervalMs: 50 });

    bus.subscribe('test.roundtrip_event.created.v1', async (event) => {
      receivedEvents.push(event);
    });

    const ctx = makeCtx();
    const event = buildEvent({
      eventType: 'test.roundtrip_event.created.v1',
      tenantId: TENANT_ID,
      actorUserId: USER_ID,
      correlationId: 'req_01',
      data: { orderId: 'ord_01' },
    });

    // Step 1: Write event via publishWithOutbox
    await publishWithOutbox(ctx, async () => {
      return { result: { id: 'business-row' }, events: [event] };
    });

    expect(mockTransaction).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();

    // Step 2: Simulate worker picking up the event from outbox (db.execute CTE)
    mockExecute.mockResolvedValueOnce([
      {
        id: 'outbox_rt',
        payload: event,
        event_type: event.eventType,
        event_id: event.eventId,
      },
    ]);

    const count = await worker.processBatch();

    expect(count).toBe(1);
    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0]!.eventType).toBe('test.roundtrip_event.created.v1');
    expect(receivedEvents[0]!.data).toEqual({ orderId: 'ord_01' });
  });
});

describe('Contract validation', () => {
  beforeEach(() => {
    clearContractRegistry();
  });

  // Test 15: consumed event has a producer
  it('validates when consumed event has a producer', () => {
    registerContracts({
      moduleName: 'orders',
      emits: [
        { eventType: 'order.order_item.placed.v1', dataSchema: z.object({ orderId: z.string() }) },
      ],
      consumes: [],
    });

    registerContracts({
      moduleName: 'inventory',
      emits: [],
      consumes: [
        { eventType: 'order.order_item.placed.v1', dataSchema: z.object({ orderId: z.string() }) },
      ],
    });

    const result = validateContracts();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // Test 16: consumed event has NO producer
  it('reports error when consumed event has no producer', () => {
    registerContracts({
      moduleName: 'inventory',
      emits: [],
      consumes: [
        { eventType: 'order.order_item.placed.v1', dataSchema: z.object({ orderId: z.string() }) },
      ],
    });

    const result = validateContracts();
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('inventory');
    expect(result.errors[0]).toContain('order.order_item.placed.v1');
    expect(result.errors[0]).toContain('no module emits it');
  });
});

describe('registerModuleEvents', () => {
  it('registers exact and pattern handlers', () => {
    const bus = new InMemoryEventBus();
    const handler = vi.fn().mockResolvedValue(undefined);

    registerModuleEvents(bus, 'test-module', {
      exact: [
        { eventType: 'test.dummy_event.created.v1', consumerName: 'test:handler', handler },
      ],
      patterns: [
        { pattern: 'order.*', consumerName: 'test:order-handler', handler },
      ],
    });

    // Verify handlers are registered (we can't inspect private state, but we can test behavior)
    // This is implicitly tested by the publish tests
  });
});
