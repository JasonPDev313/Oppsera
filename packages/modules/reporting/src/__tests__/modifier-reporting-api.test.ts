import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────
const {
  mockGetModifierPerformance,
  mockGetModifierGroupHealth,
  mockGetModifierUpsellImpact,
  mockGetModifierDaypartHeatmap,
  mockGetModifierGroupItemHeatmap,
  mockGetModifierLocationHeatmap,
  mockGetModifierWasteSignals,
  mockGetModifierComplexity,
  mockToCsv,
  mockWithMiddleware,
  middlewareOptionsList,
} = vi.hoisted(() => {
  const mockGetModifierPerformance = vi.fn();
  const mockGetModifierGroupHealth = vi.fn();
  const mockGetModifierUpsellImpact = vi.fn();
  const mockGetModifierDaypartHeatmap = vi.fn();
  const mockGetModifierGroupItemHeatmap = vi.fn();
  const mockGetModifierLocationHeatmap = vi.fn();
  const mockGetModifierWasteSignals = vi.fn();
  const mockGetModifierComplexity = vi.fn();
  const mockToCsv = vi.fn();

  // Persists across clearAllMocks — captures options at module-evaluation time
  const middlewareOptionsList: unknown[] = [];

  const mockWithMiddleware = vi.fn((handler: (...args: any[]) => any, options: unknown) => {
    middlewareOptionsList.push(options);
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
    mockGetModifierPerformance,
    mockGetModifierGroupHealth,
    mockGetModifierUpsellImpact,
    mockGetModifierDaypartHeatmap,
    mockGetModifierGroupItemHeatmap,
    mockGetModifierLocationHeatmap,
    mockGetModifierWasteSignals,
    mockGetModifierComplexity,
    mockToCsv,
    mockWithMiddleware,
    middlewareOptionsList,
  };
});

// ── Module mocks ──────────────────────────────────────────────

vi.mock('@oppsera/core/auth/with-middleware', () => ({
  withMiddleware: mockWithMiddleware,
}));

vi.mock('@oppsera/module-reporting', () => ({
  getModifierPerformance: mockGetModifierPerformance,
  getModifierGroupHealth: mockGetModifierGroupHealth,
  getModifierUpsellImpact: mockGetModifierUpsellImpact,
  getModifierDaypartHeatmap: mockGetModifierDaypartHeatmap,
  getModifierGroupItemHeatmap: mockGetModifierGroupItemHeatmap,
  getModifierLocationHeatmap: mockGetModifierLocationHeatmap,
  getModifierWasteSignals: mockGetModifierWasteSignals,
  getModifierComplexity: mockGetModifierComplexity,
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

const BASE = 'http://localhost/api/v1/reports/modifiers';

// ── Route imports (after mocks) ───────────────────────────────

import { GET as performanceGET } from '../../../../../apps/web/src/app/api/v1/reports/modifiers/performance/route';
import { GET as groupHealthGET } from '../../../../../apps/web/src/app/api/v1/reports/modifiers/group-health/route';
import { GET as upsellImpactGET } from '../../../../../apps/web/src/app/api/v1/reports/modifiers/upsell-impact/route';
import { GET as daypartHeatmapGET } from '../../../../../apps/web/src/app/api/v1/reports/modifiers/daypart-heatmap/route';
import { GET as groupItemHeatmapGET } from '../../../../../apps/web/src/app/api/v1/reports/modifiers/group-item-heatmap/route';
import { GET as locationHeatmapGET } from '../../../../../apps/web/src/app/api/v1/reports/modifiers/location-heatmap/route';
import { GET as wasteSignalsGET } from '../../../../../apps/web/src/app/api/v1/reports/modifiers/waste-signals/route';
import { GET as complexityGET } from '../../../../../apps/web/src/app/api/v1/reports/modifiers/complexity/route';
import { GET as performanceExportGET } from '../../../../../apps/web/src/app/api/v1/reports/modifiers/performance/export/route';
import { GET as groupHealthExportGET } from '../../../../../apps/web/src/app/api/v1/reports/modifiers/group-health/export/route';

// ═══════════════════════════════════════════════════════════════
// Performance Route
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/modifiers/performance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with data from getModifierPerformance', async () => {
    const mockData = [
      { modifierId: 'mod_001', modifierName: 'Extra Cheese', timesSelected: 42, revenueDollars: 84 },
      { modifierId: 'mod_002', modifierName: 'Bacon', timesSelected: 30, revenueDollars: 60 },
    ];
    mockGetModifierPerformance.mockResolvedValue(mockData);

    const response = await performanceGET(
      makeRequest(`${BASE}/performance?dateFrom=2026-01-01&dateTo=2026-01-31`),
    );
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.data).toEqual(mockData);
  });

  it('passes dateFrom, dateTo, locationId, modifierGroupId, catalogItemId, sortBy, sortDir, limit to query', async () => {
    mockGetModifierPerformance.mockResolvedValue([]);

    await performanceGET(
      makeRequest(
        `${BASE}/performance?dateFrom=2026-02-01&dateTo=2026-02-28&locationId=loc_001&modifierGroupId=mg_001&catalogItemId=item_001&sortBy=revenueDollars&sortDir=desc&limit=25`,
      ),
    );

    expect(mockGetModifierPerformance).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        dateFrom: '2026-02-01',
        dateTo: '2026-02-28',
        locationId: 'loc_001',
        modifierGroupId: 'mg_001',
        catalogItemId: 'item_001',
        sortBy: 'revenueDollars',
        sortDir: 'desc',
        limit: 25,
      }),
    );
  });

  it('throws VALIDATION_ERROR when dateFrom or dateTo missing', async () => {
    await expect(
      performanceGET(makeRequest(`${BASE}/performance?dateTo=2026-01-31`)),
    ).rejects.toThrow('dateFrom and dateTo are required');

    await expect(
      performanceGET(makeRequest(`${BASE}/performance?dateFrom=2026-01-01`)),
    ).rejects.toThrow('dateFrom and dateTo are required');

    await expect(
      performanceGET(makeRequest(`${BASE}/performance`)),
    ).rejects.toThrow('dateFrom and dateTo are required');
  });
});

