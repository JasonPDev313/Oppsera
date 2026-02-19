import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────
const {
  mockGetGolfDashboardMetrics,
  mockGetGolfUtilization,
  mockGetTeeSheetKpis,
  mockGetGolfRevenue,
  mockGetPaceKpis,
  mockGetGolfDayparts,
  mockGetChannelKpis,
  mockGetGolfCustomers,
  mockGetGolfCustomerKpis,
  mockToCsv,
  mockWithMiddleware,
} = vi.hoisted(() => {
  const mockGetGolfDashboardMetrics = vi.fn();
  const mockGetGolfUtilization = vi.fn();
  const mockGetTeeSheetKpis = vi.fn();
  const mockGetGolfRevenue = vi.fn();
  const mockGetPaceKpis = vi.fn();
  const mockGetGolfDayparts = vi.fn();
  const mockGetChannelKpis = vi.fn();
  const mockGetGolfCustomers = vi.fn();
  const mockGetGolfCustomerKpis = vi.fn();
  const mockToCsv = vi.fn();

  const mockWithMiddleware = vi.fn((handler: Function, _options: unknown) => {
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
    mockGetGolfDashboardMetrics,
    mockGetGolfUtilization,
    mockGetTeeSheetKpis,
    mockGetGolfRevenue,
    mockGetPaceKpis,
    mockGetGolfDayparts,
    mockGetChannelKpis,
    mockGetGolfCustomers,
    mockGetGolfCustomerKpis,
    mockToCsv,
    mockWithMiddleware,
  };
});

// ── Module mocks ──────────────────────────────────────────────

vi.mock('@oppsera/core/auth/with-middleware', () => ({
  withMiddleware: mockWithMiddleware,
}));

vi.mock('@oppsera/module-golf-reporting', () => ({
  getGolfDashboardMetrics: mockGetGolfDashboardMetrics,
  getGolfUtilization: mockGetGolfUtilization,
  getTeeSheetKpis: mockGetTeeSheetKpis,
  getGolfRevenue: mockGetGolfRevenue,
  getPaceKpis: mockGetPaceKpis,
  getGolfDayparts: mockGetGolfDayparts,
  getChannelKpis: mockGetChannelKpis,
  getGolfCustomers: mockGetGolfCustomers,
  getGolfCustomerKpis: mockGetGolfCustomerKpis,
}));

vi.mock('@oppsera/module-reporting', () => ({
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

const BASE = 'http://localhost/api/v1/reports/golf';

// ── Route imports (after mocks) ───────────────────────────────

import { GET as dashboardGET } from '../app/api/v1/reports/golf/dashboard/route';
import { GET as utilizationGET } from '../app/api/v1/reports/golf/utilization/route';
import { GET as utilizationKpisGET } from '../app/api/v1/reports/golf/utilization/kpis/route';
import { GET as revenueGET } from '../app/api/v1/reports/golf/revenue/route';
import { GET as paceGET } from '../app/api/v1/reports/golf/pace/route';
import { GET as daypartsGET } from '../app/api/v1/reports/golf/dayparts/route';
import { GET as channelsGET } from '../app/api/v1/reports/golf/channels/route';
import { GET as customersGET } from '../app/api/v1/reports/golf/customers/route';
import { GET as customerKpisGET } from '../app/api/v1/reports/golf/customers/kpis/route';
import { GET as utilizationExportGET } from '../app/api/v1/reports/golf/utilization/export/route';
import { GET as revenueExportGET } from '../app/api/v1/reports/golf/revenue/export/route';
import { GET as paceExportGET } from '../app/api/v1/reports/golf/pace/export/route';
import { GET as customersExportGET } from '../app/api/v1/reports/golf/customers/export/route';

// ═══════════════════════════════════════════════════════════════
// Dashboard
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/golf/dashboard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns golf dashboard metrics', async () => {
    const metrics = { todayRoundsPlayed: 42, todayRevenue: 3500, utilizationBps: 6500 };
    mockGetGolfDashboardMetrics.mockResolvedValue(metrics);

    const res = await dashboardGET(makeRequest(`${BASE}/dashboard?date=2026-03-15`));
    const body = await res.json();

    expect(body.data).toEqual(metrics);
    expect(mockGetGolfDashboardMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001', date: '2026-03-15' }),
    );
  });

  it('works without date param', async () => {
    mockGetGolfDashboardMetrics.mockResolvedValue({ todayRoundsPlayed: 0 });

    await dashboardGET(makeRequest(`${BASE}/dashboard`));

    expect(mockGetGolfDashboardMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ date: undefined }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Utilization
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/golf/utilization', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns utilization rows', async () => {
    const rows = [{ businessDate: '2026-03-15', slotsBooked: 100, slotsAvailable: 200 }];
    mockGetGolfUtilization.mockResolvedValue(rows);

    const res = await utilizationGET(
      makeRequest(`${BASE}/utilization?dateFrom=2026-03-01&dateTo=2026-03-31`),
    );
    const body = await res.json();

    expect(body.data).toEqual(rows);
    expect(mockGetGolfUtilization).toHaveBeenCalledWith(
      expect.objectContaining({ dateFrom: '2026-03-01', dateTo: '2026-03-31' }),
    );
  });

  it('throws error when date params missing', async () => {
    await expect(
      utilizationGET(makeRequest(`${BASE}/utilization`)),
    ).rejects.toThrow('dateFrom and dateTo are required');
  });

  it('passes courseId filter', async () => {
    mockGetGolfUtilization.mockResolvedValue([]);

    await utilizationGET(
      makeRequest(`${BASE}/utilization?dateFrom=2026-03-01&dateTo=2026-03-31&courseId=course_001`),
    );

    expect(mockGetGolfUtilization).toHaveBeenCalledWith(
      expect.objectContaining({ courseId: 'course_001' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Utilization KPIs
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/golf/utilization/kpis', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns tee sheet KPIs', async () => {
    const kpis = { slotsBooked: 200, utilizationBps: 5000 };
    mockGetTeeSheetKpis.mockResolvedValue(kpis);

    const res = await utilizationKpisGET(
      makeRequest(`${BASE}/utilization/kpis?dateFrom=2026-03-01&dateTo=2026-03-31`),
    );
    const body = await res.json();

    expect(body.data).toEqual(kpis);
  });
});

// ═══════════════════════════════════════════════════════════════
// Revenue
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/golf/revenue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns revenue rows', async () => {
    const rows = [{ businessDate: '2026-03-15', totalRevenue: 5000 }];
    mockGetGolfRevenue.mockResolvedValue(rows);

    const res = await revenueGET(
      makeRequest(`${BASE}/revenue?dateFrom=2026-03-01&dateTo=2026-03-31`),
    );
    const body = await res.json();

    expect(body.data).toEqual(rows);
  });

  it('throws error when date params missing', async () => {
    await expect(
      revenueGET(makeRequest(`${BASE}/revenue`)),
    ).rejects.toThrow('dateFrom and dateTo are required');
  });
});

// ═══════════════════════════════════════════════════════════════
// Pace KPIs
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/golf/pace', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns pace KPIs', async () => {
    const kpis = { roundsCompleted: 50, avgRoundDurationMin: 240 };
    mockGetPaceKpis.mockResolvedValue(kpis);

    const res = await paceGET(
      makeRequest(`${BASE}/pace?dateFrom=2026-03-01&dateTo=2026-03-31`),
    );
    const body = await res.json();

    expect(body.data).toEqual(kpis);
  });
});

