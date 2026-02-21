import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────
const {
  // GL
  mockListFnbGlMappings,
  mockConfigureFnbGlMapping,
  mockUpdateFnbPostingConfig,
  mockPostBatchToGl,
  mockListUnpostedBatches,
  // Print
  mockListRoutingRulesS14,
  mockCreateRoutingRuleS14,
  mockListPrintJobs,
  mockCreatePrintJob,
  // Reports
  mockGetTableTurns,
  mockGetKitchenPerformance,
  mockGetDaypartSales,
  mockGetMenuMix,
  // Settings
  mockGetFnbSettings,
  mockUpdateFnbSettings,
  mockSeedFnbSettings,
  mockValidateFnbSettings,
  // Locks
  mockListActiveLocks,
  mockAcquireSoftLock,
  mockReleaseSoftLock,
  mockCleanExpiredLocks,
  // Menu
  mockEightySixItem,
  mockRestoreItem,
  mockListAllergens,
  mockCreateAllergen,
  // Sections
  mockListSections,
  mockCreateSection,
  // Middleware
  mockWithMiddleware,
  // Helpers
  makeSafeParse,
} = vi.hoisted(() => {
  const mockListFnbGlMappings = vi.fn();
  const mockConfigureFnbGlMapping = vi.fn();
  const mockUpdateFnbPostingConfig = vi.fn();
  const mockPostBatchToGl = vi.fn();
  const mockListUnpostedBatches = vi.fn();
  const mockListRoutingRulesS14 = vi.fn();
  const mockCreateRoutingRuleS14 = vi.fn();
  const mockListPrintJobs = vi.fn();
  const mockCreatePrintJob = vi.fn();
  const mockGetTableTurns = vi.fn();
  const mockGetKitchenPerformance = vi.fn();
  const mockGetDaypartSales = vi.fn();
  const mockGetMenuMix = vi.fn();
  const mockGetFnbSettings = vi.fn();
  const mockUpdateFnbSettings = vi.fn();
  const mockSeedFnbSettings = vi.fn();
  const mockValidateFnbSettings = vi.fn();
  const mockListActiveLocks = vi.fn();
  const mockAcquireSoftLock = vi.fn();
  const mockReleaseSoftLock = vi.fn();
  const mockCleanExpiredLocks = vi.fn();
  const mockEightySixItem = vi.fn();
  const mockRestoreItem = vi.fn();
  const mockListAllergens = vi.fn();
  const mockCreateAllergen = vi.fn();
  const mockListSections = vi.fn();
  const mockCreateSection = vi.fn();

  const mockWithMiddleware = vi.fn(
    (handler: (...args: any[]) => any, _options: unknown) => {
      return async (request: any) => {
        const ctx = {
          user: { id: 'user_001' },
          tenantId: 'tenant_001',
          locationId: 'loc_001',
          requestId: 'req_001',
          isPlatformAdmin: false,
        };
        return handler(request, ctx);
      };
    },
  );

  const makeSafeParse = (requiredFields: string[] = []) => ({
    safeParse: (data: any) => {
      for (const field of requiredFields) {
        if (!data[field]) {
          return {
            success: false,
            error: { issues: [{ path: [field], message: `${field} is required` }] },
          };
        }
      }
      return { success: true, data };
    },
  });

  return {
    mockListFnbGlMappings,
    mockConfigureFnbGlMapping,
    mockUpdateFnbPostingConfig,
    mockPostBatchToGl,
    mockListUnpostedBatches,
    mockListRoutingRulesS14,
    mockCreateRoutingRuleS14,
    mockListPrintJobs,
    mockCreatePrintJob,
    mockGetTableTurns,
    mockGetKitchenPerformance,
    mockGetDaypartSales,
    mockGetMenuMix,
    mockGetFnbSettings,
    mockUpdateFnbSettings,
    mockSeedFnbSettings,
    mockValidateFnbSettings,
    mockListActiveLocks,
    mockAcquireSoftLock,
    mockReleaseSoftLock,
    mockCleanExpiredLocks,
    mockEightySixItem,
    mockRestoreItem,
    mockListAllergens,
    mockCreateAllergen,
    mockListSections,
    mockCreateSection,
    mockWithMiddleware,
    makeSafeParse,
  };
});

// ── Module mocks ──────────────────────────────────────────────

