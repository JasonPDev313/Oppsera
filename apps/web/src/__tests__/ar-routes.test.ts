import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────
const {
  mockListInvoices,
  mockCreateInvoice,
  mockGetInvoice,
  mockPostInvoice,
  mockVoidInvoice,
  mockListReceipts,
  mockCreateReceipt,
  mockPostReceipt,
  mockVoidReceipt,
  mockGetArAging,
  mockGetCustomerLedger,
  mockGetOpenInvoices,
  mockWithMiddleware,
} = vi.hoisted(() => {
  const mockListInvoices = vi.fn();
  const mockCreateInvoice = vi.fn();
  const mockGetInvoice = vi.fn();
  const mockPostInvoice = vi.fn();
  const mockVoidInvoice = vi.fn();
  const mockListReceipts = vi.fn();
  const mockCreateReceipt = vi.fn();
  const mockPostReceipt = vi.fn();
  const mockVoidReceipt = vi.fn();
  const mockGetArAging = vi.fn();
  const mockGetCustomerLedger = vi.fn();
  const mockGetOpenInvoices = vi.fn();

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

  return {
    mockListInvoices,
    mockCreateInvoice,
    mockGetInvoice,
    mockPostInvoice,
    mockVoidInvoice,
    mockListReceipts,
    mockCreateReceipt,
    mockPostReceipt,
    mockVoidReceipt,
    mockGetArAging,
    mockGetCustomerLedger,
    mockGetOpenInvoices,
    mockWithMiddleware,
  };
});

// ── Module mocks ──────────────────────────────────────────────

vi.mock('@oppsera/core/auth/with-middleware', () => ({
  withMiddleware: mockWithMiddleware,
}));

