/**
 * KDS Happy-Path Integration Test
 *
 * Exercises the full kitchen flow in a single test:
 *   1. sendCourse     — marks a course as 'sent', fires outbox event
 *   2. getKdsView     — ticket appears on the station view
 *   3. bumpItem       — item transitions pending → ready
 *   4. bumpTicket     — ticket transitions in_progress → ready (prep station bump)
 *   5. getExpoView    — bumped ticket (status='ready') appears on the expo view
 *
 * Mock strategy:
 *   - Commands (sendCourse / bumpItem / bumpTicket): publishWithOutbox passes a
 *     chainable Drizzle-style `mockTx` through; each call is set up with
 *     `.limit`, `.returning`, and `.execute` return values in call order.
 *   - Queries (getKdsView / getExpoView): withTenant is mocked via mockWithTenant
 *     and called in sequence for each tier of the query.
 *
 * The two mock families share the same vi.mock('@oppsera/db') factory — withTenant
 * is always `mockWithTenant` and the schema table stubs satisfy both the Drizzle
 * query-builder path (getKdsView station lookup) and the raw-SQL path (everything
 * else).
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- mock factories require dynamic typing */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Shared mock state ──────────────────────────────────────────────────────────

const mockWithTenant = vi.fn();

// Chainable Drizzle mock used by publishWithOutbox commands
function createChainableTx(defaultReturn: unknown[] = []): any {
  const chain: Record<string, any> = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(defaultReturn));
  chain.update = vi.fn(() => chain);
  chain.set = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.values = vi.fn(() => chain);
  chain.returning = vi.fn(() => Promise.resolve(defaultReturn));
  chain.execute = vi.fn(() => Promise.resolve(defaultReturn));
  return chain;
}

let mockTx = createChainableTx();

// ── Module mocks ───────────────────────────────────────────────────────────────

vi.mock('@oppsera/db', () => {
  // Proxy-based schema table stubs for Drizzle query builder (getKdsView station lookup)
  const col = (name: string) => ({ name });
  const table = (tableName: string) =>
    new Proxy(
      { _: { name: tableName } },
      { get: (_t, prop) => (prop === '_' ? _t._ : col(`${tableName}.${String(prop)}`)) },
    );

  return {
    withTenant: (...args: unknown[]) => mockWithTenant(...args),
    // Schema stubs
    fnbKitchenStations: table('fnb_kitchen_stations'),
    fnbKitchenTickets: table('fnb_kitchen_tickets'),
    fnbKitchenTicketItems: table('fnb_kitchen_ticket_items'),
    fnbTabCourses: table('fnb_tab_courses'),
    fnbTabItems: table('fnb_tab_items'),
    fnbTabs: table('fnb_tabs'),
    fnbTables: table('fnb_tables'),
  };
});

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    { join: vi.fn((values: unknown[]) => values), raw: vi.fn((s: string) => s) },
  ),
  eq: vi.fn((_col: unknown, val: unknown) => ({ _tag: 'eq', val })),
  and: vi.fn((...conds: unknown[]) => ({ _tag: 'and', conds })),
  ne: vi.fn((_col: unknown, val: unknown) => ({ _tag: 'ne', val })),
  inArray: vi.fn((_col: unknown, vals: unknown) => ({ _tag: 'inArray', vals })),
}));

vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
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
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@oppsera/shared', async (importOriginal: () => Promise<Record<string, unknown>>) => {
  const actual = await importOriginal();
  return { ...actual };
});

// Mock the dispatch preparation layer — sendCourse now calls prepareCourseDispatch
// before the transaction. We mock it to return pre-computed routing results so the
// integration test focuses on the atomic transaction behavior.
const mockPrepareCourseDispatch = vi.fn();
const mockRecordDispatchAttempt = vi.fn(async () => 'attempt-1');

vi.mock('../commands/dispatch-course-to-kds', () => ({
  prepareCourseDispatch: (...args: unknown[]) => mockPrepareCourseDispatch(...args),
  recordDispatchAttempt: (...args: unknown[]) => mockRecordDispatchAttempt(),
  emptyDispatchResult: () => ({
    attemptId: null, status: 'started', failureStage: null,
    ticketsCreated: 0, ticketsFailed: 0, itemsRouted: 0, itemsUnrouted: 0,
    itemCount: 0, effectiveKdsLocationId: null, ticketIds: [], stationIds: [],
    orderId: null, tabType: null, businessDate: null, errors: [], diagnosis: [],
  }),
}));