// ═══════════════════════════════════════════════════════════════
// Group Health Route
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/modifiers/group-health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with data from getModifierGroupHealth', async () => {
    const mockData = [
      { modifierGroupId: 'mg_001', groupName: 'Sauces', attachRate: 0.75, totalSelections: 120 },
    ];
    mockGetModifierGroupHealth.mockResolvedValue(mockData);

    const response = await groupHealthGET(
      makeRequest(`${BASE}/group-health?dateFrom=2026-01-01&dateTo=2026-01-31`),
    );
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.data).toEqual(mockData);
    expect(mockGetModifierGroupHealth).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      }),
    );
  });

  it('throws VALIDATION_ERROR when dates missing', async () => {
    await expect(
      groupHealthGET(makeRequest(`${BASE}/group-health`)),
    ).rejects.toThrow('dateFrom and dateTo are required');
  });
});

// ═══════════════════════════════════════════════════════════════
// Upsell Impact Route
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/modifiers/upsell-impact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with data from getModifierUpsellImpact', async () => {
    const mockData = [
      { modifierGroupId: 'mg_001', groupName: 'Add-Ons', upsellRevenueDollars: 500 },
    ];
    mockGetModifierUpsellImpact.mockResolvedValue(mockData);

    const response = await upsellImpactGET(
      makeRequest(`${BASE}/upsell-impact?dateFrom=2026-01-01&dateTo=2026-01-31`),
    );
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.data).toEqual(mockData);
  });

  it('passes limit and modifierGroupId parameters when provided', async () => {
    mockGetModifierUpsellImpact.mockResolvedValue([]);

    await upsellImpactGET(
      makeRequest(`${BASE}/upsell-impact?dateFrom=2026-01-01&dateTo=2026-01-31&modifierGroupId=mg_002&limit=10`),
    );

    expect(mockGetModifierUpsellImpact).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        modifierGroupId: 'mg_002',
        limit: 10,
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Daypart Heatmap Route
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/modifiers/daypart-heatmap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with data from getModifierDaypartHeatmap', async () => {
    const mockData = [
      { daypart: 'lunch', modifierName: 'Extra Cheese', count: 55 },
      { daypart: 'dinner', modifierName: 'Extra Cheese', count: 40 },
    ];
    mockGetModifierDaypartHeatmap.mockResolvedValue(mockData);

    const response = await daypartHeatmapGET(
      makeRequest(`${BASE}/daypart-heatmap?dateFrom=2026-01-01&dateTo=2026-01-31`),
    );
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.data).toEqual(mockData);
  });

  it('passes modifierGroupId filter to query', async () => {
    mockGetModifierDaypartHeatmap.mockResolvedValue([]);

    await daypartHeatmapGET(
      makeRequest(`${BASE}/daypart-heatmap?dateFrom=2026-01-01&dateTo=2026-01-31&modifierGroupId=mg_003`),
    );

    expect(mockGetModifierDaypartHeatmap).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        modifierGroupId: 'mg_003',
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Group-Item Heatmap Route
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/modifiers/group-item-heatmap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with data from getModifierGroupItemHeatmap', async () => {
    const mockData = [
      { modifierGroupId: 'mg_001', catalogItemId: 'item_001', selectionCount: 88 },
    ];
    mockGetModifierGroupItemHeatmap.mockResolvedValue(mockData);

    const response = await groupItemHeatmapGET(
      makeRequest(`${BASE}/group-item-heatmap?dateFrom=2026-01-01&dateTo=2026-01-31`),
    );
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.data).toEqual(mockData);
    expect(mockGetModifierGroupItemHeatmap).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Location Heatmap Route
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/modifiers/location-heatmap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with data from getModifierLocationHeatmap', async () => {
    const mockData = [
      { locationId: 'loc_001', modifierGroupId: 'mg_001', selectionCount: 150 },
    ];
    mockGetModifierLocationHeatmap.mockResolvedValue(mockData);

    const response = await locationHeatmapGET(
      makeRequest(`${BASE}/location-heatmap?dateFrom=2026-01-01&dateTo=2026-01-31`),
    );
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.data).toEqual(mockData);
    expect(mockGetModifierLocationHeatmap).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      }),
    );
  });

  it('passes modifierGroupId and limit parameters', async () => {
    mockGetModifierLocationHeatmap.mockResolvedValue([]);

    await locationHeatmapGET(
      makeRequest(`${BASE}/location-heatmap?dateFrom=2026-01-01&dateTo=2026-01-31&modifierGroupId=mg_010&limit=20`),
    );

    expect(mockGetModifierLocationHeatmap).toHaveBeenCalledWith(
      expect.objectContaining({
        modifierGroupId: 'mg_010',
        limit: 20,
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Waste Signals Route
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/modifiers/waste-signals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with data from getModifierWasteSignals', async () => {
    const mockData = [
      { modifierId: 'mod_001', modifierName: 'Extra Olives', voidCount: 12, voidRevenueDollars: 18 },
    ];
    mockGetModifierWasteSignals.mockResolvedValue(mockData);

    const response = await wasteSignalsGET(
      makeRequest(`${BASE}/waste-signals?dateFrom=2026-01-01&dateTo=2026-01-31`),
    );
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.data).toEqual(mockData);
  });

  it('passes limit and modifierGroupId parameters', async () => {
    mockGetModifierWasteSignals.mockResolvedValue([]);

    await wasteSignalsGET(
      makeRequest(`${BASE}/waste-signals?dateFrom=2026-01-01&dateTo=2026-01-31&modifierGroupId=mg_005&limit=5`),
    );

    expect(mockGetModifierWasteSignals).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        modifierGroupId: 'mg_005',
        limit: 5,
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Complexity Route
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/modifiers/complexity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with data from getModifierComplexity', async () => {
    const mockData = [
      { catalogItemId: 'item_001', itemName: 'Burger', modifierGroupCount: 3, avgModifiersPerOrder: 2.5 },
    ];
    mockGetModifierComplexity.mockResolvedValue(mockData);

    const response = await complexityGET(
      makeRequest(`${BASE}/complexity?dateFrom=2026-01-01&dateTo=2026-01-31`),
    );
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.data).toEqual(mockData);
  });

  it('passes locationId from query param and limit', async () => {
    mockGetModifierComplexity.mockResolvedValue([]);

    await complexityGET(
      makeRequest(`${BASE}/complexity?dateFrom=2026-01-01&dateTo=2026-01-31&locationId=loc_002&limit=15`),
    );

    expect(mockGetModifierComplexity).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        locationId: 'loc_002',
        limit: 15,
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Performance Export Route
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/modifiers/performance/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns CSV with correct content-type and disposition', async () => {
    mockGetModifierPerformance.mockResolvedValue([
      { modifierId: 'mod_001', modifierName: 'Bacon', timesSelected: 100 },
    ]);
    mockToCsv.mockReturnValue(Buffer.from('csv-content'));

    const response = await performanceExportGET(
      makeRequest(`${BASE}/performance/export?dateFrom=2026-01-01&dateTo=2026-01-31`),
    );

    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toContain('modifier-performance_2026-01-01_2026-01-31.csv');
    expect(mockToCsv).toHaveBeenCalled();
    expect(mockGetModifierPerformance).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Group Health Export Route
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/modifiers/group-health/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns CSV with correct content-type and disposition', async () => {
    mockGetModifierGroupHealth.mockResolvedValue([
      { modifierGroupId: 'mg_001', groupName: 'Toppings', attachRate: 0.85 },
    ]);
    mockToCsv.mockReturnValue(Buffer.from('group-health-csv'));

    const response = await groupHealthExportGET(
      makeRequest(`${BASE}/group-health/export?dateFrom=2026-02-01&dateTo=2026-02-28`),
    );

    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toContain('modifier-group-health_2026-02-01_2026-02-28.csv');
    expect(mockToCsv).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Middleware Options
// ═══════════════════════════════════════════════════════════════

describe('Modifier reporting middleware options', () => {
  it('all JSON routes use entitlement "reporting" and permission "reports.view"', () => {
    // middlewareOptionsList is populated at module-evaluation time (import),
    // persists across vi.clearAllMocks(). First 8 entries are JSON routes.
    expect(middlewareOptionsList.length).toBeGreaterThanOrEqual(10);

    // JSON route calls (performance, group-health, upsell-impact, daypart-heatmap,
    // group-item-heatmap, location-heatmap, waste-signals, complexity)
    for (let i = 0; i < 8; i++) {
      const options = middlewareOptionsList[i] as Record<string, unknown>;
      expect(options).toBeDefined();
      expect(options.entitlement).toBe('reporting');
      expect(options.permission).toBe('reports.view');
    }
  });

  it('export routes use permission "reports.export"', () => {
    // Export route calls (performance/export, group-health/export) are entries 8 and 9
    for (let i = 8; i < 10; i++) {
      const options = middlewareOptionsList[i] as Record<string, unknown>;
      expect(options).toBeDefined();
      expect(options.entitlement).toBe('reporting');
      expect(options.permission).toBe('reports.export');
    }
  });
});