vi.mock('@oppsera/core/auth/with-middleware', () => ({
  withMiddleware: mockWithMiddleware,
}));

vi.mock('@oppsera/module-fnb', () => ({
  // GL
  listFnbGlMappings: mockListFnbGlMappings,
  listFnbGlMappingsSchema: makeSafeParse(['tenantId']),
  configureFnbGlMapping: mockConfigureFnbGlMapping,
  configureFnbGlMappingSchema: makeSafeParse(['entityType', 'entityId', 'accountId']),
  updateFnbPostingConfig: mockUpdateFnbPostingConfig,
  updateFnbPostingConfigSchema: makeSafeParse([]),
  postBatchToGl: mockPostBatchToGl,
  postBatchToGlSchema: makeSafeParse(['closeBatchId']),
  listUnpostedBatches: mockListUnpostedBatches,
  listUnpostedBatchesSchema: makeSafeParse(['tenantId']),
  // Print
  listRoutingRulesS14: mockListRoutingRulesS14,
  listRoutingRulesS14Schema: makeSafeParse(['tenantId', 'locationId']),
  createRoutingRuleS14: mockCreateRoutingRuleS14,
  createRoutingRuleS14Schema: makeSafeParse(['stationId', 'printJobType']),
  listPrintJobs: mockListPrintJobs,
  listPrintJobsSchema: makeSafeParse(['tenantId', 'locationId']),
  createPrintJob: mockCreatePrintJob,
  createPrintJobSchema: makeSafeParse(['printJobType', 'content']),
  // Reports
  getTableTurns: mockGetTableTurns,
  getTableTurnsSchema: makeSafeParse(['tenantId', 'locationId', 'startDate', 'endDate']),
  getKitchenPerformance: mockGetKitchenPerformance,
  getKitchenPerformanceSchema: makeSafeParse(['tenantId', 'locationId', 'startDate', 'endDate']),
  getDaypartSales: mockGetDaypartSales,
  getDaypartSalesSchema: makeSafeParse(['tenantId', 'locationId', 'startDate', 'endDate']),
  getMenuMix: mockGetMenuMix,
  getMenuMixSchema: makeSafeParse(['tenantId', 'locationId', 'startDate', 'endDate']),
  // Settings
  getFnbSettings: mockGetFnbSettings,
  getFnbSettingsSchema: makeSafeParse(['tenantId', 'moduleKey']),
  updateFnbSettings: mockUpdateFnbSettings,
  updateFnbSettingsSchema: makeSafeParse(['moduleKey']),
  seedFnbSettings: mockSeedFnbSettings,
  validateFnbSettings: mockValidateFnbSettings,
  validateFnbSettingsSchema: makeSafeParse([]),
  // Locks
  listActiveLocks: mockListActiveLocks,
  listActiveLocksSchema: makeSafeParse(['tenantId']),
  acquireSoftLock: mockAcquireSoftLock,
  acquireSoftLockSchema: makeSafeParse(['entityType', 'entityId']),
  releaseSoftLock: mockReleaseSoftLock,
  releaseSoftLockSchema: makeSafeParse(['lockId']),
  cleanExpiredLocks: mockCleanExpiredLocks,
  // Menu
  eightySixItem: mockEightySixItem,
  eightySixItemSchema: makeSafeParse(['catalogItemId']),
  restoreItem: mockRestoreItem,
  restoreItemSchema: makeSafeParse(['catalogItemId']),
  listAllergens: mockListAllergens,
  createAllergen: mockCreateAllergen,
  createAllergenSchema: makeSafeParse(['name']),
  // Sections
  listSections: mockListSections,
  createSection: mockCreateSection,
  createSectionSchema: makeSafeParse(['name']),
}));

vi.mock('@oppsera/shared', () => ({
  AppError: class AppError extends Error {
    code: string;
    statusCode: number;
    details?: unknown;
    constructor(code: string, message: string, statusCode: number, details?: unknown) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
      this.details = details;
    }
  },
  ValidationError: class ValidationError extends Error {
    code = 'VALIDATION_ERROR';
    statusCode = 400;
    details: unknown[];
    constructor(message: string, details: unknown[]) {
      super(message);
      this.details = details;
    }
  },
}));

// ── Helpers ───────────────────────────────────────────────────

