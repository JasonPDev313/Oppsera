import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────
const {
  mockListGlAccounts,
  mockCreateGlAccount,
  mockUpdateGlAccount,
  mockListJournalEntries,
  mockGetJournalEntry,
  mockPostJournalEntry,
  mockPostDraftEntry,
  mockVoidJournalEntry,
  mockGetTrialBalance,
  mockGetGlSummary,
  mockGetProfitAndLoss,
  mockListUnmappedEvents,
  mockGetAccountingSettings,
  mockUpdateAccountingSettings,
  mockCreateGlClassification,
  mockWithMiddleware,
  mockWithTenant,
} = vi.hoisted(() => {
  const mockListGlAccounts = vi.fn();
  const mockCreateGlAccount = vi.fn();
  const mockUpdateGlAccount = vi.fn();
  const mockListJournalEntries = vi.fn();
  const mockGetJournalEntry = vi.fn();
  const mockPostJournalEntry = vi.fn();
  const mockPostDraftEntry = vi.fn();
  const mockVoidJournalEntry = vi.fn();
  const mockGetTrialBalance = vi.fn();
  const mockGetGlSummary = vi.fn();
  const mockGetProfitAndLoss = vi.fn();
  const mockListUnmappedEvents = vi.fn();
  const mockGetAccountingSettings = vi.fn();
  const mockUpdateAccountingSettings = vi.fn();
  const mockCreateGlClassification = vi.fn();

  const mockWithMiddleware = vi.fn(
    (handler: (...args: any[]) => any, _options: unknown) => {
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
    },
  );

  const mockWithTenant = vi.fn((_tenantId: string, fn: (tx: any) => any) => fn({}));

  return {
    mockListGlAccounts,
    mockCreateGlAccount,
    mockUpdateGlAccount,
    mockListJournalEntries,
    mockGetJournalEntry,
    mockPostJournalEntry,
    mockPostDraftEntry,
    mockVoidJournalEntry,
    mockGetTrialBalance,
    mockGetGlSummary,
    mockGetProfitAndLoss,
    mockListUnmappedEvents,
    mockGetAccountingSettings,
    mockUpdateAccountingSettings,
    mockCreateGlClassification,
    mockWithMiddleware,
    mockWithTenant,
  };
});

// ── Module mocks ──────────────────────────────────────────────

vi.mock('@oppsera/core/auth/with-middleware', () => ({
  withMiddleware: mockWithMiddleware,
}));

vi.mock('@oppsera/module-accounting', () => ({
  listGlAccounts: mockListGlAccounts,
  createGlAccount: mockCreateGlAccount,
  createGlAccountSchema: {
    safeParse: (data: any) => {
      if (!data.accountNumber || !data.name || !data.accountType || !data.classificationId) {
        return {
          success: false,
          error: {
            issues: [{ path: ['accountNumber'], message: 'Required' }],
          },
        };
      }
      return { success: true, data };
    },
  },
  updateGlAccount: mockUpdateGlAccount,
  updateGlAccountSchema: {
    safeParse: (data: any) => {
      if (data && typeof data === 'object') {
        return { success: true, data };
      }
      return {
        success: false,
        error: { issues: [{ path: ['name'], message: 'Required' }] },
      };
    },
  },
  listJournalEntries: mockListJournalEntries,
  getJournalEntry: mockGetJournalEntry,
  postJournalEntry: mockPostJournalEntry,
  postJournalEntrySchema: {
    safeParse: (data: any) => {
      if (!data.entryDate || !data.lines || !Array.isArray(data.lines) || data.lines.length < 2) {
        return {
          success: false,
          error: {
            issues: [{ path: ['lines'], message: 'At least 2 lines required' }],
          },
        };
      }
      return { success: true, data };
    },
  },
  postDraftEntry: mockPostDraftEntry,
  voidJournalEntry: mockVoidJournalEntry,
  getTrialBalance: mockGetTrialBalance,
  getGlSummary: mockGetGlSummary,
  getProfitAndLoss: mockGetProfitAndLoss,
  listUnmappedEvents: mockListUnmappedEvents,
  getAccountingSettings: mockGetAccountingSettings,
  updateAccountingSettings: mockUpdateAccountingSettings,
  updateAccountingSettingsSchema: {
    safeParse: (data: any) => {
      if (data && typeof data === 'object') {
        return { success: true, data };
      }
      return {
        success: false,
        error: { issues: [{ path: ['fiscalYearStart'], message: 'Invalid' }] },
      };
    },
  },
  createGlClassification: mockCreateGlClassification,
  createGlClassificationSchema: {
    safeParse: (data: any) => {
      if (!data.name || !data.accountType) {
        return {
          success: false,
          error: { issues: [{ path: ['name'], message: 'Required' }] },
        };
      }
      return { success: true, data };
    },
  },
}));

