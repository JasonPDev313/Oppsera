import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockExecute = vi.fn();
const mockWithTenant = vi.fn();

vi.mock('@oppsera/db', () => {
  // Stub schema table/column refs used in Drizzle query builder
  const col = (name: string) => ({ name });
  const table = (tableName: string) =>
    new Proxy(
      { _: { name: tableName } },
      { get: (_t, prop) => (prop === '_' ? _t._ : col(`${tableName}.${String(prop)}`)) },
    );
  return {
    withTenant: (...args: unknown[]) => mockWithTenant(...args),
    fnbKitchenStations: table('fnb_kitchen_stations'),
    fnbTabCourses: table('fnb_tab_courses'),
    fnbTabItems: table('fnb_tab_items'),
    fnbTabs: table('fnb_tabs'),
    fnbTables: table('fnb_tables'),
  };
});

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
      as: () => ({ strings, values, _alias: true }),
    }),
    { join: vi.fn((values: unknown[]) => values) },
  ),
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock('@oppsera/core/observability', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from '@oppsera/core/observability';
import { getKdsView, _warnedAt } from '../queries/get-kds-view';

// Station fixture in camelCase (Drizzle query builder returns camelCase keys)
const STATION_FIXTURE = {
  id: 'station-1',
  name: 'grill',
  displayName: 'Grill',
  stationType: 'grill',
  color: null as string | null,
  warningThresholdSeconds: 480,
  criticalThresholdSeconds: 720,
  rushMode: false,
  locationId: 'loc-1',
};

/** Build a mock tx that supports both Drizzle query builder (station) and raw execute (tickets/items) */
function createMockTx(stationData: Record<string, unknown> | null, execute: ReturnType<typeof vi.fn>) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(stationData ? [stationData] : []),
  };
  return {
    select: vi.fn().mockReturnValue(chain),
    execute,
  };
}

// Shared fixture for a station + one ticket with one item (Tier 1 core data)
function setupCoreDataMocks() {
  mockExecute
    .mockResolvedValueOnce([
      {
        id: 'ticket-1',
        ticket_number: 101,
        tab_id: 'tab-1',
        course_number: 1,
        status: 'pending',
        priority_level: 0,
        is_held: false,
        order_type: 'dine_in',
        channel: 'pos',
        table_number: 23,
        server_name: 'Jason',
        customer_name: null,
        sent_at: '2026-03-13T12:00:00Z',
        estimated_pickup_at: null,
        business_date: '2026-03-13',
        elapsed_seconds: 60,
        order_source: 'pos',
        terminal_id: 'term-1',
        order_timestamp: '2026-03-13T11:59:00Z',
        terminal_name: 'Bar POS 1',
        course_name: 'Entrees',
      },
    ])
    .mockResolvedValueOnce([
      {
        ticket_id: 'ticket-1',
        id: 'item-1',
        order_line_id: 'line-1',
        item_name: 'Grilled Atlantic Salmon',
        kitchen_label: null,
        item_color: null,
        modifier_summary: null,
        special_instructions: null,
        seat_number: 1,
        course_name: 'Entrees',
        quantity: '1',
        item_status: 'pending',
        station_id: 'station-1',
        priority_level: 0,
        estimated_prep_seconds: null,
        routing_rule_id: null,
        is_rush: false,
        is_allergy: false,
        is_vip: false,
        started_at: null,
        ready_at: null,
        bumped_by: null,
        elapsed_seconds: 60,
      },
    ]);
}

/**
 * Build a Tier 2 mock tx. Tier 2 queries now run sequentially in ONE
 * withTenant call with a single tx. The execute mock must handle:
 *   1. cross-station "other stations" rows
 *   2. cross-station "progress" rows
 *   3. recently completed rows
 *   4. served today count rows
 * Upcoming courses uses Drizzle query builder (.select().from()...).
 */
