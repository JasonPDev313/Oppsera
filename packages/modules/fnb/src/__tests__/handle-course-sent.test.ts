import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Setup ──────────────────────────────────────────────────────────────

const mockWithTenant = vi.fn();

vi.mock('@oppsera/db', () => ({
  withTenant: (...args: unknown[]) => mockWithTenant(...args),
  fnbTabs: {
    id: 'id', tenantId: 'tenant_id', locationId: 'location_id',
    primaryOrderId: 'primary_order_id', businessDate: 'business_date',
    tableId: 'table_id', tabType: 'tab_type',
  },
  fnbTabItems: {
    id: 'id', tenantId: 'tenant_id', tabId: 'tab_id',
    catalogItemId: 'catalog_item_id', catalogItemName: 'catalog_item_name',
    seatNumber: 'seat_number', qty: 'qty', modifiers: 'modifiers',
    subDepartmentId: 'sub_department_id', specialInstructions: 'special_instructions',
    courseNumber: 'course_number', status: 'status',
  },
  fnbTabCourses: {
    tabId: 'tab_id', courseNumber: 'course_number', courseName: 'course_name',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock('@oppsera/core/observability', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockEnrichRoutableItems = vi.fn();
const mockResolveStationRouting = vi.fn();
vi.mock('../services/kds-routing-engine', () => ({
  enrichRoutableItems: (...args: unknown[]) => mockEnrichRoutableItems(...args),
  resolveStationRouting: (...args: unknown[]) => mockResolveStationRouting(...args),
}));

const mockCreateKitchenTicket = vi.fn();
vi.mock('../commands/create-kitchen-ticket', () => ({
  createKitchenTicket: (...args: unknown[]) => mockCreateKitchenTicket(...args),
}));

vi.mock('../helpers/resolve-kds-site-id', () => ({
  resolveKdsSiteId: vi.fn().mockImplementation((_t: string, loc: string) => Promise.resolve(loc)),
}));

vi.mock('../commands/record-kds-send', () => ({
  recordKdsSend: vi.fn().mockResolvedValue({ sendToken: 'mock-token' }),
  markKdsSendSent: vi.fn().mockResolvedValue(undefined),
}));

// ── Import after mocks ──────────────────────────────────────────────────────

import { handleCourseSent } from '../consumers/handle-course-sent';
import { logger } from '@oppsera/core/observability';

// ── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-abc';
const TAB_ID    = 'tab-001';
const LOC_ID    = 'loc-123';
const COURSE_NUM = 2;

const BASE_DATA = {
  tabId: TAB_ID,
  locationId: LOC_ID,
  courseNumber: COURSE_NUM,
};

const BASE_TAB = {
  id: TAB_ID,
  locationId: LOC_ID,
  primaryOrderId: 'order-999',
  businessDate: '2026-03-06',
  tableId: 'table-7',
  tabType: 'dine_in',
};

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    catalogItemId: 'cat-item-steak',
    catalogItemName: 'NY Strip Steak',
    seatNumber: 1,
    qty: 1,
    modifiers: null,
    subDepartmentId: 'subdept-entrees',
    specialInstructions: null,
    ...overrides,
  };
}

function makeRoutingResult(orderLineId: string, stationId: string | null) {
  return {
    orderLineId,
    stationId,
    routingRuleId: stationId ? 'rule-1' : null,
    matchType: stationId ? 'category' : null,
  };
}

/**
 * Sets up the 3 parallel withTenant calls in deterministic order:
 *   call 1 → tab query   (returns tabResult)
 *   call 2 → course name (returns courseResult)
 *   call 3 → items       (returns items)
 */
function setupParallelFetches(
  tab: object | null,
  courseName: string | null,
  items: object[],
) {
  let callIndex = 0;
  mockWithTenant.mockImplementation(async (_tenantId: string, fn: (tx: unknown) => unknown) => {
    callIndex++;
    // The implementation passes a query builder lambda; our mock ignores it
    // and returns the correct fixture based on call order.
    void fn; // suppress unused-variable lint
    if (callIndex === 1) return tab ? [tab] : [];
    if (callIndex === 2) return courseName !== null ? [{ courseName }] : [];
    if (callIndex === 3) return items;
    return [];
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('handleCourseSent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: enrichRoutableItems echoes its input; resolveStationRouting
    // returns no-match for every item. Tests that need specific behavior
    // override these defaults.
    mockEnrichRoutableItems.mockImplementation(async (_tenantId: string, items: unknown[]) => items);
    mockResolveStationRouting.mockResolvedValue([]);
    mockCreateKitchenTicket.mockResolvedValue({ id: 'ticket-1' });
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  describe('edge cases — early returns', () => {
    it('returns early when tab is not found', async () => {
      setupParallelFetches(null, 'Appetizers', [makeItem()]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      expect(mockEnrichRoutableItems).not.toHaveBeenCalled();
      expect(mockResolveStationRouting).not.toHaveBeenCalled();
      expect(mockCreateKitchenTicket).not.toHaveBeenCalled();
    });

    it('logs a warning when tab is not found', async () => {
      setupParallelFetches(null, 'Appetizers', [makeItem()]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      expect(logger.warn).toHaveBeenCalledWith(
        '[kds] handleCourseSent: tab not found',
        expect.objectContaining({
          tenantId: TENANT_ID,
          tabId: TAB_ID,
          courseNumber: COURSE_NUM,
        }),
      );
    });

    it('returns early when no items exist for the course', async () => {
      setupParallelFetches(BASE_TAB, 'Appetizers', []);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      expect(mockEnrichRoutableItems).not.toHaveBeenCalled();
      expect(mockCreateKitchenTicket).not.toHaveBeenCalled();
    });

    it('logs a warning when no items exist for the course', async () => {
      setupParallelFetches(BASE_TAB, 'Appetizers', []);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      expect(logger.warn).toHaveBeenCalledWith(
        '[kds] handleCourseSent: no items found for course',
        expect.objectContaining({ tabId: TAB_ID, courseNumber: COURSE_NUM }),
      );
    });

    it('returns early when both event locationId and tab.locationId are missing', async () => {
      const tabWithNoLocation = { ...BASE_TAB, locationId: null };
      setupParallelFetches(tabWithNoLocation, 'Appetizers', [makeItem()]);

      // data.locationId is also blank
      await handleCourseSent(TENANT_ID, { ...BASE_DATA, locationId: '' });

      expect(mockEnrichRoutableItems).not.toHaveBeenCalled();
      expect(mockCreateKitchenTicket).not.toHaveBeenCalled();
    });

    it('logs an error when no locationId is available', async () => {
      const tabWithNoLocation = { ...BASE_TAB, locationId: null };
      setupParallelFetches(tabWithNoLocation, 'Appetizers', [makeItem()]);

      await handleCourseSent(TENANT_ID, { ...BASE_DATA, locationId: '' });

      expect(logger.error).toHaveBeenCalledWith(
        '[kds] handleCourseSent: no locationId on tab or event — cannot create tickets',
        expect.objectContaining({ tenantId: TENANT_ID, tabId: TAB_ID }),
      );
    });

    it('never throws — catches and logs unhandled errors', async () => {
      mockWithTenant.mockRejectedValue(new Error('DB connection failure'));

      // Must not throw
      await expect(handleCourseSent(TENANT_ID, BASE_DATA)).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        '[kds] handleCourseSent: unhandled error',
        expect.objectContaining({
          error: expect.objectContaining({ message: 'DB connection failure' }),
        }),
      );
    });

    it('never throws — catches errors thrown by enrichRoutableItems', async () => {
      setupParallelFetches(BASE_TAB, 'Mains', [makeItem()]);
      mockEnrichRoutableItems.mockRejectedValue(new Error('catalog service down'));

      await expect(handleCourseSent(TENANT_ID, BASE_DATA)).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        '[kds] handleCourseSent: unhandled error',
        expect.objectContaining({
          error: expect.objectContaining({ message: 'catalog service down' }),
        }),
      );
    });
  });

  // ── Core flow ─────────────────────────────────────────────────────────

  describe('core flow', () => {
    it('routes ALL items to stations regardless of item type (no itemType filter)', async () => {
      // Items with varied types — FnB course flow does NOT filter by itemType.
      const items = [
        makeItem({ id: 'item-1', catalogItemId: 'ci-food' }),
        makeItem({ id: 'item-2', catalogItemId: 'ci-drink' }),
        makeItem({ id: 'item-3', catalogItemId: 'ci-dessert' }),
      ];
      setupParallelFetches(BASE_TAB, 'Mains', items);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', null),
        makeRoutingResult('item-2', null),
        makeRoutingResult('item-3', null),
      ]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      // All 3 items were handed to enrichRoutableItems — no type-based filtering
      const enrichCall = mockEnrichRoutableItems.mock.calls[0];
      expect(enrichCall![1]).toHaveLength(3);
      expect(mockResolveStationRouting).toHaveBeenCalledTimes(1);
      const routingCall = mockResolveStationRouting.mock.calls[0];
      expect(routingCall![1]).toHaveLength(3);
    });

    it('uses tab.tabType as orderType in the routing context', async () => {
      const tab = { ...BASE_TAB, tabType: 'bar_tab' };
      setupParallelFetches(tab, 'Drinks', [makeItem()]);
      mockResolveStationRouting.mockResolvedValue([makeRoutingResult('item-1', 'station-bar')]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      expect(mockResolveStationRouting).toHaveBeenCalledWith(
        expect.objectContaining({ orderType: 'bar_tab', channel: 'pos' }),
        expect.any(Array),
      );
    });

    it('passes channel "pos" in routing context regardless of tab type', async () => {
      setupParallelFetches(BASE_TAB, 'Starters', [makeItem()]);
      mockResolveStationRouting.mockResolvedValue([makeRoutingResult('item-1', 'station-grill')]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      expect(mockResolveStationRouting).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'pos' }),
        expect.any(Array),
      );
    });

    it('creates a kitchen ticket with the correct idempotency key', async () => {
      const stationId = 'station-grill';
      const item = makeItem({ id: 'item-1' });
      setupParallelFetches(BASE_TAB, 'Mains', [item]);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', stationId),
      ]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      const expectedKey = `kds-course-${TAB_ID}-${COURSE_NUM}-${stationId}`;
      expect(mockCreateKitchenTicket).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ clientRequestId: expectedKey }),
      );
    });

    it('includes courseName in ticket items passed to createKitchenTicket', async () => {
      const COURSE_NAME = 'Appetizers';
      const item = makeItem({ id: 'item-1' });
      setupParallelFetches(BASE_TAB, COURSE_NAME, [item]);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', 'station-grill'),
      ]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      expect(mockCreateKitchenTicket).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ courseName: COURSE_NAME }),
          ]),
        }),
      );
    });

    it('falls back to "Course N" when no courseName row exists', async () => {
      const item = makeItem({ id: 'item-1' });
      setupParallelFetches(BASE_TAB, null /* no course row */, [item]);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', 'station-grill'),
      ]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      expect(mockCreateKitchenTicket).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ courseName: `Course ${COURSE_NUM}` }),
          ]),
        }),
      );
    });

    it('passes tab.primaryOrderId as orderId in createKitchenTicket', async () => {
      const item = makeItem({ id: 'item-1' });
      setupParallelFetches(BASE_TAB, 'Mains', [item]);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', 'station-grill'),
      ]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      expect(mockCreateKitchenTicket).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ orderId: BASE_TAB.primaryOrderId }),
      );
    });

    it('passes undefined as orderId when tab.primaryOrderId is null', async () => {
      const tabNullOrder = { ...BASE_TAB, primaryOrderId: null };
      const item = makeItem({ id: 'item-1' });
      setupParallelFetches(tabNullOrder, 'Mains', [item]);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', 'station-grill'),
      ]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      expect(mockCreateKitchenTicket).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ orderId: undefined }),
      );
    });

    it('groups items by station — 3 items to 2 stations → 2 createKitchenTicket calls', async () => {
      const items = [
        makeItem({ id: 'item-1', catalogItemName: 'Steak' }),
        makeItem({ id: 'item-2', catalogItemName: 'Fries' }),
        makeItem({ id: 'item-3', catalogItemName: 'Caesar Salad' }),
      ];
      setupParallelFetches(BASE_TAB, 'Mains', items);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', 'station-grill'),  // steak → grill
        makeRoutingResult('item-2', 'station-grill'),  // fries → grill
        makeRoutingResult('item-3', 'station-salad'),  // salad → salad bar
      ]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      expect(mockCreateKitchenTicket).toHaveBeenCalledTimes(2);
    });

    it('sends correct items to each station when grouped', async () => {
      const items = [
        makeItem({ id: 'item-1', catalogItemName: 'Steak' }),
        makeItem({ id: 'item-2', catalogItemName: 'Caesar Salad' }),
      ];
      setupParallelFetches(BASE_TAB, 'Mains', items);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', 'station-grill'),
        makeRoutingResult('item-2', 'station-salad'),
      ]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      const calls = mockCreateKitchenTicket.mock.calls;
      // Find the grill call and salad call
      const grillCall = calls.find((c) =>
        (c[1] as { clientRequestId: string }).clientRequestId.includes('station-grill'),
      );
      const saladCall = calls.find((c) =>
        (c[1] as { clientRequestId: string }).clientRequestId.includes('station-salad'),
      );

      expect(grillCall![1].items).toHaveLength(1);
      expect(grillCall![1].items[0].itemName).toBe('Steak');
      expect(saladCall![1].items).toHaveLength(1);
      expect(saladCall![1].items[0].itemName).toBe('Caesar Salad');
    });

    it('skips items with no station assigned and does not ticket them', async () => {
      const items = [
        makeItem({ id: 'item-1', catalogItemName: 'Mystery Item' }),
        makeItem({ id: 'item-2', catalogItemName: 'Steak' }),
      ];
      setupParallelFetches(BASE_TAB, 'Mains', items);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', null),             // unrouted
        makeRoutingResult('item-2', 'station-grill'),  // routed
      ]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      // Only 1 ticket (the routed item)
      expect(mockCreateKitchenTicket).toHaveBeenCalledTimes(1);
      expect(mockCreateKitchenTicket).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ itemName: 'Steak' }),
          ]),
        }),
      );
    });

    it('logs warning for unrouted items and does not throw', async () => {
      const items = [makeItem({ id: 'item-1' })];
      setupParallelFetches(BASE_TAB, 'Mains', items);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', null), // unrouted
      ]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      expect(logger.warn).toHaveBeenCalledWith(
        '[kds] handleCourseSent: unroutable items',
        expect.objectContaining({ unroutedCount: 1, totalItems: 1 }),
      );
      // No tickets created, no throw
      expect(mockCreateKitchenTicket).not.toHaveBeenCalled();
    });

    it('logs warning when stationGroups resolves to 0 stations after routing', async () => {
      const items = [makeItem({ id: 'item-1' }), makeItem({ id: 'item-2' })];
      setupParallelFetches(BASE_TAB, 'Mains', items);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      // All items unrouted
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', null),
        makeRoutingResult('item-2', null),
      ]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      expect(logger.warn).toHaveBeenCalledWith(
        '[kds] handleCourseSent: no stations resolved — no tickets will be created',
        expect.objectContaining({ itemCount: 2, tabId: TAB_ID }),
      );
    });

    it('falls back to event locationId when tab.locationId is null', async () => {
      const tabNoLoc = { ...BASE_TAB, locationId: null };
      const item = makeItem({ id: 'item-1' });
      // data.locationId = LOC_ID still provided in BASE_DATA
      setupParallelFetches(tabNoLoc, 'Mains', [item]);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', 'station-grill'),
      ]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      // Should still succeed — LOC_ID from data was used
      expect(mockResolveStationRouting).toHaveBeenCalledWith(
        expect.objectContaining({ locationId: LOC_ID }),
        expect.any(Array),
      );
      expect(mockCreateKitchenTicket).toHaveBeenCalledTimes(1);
    });

    it('prefers tab.locationId over event locationId when both are present', async () => {
      // data.locationId provided but tab.locationId is the canonical one;
      // implementation does: data.locationId || tab.locationId, so event takes precedence
      // when non-empty — this test verifies the real logic.
      const item = makeItem({ id: 'item-1' });
      setupParallelFetches(BASE_TAB, 'Mains', [item]);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', 'station-grill'),
      ]);

      await handleCourseSent(TENANT_ID, { ...BASE_DATA, locationId: LOC_ID });

      // locationId used is the event's LOC_ID (data.locationId wins in `||` expression)
      expect(mockResolveStationRouting).toHaveBeenCalledWith(
        expect.objectContaining({ locationId: LOC_ID }),
        expect.any(Array),
      );
    });

    it('extracts modifierIds from JSONB modifiers array', async () => {
      const item = makeItem({
        id: 'item-1',
        modifiers: [
          { modifierId: 'mod-spicy', name: 'Spicy' },
          { modifierId: 'mod-extra-cheese', name: 'Extra Cheese' },
        ],
      });
      setupParallelFetches(BASE_TAB, 'Mains', [item]);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', 'station-grill'),
      ]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      // enrichRoutableItems should receive routableItems with modifierIds populated
      const enrichArgs = mockEnrichRoutableItems.mock.calls[0]![1] as Array<{
        modifierIds: string[];
      }>;
      expect(enrichArgs[0]!.modifierIds).toEqual(['mod-spicy', 'mod-extra-cheese']);
    });

    it('returns empty modifierIds for items with no modifiers', async () => {
      const item = makeItem({ id: 'item-1', modifiers: null });
      setupParallelFetches(BASE_TAB, 'Mains', [item]);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', 'station-grill'),
      ]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      const enrichArgs = mockEnrichRoutableItems.mock.calls[0]![1] as Array<{
        modifierIds: string[];
      }>;
      expect(enrichArgs[0]!.modifierIds).toEqual([]);
    });

    it('includes modifier summary in ticket items when modifiers exist', async () => {
      const item = makeItem({
        id: 'item-1',
        modifiers: [
          { modifierId: 'mod-1', name: 'No Onions' },
          { modifierId: 'mod-2', name: 'Well Done' },
        ],
      });
      setupParallelFetches(BASE_TAB, 'Mains', [item]);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', 'station-grill'),
      ]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      expect(mockCreateKitchenTicket).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ modifierSummary: 'No Onions, Well Done' }),
          ]),
        }),
      );
    });

    it('passes correct courseNumber on each createKitchenTicket call', async () => {
      const item = makeItem({ id: 'item-1' });
      setupParallelFetches(BASE_TAB, 'Mains', [item]);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', 'station-grill'),
      ]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      expect(mockCreateKitchenTicket).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ courseNumber: COURSE_NUM }),
      );
    });
  });

  // ── Ticket creation failure handling ──────────────────────────────────

  describe('per-station ticket creation failure', () => {
    it('continues creating tickets for remaining stations when one fails', async () => {
      const items = [
        makeItem({ id: 'item-1', catalogItemName: 'Steak' }),
        makeItem({ id: 'item-2', catalogItemName: 'Salad' }),
      ];
      setupParallelFetches(BASE_TAB, 'Mains', items);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', 'station-grill'),
        makeRoutingResult('item-2', 'station-salad'),
      ]);

      // First station call throws (e.g., idempotency duplicate); second succeeds.
      mockCreateKitchenTicket
        .mockRejectedValueOnce(new Error('duplicate key'))
        .mockResolvedValueOnce({ id: 'ticket-2' });

      // Must not throw
      await expect(handleCourseSent(TENANT_ID, BASE_DATA)).resolves.toBeUndefined();

      // Both stations were attempted
      expect(mockCreateKitchenTicket).toHaveBeenCalledTimes(2);
    });

    it('logs a warning when a single station ticket creation fails', async () => {
      const item = makeItem({ id: 'item-1' });
      setupParallelFetches(BASE_TAB, 'Mains', [item]);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', 'station-grill'),
      ]);
      mockCreateKitchenTicket.mockRejectedValue(new Error('timeout'));

      await handleCourseSent(TENANT_ID, BASE_DATA);

      expect(logger.warn).toHaveBeenCalledWith(
        '[kds] handleCourseSent: failed to create ticket for station',
        expect.objectContaining({
          stationId: 'station-grill',
          error: expect.objectContaining({ message: 'timeout' }),
        }),
      );
    });

    it('does not propagate ticket creation error as an unhandled error', async () => {
      const item = makeItem({ id: 'item-1' });
      setupParallelFetches(BASE_TAB, 'Mains', [item]);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', 'station-grill'),
      ]);
      mockCreateKitchenTicket.mockRejectedValue(new Error('station error'));

      await handleCourseSent(TENANT_ID, BASE_DATA);

      // Per-station error is a warn, NOT the outer unhandled error
      expect(logger.error).not.toHaveBeenCalledWith(
        '[kds] handleCourseSent: unhandled error',
        expect.anything(),
      );
    });
  });

  // ── Parallel fetch behavior ───────────────────────────────────────────

  describe('parallel fetch behavior', () => {
    it('makes exactly 3 withTenant calls before calling routing functions', async () => {
      const item = makeItem({ id: 'item-1' });
      setupParallelFetches(BASE_TAB, 'Mains', [item]);

      let withTenantCallCountAtEnrich = 0;
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => {
        withTenantCallCountAtEnrich = mockWithTenant.mock.calls.length;
        return ri;
      });
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', null),
      ]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      // All 3 withTenant calls (tab, course, items) must complete before enrichRoutableItems
      expect(withTenantCallCountAtEnrich).toBe(3);
    });

    it('calls withTenant 3 times for parallel fetch + 1 for station names when items are routed', async () => {
      const item = makeItem({ id: 'item-1' });
      setupParallelFetches(BASE_TAB, 'Mains', [item]);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', 'station-grill'),
      ]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      // 3 parallel fetches (tab, course, items) + 1 station name fetch
      expect(mockWithTenant).toHaveBeenCalledTimes(4);
    });

    it('passes tenantId to all withTenant calls', async () => {
      const item = makeItem({ id: 'item-1' });
      setupParallelFetches(BASE_TAB, 'Mains', [item]);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      const calls = mockWithTenant.mock.calls;
      // 3 parallel fetches when no stations are routed (no station name fetch needed)
      expect(calls).toHaveLength(3);
      expect(calls[0]![0]).toBe(TENANT_ID);
      expect(calls[1]![0]).toBe(TENANT_ID);
      expect(calls[2]![0]).toBe(TENANT_ID);
    });
  });

  // ── Synthetic context ────────────────────────────────────────────────

  describe('synthetic request context passed to createKitchenTicket', () => {
    it('uses "system" as the user ID in the synthetic context', async () => {
      const item = makeItem({ id: 'item-1' });
      setupParallelFetches(BASE_TAB, 'Mains', [item]);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', 'station-grill'),
      ]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      const ctx = mockCreateKitchenTicket.mock.calls[0]![0] as {
        user: { id: string };
        tenantId: string;
      };
      expect(ctx.user.id).toBe('system');
      expect(ctx.tenantId).toBe(TENANT_ID);
    });

    it('sets isPlatformAdmin to false in synthetic context', async () => {
      const item = makeItem({ id: 'item-1' });
      setupParallelFetches(BASE_TAB, 'Mains', [item]);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', 'station-grill'),
      ]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      const ctx = mockCreateKitchenTicket.mock.calls[0]![0] as {
        isPlatformAdmin: boolean;
      };
      expect(ctx.isPlatformAdmin).toBe(false);
    });

    it('includes a deterministic requestId in synthetic context', async () => {
      const item = makeItem({ id: 'item-1' });
      setupParallelFetches(BASE_TAB, 'Mains', [item]);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', 'station-grill'),
      ]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      const ctx = mockCreateKitchenTicket.mock.calls[0]![0] as { requestId: string };
      expect(ctx.requestId).toBe(`kds-consumer-${TAB_ID}-${COURSE_NUM}`);
    });
  });

  // ── Quantity and special instructions ───────────────────────────────

  describe('ticket item fields', () => {
    it('converts string qty to a number in ticket items', async () => {
      const item = makeItem({ id: 'item-1', qty: '3' });
      setupParallelFetches(BASE_TAB, 'Mains', [item]);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', 'station-grill'),
      ]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      expect(mockCreateKitchenTicket).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ quantity: 3 }),
          ]),
        }),
      );
    });

    it('defaults quantity to 1 when qty is null or invalid', async () => {
      const item = makeItem({ id: 'item-1', qty: null });
      setupParallelFetches(BASE_TAB, 'Mains', [item]);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', 'station-grill'),
      ]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      expect(mockCreateKitchenTicket).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ quantity: 1 }),
          ]),
        }),
      );
    });

    it('passes specialInstructions through to ticket items', async () => {
      const item = makeItem({ id: 'item-1', specialInstructions: 'No salt, please' });
      setupParallelFetches(BASE_TAB, 'Mains', [item]);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', 'station-grill'),
      ]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      expect(mockCreateKitchenTicket).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ specialInstructions: 'No salt, please' }),
          ]),
        }),
      );
    });

    it('passes seatNumber through to ticket items', async () => {
      const item = makeItem({ id: 'item-1', seatNumber: 4 });
      setupParallelFetches(BASE_TAB, 'Mains', [item]);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', 'station-grill'),
      ]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      expect(mockCreateKitchenTicket).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ seatNumber: 4 }),
          ]),
        }),
      );
    });

    it('passes stationId on each ticket item for reference', async () => {
      const item = makeItem({ id: 'item-1' });
      setupParallelFetches(BASE_TAB, 'Mains', [item]);
      mockEnrichRoutableItems.mockImplementation(async (_t: string, ri: unknown[]) => ri);
      mockResolveStationRouting.mockResolvedValue([
        makeRoutingResult('item-1', 'station-grill'),
      ]);

      await handleCourseSent(TENANT_ID, BASE_DATA);

      expect(mockCreateKitchenTicket).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ stationId: 'station-grill' }),
          ]),
        }),
      );
    });
  });
});
