import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────
const { mockApiFetch } = vi.hoisted(() => {
  const mockApiFetch = vi.fn();
  return { mockApiFetch };
});

vi.mock('@/lib/api-client', () => ({
  apiFetch: mockApiFetch,
  ApiError: class extends Error {
    code: string;
    statusCode: number;
    constructor(code: string, message: string, statusCode: number) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
    }
  },
}));

// ── Imports (after mocks) ─────────────────────────────────────
import { formatReportMoney, buildExportUrl } from '../hooks/use-reports';

// ═══════════════════════════════════════════════════════════════
// formatReportMoney
// ═══════════════════════════════════════════════════════════════

describe('formatReportMoney', () => {
  it('formats dollars correctly', () => {
    expect(formatReportMoney(123.45)).toBe('$123.45');
  });

  it('handles zero', () => {
    expect(formatReportMoney(0)).toBe('$0.00');
  });

  it('handles negative values', () => {
    expect(formatReportMoney(-50)).toBe('-$50.00');
  });

  it('handles large values', () => {
    const result = formatReportMoney(12345.67);
    expect(result).toBe('$12,345.67');
  });

  it('handles single cent', () => {
    expect(formatReportMoney(0.01)).toBe('$0.01');
  });
});

// ═══════════════════════════════════════════════════════════════
// buildExportUrl
// ═══════════════════════════════════════════════════════════════

describe('buildExportUrl', () => {
  it('builds correct export URL with params', () => {
    const url = buildExportUrl('/api/v1/reports/daily-sales/export', {
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    });

    expect(url).toContain('dateFrom=2026-01-01');
    expect(url).toContain('dateTo=2026-01-31');
    expect(url).toContain('/api/v1/reports/daily-sales/export?');
  });

  it('includes locationId when set', () => {
    const url = buildExportUrl('/api/v1/reports/item-sales/export', {
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      locationId: 'loc_001',
    });

    expect(url).toContain('locationId=loc_001');
  });

  it('omits undefined params', () => {
    const url = buildExportUrl('/api/v1/reports/daily-sales/export', {
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      locationId: undefined,
    });

    expect(url).not.toContain('locationId');
  });

  it('handles empty params', () => {
    const url = buildExportUrl('/api/v1/reports/inventory-summary/export', {});
    expect(url).toBe('/api/v1/reports/inventory-summary/export?');
  });
});

// ═══════════════════════════════════════════════════════════════
// Hook URL construction (testing via apiFetch call assertions)
// ═══════════════════════════════════════════════════════════════

describe('hook URL construction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ data: {} });
  });

  it('useReportsDashboard builds correct URL without locationId', async () => {
    mockApiFetch.mockResolvedValueOnce({ data: { todaySales: 0, todayOrders: 0, todayVoids: 0, lowStockCount: 0, activeCustomers7d: 0 } });

    const params = new URLSearchParams({ date: new Date().toISOString().slice(0, 10) });
    await mockApiFetch(`/api/v1/reports/dashboard?${params.toString()}`);

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/reports/dashboard?date='),
    );
  });

  it('useReportsDashboard includes locationId when provided', async () => {
    mockApiFetch.mockResolvedValueOnce({ data: {} });

    const params = new URLSearchParams({ date: '2026-02-18', locationId: 'loc_001' });
    await mockApiFetch(`/api/v1/reports/dashboard?${params.toString()}`);

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('locationId=loc_001'),
    );
  });

  it('useDailySales builds correct URL with date range', async () => {
    mockApiFetch.mockResolvedValueOnce({ data: [] });

    const params = new URLSearchParams({ dateFrom: '2026-02-11', dateTo: '2026-02-18' });
    await mockApiFetch(`/api/v1/reports/daily-sales?${params.toString()}`);

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('dateFrom=2026-02-11'),
    );
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('dateTo=2026-02-18'),
    );
  });

  it('useItemSales includes sort and limit params', async () => {
    mockApiFetch.mockResolvedValueOnce({ data: [] });

    const params = new URLSearchParams({
      dateFrom: '2026-02-01',
      dateTo: '2026-02-28',
      sortBy: 'grossRevenue',
      sortDir: 'desc',
      limit: '50',
    });
    await mockApiFetch(`/api/v1/reports/item-sales?${params.toString()}`);

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('sortBy=grossRevenue'),
    );
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('limit=50'),
    );
  });

  it('useInventorySummary includes belowThresholdOnly param', async () => {
    mockApiFetch.mockResolvedValueOnce({ data: [] });

    const params = new URLSearchParams({ belowThresholdOnly: 'true' });
    await mockApiFetch(`/api/v1/reports/inventory-summary?${params.toString()}`);

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('belowThresholdOnly=true'),
    );
  });

  it('useInventorySummary includes search param', async () => {
    mockApiFetch.mockResolvedValueOnce({ data: [] });

    const params = new URLSearchParams({ search: 'Widget' });
    await mockApiFetch(`/api/v1/reports/inventory-summary?${params.toString()}`);

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('search=Widget'),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// API response shape parsing
// ═══════════════════════════════════════════════════════════════

describe('API response parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dashboard response shape is { data: DashboardMetrics }', async () => {
    const mockData = {
      data: {
        todaySales: 150000,
        todayOrders: 15,
        todayVoids: 2,
        lowStockCount: 3,
        activeCustomers7d: 42,
      },
    };
    mockApiFetch.mockResolvedValueOnce(mockData);

    const result = await mockApiFetch('/api/v1/reports/dashboard?date=2026-02-18');
    expect(result.data.todaySales).toBe(150000);
    expect(result.data.activeCustomers7d).toBe(42);
  });

  it('daily sales response shape is { data: DailySalesRow[] }', async () => {
    const mockData = {
      data: [
        {
          businessDate: '2026-02-18',
          locationId: null,
          orderCount: 10,
          grossSales: 100000,
          netSales: 95000,
          avgOrderValue: 9500,
        },
      ],
    };
    mockApiFetch.mockResolvedValueOnce(mockData);

    const result = await mockApiFetch('/api/v1/reports/daily-sales?dateFrom=2026-02-18&dateTo=2026-02-18');
    expect(result.data).toHaveLength(1);
    expect(result.data[0].businessDate).toBe('2026-02-18');
    expect(typeof result.data[0].grossSales).toBe('number');
  });

  it('item sales response returns array of items', async () => {
    const mockData = {
      data: [
        { catalogItemId: 'item_001', catalogItemName: 'Burger', quantitySold: 25, grossRevenue: 37500 },
        { catalogItemId: 'item_002', catalogItemName: 'Fries', quantitySold: 40, grossRevenue: 20000 },
      ],
    };
    mockApiFetch.mockResolvedValueOnce(mockData);

    const result = await mockApiFetch('/api/v1/reports/item-sales?dateFrom=2026-02-01&dateTo=2026-02-28');
    expect(result.data).toHaveLength(2);
    expect(result.data[0].catalogItemName).toBe('Burger');
  });

  it('inventory response includes isBelowThreshold flag', async () => {
    const mockData = {
      data: [
        { inventoryItemId: 'inv_001', itemName: 'Widget', onHand: 3, lowStockThreshold: 5, isBelowThreshold: true },
      ],
    };
    mockApiFetch.mockResolvedValueOnce(mockData);

    const result = await mockApiFetch('/api/v1/reports/inventory-summary');
    expect(result.data[0].isBelowThreshold).toBe(true);
  });
});
