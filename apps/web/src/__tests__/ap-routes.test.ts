import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────
const {
  mockListBills,
  mockCreateBill,
  mockGetBill,
  mockUpdateBill,
  mockPostBill,
  mockVoidBill,
  mockGetPaymentHistory,
  mockCreatePayment,
  mockPostPayment,
  mockVoidPayment,
  mockGetApAging,
  mockGetVendorLedger,
  mockGetOpenBills,
  mockWithMiddleware,
} = vi.hoisted(() => {
  const mockListBills = vi.fn();
  const mockCreateBill = vi.fn();
  const mockGetBill = vi.fn();
  const mockUpdateBill = vi.fn();
  const mockPostBill = vi.fn();
  const mockVoidBill = vi.fn();
  const mockGetPaymentHistory = vi.fn();
  const mockCreatePayment = vi.fn();
  const mockPostPayment = vi.fn();
  const mockVoidPayment = vi.fn();
  const mockGetApAging = vi.fn();
  const mockGetVendorLedger = vi.fn();
  const mockGetOpenBills = vi.fn();

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
    mockListBills,
    mockCreateBill,
    mockGetBill,
    mockUpdateBill,
    mockPostBill,
    mockVoidBill,
    mockGetPaymentHistory,
    mockCreatePayment,
    mockPostPayment,
    mockVoidPayment,
    mockGetApAging,
    mockGetVendorLedger,
    mockGetOpenBills,
    mockWithMiddleware,
  };
});

// ── Module mocks ──────────────────────────────────────────────

vi.mock('@oppsera/core/auth/with-middleware', () => ({
  withMiddleware: mockWithMiddleware,
}));