vi.mock('@oppsera/db', () => ({
  withTenant: mockWithTenant,
  sql: (strings: TemplateStringsArray, ...values: any[]) => ({
    strings,
    values,
  }),
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
  NotFoundError: class NotFoundError extends Error {
    code = 'NOT_FOUND';
    statusCode = 404;
    constructor(entity: string, id?: string) {
      super(id ? `${entity} ${id} not found` : `${entity} not found`);
    }
  },
}));

// ── Helpers ───────────────────────────────────────────────────

function makeGetRequest(url: string) {
  return { url, method: 'GET' } as any;
}

function makePostRequest(url: string, body: unknown) {
  return {
    url,
    method: 'POST',
    json: vi.fn().mockResolvedValue(body),
  } as any;
}

function makePatchRequest(url: string, body: unknown) {
  return {
    url,
    method: 'PATCH',
    json: vi.fn().mockResolvedValue(body),
  } as any;
}

const BASE = 'http://localhost/api/v1/accounting';

// ── Route imports (after mocks) ──────────────────────────────

import { GET as accountsGET, POST as accountsPOST } from '../app/api/v1/accounting/accounts/route';
import { GET as accountDetailGET, PATCH as accountPATCH } from '../app/api/v1/accounting/accounts/[id]/route';
import { GET as journalsGET, POST as journalsPOST } from '../app/api/v1/accounting/journals/route';
import { GET as journalDetailGET } from '../app/api/v1/accounting/journals/[id]/route';
import { POST as journalPostPOST } from '../app/api/v1/accounting/journals/[id]/post/route';
import { POST as journalVoidPOST } from '../app/api/v1/accounting/journals/[id]/void/route';
import { GET as trialBalanceGET } from '../app/api/v1/accounting/reports/trial-balance/route';
import { GET as glSummaryGET } from '../app/api/v1/accounting/reports/summary/route';
import { GET as profitLossGET } from '../app/api/v1/accounting/statements/profit-loss/route';
import { GET as unmappedEventsGET } from '../app/api/v1/accounting/unmapped-events/route';

// ═══════════════════════════════════════════════════════════════
// GL Accounts — List
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/accounting/accounts', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns list of GL accounts with { data } shape', async () => {
    const accounts = [
      { id: 'acct_001', accountNumber: '1000', name: 'Cash', accountType: 'asset' },
      { id: 'acct_002', accountNumber: '2000', name: 'AP', accountType: 'liability' },
    ];
    mockListGlAccounts.mockResolvedValue({ items: accounts });

    const res = await accountsGET(makeGetRequest(`${BASE}/accounts`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual(accounts);
    expect(body.data).toHaveLength(2);
  });

  it('passes filter params to query', async () => {
    mockListGlAccounts.mockResolvedValue({ items: [] });

    await accountsGET(
      makeGetRequest(`${BASE}/accounts?accountType=asset&isActive=true&includeBalance=true`),
    );

    expect(mockListGlAccounts).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        accountType: 'asset',
        isActive: true,
        includeBalance: true,
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// GL Accounts — Create
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/accounting/accounts', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates an account and returns 201 with { data }', async () => {
    const created = { id: 'acct_new', accountNumber: '1100', name: 'Petty Cash', accountType: 'asset' };
    mockCreateGlAccount.mockResolvedValue(created);

    const req = makePostRequest(`${BASE}/accounts`, {
      accountNumber: '1100',
      name: 'Petty Cash',
      accountType: 'asset',
      classificationId: 'cls_001',
    });
    const res = await accountsPOST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data).toEqual(created);
  });

  it('throws ValidationError for missing required fields', async () => {
    const req = makePostRequest(`${BASE}/accounts`, { name: 'Incomplete' });

    // The route handler throws ValidationError (caught by real withMiddleware → 400).
    // Our mock middleware does not catch, so the throw propagates.
    await expect(accountsPOST(req)).rejects.toThrow('Validation failed');
  });
});