function makeGetRequest(url: string) {
  const urlObj = new URL(url);
  return {
    url,
    method: 'GET',
    nextUrl: urlObj,
    json: vi.fn(),
  } as any;
}

function makePostRequest(url: string, body: unknown) {
  const urlObj = new URL(url);
  return {
    url,
    method: 'POST',
    nextUrl: urlObj,
    json: vi.fn().mockResolvedValue(body),
  } as any;
}

function makePatchRequest(url: string, body: unknown) {
  const urlObj = new URL(url);
  return {
    url,
    method: 'PATCH',
    nextUrl: urlObj,
    json: vi.fn().mockResolvedValue(body),
  } as any;
}

const BASE = 'http://localhost/api/v1/fnb';

// ── Route imports (after mocks) ──────────────────────────────

// GL routes
import { GET as glMappingsGET, POST as glMappingsPOST } from '../app/api/v1/fnb/gl/mappings/route';
import { PATCH as postingConfigPATCH } from '../app/api/v1/fnb/gl/posting-config/route';
import { POST as postBatchPOST } from '../app/api/v1/fnb/gl/post-batch/route';
import { GET as unpostedBatchesGET } from '../app/api/v1/fnb/gl/unposted-batches/route';

// Print routes
import { GET as routingRulesGET, POST as routingRulesPOST } from '../app/api/v1/fnb/print/routing-rules/route';
import { GET as printJobsGET, POST as printJobsPOST } from '../app/api/v1/fnb/print/jobs/route';

// Report routes
import { GET as tableTurnsGET } from '../app/api/v1/fnb/reports/table-turns/route';
import { GET as kitchenPerfGET } from '../app/api/v1/fnb/reports/kitchen-performance/route';
import { GET as daypartSalesGET } from '../app/api/v1/fnb/reports/daypart-sales/route';
import { GET as menuMixGET } from '../app/api/v1/fnb/reports/menu-mix/route';

// Settings routes
import { GET as settingsGET, PATCH as settingsPATCH } from '../app/api/v1/fnb/settings/[moduleKey]/route';
import { POST as seedPOST } from '../app/api/v1/fnb/settings/seed/route';
import { POST as validatePOST } from '../app/api/v1/fnb/settings/validate/route';

// Lock routes
import { GET as locksGET, POST as locksPOST } from '../app/api/v1/fnb/locks/route';
import { POST as lockReleasePOST } from '../app/api/v1/fnb/locks/[id]/release/route';
import { POST as lockCleanPOST } from '../app/api/v1/fnb/locks/clean/route';

// Menu routes
import { POST as eightySixPOST } from '../app/api/v1/fnb/menu/eighty-six/route';
import { POST as restorePOST } from '../app/api/v1/fnb/menu/restore/route';
import { GET as allergensGET, POST as allergensPOST } from '../app/api/v1/fnb/menu/allergens/route';

// Section routes
import { GET as sectionsGET, POST as sectionsPOST } from '../app/api/v1/fnb/sections/route';

// ═══════════════════════════════════════════════════════════════
// 1. GL Routes
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/fnb/gl/mappings', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns GL mappings list', async () => {
    const mappings = [{ id: 'map_001', entityType: 'revenue', accountId: 'acct_001' }];
    mockListFnbGlMappings.mockResolvedValue(mappings);

    const res = await glMappingsGET(makeGetRequest(`${BASE}/gl/mappings`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(mockListFnbGlMappings).toHaveBeenCalled();
  });

  it('passes locationId filter', async () => {
    mockListFnbGlMappings.mockResolvedValue([]);
    await glMappingsGET(makeGetRequest(`${BASE}/gl/mappings?locationId=loc_002`));

    expect(mockListFnbGlMappings).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001', locationId: 'loc_002' }),
    );
  });
});

describe('POST /api/v1/fnb/gl/mappings', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates a GL mapping and returns 201', async () => {
    const created = { id: 'map_new', entityType: 'revenue', accountId: 'acct_001' };
    mockConfigureFnbGlMapping.mockResolvedValue(created);

    const req = makePostRequest(`${BASE}/gl/mappings`, {
      entityType: 'revenue',
      entityId: 'subdept_001',
      accountId: 'acct_001',
    });
    const res = await glMappingsPOST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.id).toBe('map_new');
  });

  it('rejects mapping without required entityType', async () => {
    const req = makePostRequest(`${BASE}/gl/mappings`, { entityId: 'x', accountId: 'y' });
    await expect(glMappingsPOST(req)).rejects.toThrow();
  });
});