// ── Imports (must come after vi.mock calls) ───────────────────────────────────

import type { RequestContext } from '@oppsera/core/auth/context';
import { sendCourse } from '../commands/send-course';
import { bumpItem } from '../commands/bump-item';
import { bumpTicket } from '../commands/bump-ticket';
import { getKdsView, _warnedAt } from '../queries/get-kds-view';
import { getExpoView } from '../queries/get-expo-view';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT = 'tenant-1';
const LOCATION = 'loc-1';
const STATION_ID = 'station-1';
const TAB_ID = 'tab-1';
const TICKET_ID = 'ticket-1';
const ITEM_ID = 'item-1';
const BUSINESS_DATE = '2026-03-13';

function makeCtx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    tenantId: TENANT,
    locationId: LOCATION,
    user: { id: 'user-1', email: 'chef@example.com', role: 'manager', name: 'Chef' },
    ...overrides,
  } as RequestContext;
}

/** Station fixture — camelCase keys (Drizzle query builder output) */
const STATION_FIXTURE = {
  id: STATION_ID,
  name: 'grill',
  displayName: 'Grill',
  stationType: 'grill',
  color: null as string | null,
  warningThresholdSeconds: 480,
  criticalThresholdSeconds: 720,
  rushMode: false,
  locationId: LOCATION,
};

/** Build a mock tx for the getKdsView Tier-1 call (station via Drizzle + tickets/items via execute) */
function createKdsTx(execute: ReturnType<typeof vi.fn>) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([STATION_FIXTURE]),
  };
  return {
    select: vi.fn().mockReturnValue(chain),
    execute,
  };
}

/** Mock a full KDS view Tier-2 (cross-station, completed, served-today, upcoming) with happy-path data. */
function setupKdsTier2(ticketId: string, status: string) {
  // Cross-station: no other stations for simplicity
  mockWithTenant.mockImplementationOnce(
    async (_tenantId: string, fn: (tx: unknown) => unknown) =>
      fn({
        execute: vi.fn()
          .mockResolvedValueOnce([]) // other stations
          .mockResolvedValueOnce([
            { ticket_id: ticketId, total_order_items: 1, ready_order_items: status === 'ready' ? 1 : 0 },
          ]),
      }),
  );
  // Recently completed: empty (still active)
  mockWithTenant.mockImplementationOnce(
    async (_tenantId: string, fn: (tx: unknown) => unknown) =>
      fn({ execute: vi.fn().mockResolvedValueOnce([]) }),
  );
  // Served today count: 0
  mockWithTenant.mockImplementationOnce(
    async (_tenantId: string, fn: (tx: unknown) => unknown) =>
      fn({ execute: vi.fn().mockResolvedValueOnce([{ served_count: 0 }]) }),
  );
  // Upcoming courses: resolved directly (no active tabs after bump, but still mock it)
  mockWithTenant.mockResolvedValueOnce([]);
}

// ── Integration test ──────────────────────────────────────────────────────────

