import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const mockGetItemForPOS = vi.fn();
  return {
    mockGetItemForPOS,
    publishWithOutbox: vi.fn(),
    buildEventFromContext: vi.fn(),
    checkIdempotency: vi.fn(),
    saveIdempotencyKey: vi.fn(),
  };
});

vi.mock('@oppsera/core/helpers/catalog-read-api', () => ({
  getCatalogReadApi: () => ({
    getItemForPOS: mocks.mockGetItemForPOS,
  }),
}));

vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
  publishWithOutbox: mocks.publishWithOutbox,
}));

vi.mock('@oppsera/core/events/build-event', () => ({
  buildEventFromContext: mocks.buildEventFromContext,
}));

vi.mock('@oppsera/core/audit/helpers', () => ({
  auditLogDeferred: vi.fn(),
}));

vi.mock('@oppsera/core/helpers/idempotency', () => ({
  checkIdempotency: mocks.checkIdempotency,
  saveIdempotencyKey: mocks.saveIdempotencyKey,
}));

vi.mock('@oppsera/core/observability', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@oppsera/db', () => ({
  fnbTabItems: {},
  fnbTabCourses: {},
  withTenant: vi.fn().mockResolvedValue([]),
}));

vi.mock('../helpers/resolve-course-rule', () => ({
  batchResolveCourseRules: vi.fn().mockResolvedValue({}),
}));

vi.mock('@oppsera/shared', () => ({
  AppError: class AppError extends Error {
    constructor(public code: string, msg: string, public statusCode: number) { super(msg); }
  },
  generateUlid: () => 'ulid-1',
}));

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ type: 'sql', strings, values }),
    { raw: (s: string) => ({ type: 'sql_raw', value: s }) },
  ),
}));

vi.mock('../events/types', () => ({
  FNB_EVENTS: { TAB_ITEMS_ADDED: 'fnb.tab.items_added.v1' },
}));

import { addTabItems } from '../commands/add-tab-items';

describe('addTabItems — catalog argument order', () => {
  const TENANT = 'tenant-1';
  const LOCATION = 'loc-1';

  const makeCtx = () => ({
    tenantId: TENANT,
    locationId: LOCATION,
    requestId: 'req-1',
    isPlatformAdmin: false,
    user: { id: 'user-1', email: 'test@test.com', role: 'cashier' as const, name: 'Test User', tenantId: TENANT, tenantStatus: 'active' as const, membershipStatus: 'none' },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // publishWithOutbox passes through to the callback
    mocks.publishWithOutbox.mockImplementation(async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn().mockResolvedValue([
          // Tab row
          { id: 'tab-1', status: 'open' },
        ]),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 'item-1' }]),
            onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      };
      // Mock: execute returns tab row, then course rows, then insert
      tx.execute
        .mockResolvedValueOnce([{ id: 'tab-1', status: 'open' }]) // tab lookup
        .mockResolvedValueOnce([{ course_number: 1 }]); // existing courses

      mocks.checkIdempotency.mockResolvedValue({ isDuplicate: false });
      mocks.buildEventFromContext.mockReturnValue({ eventType: 'test' });

      const result = await fn(tx);
      return (result as { result: unknown }).result;
    });

    mocks.mockGetItemForPOS.mockResolvedValue({
      id: 'catalog-item-1',
      subDepartmentId: 'subdept-1',
    });
  });

  it('calls getItemForPOS with (tenantId, locationId, catalogItemId) — not swapped', async () => {
    const ctx = makeCtx();
    const input = {
      tabId: 'tab-1',
      clientRequestId: 'cr-1',
      items: [
        {
          catalogItemId: 'catalog-item-1',
          catalogItemName: 'Burger',
          courseNumber: 1,
          seatNumber: 1,
          qty: 1,
          unitPriceCents: 999,
        },
      ],
    };

    await addTabItems(ctx, input);

    // The critical assertion: argument order must be (tenantId, locationId, catalogItemId)
    expect(mocks.mockGetItemForPOS).toHaveBeenCalledWith(
      TENANT,     // arg 1: tenantId
      LOCATION,   // arg 2: locationId (NOT catalogItemId!)
      'catalog-item-1', // arg 3: catalogItemId (NOT locationId!)
    );
  });

  it('deduplicates catalog item lookups for batch items', async () => {
    const ctx = makeCtx();
    const input = {
      tabId: 'tab-1',
      clientRequestId: 'cr-2',
      items: [
        { catalogItemId: 'item-a', catalogItemName: 'Burger', courseNumber: 1, seatNumber: 1, qty: 1, unitPriceCents: 999 },
        { catalogItemId: 'item-a', catalogItemName: 'Burger', courseNumber: 1, seatNumber: 1, qty: 2, unitPriceCents: 999 },
        { catalogItemId: 'item-b', catalogItemName: 'Fries', courseNumber: 1, seatNumber: 1, qty: 1, unitPriceCents: 499 },
      ],
    };

    await addTabItems(ctx, input);

    // Only 2 unique catalog items, so only 2 calls
    expect(mocks.mockGetItemForPOS).toHaveBeenCalledTimes(2);
    expect(mocks.mockGetItemForPOS).toHaveBeenCalledWith(TENANT, LOCATION, 'item-a');
    expect(mocks.mockGetItemForPOS).toHaveBeenCalledWith(TENANT, LOCATION, 'item-b');
  });
});