describe('PATCH /api/v1/fnb/gl/posting-config', () => {
  beforeEach(() => vi.resetAllMocks());

  it('updates posting config', async () => {
    const updated = { autoPost: true, requireApproval: false };
    mockUpdateFnbPostingConfig.mockResolvedValue(updated);

    const req = makePatchRequest(`${BASE}/gl/posting-config`, { autoPost: true });
    const res = await postingConfigPATCH(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.autoPost).toBe(true);
    expect(mockUpdateFnbPostingConfig).toHaveBeenCalled();
  });
});

describe('POST /api/v1/fnb/gl/post-batch', () => {
  beforeEach(() => vi.resetAllMocks());

  it('posts a batch to GL', async () => {
    const result = { journalEntryId: 'je_001', status: 'posted' };
    mockPostBatchToGl.mockResolvedValue(result);

    const req = makePostRequest(`${BASE}/gl/post-batch`, { closeBatchId: 'batch_001' });
    const res = await postBatchPOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.journalEntryId).toBe('je_001');
  });

  it('rejects without closeBatchId', async () => {
    const req = makePostRequest(`${BASE}/gl/post-batch`, {});
    await expect(postBatchPOST(req)).rejects.toThrow();
  });
});

describe('GET /api/v1/fnb/gl/unposted-batches', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns unposted batches list', async () => {
    const batches = [{ id: 'batch_001', businessDate: '2026-02-20', status: 'locked' }];
    mockListUnpostedBatches.mockResolvedValue(batches);

    const res = await unpostedBatchesGET(makeGetRequest(`${BASE}/gl/unposted-batches`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(mockListUnpostedBatches).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. Print Routes
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/fnb/print/routing-rules', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns routing rules', async () => {
    const rules = [{ id: 'rule_001', stationId: 'st_001', printJobType: 'kitchen_chit' }];
    mockListRoutingRulesS14.mockResolvedValue(rules);

    const res = await routingRulesGET(makeGetRequest(`${BASE}/print/routing-rules?locationId=loc_001`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(mockListRoutingRulesS14).toHaveBeenCalled();
  });
});

describe('POST /api/v1/fnb/print/routing-rules', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates a routing rule and returns 201', async () => {
    const created = { id: 'rule_new', stationId: 'st_001', printJobType: 'kitchen_chit' };
    mockCreateRoutingRuleS14.mockResolvedValue(created);

    const req = makePostRequest(`${BASE}/print/routing-rules`, {
      stationId: 'st_001',
      printJobType: 'kitchen_chit',
      printerId: 'printer_001',
    });
    const res = await routingRulesPOST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.id).toBe('rule_new');
  });

  it('rejects routing rule without stationId', async () => {
    const req = makePostRequest(`${BASE}/print/routing-rules`, { printJobType: 'kitchen_chit' });
    await expect(routingRulesPOST(req)).rejects.toThrow();
  });
});

describe('GET /api/v1/fnb/print/jobs', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns paginated print jobs', async () => {
    const jobs = [{ id: 'job_001', status: 'pending', printJobType: 'receipt' }];
    mockListPrintJobs.mockResolvedValue({ items: jobs, cursor: null, hasMore: false });

    const res = await printJobsGET(makeGetRequest(`${BASE}/print/jobs?locationId=loc_001`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.meta).toEqual({ cursor: null, hasMore: false });
  });
});

describe('POST /api/v1/fnb/print/jobs', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates a print job and returns 201', async () => {
    const created = { id: 'job_new', printJobType: 'receipt', status: 'pending' };
    mockCreatePrintJob.mockResolvedValue(created);

    const req = makePostRequest(`${BASE}/print/jobs`, {
      printJobType: 'receipt',
      content: { lines: ['Item 1'] },
      printerId: 'printer_001',
    });
    const res = await printJobsPOST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.id).toBe('job_new');
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. Report Routes
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/fnb/reports/table-turns', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns table turn data', async () => {
    const data = [{ tableId: 't_001', avgTurnMinutes: 45, turnCount: 8 }];
    mockGetTableTurns.mockResolvedValue(data);

    const res = await tableTurnsGET(
      makeGetRequest(`${BASE}/reports/table-turns?locationId=loc_001&startDate=2026-02-01&endDate=2026-02-20`),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(mockGetTableTurns).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        locationId: 'loc_001',
        startDate: '2026-02-01',
        endDate: '2026-02-20',
      }),
    );
  });

  it('rejects without required date range', async () => {
    // startDate and endDate are empty strings when missing from URL, which fail safeParse
    await expect(
      tableTurnsGET(makeGetRequest(`${BASE}/reports/table-turns?locationId=loc_001`)),
    ).rejects.toThrow();
  });
});