vi.mock('@oppsera/module-ap', () => ({
  listBills: mockListBills,
  createBill: mockCreateBill,
  createBillSchema: {
    safeParse: (data: any) => {
      if (!data.vendorId || !data.billDate || !data.lines || data.lines.length === 0) {
        return {
          success: false,
          error: {
            issues: [{ path: ['vendorId'], message: 'Required' }],
          },
        };
      }
      return { success: true, data };
    },
  },
  getBill: mockGetBill,
  updateBill: mockUpdateBill,
  updateBillSchema: {
    safeParse: (data: any) => {
      if (data && typeof data === 'object') {
        return { success: true, data };
      }
      return {
        success: false,
        error: { issues: [{ path: ['billDate'], message: 'Required' }] },
      };
    },
  },
  postBill: mockPostBill,
  postBillSchema: {
    safeParse: (data: any) => {
      if (!data.billId) {
        return {
          success: false,
          error: { issues: [{ path: ['billId'], message: 'Required' }] },
        };
      }
      return { success: true, data };
    },
  },
  voidBill: mockVoidBill,
  voidBillSchema: {
    safeParse: (data: any) => {
      if (!data.billId || !data.reason) {
        return {
          success: false,
          error: { issues: [{ path: ['reason'], message: 'Required' }] },
        };
      }
      return { success: true, data };
    },
  },
  getPaymentHistory: mockGetPaymentHistory,
  createPayment: mockCreatePayment,
  createPaymentSchema: {
    safeParse: (data: any) => {
      if (!data.vendorId || !data.amount || !data.paymentDate) {
        return {
          success: false,
          error: { issues: [{ path: ['vendorId'], message: 'Required' }] },
        };
      }
      return { success: true, data };
    },
  },
  postPayment: mockPostPayment,
  voidPayment: mockVoidPayment,
  getApAging: mockGetApAging,
  getVendorLedger: mockGetVendorLedger,
  getOpenBills: mockGetOpenBills,
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

function makePutRequest(url: string, body: unknown) {
  return {
    url,
    method: 'PUT',
    json: vi.fn().mockResolvedValue(body),
  } as any;
}

const BASE = 'http://localhost/api/v1/ap';

// ── Route imports (after mocks) ──────────────────────────────

import { GET as billsGET, POST as billsPOST } from '../app/api/v1/ap/bills/route';
import { GET as billDetailGET, PUT as billPUT } from '../app/api/v1/ap/bills/[id]/route';
import { POST as billPostPOST } from '../app/api/v1/ap/bills/[id]/post/route';
import { POST as billVoidPOST } from '../app/api/v1/ap/bills/[id]/void/route';
import { GET as paymentsGET, POST as paymentsPOST } from '../app/api/v1/ap/payments/route';
import { POST as paymentPostPOST } from '../app/api/v1/ap/payments/[id]/post/route';
import { POST as paymentVoidPOST } from '../app/api/v1/ap/payments/[id]/void/route';
import { GET as agingGET } from '../app/api/v1/ap/aging/route';
import { GET as vendorLedgerGET } from '../app/api/v1/ap/reports/vendor-ledger/[vendorId]/route';
import { GET as openBillsGET } from '../app/api/v1/ap/reports/open-bills/route';

// ═══════════════════════════════════════════════════════════════
// Bills — List
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/ap/bills', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns paginated list of bills with { data, meta }', async () => {
    const bills = [
      { id: 'bill_001', vendorId: 'v_001', totalAmount: '1000.00', status: 'posted' },
    ];
    mockListBills.mockResolvedValue({ items: bills, cursor: null, hasMore: false });

    const res = await billsGET(makeGetRequest(`${BASE}/bills`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.meta).toEqual({ cursor: null, hasMore: false });
  });

  it('passes filter parameters to query', async () => {
    mockListBills.mockResolvedValue({ items: [], cursor: null, hasMore: false });

    await billsGET(
      makeGetRequest(`${BASE}/bills?vendorId=v_001&status=posted&overdue=true&limit=25`),
    );

    expect(mockListBills).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        vendorId: 'v_001',
        status: 'posted',
        overdue: true,
        limit: 25,
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Bills — Create
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/ap/bills', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates a bill and returns 201', async () => {
    const created = { id: 'bill_new', vendorId: 'v_001', totalAmount: '500.00', status: 'draft' };
    mockCreateBill.mockResolvedValue(created);

    const req = makePostRequest(`${BASE}/bills`, {
      vendorId: 'v_001',
      billDate: '2026-02-01',
      lines: [{ description: 'Office supplies', quantity: '1', unitCost: '500.00', lineType: 'expense', accountId: 'acct_001' }],
    });
    const res = await billsPOST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.id).toBe('bill_new');
    expect(body.data.status).toBe('draft');
  });

  it('rejects bill creation with missing vendorId', async () => {
    const req = makePostRequest(`${BASE}/bills`, {
      billDate: '2026-02-01',
      lines: [],
    });

    await expect(billsPOST(req)).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// Bills — Get Detail
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/ap/bills/:id', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns bill detail with lines and allocations', async () => {
    const bill = {
      id: 'bill_001',
      vendorId: 'v_001',
      totalAmount: '1000.00',
      balanceDue: '500.00',
      status: 'partial',
      lines: [{ id: 'line_001', description: 'Supplies', amount: '1000.00' }],
      allocations: [{ paymentId: 'pay_001', amountApplied: '500.00' }],
    };
    mockGetBill.mockResolvedValue(bill);

    const res = await billDetailGET(makeGetRequest(`${BASE}/bills/bill_001`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.id).toBe('bill_001');
    expect(body.data.lines).toHaveLength(1);
    expect(body.data.allocations).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Bills — Update
// ═══════════════════════════════════════════════════════════════

describe('PUT /api/v1/ap/bills/:id', () => {
  beforeEach(() => vi.resetAllMocks());

  it('updates a draft bill', async () => {
    const updated = { id: 'bill_001', memo: 'Updated memo', status: 'draft' };
    mockUpdateBill.mockResolvedValue(updated);

    const req = makePutRequest(`${BASE}/bills/bill_001`, { memo: 'Updated memo' });
    const res = await billPUT(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.memo).toBe('Updated memo');
  });
});

// ═══════════════════════════════════════════════════════════════
// Bills — Post
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/ap/bills/:id/post', () => {
  beforeEach(() => vi.resetAllMocks());

  it('posts a draft bill and returns updated data', async () => {
    const posted = { id: 'bill_001', status: 'posted', journalEntryId: 'je_001' };
    mockPostBill.mockResolvedValue(posted);

    const req = makePostRequest(`${BASE}/bills/bill_001/post`, {
      businessDate: '2026-02-01',
    });
    const res = await billPostPOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('posted');
  });
});

// ═══════════════════════════════════════════════════════════════
// Bills — Void
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/ap/bills/:id/void', () => {
  beforeEach(() => vi.resetAllMocks());

  it('voids a bill with reason', async () => {
    const voided = { id: 'bill_001', status: 'voided' };
    mockVoidBill.mockResolvedValue(voided);

    const req = makePostRequest(`${BASE}/bills/bill_001/void`, { reason: 'Duplicate bill' });
    const res = await billVoidPOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('voided');
  });

  it('rejects void without reason', async () => {
    const req = makePostRequest(`${BASE}/bills/bill_001/void`, {});

    await expect(billVoidPOST(req)).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// Payments — List
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/ap/payments', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns paginated payment history', async () => {
    const payments = [
      { id: 'pay_001', vendorId: 'v_001', amount: '500.00', status: 'posted' },
    ];
    mockGetPaymentHistory.mockResolvedValue({ items: payments, cursor: null, hasMore: false });

    const res = await paymentsGET(makeGetRequest(`${BASE}/payments`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.meta).toEqual({ cursor: null, hasMore: false });
  });
});

// ═══════════════════════════════════════════════════════════════
// Payments — Create
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/ap/payments', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates a payment and returns 201', async () => {
    const created = { id: 'pay_new', vendorId: 'v_001', amount: '500.00', status: 'draft' };
    mockCreatePayment.mockResolvedValue(created);

    const req = makePostRequest(`${BASE}/payments`, {
      vendorId: 'v_001',
      amount: '500.00',
      paymentDate: '2026-02-15',
      paymentMethod: 'check',
      allocations: [{ billId: 'bill_001', amount: '500.00' }],
    });
    const res = await paymentsPOST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.id).toBe('pay_new');
  });

  it('rejects payment creation without required fields', async () => {
    const req = makePostRequest(`${BASE}/payments`, { paymentMethod: 'check' });

    await expect(paymentsPOST(req)).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// Payments — Post
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/ap/payments/:id/post', () => {
  beforeEach(() => vi.resetAllMocks());

  it('posts a payment and returns { data }', async () => {
    const posted = { id: 'pay_001', status: 'posted' };
    mockPostPayment.mockResolvedValue(posted);

    const req = makePostRequest(`${BASE}/payments/pay_001/post`, {});
    const res = await paymentPostPOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('posted');
  });
});

// ═══════════════════════════════════════════════════════════════
// Payments — Void
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/ap/payments/:id/void', () => {
  beforeEach(() => vi.resetAllMocks());

  it('voids a payment with reason', async () => {
    const voided = { id: 'pay_001', status: 'voided' };
    mockVoidPayment.mockResolvedValue(voided);

    const req = makePostRequest(`${BASE}/payments/pay_001/void`, { reason: 'Wrong amount' });
    const res = await paymentVoidPOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('voided');
  });

  it('returns 400 when reason is missing', async () => {
    const req = makePostRequest(`${BASE}/payments/pay_001/void`, {});
    const res = await paymentVoidPOST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('reason');
  });
});

// ═══════════════════════════════════════════════════════════════
// AP Aging
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/ap/aging', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns aging report with { data }', async () => {
    const report = {
      vendors: [
        { vendorId: 'v_001', vendorName: 'Acme', current: '500.00', days30: '0.00', days60: '0.00', days90: '0.00', over90: '0.00', total: '500.00' },
      ],
      totals: { current: '500.00', days30: '0.00', days60: '0.00', days90: '0.00', over90: '0.00', total: '500.00' },
    };
    mockGetApAging.mockResolvedValue(report);

    const res = await agingGET(makeGetRequest(`${BASE}/aging?asOfDate=2026-02-20`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.vendors).toBeDefined();
    expect(body.data.totals).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Vendor Ledger
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/ap/reports/vendor-ledger/:vendorId', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns vendor ledger with running balance', async () => {
    const ledger = {
      entries: [
        { date: '2026-01-15', type: 'bill', reference: 'BILL-001', debit: '1000.00', credit: '0.00', balance: '1000.00' },
        { date: '2026-02-01', type: 'payment', reference: 'PAY-001', debit: '0.00', credit: '500.00', balance: '500.00' },
      ],
    };
    mockGetVendorLedger.mockResolvedValue(ledger);

    const res = await vendorLedgerGET(
      makeGetRequest(`${BASE}/reports/vendor-ledger/v_001?startDate=2026-01-01&endDate=2026-02-28`),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.entries).toHaveLength(2);
  });

  it('passes vendorId from URL path', async () => {
    mockGetVendorLedger.mockResolvedValue({ entries: [] });

    await vendorLedgerGET(
      makeGetRequest(`${BASE}/reports/vendor-ledger/v_001`),
    );

    expect(mockGetVendorLedger).toHaveBeenCalledWith(
      expect.objectContaining({ vendorId: 'v_001', tenantId: 'tenant_001' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Open Bills
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/ap/reports/open-bills', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns open bills with totalBalance in meta', async () => {
    const result = {
      items: [{ id: 'bill_001', vendorName: 'Acme', balanceDue: '750.00' }],
      totalBalance: '750.00',
      cursor: null,
      hasMore: false,
    };
    mockGetOpenBills.mockResolvedValue(result);

    const res = await openBillsGET(makeGetRequest(`${BASE}/reports/open-bills`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.meta.totalBalance).toBe('750.00');
    expect(body.meta.hasMore).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Route exports verification
// ═══════════════════════════════════════════════════════════════

describe('AP route exports', () => {
  it('exports GET and POST for /bills', () => {
    expect(typeof billsGET).toBe('function');
    expect(typeof billsPOST).toBe('function');
  });

  it('exports GET and PUT for /bills/:id', () => {
    expect(typeof billDetailGET).toBe('function');
    expect(typeof billPUT).toBe('function');
  });

  it('exports POST for /bills/:id/post and /bills/:id/void', () => {
    expect(typeof billPostPOST).toBe('function');
    expect(typeof billVoidPOST).toBe('function');
  });

  it('exports GET and POST for /payments', () => {
    expect(typeof paymentsGET).toBe('function');
    expect(typeof paymentsPOST).toBe('function');
  });
});