vi.mock('@oppsera/module-ar', () => ({
  listInvoices: mockListInvoices,
  createInvoice: mockCreateInvoice,
  createInvoiceSchema: {
    safeParse: (data: any) => {
      if (!data.customerId || !data.invoiceDate || !data.lines || data.lines.length === 0) {
        return {
          success: false,
          error: {
            issues: [{ path: ['customerId'], message: 'Required' }],
          },
        };
      }
      return { success: true, data };
    },
  },
  getInvoice: mockGetInvoice,
  postInvoice: mockPostInvoice,
  voidInvoice: mockVoidInvoice,
  listReceipts: mockListReceipts,
  createReceipt: mockCreateReceipt,
  createReceiptSchema: {
    safeParse: (data: any) => {
      if (!data.customerId || !data.amount || !data.receiptDate || !data.allocations) {
        return {
          success: false,
          error: {
            issues: [{ path: ['customerId'], message: 'Required' }],
          },
        };
      }
      return { success: true, data };
    },
  },
  postReceipt: mockPostReceipt,
  voidReceipt: mockVoidReceipt,
  getArAging: mockGetArAging,
  getCustomerLedger: mockGetCustomerLedger,
  getOpenInvoices: mockGetOpenInvoices,
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

const BASE = 'http://localhost/api/v1/ar';

// ── Route imports (after mocks) ──────────────────────────────

import { GET as invoicesGET, POST as invoicesPOST } from '../app/api/v1/ar/invoices/route';
import { GET as invoiceDetailGET } from '../app/api/v1/ar/invoices/[id]/route';
import { POST as invoicePostPOST } from '../app/api/v1/ar/invoices/[id]/post/route';
import { POST as invoiceVoidPOST } from '../app/api/v1/ar/invoices/[id]/void/route';
import { GET as receiptsGET, POST as receiptsPOST } from '../app/api/v1/ar/receipts/route';
import { POST as receiptPostPOST } from '../app/api/v1/ar/receipts/[id]/post/route';
import { POST as receiptVoidPOST } from '../app/api/v1/ar/receipts/[id]/void/route';
import { GET as agingGET } from '../app/api/v1/ar/reports/aging/route';
import { GET as customerLedgerGET } from '../app/api/v1/ar/reports/customer-ledger/[customerId]/route';
import { GET as openInvoicesGET } from '../app/api/v1/ar/reports/open-invoices/route';

// ═══════════════════════════════════════════════════════════════
// Invoices — List
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/ar/invoices', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns paginated list of invoices with { data, meta }', async () => {
    const invoices = [
      { id: 'inv_001', customerId: 'c_001', totalAmount: '2000.00', status: 'posted' },
    ];
    mockListInvoices.mockResolvedValue({ items: invoices, cursor: null, hasMore: false });

    const res = await invoicesGET(makeGetRequest(`${BASE}/invoices`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.meta).toEqual({ cursor: null, hasMore: false });
  });

  it('passes filter parameters to query', async () => {
    mockListInvoices.mockResolvedValue({ items: [], cursor: null, hasMore: false });

    await invoicesGET(
      makeGetRequest(`${BASE}/invoices?customerId=c_001&status=posted&limit=10`),
    );

    expect(mockListInvoices).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        customerId: 'c_001',
        status: 'posted',
        limit: 10,
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Invoices — Create
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/ar/invoices', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates an invoice and returns 201', async () => {
    const created = { id: 'inv_new', customerId: 'c_001', totalAmount: '1500.00', status: 'draft' };
    mockCreateInvoice.mockResolvedValue(created);

    const req = makePostRequest(`${BASE}/invoices`, {
      customerId: 'c_001',
      invoiceDate: '2026-02-15',
      dueDate: '2026-03-15',
      lines: [{ description: 'Consulting', quantity: '10', unitPrice: '150.00', accountId: 'acct_001' }],
    });
    const res = await invoicesPOST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.id).toBe('inv_new');
    expect(body.data.status).toBe('draft');
  });

  it('rejects invoice without required fields', async () => {
    const req = makePostRequest(`${BASE}/invoices`, {
      invoiceDate: '2026-02-15',
      lines: [],
    });

    await expect(invoicesPOST(req)).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// Invoices — Get Detail
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/ar/invoices/:id', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns invoice detail with lines', async () => {
    const invoice = {
      id: 'inv_001',
      customerId: 'c_001',
      totalAmount: '2000.00',
      balanceDue: '2000.00',
      status: 'posted',
      lines: [{ id: 'line_001', description: 'Service', amount: '2000.00' }],
    };
    mockGetInvoice.mockResolvedValue(invoice);

    const res = await invoiceDetailGET(makeGetRequest(`${BASE}/invoices/inv_001`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.id).toBe('inv_001');
    expect(body.data.lines).toHaveLength(1);
  });

  it('throws NotFoundError when invoice does not exist', async () => {
    mockGetInvoice.mockResolvedValue(null);

    await expect(
      invoiceDetailGET(makeGetRequest(`${BASE}/invoices/inv_missing`)),
    ).rejects.toThrow('Invoice inv_missing not found');
  });
});

// ═══════════════════════════════════════════════════════════════
// Invoices — Post
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/ar/invoices/:id/post', () => {
  beforeEach(() => vi.resetAllMocks());

  it('posts a draft invoice and returns { data }', async () => {
    const posted = { id: 'inv_001', status: 'posted' };
    mockPostInvoice.mockResolvedValue(posted);

    const req = makePostRequest(`${BASE}/invoices/inv_001/post`, {});
    const res = await invoicePostPOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('posted');
  });

  it('passes invoiceId extracted from URL path', async () => {
    mockPostInvoice.mockResolvedValue({ id: 'inv_001', status: 'posted' });

    const req = makePostRequest(`${BASE}/invoices/inv_001/post`, {});
    await invoicePostPOST(req);

    expect(mockPostInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      { invoiceId: 'inv_001' },
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Invoices — Void
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/ar/invoices/:id/void', () => {
  beforeEach(() => vi.resetAllMocks());

  it('voids an invoice with reason', async () => {
    const voided = { id: 'inv_001', status: 'voided' };
    mockVoidInvoice.mockResolvedValue(voided);

    const req = makePostRequest(`${BASE}/invoices/inv_001/void`, { reason: 'Billing error' });
    const res = await invoiceVoidPOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('voided');
  });

  it('returns 400 when reason is missing', async () => {
    const req = makePostRequest(`${BASE}/invoices/inv_001/void`, {});
    const res = await invoiceVoidPOST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('reason');
  });

  it('returns 400 when reason is not a string', async () => {
    const req = makePostRequest(`${BASE}/invoices/inv_001/void`, { reason: 123 });
    const res = await invoiceVoidPOST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ═══════════════════════════════════════════════════════════════
// Receipts — List
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/ar/receipts', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns paginated list of receipts', async () => {
    const receipts = [
      { id: 'rcpt_001', customerId: 'c_001', amount: '1000.00', status: 'posted' },
    ];
    mockListReceipts.mockResolvedValue({ items: receipts, cursor: null, hasMore: false });

    const res = await receiptsGET(makeGetRequest(`${BASE}/receipts`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.meta).toEqual({ cursor: null, hasMore: false });
  });
});

// ═══════════════════════════════════════════════════════════════
// Receipts — Create
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/ar/receipts', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates a receipt and returns 201', async () => {
    const created = { id: 'rcpt_new', customerId: 'c_001', amount: '500.00', status: 'draft' };
    mockCreateReceipt.mockResolvedValue(created);

    const req = makePostRequest(`${BASE}/receipts`, {
      customerId: 'c_001',
      receiptDate: '2026-02-15',
      paymentMethod: 'check',
      amount: '500.00',
      allocations: [{ invoiceId: 'inv_001', amount: '500.00' }],
    });
    const res = await receiptsPOST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.id).toBe('rcpt_new');
  });

  it('rejects receipt without required fields', async () => {
    const req = makePostRequest(`${BASE}/receipts`, {
      paymentMethod: 'check',
    });

    await expect(receiptsPOST(req)).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// Receipts — Post
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/ar/receipts/:id/post', () => {
  beforeEach(() => vi.resetAllMocks());

  it('posts a receipt and returns { data }', async () => {
    const posted = { id: 'rcpt_001', status: 'posted' };
    mockPostReceipt.mockResolvedValue(posted);

    const req = makePostRequest(`${BASE}/receipts/rcpt_001/post`, {});
    const res = await receiptPostPOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('posted');
  });
});

// ═══════════════════════════════════════════════════════════════
// Receipts — Void
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/ar/receipts/:id/void', () => {
  beforeEach(() => vi.resetAllMocks());

  it('voids a receipt with reason', async () => {
    const voided = { id: 'rcpt_001', status: 'voided' };
    mockVoidReceipt.mockResolvedValue(voided);

    const req = makePostRequest(`${BASE}/receipts/rcpt_001/void`, { reason: 'Duplicate' });
    const res = await receiptVoidPOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('voided');
  });

  it('returns 400 when reason is missing', async () => {
    const req = makePostRequest(`${BASE}/receipts/rcpt_001/void`, {});
    const res = await receiptVoidPOST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('reason');
  });
});

// ═══════════════════════════════════════════════════════════════
// AR Aging
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/ar/reports/aging', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns AR aging report with { data }', async () => {
    const report = {
      customers: [
        { customerId: 'c_001', customerName: 'Acme Corp', current: '1000.00', days30: '500.00', days60: '0.00', days90: '0.00', over90: '0.00', total: '1500.00' },
      ],
      totals: { current: '1000.00', days30: '500.00', days60: '0.00', days90: '0.00', over90: '0.00', total: '1500.00' },
    };
    mockGetArAging.mockResolvedValue(report);

    const res = await agingGET(makeGetRequest(`${BASE}/reports/aging?asOfDate=2026-02-20`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.customers).toBeDefined();
    expect(body.data.totals).toBeDefined();
  });

  it('passes customerId filter to query', async () => {
    mockGetArAging.mockResolvedValue({ customers: [], totals: {} });

    await agingGET(
      makeGetRequest(`${BASE}/reports/aging?asOfDate=2026-02-20&customerId=c_001`),
    );

    expect(mockGetArAging).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        asOfDate: '2026-02-20',
        customerId: 'c_001',
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Customer Ledger
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/ar/reports/customer-ledger/:customerId', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns customer ledger with running balance', async () => {
    const ledger = {
      entries: [
        { date: '2026-01-10', type: 'invoice', reference: 'INV-001', debit: '2000.00', credit: '0.00', balance: '2000.00' },
        { date: '2026-02-01', type: 'receipt', reference: 'RCPT-001', debit: '0.00', credit: '1000.00', balance: '1000.00' },
      ],
      openingBalance: '0.00',
      closingBalance: '1000.00',
    };
    mockGetCustomerLedger.mockResolvedValue(ledger);

    const res = await customerLedgerGET(
      makeGetRequest(`${BASE}/reports/customer-ledger/c_001?fromDate=2026-01-01&toDate=2026-02-28`),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.entries).toHaveLength(2);
  });

  it('extracts customerId from URL path', async () => {
    mockGetCustomerLedger.mockResolvedValue({ entries: [] });

    await customerLedgerGET(
      makeGetRequest(`${BASE}/reports/customer-ledger/c_001`),
    );

    expect(mockGetCustomerLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        customerId: 'c_001',
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Open Invoices
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/ar/reports/open-invoices', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns paginated open invoices with { data, meta }', async () => {
    const result = {
      items: [{ id: 'inv_001', customerName: 'Acme Corp', balanceDue: '1500.00', dueDate: '2026-03-01' }],
      cursor: null,
      hasMore: false,
    };
    mockGetOpenInvoices.mockResolvedValue(result);

    const res = await openInvoicesGET(makeGetRequest(`${BASE}/reports/open-invoices`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.meta).toEqual({ cursor: null, hasMore: false });
  });

  it('passes overdue filter to query', async () => {
    mockGetOpenInvoices.mockResolvedValue({ items: [], cursor: null, hasMore: false });

    await openInvoicesGET(
      makeGetRequest(`${BASE}/reports/open-invoices?overdue=true&customerId=c_001`),
    );

    expect(mockGetOpenInvoices).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        overdue: true,
        customerId: 'c_001',
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Route exports verification
// ═══════════════════════════════════════════════════════════════

describe('AR route exports', () => {
  it('exports GET and POST for /invoices', () => {
    expect(typeof invoicesGET).toBe('function');
    expect(typeof invoicesPOST).toBe('function');
  });

  it('exports GET for /invoices/:id', () => {
    expect(typeof invoiceDetailGET).toBe('function');
  });

  it('exports POST for /invoices/:id/post and /invoices/:id/void', () => {
    expect(typeof invoicePostPOST).toBe('function');
    expect(typeof invoiceVoidPOST).toBe('function');
  });

  it('exports GET and POST for /receipts', () => {
    expect(typeof receiptsGET).toBe('function');
    expect(typeof receiptsPOST).toBe('function');
  });
});