describe('GET /api/v1/fnb/reports/kitchen-performance', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns kitchen performance metrics', async () => {
    const data = { avgTicketTimeMinutes: 12, ticketCount: 150 };
    mockGetKitchenPerformance.mockResolvedValue(data);

    const res = await kitchenPerfGET(
      makeGetRequest(`${BASE}/reports/kitchen-performance?locationId=loc_001&startDate=2026-02-01&endDate=2026-02-20`),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.avgTicketTimeMinutes).toBe(12);
  });
});

describe('GET /api/v1/fnb/reports/daypart-sales', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns daypart sales breakdown', async () => {
    const data = [
      { daypart: 'lunch', totalSalesCents: 125000, orderCount: 45 },
      { daypart: 'dinner', totalSalesCents: 350000, orderCount: 80 },
    ];
    mockGetDaypartSales.mockResolvedValue(data);

    const res = await daypartSalesGET(
      makeGetRequest(`${BASE}/reports/daypart-sales?locationId=loc_001&startDate=2026-02-01&endDate=2026-02-20`),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
  });
});

describe('GET /api/v1/fnb/reports/menu-mix', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns menu mix with optional topN', async () => {
    const data = [{ catalogItemName: 'Burger', qtySold: 120, revenueCents: 180000 }];
    mockGetMenuMix.mockResolvedValue(data);

    const res = await menuMixGET(
      makeGetRequest(`${BASE}/reports/menu-mix?locationId=loc_001&startDate=2026-02-01&endDate=2026-02-20&topN=10`),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(mockGetMenuMix).toHaveBeenCalledWith(
      expect.objectContaining({ topN: 10 }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. Settings Routes
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/fnb/settings/[moduleKey]', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns settings for a module key', async () => {
    const settings = { moduleKey: 'general', settings: { autoFireCourses: true } };
    mockGetFnbSettings.mockResolvedValue(settings);

    const res = await settingsGET(
      makeGetRequest(`${BASE}/settings/general`),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.moduleKey).toBe('general');
    expect(mockGetFnbSettings).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001', moduleKey: 'general' }),
    );
  });
});

describe('PATCH /api/v1/fnb/settings/[moduleKey]', () => {
  beforeEach(() => vi.resetAllMocks());

  it('updates settings for a module key', async () => {
    const updated = { moduleKey: 'kitchen', settings: { defaultPrepTime: 15 } };
    mockUpdateFnbSettings.mockResolvedValue(updated);

    const req = makePatchRequest(`${BASE}/settings/kitchen`, {
      settings: { defaultPrepTime: 15 },
    });
    const res = await settingsPATCH(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.moduleKey).toBe('kitchen');
    expect(mockUpdateFnbSettings).toHaveBeenCalled();
  });
});

describe('POST /api/v1/fnb/settings/seed', () => {
  beforeEach(() => vi.resetAllMocks());

  it('seeds default settings and returns 201', async () => {
    const result = { seeded: true, moduleCount: 8 };
    mockSeedFnbSettings.mockResolvedValue(result);

    const req = makePostRequest(`${BASE}/settings/seed`, {});
    const res = await seedPOST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.seeded).toBe(true);
    // seedFnbSettings takes (ctx) only, no parsed body
    expect(mockSeedFnbSettings).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001', user: { id: 'user_001' } }),
    );
  });
});

