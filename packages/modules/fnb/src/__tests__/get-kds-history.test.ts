import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockExecute = vi.fn();
const mockWithTenant = vi.fn();

vi.mock('@oppsera/db', () => {
  const col = (name: string) => ({ name });
  const table = (tableName: string) =>
    new Proxy(
      { _: { name: tableName } },
      { get: (_t, prop) => (prop === '_' ? _t._ : col(`${tableName}.${String(prop)}`)) },
    );
  return {
    withTenant: (...args: unknown[]) => mockWithTenant(...args),
    fnbKitchenStations: table('fnb_kitchen_stations'),
  };
});

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    { join: vi.fn((values: unknown[]) => values) },
  ),
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock('@oppsera/core/observability', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getKdsHistory } from '../queries/get-kds-history';

// ── Fixtures ───────────────────────────────────────────────────────

const STATION_FIXTURE = {
  id: 'station-1',
  name: 'grill',
  displayName: 'Grill',
  stationType: 'grill',
};

const DEFAULT_INPUT = {
  tenantId: 'tenant-1',
  stationId: 'station-1',
  locationId: 'loc-1',
  businessDate: '2026-03-13',
};

/** One completed ticket (served) with two items (one served, one ready). */
const TICKET_ROW = {
  id: 'ticket-1',
  ticket_number: 101,
  tab_id: 'tab-1',
  course_number: 1,
  status: 'served',
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
  elapsed_seconds: 600,
  completed_at: '2026-03-13T12:10:00Z',
  order_source: 'pos',
  terminal_id: 'term-1',
  order_timestamp: '2026-03-13T11:59:00Z',
  terminal_name: 'Bar POS 1',
  course_name: 'Entrees',
};

const ITEM_ROWS = [
  {
    ticket_id: 'ticket-1',
    id: 'item-1',
    order_line_id: 'line-1',
    item_name: 'Grilled Atlantic Salmon',
    kitchen_label: null,
    item_color: null,
    modifier_summary: 'No Dill',
    special_instructions: null,
    seat_number: 1,
    course_name: 'Entrees',
    quantity: '1',
    item_status: 'served',
    station_id: 'station-1',
    priority_level: 0,
    estimated_prep_seconds: null,
    routing_rule_id: null,
    is_rush: false,
    is_allergy: false,
    is_vip: false,
    started_at: '2026-03-13T12:01:00Z',
    ready_at: '2026-03-13T12:08:00Z',
    bumped_by: 'user-1',
    elapsed_seconds: 540,
  },
  {
    ticket_id: 'ticket-1',
    id: 'item-2',
    order_line_id: 'line-2',
    item_name: 'Caesar Salad',
    kitchen_label: null,
    item_color: null,
    modifier_summary: null,
    special_instructions: 'Extra croutons',
    seat_number: 2,
    course_name: 'Entrees',
    quantity: '1',
    item_status: 'ready',
    station_id: 'station-1',
    priority_level: 0,
    estimated_prep_seconds: null,
    routing_rule_id: null,
    is_rush: false,
    is_allergy: true,
    is_vip: false,
    started_at: '2026-03-13T12:01:00Z',
    ready_at: '2026-03-13T12:07:00Z',
    bumped_by: 'user-1',
    elapsed_seconds: 480,
  },
];

// ── Helpers ────────────────────────────────────────────────────────

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

function setupStandardMocks(
  ticketRows: Record<string, unknown>[] = [TICKET_ROW],
  itemRows: Record<string, unknown>[] = ITEM_ROWS,
) {
  mockExecute
    .mockResolvedValueOnce(ticketRows)  // CTE ticket query
    .mockResolvedValueOnce(itemRows);   // Batch item fetch
  mockWithTenant.mockImplementationOnce(
    async (_tenantId: string, fn: (tx: unknown) => unknown) =>
      fn(createMockTx(STATION_FIXTURE, mockExecute)),
  );
}

// ── Tests ──────────────────────────────────────────────────────────