describe('KDS happy path integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _warnedAt.clear();
    mockTx = createChainableTx();
  });

  it('send → view → bump item → bump ticket → expo', async () => {
    // ──────────────────────────────────────────────────────────────────────────
    // STEP 1: sendCourse — marks course 1 on tab-1 as 'sent'
    // ──────────────────────────────────────────────────────────────────────────

    const tab = { id: TAB_ID, tenantId: TENANT, locationId: LOCATION, status: 'open', version: 1 };
    const course = { id: 'course-1', tabId: TAB_ID, courseNumber: 1, courseStatus: 'unsent' };
    const sentCourse = { ...course, courseStatus: 'sent', sentAt: new Date() };

    // Mock the preparation phase — returns pre-computed routing with 1 station, 1 item
    mockPrepareCourseDispatch.mockResolvedValueOnce({
      tab: { id: TAB_ID, locationId: LOCATION, primaryOrderId: null, businessDate: BUSINESS_DATE, tableId: null, tabType: 'dine_in' },
      courseName: 'Course 1',
      effectiveLocationId: LOCATION,
      tableNumber: null,
      stationGroups: new Map([
        [STATION_ID, [{
          orderLineId: ITEM_ID, catalogItemId: 'cat-1', itemName: 'Test Item',
          modifierSummary: null, specialInstructions: null, seatNumber: 1,
          courseName: 'Course 1', quantity: 1, stationId: STATION_ID, routingRuleId: 'rule-1',
        }]],
      ]),
      stationNameMap: new Map([[STATION_ID, 'Grill']]),
      prepTimeMap: new Map(),
      routingResults: [{ orderLineId: ITEM_ID, stationId: STATION_ID, routingRuleId: 'rule-1', matchType: 'item' }],
      diagnosis: ['Tab: rawLocationId=loc-1, resolvedLocationId=loc-1'],
      errors: [],
      itemCount: 1,
      itemsRouted: 1,
      itemsUnrouted: 0,
    });

    // sendCourse atomic transaction via publishWithOutbox (in order):
    //   1. checkIdempotency (mocked globally → not duplicate)
    //   2. tx.select().from(fnbTabs)...limit(1) → tab
    //   3. tx.select().from(fnbTabCourses)...limit(1) → course
    //   4. tx.execute (counter increment) → { last_number: 1 }
    //   5. checkIdempotency per ticket (mocked globally → not duplicate)
    //   6. tx.insert(fnbKitchenTickets)...returning() → ticket
    //   7. tx.insert(fnbKitchenTicketItems)...values() → void (no returning)
    //   8. saveIdempotencyKey per ticket
    //   9. tx.execute (send tracking) → void
    //  10. tx.execute (send event) → void
    //  11. tx.update(fnbTabCourses)...returning() → sentCourse
    //  12. tx.update(fnbTabs)...where() → void
    //  13. saveIdempotencyKey for sendCourse
    const insertedTicket = { id: TICKET_ID, ticketNumber: 1 };
    mockTx.limit
      .mockResolvedValueOnce([tab])    // tab lookup
      .mockResolvedValueOnce([course]); // course lookup
    mockTx.execute
      .mockResolvedValueOnce([{ last_number: 1 }])  // counter increment
      .mockResolvedValueOnce([])  // send tracking INSERT
      .mockResolvedValueOnce([]);  // send event INSERT
    mockTx.returning
      .mockResolvedValueOnce([insertedTicket])      // ticket insert
      .mockResolvedValueOnce([sentCourse]); // course update
    // ticket items insert uses .values() which is already mocked to return chain

    const sendResult = await sendCourse(makeCtx(), {
      tabId: TAB_ID,
      courseNumber: 1,
      clientRequestId: 'cr-send-1',
    });

    expect(sendResult.course?.courseStatus).toBe('sent');
    expect(sendResult.dispatch.status).toBe('succeeded');
    expect(sendResult.dispatch.ticketsCreated).toBe(1);

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 2: getKdsView — ticket appears on the prep station
    // ──────────────────────────────────────────────────────────────────────────

    // Tier-1 execute calls (tickets + items)
    const ticketExecute = vi.fn()
      .mockResolvedValueOnce([
        {
          id: TICKET_ID,
          ticket_number: 42,
          tab_id: TAB_ID,
          course_number: 1,
          status: 'pending',
          priority_level: 0,
          is_held: false,
          order_type: 'dine_in',
          channel: 'pos',
          table_number: 7,
          server_name: 'Chef',
          customer_name: null,
          sent_at: '2026-03-13T12:00:00Z',
          estimated_pickup_at: null,
          business_date: BUSINESS_DATE,
          elapsed_seconds: 45,
          order_source: 'pos',
          terminal_id: 'term-1',
          order_timestamp: '2026-03-13T11:59:00Z',
          terminal_name: 'Bar POS 1',
          course_name: 'Entrees',
        },
      ])
      .mockResolvedValueOnce([
        {
          ticket_id: TICKET_ID,
          id: ITEM_ID,
          order_line_id: 'line-1',
          item_name: 'Grilled Salmon',
          kitchen_label: null,
          item_color: null,
          modifier_summary: null,
          special_instructions: null,
          seat_number: 2,
          course_name: 'Entrees',
          quantity: '1',
          item_status: 'pending',
          station_id: STATION_ID,
          priority_level: 0,
          estimated_prep_seconds: null,
          routing_rule_id: null,
          is_rush: false,
          is_allergy: false,
          is_vip: false,
          started_at: null,
          ready_at: null,
          bumped_by: null,
          elapsed_seconds: 45,
        },
      ]);

    // Tier-1 withTenant call
    mockWithTenant.mockImplementationOnce(
      async (_tenantId: string, fn: (tx: unknown) => unknown) =>
        fn(createKdsTx(ticketExecute)),
    );

    // Tier-2 withTenant calls (cross-station, completed, served-today, upcoming)
    setupKdsTier2(TICKET_ID, 'pending');

    const kdsView = await getKdsView({
      tenantId: TENANT,
      stationId: STATION_ID,
      locationId: LOCATION,
      businessDate: BUSINESS_DATE,
    });

    // Verify ticket appears
    expect(kdsView.stationId).toBe(STATION_ID);
    expect(kdsView.stationName).toBe('Grill');
    expect(kdsView.tickets).toHaveLength(1);
    const ticket = kdsView.tickets[0]!;
    expect(ticket.ticketId).toBe(TICKET_ID);
    expect(ticket.ticketNumber).toBe(42);
    expect(ticket.status).toBe('pending');
    expect(ticket.tableNumber).toBe(7);
    expect(ticket.courseName).toBe('Entrees');
    expect(ticket.items).toHaveLength(1);
    expect(ticket.items[0]!.itemId).toBe(ITEM_ID);
    expect(ticket.items[0]!.itemName).toBe('Grilled Salmon');
    expect(ticket.items[0]!.itemStatus).toBe('pending');
    expect(ticket.alertLevel).toBe('normal'); // 45s < 480s warning threshold

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 3: bumpItem — Grilled Salmon goes pending → ready
    // ──────────────────────────────────────────────────────────────────────────

    const station = { id: STATION_ID, autoBumpOnAllReady: false };
    const ticketItemPending = {
      id: ITEM_ID,
      tenantId: TENANT,
      ticketId: TICKET_ID,
      stationId: STATION_ID,
      itemStatus: 'pending',
      startedAt: null,
      readyAt: null,
      bumpedBy: null,
    };
    const ticketRecord = {
      id: TICKET_ID,
      tenantId: TENANT,
      locationId: LOCATION,
      tabId: TAB_ID,
      status: 'pending',
      version: 1,
      isHeld: false,
      startedAt: null,
      readyAt: null,
      bumpedAt: null,
      bumpedBy: null,
      servedAt: null,
    };
    const progressedTicket = { ...ticketRecord, status: 'in_progress', version: 2 };
    const readyItem = { ...ticketItemPending, itemStatus: 'ready', readyAt: new Date(), bumpedBy: 'user-1' };

    // bumpItem call order inside publishWithOutbox:
    //   1. tx.select().from(fnbKitchenStations).where(...).limit(1) → station
    //   2. tx.select().from(fnbKitchenTicketItems).where(...).limit(1) → item
    //   3. tx.select().from(fnbKitchenTickets).where(...).limit(1) → ticket (pending)
    //   4. tx.update(fnbKitchenTickets).set({in_progress}).returning() → progressedTicket
    //   5. tx.update(fnbKitchenTicketItems).set({ready}).returning() → readyItem
    //   (autoBumpOnAllReady=false → no sibling check or expo check)
    mockTx.limit
      .mockResolvedValueOnce([station])          // station lookup
      .mockResolvedValueOnce([ticketItemPending]) // item lookup
      .mockResolvedValueOnce([ticketRecord]);     // ticket lookup
    mockTx.returning
      .mockResolvedValueOnce([progressedTicket]) // ticket pending → in_progress
      .mockResolvedValueOnce([readyItem]);        // item pending → ready

    const bumpItemResult = await bumpItem(makeCtx(), {
      ticketItemId: ITEM_ID,
      stationId: STATION_ID,
      clientRequestId: 'cr-bump-item-1',
    });

    expect(bumpItemResult.itemStatus).toBe('ready');
    expect(bumpItemResult.id).toBe(ITEM_ID);

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 4: bumpTicket — prep station bumps ticket in_progress → ready
    // ──────────────────────────────────────────────────────────────────────────

    const ticketInProgress = { ...ticketRecord, status: 'in_progress', version: 2 };
    const ticketReady = { ...ticketRecord, status: 'ready', version: 3, readyAt: new Date() };

    // bumpTicket call order inside publishWithOutbox:
    //   1. tx.select().from(fnbKitchenTickets).where(...).limit(1) → ticketInProgress
    //   2. tx.execute(sql`SELECT station_type ...`) → [{ station_type: 'grill' }] (prep, not expo)
    //   3. tx.select().from(fnbKitchenTicketItems).where(...) → allItems (used for where chain)
    //   4. tx.update(fnbKitchenTickets).set({ready}).returning() → ticketReady
    //   (ticket is already in_progress, so no pending→in_progress auto-progress step)
    mockTx.limit
      .mockResolvedValueOnce([ticketInProgress]); // ticket lookup

    mockTx.execute
      .mockResolvedValueOnce([{ station_type: 'grill' }]); // resolveIsExpoBump → prep station

    // select items for the "all non-voided items ready" guard:
    // bumpTicket uses tx.select().from(fnbKitchenTicketItems).where(...) — no .limit()
    // The chain mock's .where() returns the chain; we need .where() to resolve to items.
    // Override .where() so the last call (items select) returns the items array.
    const allItems = [{ itemStatus: 'ready' }];
    mockTx.where
      .mockReturnValueOnce({ limit: vi.fn().mockResolvedValue([ticketInProgress]) }) // select() chain's where (no match — this is the limit path)
      .mockResolvedValueOnce(allItems); // items select (no .limit — Promise directly)

    mockTx.returning
      .mockResolvedValueOnce([ticketReady]); // ticket → ready

    const bumpTicketResult = await bumpTicket(makeCtx(), {
      ticketId: TICKET_ID,
      stationId: STATION_ID,
      clientRequestId: 'cr-bump-ticket-1',
    });

    expect(bumpTicketResult.status).toBe('ready');
    expect(bumpTicketResult.id).toBe(TICKET_ID);

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 5: getExpoView — bumped ticket (status='ready') appears on expo
    // ──────────────────────────────────────────────────────────────────────────

    // getExpoView uses a single withTenant call with raw SQL only.
    // execute calls inside the callback:
    //   1. ticketRows — SELECT ... WHERE status = 'ready'
    //   2. allItemRows — SELECT ... WHERE ticket_id IN (...)
    //   3. expoStationRows — SELECT warning/critical threshold from expo station
    const expoExecute = vi.fn()
      .mockResolvedValueOnce([
        {
          id: TICKET_ID,
          ticket_number: 42,
          tab_id: TAB_ID,
          course_number: 1,
          status: 'ready',
          priority_level: 0,
          is_held: false,
          order_type: 'dine_in',
          channel: 'pos',
          table_number: 7,
          server_name: 'Chef',
          customer_name: null,
          sent_at: '2026-03-13T12:00:00Z',
          estimated_pickup_at: null,
          business_date: BUSINESS_DATE,
          elapsed_seconds: 120,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: ITEM_ID,
          ticket_id: TICKET_ID,
          item_name: 'Grilled Salmon',
          kitchen_label: null,
          item_color: null,
          modifier_summary: null,
          special_instructions: null,
          seat_number: 2,
          course_name: 'Entrees',
          quantity: 1,
          item_status: 'ready',
          priority_level: 0,
          estimated_prep_seconds: null,
          station_id: STATION_ID,
          station_name: 'Grill',
          is_rush: false,
          is_allergy: false,
          is_vip: false,
          ready_at: '2026-03-13T12:02:00Z',
        },
      ])
      .mockResolvedValueOnce([
        { warning_threshold_seconds: 480, critical_threshold_seconds: 720 },
      ]);

    mockWithTenant.mockImplementationOnce(
      async (_tenantId: string, fn: (tx: unknown) => unknown) =>
        fn({ execute: expoExecute }),
    );

    const expoView = await getExpoView({
      tenantId: TENANT,
      locationId: LOCATION,
      businessDate: BUSINESS_DATE,
    });

    // Verify bumped ticket appears on expo
    expect(expoView.tickets).toHaveLength(1);
    const expoTicket = expoView.tickets[0]!;
    expect(expoTicket.ticketId).toBe(TICKET_ID);
    expect(expoTicket.ticketNumber).toBe(42);
    expect(expoTicket.status).toBe('ready');
    expect(expoTicket.tableNumber).toBe(7);
    expect(expoTicket.elapsedSeconds).toBe(120);
    expect(expoTicket.alertLevel).toBe('normal'); // 120s < 480s threshold
    expect(expoTicket.items).toHaveLength(1);
    expect(expoTicket.items[0]!.itemStatus).toBe('ready');
    expect(expoTicket.items[0]!.itemName).toBe('Grilled Salmon');
    expect(expoTicket.allItemsReady).toBe(true);
    expect(expoTicket.readyCount).toBe(1);
    expect(expoTicket.totalCount).toBe(1);

    // Expo-level counters
    expect(expoView.totalActiveTickets).toBe(1);
    expect(expoView.ticketsAllReady).toBe(1);
    expect(expoView.warningThresholdSeconds).toBe(480);
    expect(expoView.criticalThresholdSeconds).toBe(720);
  });
});