describe('POST /api/v1/fnb/settings/validate', () => {
  beforeEach(() => vi.resetAllMocks());

  it('validates settings without saving', async () => {
    const result = { valid: true, errors: [] };
    mockValidateFnbSettings.mockResolvedValue(result);

    const req = makePostRequest(`${BASE}/settings/validate`, {
      moduleKey: 'general',
      settings: { autoFireCourses: true },
    });
    const res = await validatePOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.valid).toBe(true);
    // validateFnbSettings takes (input) only
    expect(mockValidateFnbSettings).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. Lock Routes
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/fnb/locks', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns active locks (query pattern, no ctx)', async () => {
    const locks = [{ id: 'lock_001', entityType: 'tab', entityId: 'tab_001', userId: 'user_001' }];
    mockListActiveLocks.mockResolvedValue(locks);

    const res = await locksGET(makeGetRequest(`${BASE}/locks`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    // Query — takes input only, tenantId injected from ctx
    expect(mockListActiveLocks).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
    );
  });

  it('filters by entityType', async () => {
    mockListActiveLocks.mockResolvedValue([]);
    await locksGET(makeGetRequest(`${BASE}/locks?entityType=tab`));

    expect(mockListActiveLocks).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'tab' }),
    );
  });
});

describe('POST /api/v1/fnb/locks', () => {
  beforeEach(() => vi.resetAllMocks());

  it('acquires a soft lock and returns 201', async () => {
    const lock = { id: 'lock_new', entityType: 'tab', entityId: 'tab_001', expiresAt: '2026-02-20T12:05:00Z' };
    mockAcquireSoftLock.mockResolvedValue(lock);

    const req = makePostRequest(`${BASE}/locks`, {
      entityType: 'tab',
      entityId: 'tab_001',
    });
    const res = await locksPOST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.id).toBe('lock_new');
    // Command — takes (ctx, input)
    expect(mockAcquireSoftLock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      expect.objectContaining({ entityType: 'tab', entityId: 'tab_001' }),
    );
  });

  it('rejects lock without entityType', async () => {
    const req = makePostRequest(`${BASE}/locks`, { entityId: 'tab_001' });
    await expect(locksPOST(req)).rejects.toThrow();
  });
});

describe('POST /api/v1/fnb/locks/[id]/release', () => {
  beforeEach(() => vi.resetAllMocks());

  it('releases a soft lock', async () => {
    mockReleaseSoftLock.mockResolvedValue(undefined);

    const req = makePostRequest(`${BASE}/locks/lock_001/release`, {});
    const res = await lockReleasePOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.success).toBe(true);
    // Command — takes (ctx, input) with lockId from URL
    expect(mockReleaseSoftLock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      expect.objectContaining({ lockId: 'lock_001' }),
    );
  });
});

describe('POST /api/v1/fnb/locks/clean', () => {
  beforeEach(() => vi.resetAllMocks());

  it('cleans expired locks (input only, no ctx)', async () => {
    const result = { cleaned: 3 };
    mockCleanExpiredLocks.mockResolvedValue(result);

    const req = makePostRequest(`${BASE}/locks/clean`, {});
    const res = await lockCleanPOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.cleaned).toBe(3);
    // cleanExpiredLocks takes (input) only — { tenantId } built from ctx
    expect(mockCleanExpiredLocks).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. Menu Routes
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/fnb/menu/eighty-six', () => {
  beforeEach(() => vi.resetAllMocks());

  it('86s an item and returns result', async () => {
    const result = { catalogItemId: 'item_001', eightySixedAt: '2026-02-20T12:00:00Z' };
    mockEightySixItem.mockResolvedValue(result);

    const req = makePostRequest(`${BASE}/menu/eighty-six`, { catalogItemId: 'item_001' });
    const res = await eightySixPOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.catalogItemId).toBe('item_001');
    // Command — takes (ctx, input)
    expect(mockEightySixItem).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      expect.objectContaining({ catalogItemId: 'item_001' }),
    );
  });

  it('rejects without catalogItemId', async () => {
    const req = makePostRequest(`${BASE}/menu/eighty-six`, {});
    await expect(eightySixPOST(req)).rejects.toThrow();
  });
});

describe('POST /api/v1/fnb/menu/restore', () => {
  beforeEach(() => vi.resetAllMocks());

  it('restores an 86d item', async () => {
    const result = { catalogItemId: 'item_001', restoredAt: '2026-02-20T12:30:00Z' };
    mockRestoreItem.mockResolvedValue(result);

    const req = makePostRequest(`${BASE}/menu/restore`, { catalogItemId: 'item_001' });
    const res = await restorePOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.catalogItemId).toBe('item_001');
    expect(mockRestoreItem).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      expect.objectContaining({ catalogItemId: 'item_001' }),
    );
  });
});

