import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────
const {
  mockGetDailySales,
  mockGetItemSales,
  mockGetInventorySummary,
  mockGetDashboardMetrics,
  mockToCsv,
  mockWithMiddleware,
} = vi.hoisted(() => {
  const mockGetDailySales = vi.fn();
  const mockGetItemSales = vi.fn();
  const mockGetInventorySummary = vi.fn();
  const mockGetDashboardMetrics = vi.fn();
  const mockToCsv = vi.fn();

  // withMiddleware extracts the handler and calls it with a mock context
  const mockWithMiddleware = vi.fn((handler: (...args: any[]) => any, _options: unknown) => {
    return async (request: any) => {
      const ctx = {
        user: { id: 'user_001' },
        tenantId: 'tenant_001',
        locationId: undefined as string | undefined,
        requestId: 'req_001',
        isPlatformAdmin: false,
      };
      return handler(request, ctx);
    };
  });

  return {
    mockGetDailySales,
    mockGetItemSales,
    mockGetInventorySummary,
    mockGetDashboardMetrics,
    mockToCsv,
    mockWithMiddleware,
  };
});

// ── Module mocks ──────────────────────────────────────────────

vi.mock('@oppsera/core/auth/with-middleware', () => ({
  withMiddleware: mockWithMiddleware,
}));

vi.mock('@oppsera/module-reporting', () => ({
  getDailySales: mockGetDailySales,
  getItemSales: mockGetItemSales,
  getInventorySummary: mockGetInventorySummary,
  getDashboardMetrics: mockGetDashboardMetrics,
  toCsv: mockToCsv,
}));

vi.mock('@oppsera/shared', () => ({
  AppError: class AppError extends Error {
    code: string;
    statusCode: number;
    constructor(code: string, message: string, statusCode: number) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
    }
  },
}));

// ── Helper ────────────────────────────────────────────────────

function makeRequest(url: string) {
  return { url, json: vi.fn() } as any;
}

// ── Route imports (after mocks) ───────────────────────────────

import { GET as dailySalesGET } from '../app/api/v1/reports/daily-sales/route';
import { GET as itemSalesGET } from '../app/api/v1/reports/item-sales/route';
import { GET as inventorySummaryGET } from '../app/api/v1/reports/inventory-summary/route';
import { GET as dashboardGET } from '../app/api/v1/reports/dashboard/route';
import { GET as dailySalesExportGET } from '../app/api/v1/reports/daily-sales/export/route';
import { GET as itemSalesExportGET } from '../app/api/v1/reports/item-sales/export/route';

// ═══════════════════════════════════════════════════════════════
// Daily Sales Route
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/daily-sales', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns daily sales data', async () => {
    const salesData = [
      { businessDate: '2026-03-15', locationId: null, orderCount: 5, netSales: 500 },
    ];
    mockGetDailySales.mockResolvedValue(salesData);

    const response = await dailySalesGET(
      makeRequest('http://localhost/api/v1/reports/daily-sales?dateFrom=2026-03-15&dateTo=2026-03-15'),
    );
    const body = await response.json();

    expect(body.data).toEqual(salesData);
    expect(mockGetDailySales).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        dateFrom: '2026-03-15',
        dateTo: '2026-03-15',
      }),
    );
  });

  it('throws error when dateFrom is missing', async () => {
    await expect(
      dailySalesGET(makeRequest('http://localhost/api/v1/reports/daily-sales?dateTo=2026-03-15')),
    ).rejects.toThrow('dateFrom and dateTo are required');
  });

  it('throws error when dateTo is missing', async () => {
    await expect(
      dailySalesGET(makeRequest('http://localhost/api/v1/reports/daily-sales?dateFrom=2026-03-15')),
    ).rejects.toThrow('dateFrom and dateTo are required');
  });

  it('passes locationId from query param', async () => {
    mockGetDailySales.mockResolvedValue([]);

    await dailySalesGET(
      makeRequest('http://localhost/api/v1/reports/daily-sales?dateFrom=2026-03-01&dateTo=2026-03-31&locationId=loc_001'),
    );

    expect(mockGetDailySales).toHaveBeenCalledWith(
      expect.objectContaining({ locationId: 'loc_001' }),
    );
  });

});

// ═══════════════════════════════════════════════════════════════
// Item Sales Route
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/item-sales', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns item sales data with sort and limit', async () => {
    const items = [{ catalogItemId: 'item_001', catalogItemName: 'Burger', quantitySold: 10 }];
    mockGetItemSales.mockResolvedValue(items);

    const response = await itemSalesGET(
      makeRequest('http://localhost/api/v1/reports/item-sales?dateFrom=2026-03-01&dateTo=2026-03-31&sortBy=grossRevenue&limit=10'),
    );
    const body = await response.json();

    expect(body.data).toEqual(items);
    expect(mockGetItemSales).toHaveBeenCalledWith(
      expect.objectContaining({
        sortBy: 'grossRevenue',
        limit: 10,
      }),
    );
  });

  it('throws error when date params missing', async () => {
    await expect(
      itemSalesGET(makeRequest('http://localhost/api/v1/reports/item-sales')),
    ).rejects.toThrow('dateFrom and dateTo are required');
  });
});