// ═══════════════════════════════════════════════════════════════
// GL Account — Get by ID
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/accounting/accounts/:id', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns single account with { data }', async () => {
    const account = { id: 'acct_001', accountNumber: '1000', name: 'Cash', accountType: 'asset' };
    mockListGlAccounts.mockResolvedValue({ items: [account] });

    const res = await accountDetailGET(makeGetRequest(`${BASE}/accounts/acct_001`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.id).toBe('acct_001');
  });

  it('returns 404 when account not found', async () => {
    mockListGlAccounts.mockResolvedValue({ items: [] });

    const res = await accountDetailGET(makeGetRequest(`${BASE}/accounts/acct_missing`));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

// ═══════════════════════════════════════════════════════════════
// GL Account — Update
// ═══════════════════════════════════════════════════════════════

describe('PATCH /api/v1/accounting/accounts/:id', () => {
  beforeEach(() => vi.resetAllMocks());

  it('updates an account and returns { data }', async () => {
    const updated = { id: 'acct_001', accountNumber: '1000', name: 'Cash Updated' };
    mockUpdateGlAccount.mockResolvedValue(updated);

    const req = makePatchRequest(`${BASE}/accounts/acct_001`, { name: 'Cash Updated' });
    const res = await accountPATCH(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.name).toBe('Cash Updated');
  });
});

// ═══════════════════════════════════════════════════════════════
// Journal Entries — List
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/accounting/journals', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns paginated list with { data, meta }', async () => {
    const entries = [
      { id: 'je_001', journalNumber: 'JE-000001', status: 'posted', entryDate: '2026-01-15' },
    ];
    mockListJournalEntries.mockResolvedValue({
      items: entries,
      cursor: null,
      hasMore: false,
    });

    const res = await journalsGET(makeGetRequest(`${BASE}/journals?startDate=2026-01-01&endDate=2026-01-31`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.meta).toEqual({ cursor: null, hasMore: false });
  });

  it('passes all filter params to query', async () => {
    mockListJournalEntries.mockResolvedValue({ items: [], cursor: null, hasMore: false });

    await journalsGET(
      makeGetRequest(`${BASE}/journals?startDate=2026-01-01&endDate=2026-01-31&sourceModule=pos&status=posted&limit=50`),
    );

    expect(mockListJournalEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        sourceModule: 'pos',
        status: 'posted',
        limit: 50,
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Journal Entry — Create
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/accounting/journals', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates a journal entry and returns 201', async () => {
    const entry = { id: 'je_new', journalNumber: 'JE-000002', status: 'posted' };
    mockPostJournalEntry.mockResolvedValue(entry);

    const req = makePostRequest(`${BASE}/journals`, {
      entryDate: '2026-02-01',
      memo: 'Test entry',
      lines: [
        { accountId: 'acct_001', debit: '100.00', credit: '0.00' },
        { accountId: 'acct_002', debit: '0.00', credit: '100.00' },
      ],
    });
    const res = await journalsPOST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.id).toBe('je_new');
  });

  it('rejects journal entry with fewer than 2 lines', async () => {
    const req = makePostRequest(`${BASE}/journals`, {
      entryDate: '2026-02-01',
      lines: [{ accountId: 'acct_001', debit: '100.00' }],
    });

    // Validation fails — route throws ValidationError
    await expect(journalsPOST(req)).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// Journal Entry — Get Detail
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/accounting/journals/:id', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns journal entry with lines', async () => {
    const entry = {
      id: 'je_001',
      journalNumber: 'JE-000001',
      status: 'posted',
      lines: [
        { accountId: 'acct_001', debit: '100.00', credit: '0.00' },
        { accountId: 'acct_002', debit: '0.00', credit: '100.00' },
      ],
    };
    mockGetJournalEntry.mockResolvedValue(entry);

    const res = await journalDetailGET(makeGetRequest(`${BASE}/journals/je_001`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.id).toBe('je_001');
    expect(body.data.lines).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// Journal Entry — Post Draft
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/accounting/journals/:id/post', () => {
  beforeEach(() => vi.resetAllMocks());

  it('posts a draft entry and returns { data }', async () => {
    const posted = { id: 'je_001', status: 'posted' };
    mockPostDraftEntry.mockResolvedValue(posted);

    const req = makePostRequest(`${BASE}/journals/je_001/post`, {});
    const res = await journalPostPOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('posted');
  });
});

// ═══════════════════════════════════════════════════════════════
// Journal Entry — Void
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/accounting/journals/:id/void', () => {
  beforeEach(() => vi.resetAllMocks());

  it('voids a journal entry with reason', async () => {
    const voided = { id: 'je_001', status: 'voided' };
    mockVoidJournalEntry.mockResolvedValue(voided);

    const req = makePostRequest(`${BASE}/journals/je_001/void`, { reason: 'Duplicate entry' });
    const res = await journalVoidPOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('voided');
  });

  it('returns 400 when reason is missing', async () => {
    const req = makePostRequest(`${BASE}/journals/je_001/void`, {});
    const res = await journalVoidPOST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('reason');
  });
});

// ═══════════════════════════════════════════════════════════════
// Reports — Trial Balance
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/accounting/reports/trial-balance', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns trial balance report with { data }', async () => {
    const report = {
      accounts: [
        { accountId: 'acct_001', accountName: 'Cash', debit: '5000.00', credit: '0.00' },
      ],
      totalDebits: '5000.00',
      totalCredits: '5000.00',
    };
    mockGetTrialBalance.mockResolvedValue(report);

    const res = await trialBalanceGET(
      makeGetRequest(`${BASE}/reports/trial-balance?asOfDate=2026-01-31`),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.accounts).toBeDefined();
    expect(body.data.totalDebits).toBe('5000.00');
  });
});