function createTier2MockTx(opts?: {
  crossStationOther?: Record<string, unknown>[];
  crossStationProgress?: Record<string, unknown>[];
  recentlyCompleted?: Record<string, unknown>[];
  servedToday?: Record<string, unknown>[];
  upcomingCourses?: Record<string, unknown>[];
  failAt?: 'crossStation' | 'completed' | 'served' | 'upcoming';
}) {
  const o = opts ?? {};
  const exec = vi.fn();

  // 1 & 2: cross-station (two execute calls)
  if (o.failAt === 'crossStation') {
    exec.mockRejectedValueOnce(new Error('cross-station failure'));
  } else {
    exec.mockResolvedValueOnce(o.crossStationOther ?? []);
    exec.mockResolvedValueOnce(o.crossStationProgress ?? [
      { ticket_id: 'ticket-1', total_order_items: 1, ready_order_items: 0 },
    ]);
  }

  // 3: recently completed
  if (o.failAt === 'completed') {
    exec.mockRejectedValueOnce(new Error('completed failure'));
  } else {
    exec.mockResolvedValueOnce(o.recentlyCompleted ?? []);
  }

  // 4: served today
  if (o.failAt === 'served') {
    exec.mockRejectedValueOnce(new Error('served failure'));
  } else {
    exec.mockResolvedValueOnce(o.servedToday ?? [{ served_count: 0 }]);
  }

  // Upcoming courses uses Drizzle query builder — create rejection lazily
  // to avoid unhandled promise rejection warnings
  const drizzleChain = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockImplementation(() => {
      if (o.failAt === 'upcoming') return Promise.reject(new Error('upcoming failure'));
      return Promise.resolve(o.upcomingCourses ?? []);
    }),
  };

  return {
    execute: exec,
    select: vi.fn().mockReturnValue(drizzleChain),
  };
}

/** Standard Tier 2 setup: one withTenant call for all enrichment queries */
function setupTier2Mock(opts?: Parameters<typeof createTier2MockTx>[0]) {
  mockWithTenant.mockImplementationOnce(
    async (_tenantId: string, fn: (tx: unknown) => unknown) =>
      fn(createTier2MockTx(opts)),
  );
}

const DEFAULT_INPUT = {
  tenantId: 'tenant-1',
  stationId: 'station-1',
  locationId: 'loc-1',
  businessDate: '2026-03-13',
};