// ═══════════════════════════════════════════════════════════════
// Inventory Summary Route
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/inventory-summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns inventory summary', async () => {
    const inventory = [
      { inventoryItemId: 'inv_001', itemName: 'Widget', onHand: 42, isBelowThreshold: false },
    ];
    mockGetInventorySummary.mockResolvedValue(inventory);

    const response = await inventorySummaryGET(
      makeRequest('http://localhost/api/v1/reports/inventory-summary'),
    );
    const body = await response.json();

    expect(body.data).toEqual(inventory);
  });

  it('passes belowThresholdOnly flag', async () => {
    mockGetInventorySummary.mockResolvedValue([]);

    await inventorySummaryGET(
      makeRequest('http://localhost/api/v1/reports/inventory-summary?belowThresholdOnly=true'),
    );

    expect(mockGetInventorySummary).toHaveBeenCalledWith(
      expect.objectContaining({ belowThresholdOnly: true }),
    );
  });

  it('passes search param', async () => {
    mockGetInventorySummary.mockResolvedValue([]);

    await inventorySummaryGET(
      makeRequest('http://localhost/api/v1/reports/inventory-summary?search=widget'),
    );

    expect(mockGetInventorySummary).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'widget' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Dashboard Route
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns dashboard metrics', async () => {
    const metrics = {
      todaySales: 1500,
      todayOrders: 15,
      todayVoids: 2,
      lowStockCount: 3,
      activeCustomers7d: 42,
    };
    mockGetDashboardMetrics.mockResolvedValue(metrics);

    const response = await dashboardGET(
      makeRequest('http://localhost/api/v1/reports/dashboard?date=2026-03-15'),
    );
    const body = await response.json();

    expect(body.data).toEqual(metrics);
    expect(mockGetDashboardMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-03-15' }),
    );
  });

  it('works without date param (defaults to today)', async () => {
    mockGetDashboardMetrics.mockResolvedValue({
      todaySales: 0,
      todayOrders: 0,
      todayVoids: 0,
      lowStockCount: 0,
      activeCustomers7d: 0,
    });

    const response = await dashboardGET(
      makeRequest('http://localhost/api/v1/reports/dashboard'),
    );
    const body = await response.json();

    expect(body.data.todaySales).toBe(0);
    expect(mockGetDashboardMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ date: undefined }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Daily Sales Export Route
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/daily-sales/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns CSV with correct content type and disposition', async () => {
    mockGetDailySales.mockResolvedValue([{ businessDate: '2026-03-15', netSales: 500 }]);
    mockToCsv.mockReturnValue(Buffer.from('csv-content'));

    const response = await dailySalesExportGET(
      makeRequest('http://localhost/api/v1/reports/daily-sales/export?dateFrom=2026-03-15&dateTo=2026-03-15'),
    );

    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toContain('daily-sales_2026-03-15_2026-03-15.csv');
    expect(mockToCsv).toHaveBeenCalled();
  });

  it('throws error when date params missing', async () => {
    await expect(
      dailySalesExportGET(makeRequest('http://localhost/api/v1/reports/daily-sales/export')),
    ).rejects.toThrow('dateFrom and dateTo are required');
  });

});

// ═══════════════════════════════════════════════════════════════
// Item Sales Export Route
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/item-sales/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns CSV with correct content type', async () => {
    mockGetItemSales.mockResolvedValue([{ catalogItemId: 'item_001', quantitySold: 10 }]);
    mockToCsv.mockReturnValue(Buffer.from('csv-content'));

    const response = await itemSalesExportGET(
      makeRequest('http://localhost/api/v1/reports/item-sales/export?dateFrom=2026-03-01&dateTo=2026-03-31'),
    );

    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toContain('item-sales_2026-03-01_2026-03-31.csv');
  });

  it('passes sort and limit params', async () => {
    mockGetItemSales.mockResolvedValue([]);
    mockToCsv.mockReturnValue(Buffer.from(''));

    await itemSalesExportGET(
      makeRequest('http://localhost/api/v1/reports/item-sales/export?dateFrom=2026-03-01&dateTo=2026-03-31&sortBy=quantitySold&limit=50'),
    );

    expect(mockGetItemSales).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'quantitySold', limit: 50 }),
    );
  });
});