// ═══════════════════════════════════════════════════════════════
// Reports — GL Summary
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/accounting/reports/summary', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns GL summary', async () => {
    const report = {
      classifications: [{ name: 'Assets', balance: '10000.00' }],
    };
    mockGetGlSummary.mockResolvedValue(report);

    const res = await glSummaryGET(
      makeGetRequest(`${BASE}/reports/summary?startDate=2026-01-01&endDate=2026-01-31`),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.classifications).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Statements — Profit & Loss
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/accounting/statements/profit-loss', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns P&L statement with { data }', async () => {
    const report = {
      revenue: { total: '50000.00', sections: [] },
      expenses: { total: '30000.00', sections: [] },
      netIncome: '20000.00',
    };
    mockGetProfitAndLoss.mockResolvedValue(report);

    const res = await profitLossGET(
      makeGetRequest(`${BASE}/statements/profit-loss?from=2026-01-01&to=2026-01-31`),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.netIncome).toBe('20000.00');
  });

  it('returns 400 when from/to params are missing', async () => {
    const res = await profitLossGET(
      makeGetRequest(`${BASE}/statements/profit-loss`),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('from and to are required');
  });
});

// ═══════════════════════════════════════════════════════════════
// Unmapped Events
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/accounting/unmapped-events', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns paginated unmapped events', async () => {
    const events = [
      { id: 'evt_001', eventType: 'tender.recorded.v1', resolved: false },
    ];
    mockListUnmappedEvents.mockResolvedValue({
      items: events,
      cursor: null,
      hasMore: false,
    });

    const res = await unmappedEventsGET(makeGetRequest(`${BASE}/unmapped-events`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.meta).toEqual({ cursor: null, hasMore: false });
  });
});

// ═══════════════════════════════════════════════════════════════
// Route exports verification
// ═══════════════════════════════════════════════════════════════

describe('accounting route exports', () => {
  it('exports GET and POST for /accounts', () => {
    expect(typeof accountsGET).toBe('function');
    expect(typeof accountsPOST).toBe('function');
  });

  it('exports GET and PATCH for /accounts/:id', () => {
    expect(typeof accountDetailGET).toBe('function');
    expect(typeof accountPATCH).toBe('function');
  });

  it('exports GET and POST for /journals', () => {
    expect(typeof journalsGET).toBe('function');
    expect(typeof journalsPOST).toBe('function');
  });

  it('exports POST for /journals/:id/void', () => {
    expect(typeof journalVoidPOST).toBe('function');
  });
});