// ═══════════════════════════════════════════════════════════════
// Dayparts
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/golf/dayparts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns daypart rows', async () => {
    const rows = [{ daypart: 'morning', totalSlots: 100, pctOfTotalBps: 4000 }];
    mockGetGolfDayparts.mockResolvedValue(rows);

    const res = await daypartsGET(
      makeRequest(`${BASE}/dayparts?dateFrom=2026-03-01&dateTo=2026-03-31`),
    );
    const body = await res.json();

    expect(body.data).toEqual(rows);
  });
});

// ═══════════════════════════════════════════════════════════════
// Channels
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/golf/channels', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns channel KPIs', async () => {
    const kpis = { onlineSlots: 60, totalSlots: 100, onlinePctBps: 6000 };
    mockGetChannelKpis.mockResolvedValue(kpis);

    const res = await channelsGET(
      makeRequest(`${BASE}/channels?dateFrom=2026-03-01&dateTo=2026-03-31`),
    );
    const body = await res.json();

    expect(body.data).toEqual(kpis);
  });
});

// ═══════════════════════════════════════════════════════════════
// Customers (paginated)
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/golf/customers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns paginated customer list', async () => {
    const result = {
      items: [{ id: 'cp_001', customerId: 'cust_001', totalRounds: 10 }],
      cursor: null,
      hasMore: false,
    };
    mockGetGolfCustomers.mockResolvedValue(result);

    const res = await customersGET(makeRequest(`${BASE}/customers?limit=20`));
    const body = await res.json();

    expect(body.data).toEqual(result.items);
    expect(body.meta).toEqual({ cursor: null, hasMore: false });
  });

  it('passes sort params', async () => {
    mockGetGolfCustomers.mockResolvedValue({ items: [], cursor: null, hasMore: false });

    await customersGET(
      makeRequest(`${BASE}/customers?sortBy=totalRevenue&sortDir=desc`),
    );

    expect(mockGetGolfCustomers).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'totalRevenue', sortDir: 'desc' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Customer KPIs
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/golf/customers/kpis', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns customer aggregate KPIs', async () => {
    const kpis = { totalCustomers: 50, totalRounds: 500 };
    mockGetGolfCustomerKpis.mockResolvedValue(kpis);

    const res = await customerKpisGET(makeRequest(`${BASE}/customers/kpis`));
    const body = await res.json();

    expect(body.data).toEqual(kpis);
  });
});