describe('getKdsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _warnedAt.clear(); // Reset rate-limit state between tests
  });

  it('keeps active tickets visible when upcoming courses lookup fails', async () => {
    setupCoreDataMocks();

    // Tier 1: core data
    mockWithTenant.mockImplementationOnce(
      async (_tenantId: string, fn: (tx: unknown) => unknown) =>
        fn(createMockTx(STATION_FIXTURE, mockExecute)),
    );
    // Tier 2: upcoming courses fails
    setupTier2Mock({ failAt: 'upcoming' });

    const result = await getKdsView(DEFAULT_INPUT);

    // Core data must survive the upcomingCourses failure
    expect(result.stationId).toBe('station-1');
    expect(result.tickets).toHaveLength(1);
    expect(result.tickets[0]?.ticketId).toBe('ticket-1');
    expect(result.tickets[0]?.items).toHaveLength(1);
    expect(result.upcomingCourses).toEqual([]);

    // Verify warning was logged for the failed enrichment
    expect(logger.warn).toHaveBeenCalledWith(
      '[kds] getKdsView: upcoming courses query failed — continuing without timeline',
      expect.objectContaining({
        tenantId: 'tenant-1',
        stationId: 'station-1',
        activeTabCount: 1,
      }),
    );
  });

  it('returns upcomingCourses when the secondary query succeeds', async () => {
    setupCoreDataMocks();

    // Tier 1
    mockWithTenant.mockImplementationOnce(
      async (_tenantId: string, fn: (tx: unknown) => unknown) =>
        fn(createMockTx(STATION_FIXTURE, mockExecute)),
    );
    // Tier 2 with upcoming courses data
    setupTier2Mock({
      upcomingCourses: [
        {
          tabId: 'tab-1',
          courseNumber: 2,
          courseName: 'Desserts',
          courseStatus: 'unsent',
          tableNumber: 23,
          itemCount: 2,
        },
      ],
    });

    const result = await getKdsView(DEFAULT_INPUT);

    expect(result.upcomingCourses).toHaveLength(1);
    expect(result.upcomingCourses[0]).toEqual({
      tabId: 'tab-1',
      courseNumber: 2,
      courseName: 'Desserts',
      courseStatus: 'unsent',
      itemCount: 2,
      tableNumber: 23,
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('keeps tickets visible when cross-station query fails', async () => {
    setupCoreDataMocks();

    // Tier 1
    mockWithTenant.mockImplementationOnce(
      async (_tenantId: string, fn: (tx: unknown) => unknown) =>
        fn(createMockTx(STATION_FIXTURE, mockExecute)),
    );
    // Tier 2: cross-station fails
    setupTier2Mock({ failAt: 'crossStation' });

    const result = await getKdsView(DEFAULT_INPUT);

    // Tickets survive cross-station failure
    expect(result.tickets).toHaveLength(1);
    expect(result.tickets[0]?.ticketId).toBe('ticket-1');
    // Cross-station data falls back to defaults
    expect(result.tickets[0]?.otherStations).toEqual([]);
    expect(result.tickets[0]?.totalOrderItems).toBe(1); // station-local count
    expect(result.tickets[0]?.totalOrderReadyItems).toBe(0);

    expect(logger.warn).toHaveBeenCalledWith(
      '[kds] getKdsView: cross-station query failed — showing tickets without cross-station data',
      expect.objectContaining({
        tenantId: 'tenant-1',
        stationId: 'station-1',
      }),
    );
  });

  it('keeps tickets visible when recently-completed query fails', async () => {
    setupCoreDataMocks();

    // Tier 1
    mockWithTenant.mockImplementationOnce(
      async (_tenantId: string, fn: (tx: unknown) => unknown) =>
        fn(createMockTx(STATION_FIXTURE, mockExecute)),
    );
    // Tier 2: completed fails
    setupTier2Mock({ failAt: 'completed' });

    const result = await getKdsView(DEFAULT_INPUT);

    expect(result.tickets).toHaveLength(1);
    expect(result.recentlyCompleted).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      '[kds] getKdsView: recently-completed query failed — continuing without history',
      expect.objectContaining({ tenantId: 'tenant-1' }),
    );
  });

  it('returns valid empty view when no tickets (diagnostic is just a log, no DB)', async () => {
    // No tickets — only execute call is for ticket query (returns empty)
    mockExecute.mockResolvedValueOnce([]);

    // Tier 1: core data (station via Drizzle + empty tickets via execute)
    mockWithTenant.mockImplementationOnce(
      async (_tenantId: string, fn: (tx: unknown) => unknown) =>
        fn(createMockTx(STATION_FIXTURE, mockExecute)),
    );
    // Tier 2: no tickets → cross-station and upcoming skipped, but withTenant still called
    setupTier2Mock();

    const result = await getKdsView(DEFAULT_INPUT);

    // Valid empty view
    expect(result.stationId).toBe('station-1');
    expect(result.stationName).toBe('Grill');
    expect(result.tickets).toEqual([]);
    expect(result.activeTicketCount).toBe(0);
    expect(result.recentlyCompleted).toEqual([]);
    expect(result.servedTodayCount).toBe(0);
    expect(result.upcomingCourses).toEqual([]);
    // Diagnostic logged (no DB call)
    expect(logger.debug).toHaveBeenCalledWith(
      '[KDS] Empty view — no active tickets for station',
      expect.objectContaining({ stationId: 'station-1', businessDate: '2026-03-13' }),
    );
  });

  it('clamps negative elapsed_seconds to 0 (clock drift)', async () => {
    mockExecute
      .mockResolvedValueOnce([
        {
          id: 'ticket-1', ticket_number: 1, tab_id: 'tab-1', course_number: null,
          status: 'pending', priority_level: 0, is_held: false,
          order_type: null, channel: null, table_number: null,
          server_name: null, customer_name: null,
          sent_at: '2026-03-13T12:00:00Z', estimated_pickup_at: null,
          business_date: '2026-03-13',
          elapsed_seconds: -5, // clock drift
          order_source: null, terminal_id: null,
          order_timestamp: null, terminal_name: null, course_name: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          ticket_id: 'ticket-1', id: 'item-1', order_line_id: 'line-1',
          item_name: 'Burger', kitchen_label: null, item_color: null,
          modifier_summary: null, special_instructions: null,
          seat_number: null, course_name: null, quantity: '1',
          item_status: 'pending', station_id: 'station-1',
          priority_level: 0, estimated_prep_seconds: null,
          routing_rule_id: null,
          is_rush: false, is_allergy: false, is_vip: false,
          started_at: null, ready_at: null, bumped_by: null,
          elapsed_seconds: -3, // clock drift on item too
        },
      ]);

    mockWithTenant.mockImplementationOnce(
      async (_tenantId: string, fn: (tx: unknown) => unknown) =>
        fn(createMockTx(STATION_FIXTURE, mockExecute)),
    );
    setupTier2Mock();

    const result = await getKdsView(DEFAULT_INPUT);

    // Negative elapsed clamped to 0
    expect(result.tickets[0]?.elapsedSeconds).toBe(0);
    expect(result.tickets[0]?.items[0]?.elapsedSeconds).toBe(0);
    // Alert level should be 'normal' (0 < 480)
    expect(result.tickets[0]?.alertLevel).toBe('normal');
  });

  it('handles null/undefined DB values with safe defaults', async () => {
    // Station with null displayName (falls back to name)
    const nullDisplayStation = {
      ...STATION_FIXTURE,
      displayName: null as string | null,
    };
    mockExecute
      .mockResolvedValueOnce([
        {
          id: 'ticket-1', ticket_number: null, tab_id: null, // retail: null tab_id
          course_number: null, status: null, priority_level: null,
          is_held: null, order_type: null, channel: null,
          table_number: null, server_name: null, customer_name: null,
          sent_at: null, estimated_pickup_at: null, business_date: null,
          elapsed_seconds: null,
          order_source: null, terminal_id: null,
          order_timestamp: null, terminal_name: null, course_name: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          ticket_id: 'ticket-1', id: 'item-1', order_line_id: 'line-1',
          item_name: null, kitchen_label: null, item_color: null,
          modifier_summary: null, special_instructions: null,
          seat_number: null, course_name: null, quantity: null,
          item_status: null, station_id: null,
          priority_level: null, estimated_prep_seconds: null,
          routing_rule_id: null,
          is_rush: null, is_allergy: null, is_vip: null, // null booleans
          started_at: null, ready_at: null, bumped_by: null,
          elapsed_seconds: null,
        },
      ]);

    mockWithTenant.mockImplementationOnce(
      async (_tenantId: string, fn: (tx: unknown) => unknown) =>
        fn(createMockTx(nullDisplayStation, mockExecute)),
    );
    setupTier2Mock();

    const result = await getKdsView(DEFAULT_INPUT);

    // Station defaults
    expect(result.stationName).toBe('grill'); // falls back to name when displayName null
    expect(result.warningThresholdSeconds).toBe(480);
    expect(result.criticalThresholdSeconds).toBe(720);
    expect(result.rushMode).toBe(false);

    // Ticket defaults
    const ticket = result.tickets[0]!;
    expect(ticket.ticketNumber).toBe(0); // null → 0
    expect(ticket.tabId).toBe(''); // null → '' for retail orders
    expect(ticket.isHeld).toBe(false); // null → false via !!
    expect(ticket.elapsedSeconds).toBe(0); // null → 0, clamped

    // Item defaults
    const item = ticket.items[0]!;
    expect(item.itemName).toBe('Unknown Item'); // null → fallback
    expect(item.quantity).toBe(1); // null → 1 default
    expect(item.isRush).toBe(false); // null → false via !!
    expect(item.isAllergy).toBe(false);
    expect(item.isVip).toBe(false);
    expect(item.elapsedSeconds).toBe(0);

    // No NaN anywhere
    expect(Number.isNaN(ticket.ticketNumber)).toBe(false);
    expect(Number.isNaN(ticket.elapsedSeconds)).toBe(false);
    expect(Number.isNaN(item.quantity)).toBe(false);
    expect(Number.isNaN(item.elapsedSeconds)).toBe(false);
  });

  it('falls back servedTodayCount to 0 when served-today query fails', async () => {
    setupCoreDataMocks();

    // Tier 1
    mockWithTenant.mockImplementationOnce(
      async (_tenantId: string, fn: (tx: unknown) => unknown) =>
        fn(createMockTx(STATION_FIXTURE, mockExecute)),
    );
    // Tier 2: served fails
    setupTier2Mock({ failAt: 'served' });

    const result = await getKdsView(DEFAULT_INPUT);

    // Core tickets survive
    expect(result.tickets).toHaveLength(1);
    // Served count falls back to 0
    expect(result.servedTodayCount).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(
      '[kds] getKdsView: served-today query failed — showing 0',
      expect.objectContaining({ tenantId: 'tenant-1', stationId: 'station-1' }),
    );
  });

  it('applies cross-station data to ticket cards on success', async () => {
    setupCoreDataMocks();

    // Tier 1
    mockWithTenant.mockImplementationOnce(
      async (_tenantId: string, fn: (tx: unknown) => unknown) =>
        fn(createMockTx(STATION_FIXTURE, mockExecute)),
    );
    // Tier 2 with cross-station data
    setupTier2Mock({
      crossStationOther: [
        { ticket_id: 'ticket-1', station_id: 'station-2', station_name: 'Fryer' },
      ],
      crossStationProgress: [
        { ticket_id: 'ticket-1', total_order_items: 3, ready_order_items: 1 },
      ],
    });

    const result = await getKdsView(DEFAULT_INPUT);

    const ticket = result.tickets[0]!;
    // Cross-station "Also At" populated
    expect(ticket.otherStations).toEqual([
      { stationId: 'station-2', stationName: 'Fryer' },
    ]);
    // Cross-station progress overrides station-local counts
    expect(ticket.totalOrderItems).toBe(3);
    expect(ticket.totalOrderReadyItems).toBe(1);
    // Station-local counts unchanged
    expect(ticket.stationItemCount).toBe(1);
    expect(ticket.stationReadyCount).toBe(0);
  });
});