describe('getKdsHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns completed tickets with full item details', async () => {
    setupStandardMocks();

    const result = await getKdsHistory(DEFAULT_INPUT);

    expect(result.stationId).toBe('station-1');
    expect(result.stationName).toBe('Grill');
    expect(result.stationType).toBe('grill');
    expect(result.tickets).toHaveLength(1);
    expect(result.totalCount).toBe(1);

    const ticket = result.tickets[0]!;
    expect(ticket.ticketId).toBe('ticket-1');
    expect(ticket.ticketNumber).toBe(101);
    expect(ticket.status).toBe('served');
    expect(ticket.tableNumber).toBe(23);
    expect(ticket.serverName).toBe('Jason');
    expect(ticket.orderType).toBe('dine_in');
    expect(ticket.items).toHaveLength(2);

    // First item
    expect(ticket.items[0]?.itemName).toBe('Grilled Atlantic Salmon');
    expect(ticket.items[0]?.itemStatus).toBe('served');
    expect(ticket.items[0]?.modifierSummary).toBe('No Dill');

    // Second item
    expect(ticket.items[1]?.itemName).toBe('Caesar Salad');
    expect(ticket.items[1]?.itemStatus).toBe('ready');
    expect(ticket.items[1]?.isAllergy).toBe(true);
    expect(ticket.items[1]?.specialInstructions).toBe('Extra croutons');
  });

  it('computes stationItemCount and stationReadyCount correctly', async () => {
    // 2 items: 1 served + 1 ready = 2 non-voided, 2 ready/served
    setupStandardMocks();

    const result = await getKdsHistory(DEFAULT_INPUT);
    const ticket = result.tickets[0]!;

    expect(ticket.stationItemCount).toBe(2);  // non-voided
    expect(ticket.stationReadyCount).toBe(2); // ready + served
  });

  it('excludes voided items from stationItemCount', async () => {
    const itemsWithVoided = [
      ...ITEM_ROWS,
      {
        ...ITEM_ROWS[0],
        id: 'item-3',
        order_line_id: 'line-3',
        item_name: 'Voided Steak',
        item_status: 'voided',
      },
    ];
    setupStandardMocks([TICKET_ROW], itemsWithVoided);

    const result = await getKdsHistory(DEFAULT_INPUT);
    const ticket = result.tickets[0]!;

    expect(ticket.items).toHaveLength(3);        // all items returned
    expect(ticket.stationItemCount).toBe(2);     // voided excluded
    expect(ticket.stationReadyCount).toBe(2);    // voided excluded
  });

  it('returns empty tickets array when no completed tickets exist', async () => {
    mockExecute.mockResolvedValueOnce([]);  // No tickets
    mockWithTenant.mockImplementationOnce(
      async (_tenantId: string, fn: (tx: unknown) => unknown) =>
        fn(createMockTx(STATION_FIXTURE, mockExecute)),
    );

    const result = await getKdsHistory(DEFAULT_INPUT);

    expect(result.stationId).toBe('station-1');
    expect(result.stationName).toBe('Grill');
    expect(result.tickets).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  it('throws StationNotFoundError for missing station', async () => {
    mockWithTenant.mockImplementationOnce(
      async (_tenantId: string, fn: (tx: unknown) => unknown) =>
        fn(createMockTx(null, mockExecute)),
    );

    await expect(getKdsHistory(DEFAULT_INPUT)).rejects.toThrow('Kitchen station');
  });

  it('throws ExpoStationError for expo stations', async () => {
    const expoStation = { ...STATION_FIXTURE, stationType: 'expo' };
    mockWithTenant.mockImplementationOnce(
      async (_tenantId: string, fn: (tx: unknown) => unknown) =>
        fn(createMockTx(expoStation, mockExecute)),
    );

    await expect(getKdsHistory(DEFAULT_INPUT)).rejects.toThrow();
  });

  it('throws when locationId is empty', async () => {
    await expect(
      getKdsHistory({ ...DEFAULT_INPUT, locationId: '' }),
    ).rejects.toThrow();
  });

  it('sets alertLevel to normal for all history tickets', async () => {
    setupStandardMocks();

    const result = await getKdsHistory(DEFAULT_INPUT);

    // History tickets should always be 'normal' — no aging alerts
    expect(result.tickets[0]?.alertLevel).toBe('normal');
  });

  it('clamps negative elapsed_seconds to 0 (clock drift)', async () => {
    const driftTicket = { ...TICKET_ROW, elapsed_seconds: -10 };
    const driftItems = ITEM_ROWS.map((i) => ({ ...i, elapsed_seconds: -5 }));
    setupStandardMocks([driftTicket], driftItems);

    const result = await getKdsHistory(DEFAULT_INPUT);

    expect(result.tickets[0]?.elapsedSeconds).toBe(0);
    expect(result.tickets[0]?.items[0]?.elapsedSeconds).toBe(0);
    expect(result.tickets[0]?.items[1]?.elapsedSeconds).toBe(0);
  });

  it('handles null DB values with safe defaults', async () => {
    const nullStation = { ...STATION_FIXTURE, displayName: null as string | null };
    const nullTicket = {
      id: 'ticket-1', ticket_number: null, tab_id: null,
      course_number: null, status: null, priority_level: null,
      is_held: null, order_type: null, channel: null,
      table_number: null, server_name: null, customer_name: null,
      sent_at: null, estimated_pickup_at: null, business_date: null,
      elapsed_seconds: null, completed_at: null,
      order_source: null, terminal_id: null,
      order_timestamp: null, terminal_name: null, course_name: null,
    };
    const nullItem = {
      ticket_id: 'ticket-1', id: 'item-1', order_line_id: 'line-1',
      item_name: null, kitchen_label: null, item_color: null,
      modifier_summary: null, special_instructions: null,
      seat_number: null, course_name: null, quantity: null,
      item_status: null, station_id: null,
      priority_level: null, estimated_prep_seconds: null,
      routing_rule_id: null,
      is_rush: null, is_allergy: null, is_vip: null,
      started_at: null, ready_at: null, bumped_by: null,
      elapsed_seconds: null,
    };

    mockExecute
      .mockResolvedValueOnce([nullTicket])
      .mockResolvedValueOnce([nullItem]);
    mockWithTenant.mockImplementationOnce(
      async (_tenantId: string, fn: (tx: unknown) => unknown) =>
        fn(createMockTx(nullStation, mockExecute)),
    );

    const result = await getKdsHistory(DEFAULT_INPUT);

    // Station falls back to name when displayName is null
    expect(result.stationName).toBe('grill');

    const ticket = result.tickets[0]!;
    expect(ticket.ticketNumber).toBe(0);
    expect(ticket.tabId).toBe('');
    expect(ticket.isHeld).toBe(false);
    expect(ticket.elapsedSeconds).toBe(0);
    expect(ticket.alertLevel).toBe('normal');

    const item = ticket.items[0]!;
    expect(item.itemName).toBe('Unknown Item');
    expect(item.quantity).toBe(1);
    expect(item.isRush).toBe(false);
    expect(item.isAllergy).toBe(false);
    expect(item.isVip).toBe(false);
    expect(item.elapsedSeconds).toBe(0);

    // No NaN anywhere
    expect(Number.isNaN(ticket.ticketNumber)).toBe(false);
    expect(Number.isNaN(ticket.elapsedSeconds)).toBe(false);
    expect(Number.isNaN(item.quantity)).toBe(false);
    expect(Number.isNaN(item.elapsedSeconds)).toBe(false);
  });

  it('builds courseGroups from items with courseName', async () => {
    // Two items in the same course, both served
    const courseItems = [
      { ...ITEM_ROWS[0], course_name: 'Appetizers', item_status: 'served' },
      { ...ITEM_ROWS[1], course_name: 'Appetizers', item_status: 'ready' },
    ];
    setupStandardMocks([TICKET_ROW], courseItems);

    const result = await getKdsHistory(DEFAULT_INPUT);
    const ticket = result.tickets[0]!;

    expect(ticket.courseGroups).toHaveLength(1);
    expect(ticket.courseGroups[0]?.courseName).toBe('Appetizers');
    expect(ticket.courseGroups[0]?.itemCount).toBe(2);
    expect(ticket.courseGroups[0]?.readyCount).toBe(2); // ready + served both count
    expect(ticket.courseGroups[0]?.allReady).toBe(true);
  });

  it('handles multiple tickets ordered by completion time', async () => {
    const ticket1 = { ...TICKET_ROW, id: 'ticket-1', ticket_number: 101 };
    const ticket2 = { ...TICKET_ROW, id: 'ticket-2', ticket_number: 102, table_number: 5 };
    const items = [
      { ...ITEM_ROWS[0], ticket_id: 'ticket-1' },
      { ...ITEM_ROWS[0], ticket_id: 'ticket-2', id: 'item-3', order_line_id: 'line-3' },
    ];
    setupStandardMocks([ticket1, ticket2], items);

    const result = await getKdsHistory(DEFAULT_INPUT);

    expect(result.tickets).toHaveLength(2);
    expect(result.totalCount).toBe(2);
    expect(result.tickets[0]?.ticketId).toBe('ticket-1');
    expect(result.tickets[1]?.ticketId).toBe('ticket-2');
    expect(result.tickets[1]?.tableNumber).toBe(5);
  });

  it('skips batch item fetch when no tickets found', async () => {
    mockExecute.mockResolvedValueOnce([]);  // No tickets
    mockWithTenant.mockImplementationOnce(
      async (_tenantId: string, fn: (tx: unknown) => unknown) =>
        fn(createMockTx(STATION_FIXTURE, mockExecute)),
    );

    await getKdsHistory(DEFAULT_INPUT);

    // Only 1 execute call (ticket CTE), no item fetch
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('returns ticket with empty items array when item fetch returns nothing', async () => {
    mockExecute
      .mockResolvedValueOnce([TICKET_ROW])  // One ticket
      .mockResolvedValueOnce([]);            // No items (shouldn't happen but guard)
    mockWithTenant.mockImplementationOnce(
      async (_tenantId: string, fn: (tx: unknown) => unknown) =>
        fn(createMockTx(STATION_FIXTURE, mockExecute)),
    );

    const result = await getKdsHistory(DEFAULT_INPUT);

    expect(result.tickets).toHaveLength(1);
    expect(result.tickets[0]?.items).toEqual([]);
    expect(result.tickets[0]?.stationItemCount).toBe(0);
    expect(result.tickets[0]?.stationReadyCount).toBe(0);
  });
});