// ═══════════════════════════════════════════════════════════════
// CSV Exports
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/golf/utilization/export', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns CSV with correct headers', async () => {
    mockGetGolfUtilization.mockResolvedValue([{ businessDate: '2026-03-15', slotsBooked: 100 }]);
    mockToCsv.mockReturnValue(Buffer.from('csv-content'));

    const res = await utilizationExportGET(
      makeRequest(`${BASE}/utilization/export?dateFrom=2026-03-15&dateTo=2026-03-15`),
    );

    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toContain('golf-utilization_2026-03-15_2026-03-15.csv');
    expect(mockToCsv).toHaveBeenCalled();
  });
});

describe('GET /api/v1/reports/golf/revenue/export', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns CSV with correct filename', async () => {
    mockGetGolfRevenue.mockResolvedValue([]);
    mockToCsv.mockReturnValue(Buffer.from(''));

    const res = await revenueExportGET(
      makeRequest(`${BASE}/revenue/export?dateFrom=2026-03-01&dateTo=2026-03-31`),
    );

    expect(res.headers.get('Content-Disposition')).toContain('golf-revenue_2026-03-01_2026-03-31.csv');
  });
});

describe('GET /api/v1/reports/golf/pace/export', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns CSV with single summary row', async () => {
    const kpis = { roundsCompleted: 50, avgRoundDurationMin: 240 };
    mockGetPaceKpis.mockResolvedValue(kpis);
    mockToCsv.mockReturnValue(Buffer.from('csv'));

    const res = await paceExportGET(
      makeRequest(`${BASE}/pace/export?dateFrom=2026-03-01&dateTo=2026-03-31`),
    );

    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    // toCsv should receive [kpis] (single-element array)
    expect(mockToCsv).toHaveBeenCalledWith(expect.any(Array), [kpis]);
  });
});

describe('GET /api/v1/reports/golf/customers/export', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns CSV for all customers (high limit)', async () => {
    mockGetGolfCustomers.mockResolvedValue({ items: [{ customerId: 'c1' }], cursor: null, hasMore: false });
    mockToCsv.mockReturnValue(Buffer.from('csv'));

    const res = await customersExportGET(makeRequest(`${BASE}/customers/export`));

    expect(res.headers.get('Content-Disposition')).toContain('golf-customers.csv');
    expect(mockGetGolfCustomers).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10000 }),
    );
  });
});