describe('GET /api/v1/fnb/menu/allergens', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns allergens list', async () => {
    const allergens = [{ id: 'alg_001', name: 'Gluten' }, { id: 'alg_002', name: 'Dairy' }];
    mockListAllergens.mockResolvedValue(allergens);

    const res = await allergensGET(makeGetRequest(`${BASE}/menu/allergens`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(mockListAllergens).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
    );
  });
});

describe('POST /api/v1/fnb/menu/allergens', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates an allergen and returns 201', async () => {
    const created = { id: 'alg_new', name: 'Shellfish' };
    mockCreateAllergen.mockResolvedValue(created);

    const req = makePostRequest(`${BASE}/menu/allergens`, { name: 'Shellfish' });
    const res = await allergensPOST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.name).toBe('Shellfish');
  });

  it('rejects allergen without name', async () => {
    const req = makePostRequest(`${BASE}/menu/allergens`, {});
    await expect(allergensPOST(req)).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. Section Routes
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/fnb/sections', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns sections list', async () => {
    const sections = [{ id: 'sec_001', name: 'Patio', isActive: true }];
    mockListSections.mockResolvedValue(sections);

    const res = await sectionsGET(makeGetRequest(`${BASE}/sections`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(mockListSections).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
    );
  });

  it('passes roomId and isActive filters', async () => {
    mockListSections.mockResolvedValue([]);
    await sectionsGET(makeGetRequest(`${BASE}/sections?roomId=room_001&isActive=false`));

    expect(mockListSections).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: 'room_001', isActive: false }),
    );
  });
});

describe('POST /api/v1/fnb/sections', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates a section and returns 201', async () => {
    const created = { id: 'sec_new', name: 'Bar Area', isActive: true };
    mockCreateSection.mockResolvedValue(created);

    const req = makePostRequest(`${BASE}/sections`, { name: 'Bar Area', roomId: 'room_001' });
    const res = await sectionsPOST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.name).toBe('Bar Area');
    expect(mockCreateSection).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      expect.objectContaining({ name: 'Bar Area' }),
    );
  });

  it('rejects section without name', async () => {
    const req = makePostRequest(`${BASE}/sections`, { roomId: 'room_001' });
    await expect(sectionsPOST(req)).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// Route exports verification
// ═══════════════════════════════════════════════════════════════

describe('FnB comprehensive route exports', () => {
  it('exports GL route handlers', () => {
    expect(typeof glMappingsGET).toBe('function');
    expect(typeof glMappingsPOST).toBe('function');
    expect(typeof postingConfigPATCH).toBe('function');
    expect(typeof postBatchPOST).toBe('function');
    expect(typeof unpostedBatchesGET).toBe('function');
  });

  it('exports print route handlers', () => {
    expect(typeof routingRulesGET).toBe('function');
    expect(typeof routingRulesPOST).toBe('function');
    expect(typeof printJobsGET).toBe('function');
    expect(typeof printJobsPOST).toBe('function');
  });

  it('exports report route handlers', () => {
    expect(typeof tableTurnsGET).toBe('function');
    expect(typeof kitchenPerfGET).toBe('function');
    expect(typeof daypartSalesGET).toBe('function');
    expect(typeof menuMixGET).toBe('function');
  });

  it('exports settings route handlers', () => {
    expect(typeof settingsGET).toBe('function');
    expect(typeof settingsPATCH).toBe('function');
    expect(typeof seedPOST).toBe('function');
    expect(typeof validatePOST).toBe('function');
  });

  it('exports lock route handlers', () => {
    expect(typeof locksGET).toBe('function');
    expect(typeof locksPOST).toBe('function');
    expect(typeof lockReleasePOST).toBe('function');
    expect(typeof lockCleanPOST).toBe('function');
  });

  it('exports menu route handlers', () => {
    expect(typeof eightySixPOST).toBe('function');
    expect(typeof restorePOST).toBe('function');
    expect(typeof allergensGET).toBe('function');
    expect(typeof allergensPOST).toBe('function');
  });

  it('exports section route handlers', () => {
    expect(typeof sectionsGET).toBe('function');
    expect(typeof sectionsPOST).toBe('function');
  });
});
