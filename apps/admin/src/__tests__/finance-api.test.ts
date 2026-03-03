import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ── Hoisted mocks ─────────────────────────────────────────────

const {
  mockGetAdminSession,
  mockGetAdminPermissions,
  mockWithAdminDb,
} = vi.hoisted(() => ({
  mockGetAdminSession: vi.fn(),
  mockGetAdminPermissions: vi.fn(),
  mockWithAdminDb: vi.fn(),
}));

vi.mock('../lib/auth', () => ({
  getAdminSession: mockGetAdminSession,
  requireRole: vi.fn().mockReturnValue(true),
}));

vi.mock('../lib/admin-permissions', () => ({
  getAdminPermissions: mockGetAdminPermissions,
  matchAdminPermission: vi.fn().mockReturnValue(true),
}));

vi.mock('../lib/admin-db', () => ({
  withAdminDb: mockWithAdminDb,
}));

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(
    vi.fn((...args: unknown[]) => args),
    {
      join: vi.fn((...args: unknown[]) => args),
      raw: vi.fn((v: string) => v),
    },
  ),
}));

// ── Helpers ──────────────────────────────────────────────────

const ADMIN_SESSION = {
  adminId: 'admin_001',
  email: 'admin@oppsera.com',
  name: 'Admin',
  role: 'super_admin' as const,
};

function makeRequest(url: string, options: RequestInit = {}): NextRequest {
  const req = new Request(`http://localhost${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  (req as unknown as Record<string, unknown>).nextUrl = new URL(req.url);
  return req as unknown as NextRequest;
}

// ── Test Suites ──────────────────────────────────────────────

describe('GET /api/v1/finance/orders — Order Search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminSession.mockResolvedValue(ADMIN_SESSION);
    mockGetAdminPermissions.mockResolvedValue(new Set(['tenants.read']));
  });

  it('returns paginated results with correct structure', async () => {
    const mockItems = [
      {
        id: 'ord_001',
        tenant_id: 'tenant_001',
        order_number: 'ORD-0001',
        status: 'paid',
        total: 5000,
        created_at: '2026-03-01T10:00:00Z',
        tenant_name: 'Test Tenant',
        location_name: 'Main Store',
        employee_name: 'John',
      },
      {
        id: 'ord_002',
        tenant_id: 'tenant_001',
        order_number: 'ORD-0002',
        status: 'open',
        total: 3000,
        created_at: '2026-03-01T11:00:00Z',
        tenant_name: 'Test Tenant',
        location_name: 'Main Store',
        employee_name: 'Jane',
      },
    ];

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        execute: vi.fn()
          .mockResolvedValueOnce([{ total: 2 }])   // count query
          .mockResolvedValueOnce(mockItems),         // data query
      };
      return cb(tx);
    });

    const { GET } = await import('../app/api/v1/finance/orders/route');
    const req = makeRequest('/api/v1/finance/orders?page=1&limit=25');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(2);
    expect(body.data.total).toBe(2);
    expect(body.data.page).toBe(1);
    expect(body.data.limit).toBe(25);
    expect(body.data.items[0].id).toBe('ord_001');
    expect(body.data.items[0].order_number).toBe('ORD-0001');
  });

  it('applies tenant_id filter', async () => {
    const executeMock = vi.fn()
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([{
        id: 'ord_001',
        tenant_id: 'tenant_abc',
        order_number: 'ORD-0001',
        status: 'paid',
        total: 5000,
      }]);

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/orders/route');
    const req = makeRequest('/api/v1/finance/orders?tenant_id=tenant_abc');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].tenant_id).toBe('tenant_abc');
  });

  it('applies status filter', async () => {
    const executeMock = vi.fn()
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/orders/route');
    const req = makeRequest('/api/v1/finance/orders?status=voided');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(0);
    expect(body.data.total).toBe(0);
  });

  it('applies date range filters', async () => {
    const executeMock = vi.fn()
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([{
        id: 'ord_001',
        business_date: '2026-03-01',
        status: 'paid',
        total: 5000,
      }]);

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/orders/route');
    const req = makeRequest(
      '/api/v1/finance/orders?business_date_from=2026-03-01&business_date_to=2026-03-01',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
  });

  it('has_voids=true filter works', async () => {
    const executeMock = vi.fn()
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([{
        id: 'ord_voided',
        status: 'voided',
        void_reason: 'Customer requested',
        total: 2500,
      }]);

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/orders/route');
    const req = makeRequest('/api/v1/finance/orders?has_voids=true');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].status).toBe('voided');
  });

  it('returns 401 when not authenticated', async () => {
    mockGetAdminSession.mockResolvedValue(null);

    const { GET } = await import('../app/api/v1/finance/orders/route');
    const req = makeRequest('/api/v1/finance/orders');
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('clamps page to minimum 1 and limit to 1-100 range', async () => {
    const executeMock = vi.fn()
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/orders/route');
    const req = makeRequest('/api/v1/finance/orders?page=-5&limit=999');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.page).toBe(1);
    expect(body.data.limit).toBe(100);
  });
});

describe('GET /api/v1/finance/orders/[id] — Order Detail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminSession.mockResolvedValue(ADMIN_SESSION);
    mockGetAdminPermissions.mockResolvedValue(new Set(['tenants.read']));
  });

  it('returns complete order aggregation (order, lines, tenders, GL, audit, timeline)', async () => {
    const mockOrder = {
      id: 'ord_001',
      tenant_id: 'tenant_001',
      order_number: 'ORD-0001',
      status: 'paid',
      total: 5000,
      subtotal: 4500,
      tax_total: 500,
      created_at: '2026-03-01T10:00:00Z',
      placed_at: '2026-03-01T10:00:05Z',
      paid_at: '2026-03-01T10:01:00Z',
      voided_at: null,
      employee_name: 'John',
      voided_by_name: null,
      customer_name: 'Jane Customer',
      customer_email: 'jane@test.com',
      customer_phone: '555-0100',
      tenant_name: 'Test Tenant',
      location_name: 'Main Store',
    };

    const mockLines = [
      {
        id: 'line_001',
        catalog_item_name: 'Widget',
        qty: 2,
        unit_price: 2000,
        line_total: 4500,
        sort_order: 0,
      },
    ];

    const mockTenders = [
      {
        id: 'td_001',
        tender_type: 'card',
        amount: 5000,
        status: 'completed',
        card_last4: '4242',
        card_brand: 'Visa',
        created_at: '2026-03-01T10:01:00Z',
        employee_name: 'John',
        reversal_id: null,
      },
    ];

    const mockGlEntries = [
      {
        id: 'je_001',
        journal_number: 'JE-0001',
        source_module: 'pos',
        status: 'posted',
        posted_at: '2026-03-01T10:01:05Z',
        created_at: '2026-03-01T10:01:00Z',
      },
    ];

    const mockGlLines = [
      {
        id: 'jl_001',
        journal_entry_id: 'je_001',
        account_id: 'acc_revenue',
        debit_amount: '0.00',
        credit_amount: '50.00',
        account_number: '4000',
        account_name: 'Revenue',
        account_type: 'revenue',
      },
    ];

    const mockAudit = [
      {
        id: 'audit_001',
        action: 'order.placed',
        entity_type: 'order',
        entity_id: 'ord_001',
        actor_user_id: 'user_001',
        actor_name: 'John',
        created_at: '2026-03-01T10:00:05Z',
      },
    ];

    const executeMock = vi.fn()
      .mockResolvedValueOnce([mockOrder])       // order query
      .mockResolvedValueOnce(mockLines)          // lines query
      .mockResolvedValueOnce(mockTenders)        // tenders query
      .mockResolvedValueOnce(mockGlEntries)      // GL entries query
      .mockResolvedValueOnce(mockGlLines)        // GL lines query
      .mockResolvedValueOnce(mockAudit);         // audit query

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/orders/[id]/route');
    const req = makeRequest('/api/v1/finance/orders/ord_001');
    const res = await GET(req, { params: Promise.resolve({ id: 'ord_001' }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.order.id).toBe('ord_001');
    expect(body.data.order.status).toBe('paid');
    expect(body.data.order.tenant_name).toBe('Test Tenant');
    expect(body.data.order.customer_name).toBe('Jane Customer');
    expect(body.data.lines).toHaveLength(1);
    expect(body.data.lines[0].catalog_item_name).toBe('Widget');
    expect(body.data.tenders).toHaveLength(1);
    expect(body.data.tenders[0].card_last4).toBe('4242');
    expect(body.data.glEntries).toHaveLength(1);
    expect(body.data.glEntries[0].lines).toHaveLength(1);
    expect(body.data.glEntries[0].lines[0].account_name).toBe('Revenue');
    expect(body.data.auditTrail).toHaveLength(1);
    expect(body.data.timeline).toBeDefined();
    expect(body.data.timeline.length).toBeGreaterThanOrEqual(3); // created, placed, paid
  });

  it('returns 404 for non-existent order', async () => {
    const executeMock = vi.fn().mockResolvedValueOnce([]); // empty order result

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/orders/[id]/route');
    const req = makeRequest('/api/v1/finance/orders/nonexistent');
    const res = await GET(req, { params: Promise.resolve({ id: 'nonexistent' }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Order not found');
  });

  it('returns 401 when not authenticated', async () => {
    mockGetAdminSession.mockResolvedValue(null);

    const { GET } = await import('../app/api/v1/finance/orders/[id]/route');
    const req = makeRequest('/api/v1/finance/orders/ord_001');
    const res = await GET(req, { params: Promise.resolve({ id: 'ord_001' }) });

    expect(res.status).toBe(401);
  });

  it('builds timeline with correct chronological ordering', async () => {
    const mockOrder = {
      id: 'ord_002',
      status: 'voided',
      created_at: '2026-03-01T10:00:00Z',
      placed_at: '2026-03-01T10:00:05Z',
      paid_at: '2026-03-01T10:01:00Z',
      voided_at: '2026-03-01T10:05:00Z',
      employee_name: 'John',
      voided_by_name: 'Manager',
    };

    const mockTenders = [
      {
        id: 'td_001',
        tender_type: 'card',
        created_at: '2026-03-01T10:01:00Z',
        employee_name: 'John',
        reversal_id: 'rev_001',
        reversal_type: 'void',
        reversal_created_at: '2026-03-01T10:04:00Z',
        reversal_created_by_name: 'Manager',
      },
    ];

    const executeMock = vi.fn()
      .mockResolvedValueOnce([mockOrder])   // order
      .mockResolvedValueOnce([])            // lines
      .mockResolvedValueOnce(mockTenders)   // tenders
      .mockResolvedValueOnce([])            // GL entries
      .mockResolvedValueOnce([]);           // audit

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/orders/[id]/route');
    const req = makeRequest('/api/v1/finance/orders/ord_002');
    const res = await GET(req, { params: Promise.resolve({ id: 'ord_002' }) });

    expect(res.status).toBe(200);
    const body = await res.json();

    // Timeline should have: created, placed, paid, tender_card, tender_void, voided
    expect(body.data.timeline.length).toBe(6);
    // Verify chronological order
    for (let i = 1; i < body.data.timeline.length; i++) {
      const prevTs = new Date(body.data.timeline[i - 1].timestamp).getTime();
      const currTs = new Date(body.data.timeline[i].timestamp).getTime();
      expect(currTs).toBeGreaterThanOrEqual(prevTs);
    }
  });

  it('handles order with no GL entries (jeIds empty)', async () => {
    const mockOrder = {
      id: 'ord_003',
      status: 'open',
      created_at: '2026-03-01T10:00:00Z',
      placed_at: null,
      paid_at: null,
      voided_at: null,
      employee_name: 'John',
      voided_by_name: null,
    };

    const executeMock = vi.fn()
      .mockResolvedValueOnce([mockOrder])   // order
      .mockResolvedValueOnce([])            // lines
      .mockResolvedValueOnce([])            // tenders
      .mockResolvedValueOnce([])            // GL entries (empty — no GL lines query)
      .mockResolvedValueOnce([]);           // audit

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/orders/[id]/route');
    const req = makeRequest('/api/v1/finance/orders/ord_003');
    const res = await GET(req, { params: Promise.resolve({ id: 'ord_003' }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.glEntries).toHaveLength(0);
    // When no GL entries, the GL lines query is skipped (5 calls, not 6)
    expect(executeMock).toHaveBeenCalledTimes(5);
  });
});

describe('GET /api/v1/finance/voids — Voided Orders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminSession.mockResolvedValue(ADMIN_SESSION);
    mockGetAdminPermissions.mockResolvedValue(new Set(['tenants.read']));
  });

  it('returns voided orders with actor info', async () => {
    const mockVoids = [
      {
        id: 'ord_v1',
        tenant_id: 'tenant_001',
        order_number: 'ORD-0010',
        status: 'voided',
        void_reason: 'Customer changed mind',
        voided_by: 'user_mgr',
        voided_at: '2026-03-01T12:00:00Z',
        total: 3500,
        tenant_name: 'Test Tenant',
        location_name: 'Main Store',
        voided_by_name: 'Manager Mike',
        employee_name: 'Cashier Carl',
      },
    ];

    const executeMock = vi.fn()
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce(mockVoids);

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/voids/route');
    const req = makeRequest('/api/v1/finance/voids');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].status).toBe('voided');
    expect(body.data.items[0].void_reason).toBe('Customer changed mind');
    expect(body.data.items[0].voided_by_name).toBe('Manager Mike');
    expect(body.data.total).toBe(1);
  });

  it('applies tenant_id and date range filters', async () => {
    const executeMock = vi.fn()
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/voids/route');
    const req = makeRequest(
      '/api/v1/finance/voids?tenant_id=tenant_xyz&date_from=2026-03-01&date_to=2026-03-02',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(0);
  });

  it('returns 401 when not authenticated', async () => {
    mockGetAdminSession.mockResolvedValue(null);

    const { GET } = await import('../app/api/v1/finance/voids/route');
    const req = makeRequest('/api/v1/finance/voids');
    const res = await GET(req);

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/finance/refunds — Tender Reversals (refund)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminSession.mockResolvedValue(ADMIN_SESSION);
    mockGetAdminPermissions.mockResolvedValue(new Set(['tenants.read']));
  });

  it('returns tender reversals of type refund', async () => {
    const mockRefunds = [
      {
        id: 'rev_001',
        tenant_id: 'tenant_001',
        original_tender_id: 'td_001',
        order_id: 'ord_001',
        reversal_type: 'refund',
        amount: 2500,
        reason: 'Item returned',
        refund_method: 'original_payment',
        status: 'completed',
        created_at: '2026-03-01T14:00:00Z',
        tender_type: 'card',
        card_last4: '4242',
        card_brand: 'Visa',
        order_number: 'ORD-0001',
        order_total: 5000,
        tenant_name: 'Test Tenant',
        location_name: 'Main Store',
        created_by_name: 'Manager',
      },
    ];

    const executeMock = vi.fn()
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce(mockRefunds);

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/refunds/route');
    const req = makeRequest('/api/v1/finance/refunds');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].reversal_type).toBe('refund');
    expect(body.data.items[0].amount).toBe(2500);
    expect(body.data.items[0].card_last4).toBe('4242');
    expect(body.data.items[0].order_number).toBe('ORD-0001');
    expect(body.data.total).toBe(1);
  });

  it('applies filters correctly', async () => {
    const executeMock = vi.fn()
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/refunds/route');
    const req = makeRequest(
      '/api/v1/finance/refunds?tenant_id=tenant_abc&amount_min=1000',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.total).toBe(0);
  });

  it('supports pagination', async () => {
    const executeMock = vi.fn()
      .mockResolvedValueOnce([{ total: 50 }])
      .mockResolvedValueOnce([{ id: 'rev_011' }]);

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/refunds/route');
    const req = makeRequest('/api/v1/finance/refunds?page=2&limit=10');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.total).toBe(50);
    expect(body.data.page).toBe(2);
    expect(body.data.limit).toBe(10);
  });
});

describe('GET /api/v1/finance/gl-issues — GL Posting Issues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminSession.mockResolvedValue(ADMIN_SESSION);
    mockGetAdminPermissions.mockResolvedValue(new Set(['tenants.read']));
  });

  it('separates unmapped events, unposted entries, and failed postings', async () => {
    const mockUnmapped = [
      {
        id: 'ue_001',
        tenant_id: 'tenant_001',
        event_type: 'tender.recorded.v1',
        source_module: 'pos',
        reason: 'No GL mapping for sub-department',
        created_at: '2026-03-01T10:00:00Z',
        tenant_name: 'Test Tenant',
      },
    ];

    const mockUnposted = [
      {
        id: 'je_draft_001',
        tenant_id: 'tenant_001',
        journal_number: 'JE-DRAFT-0001',
        source_module: 'pos',
        status: 'draft',
        created_at: '2026-03-01T11:00:00Z',
        tenant_name: 'Test Tenant',
      },
    ];

    const mockFailed = [
      {
        id: 'je_voided_001',
        tenant_id: 'tenant_002',
        journal_number: 'JE-V-0001',
        source_module: 'pos',
        status: 'voided',
        void_reason: 'Duplicate posting',
        voided_at: '2026-03-01T12:00:00Z',
        created_at: '2026-03-01T10:00:00Z',
        tenant_name: 'Other Tenant',
      },
    ];

    const executeMock = vi.fn()
      .mockResolvedValueOnce(mockUnmapped)          // unmapped events
      .mockResolvedValueOnce(mockUnposted)           // unposted entries
      .mockResolvedValueOnce(mockFailed)             // failed postings
      .mockResolvedValueOnce([{ count: 1 }])         // unmapped count
      .mockResolvedValueOnce([{ count: 1 }])         // unposted count
      .mockResolvedValueOnce([{ count: 1 }]);        // failed count

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/gl-issues/route');
    const req = makeRequest('/api/v1/finance/gl-issues');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();

    // Unmapped events
    expect(body.data.unmappedEvents).toHaveLength(1);
    expect(body.data.unmappedEvents[0].event_type).toBe('tender.recorded.v1');
    expect(body.data.unmappedEvents[0].reason).toBe('No GL mapping for sub-department');

    // Unposted entries
    expect(body.data.unpostedEntries).toHaveLength(1);
    expect(body.data.unpostedEntries[0].journal_number).toBe('JE-DRAFT-0001');

    // Failed postings
    expect(body.data.failedPostings).toHaveLength(1);
    expect(body.data.failedPostings[0].void_reason).toBe('Duplicate posting');

    // Stats
    expect(body.data.stats.unmappedCount).toBe(1);
    expect(body.data.stats.unpostedCount).toBe(1);
    expect(body.data.stats.failedCount).toBe(1);
  });

  it('applies tenant_id filter to all three queries', async () => {
    const executeMock = vi.fn()
      .mockResolvedValueOnce([])               // unmapped
      .mockResolvedValueOnce([])               // unposted
      .mockResolvedValueOnce([])               // failed
      .mockResolvedValueOnce([{ count: 0 }])   // unmapped count
      .mockResolvedValueOnce([{ count: 0 }])   // unposted count
      .mockResolvedValueOnce([{ count: 0 }]);  // failed count

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/gl-issues/route');
    const req = makeRequest('/api/v1/finance/gl-issues?tenant_id=tenant_001');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.unmappedEvents).toHaveLength(0);
    expect(body.data.unpostedEntries).toHaveLength(0);
    expect(body.data.failedPostings).toHaveLength(0);
    expect(body.data.stats.unmappedCount).toBe(0);
  });

  it('returns 401 when not authenticated', async () => {
    mockGetAdminSession.mockResolvedValue(null);

    const { GET } = await import('../app/api/v1/finance/gl-issues/route');
    const req = makeRequest('/api/v1/finance/gl-issues');
    const res = await GET(req);

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/finance/chargebacks — Chargeback Tracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminSession.mockResolvedValue(ADMIN_SESSION);
    mockGetAdminPermissions.mockResolvedValue(new Set(['tenants.read']));
  });

  it('returns chargebacks with linked tender and order info', async () => {
    const mockChargebacks = [
      {
        id: 'cb_001',
        tenant_id: 'tenant_001',
        tender_id: 'td_001',
        order_id: 'ord_001',
        chargeback_reason: 'Unauthorized transaction',
        chargeback_amount_cents: 5000,
        fee_amount_cents: 1500,
        status: 'open',
        provider_case_id: 'CASE-123',
        provider_ref: 'ref_abc',
        business_date: '2026-03-01',
        created_at: '2026-03-02T10:00:00Z',
        tender_type: 'card',
        card_last4: '4242',
        card_brand: 'Visa',
        tender_amount: 5000,
        order_number: 'ORD-0001',
        order_total: 5000,
        tenant_name: 'Test Tenant',
        location_name: 'Main Store',
        customer_name: 'Jane Doe',
        resolved_by_name: null,
      },
    ];

    const executeMock = vi.fn()
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce(mockChargebacks);

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/chargebacks/route');
    const req = makeRequest('/api/v1/finance/chargebacks');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);

    const cb = body.data.items[0];
    expect(cb.chargeback_reason).toBe('Unauthorized transaction');
    expect(cb.chargeback_amount_cents).toBe(5000);
    expect(cb.fee_amount_cents).toBe(1500);
    expect(cb.status).toBe('open');
    expect(cb.tender_type).toBe('card');
    expect(cb.card_last4).toBe('4242');
    expect(cb.order_number).toBe('ORD-0001');
    expect(cb.tenant_name).toBe('Test Tenant');
    expect(body.data.total).toBe(1);
  });

  it('applies status filter', async () => {
    const executeMock = vi.fn()
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/chargebacks/route');
    const req = makeRequest('/api/v1/finance/chargebacks?status=resolved');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(0);
  });

  it('supports pagination', async () => {
    const executeMock = vi.fn()
      .mockResolvedValueOnce([{ total: 30 }])
      .mockResolvedValueOnce([{ id: 'cb_026' }]);

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/chargebacks/route');
    const req = makeRequest('/api/v1/finance/chargebacks?page=3&limit=10');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.total).toBe(30);
    expect(body.data.page).toBe(3);
    expect(body.data.limit).toBe(10);
  });
});

describe('GET /api/v1/finance/close-batches — Close Batch Status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminSession.mockResolvedValue(ADMIN_SESSION);
    mockGetAdminPermissions.mockResolvedValue(new Set(['tenants.read']));
  });

  it('merges F&B and retail batches and identifies overdue', async () => {
    const mockBatches = [
      {
        id: 'fb_001',
        tenant_id: 'tenant_001',
        location_id: 'loc_001',
        terminal_id: null,
        business_date: '2026-02-28',
        status: 'open',
        batch_type: 'fnb',
        is_overdue: true,
        tenant_name: 'Test Tenant',
        location_name: 'Main Restaurant',
        started_at: '2026-02-28T07:00:00Z',
        created_at: '2026-02-28T07:00:00Z',
      },
      {
        id: 'rb_001',
        tenant_id: 'tenant_001',
        location_id: 'loc_001',
        terminal_id: 'term_001',
        business_date: '2026-03-01',
        status: 'reconciled',
        batch_type: 'retail',
        is_overdue: false,
        tenant_name: 'Test Tenant',
        location_name: 'Main Store',
        started_at: '2026-03-01T07:00:00Z',
        created_at: '2026-03-01T07:00:00Z',
      },
    ];

    const executeMock = vi.fn()
      .mockResolvedValueOnce([{ total: 2 }])
      .mockResolvedValueOnce(mockBatches);

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/close-batches/route');
    const req = makeRequest('/api/v1/finance/close-batches');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(2);
    expect(body.data.total).toBe(2);

    // Check F&B batch
    const fnbBatch = body.data.items.find((b: Record<string, unknown>) => b.batch_type === 'fnb');
    expect(fnbBatch).toBeDefined();
    expect(fnbBatch.is_overdue).toBe(true);
    expect(fnbBatch.status).toBe('open');

    // Check retail batch
    const retailBatch = body.data.items.find((b: Record<string, unknown>) => b.batch_type === 'retail');
    expect(retailBatch).toBeDefined();
    expect(retailBatch.is_overdue).toBe(false);
    expect(retailBatch.status).toBe('reconciled');
    expect(retailBatch.terminal_id).toBe('term_001');
  });

  it('applies tenant_id and location_id filters', async () => {
    const executeMock = vi.fn()
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/close-batches/route');
    const req = makeRequest(
      '/api/v1/finance/close-batches?tenant_id=tenant_001&location_id=loc_001',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(0);
  });

  it('filters by business_date', async () => {
    const executeMock = vi.fn()
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([{
        id: 'fb_001',
        business_date: '2026-03-01',
        status: 'posted',
        batch_type: 'fnb',
      }]);

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/close-batches/route');
    const req = makeRequest('/api/v1/finance/close-batches?business_date=2026-03-01');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].business_date).toBe('2026-03-01');
  });

  it('filters by batch status', async () => {
    const executeMock = vi.fn()
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([{
        id: 'rb_001',
        status: 'open',
        batch_type: 'retail',
        is_overdue: true,
      }]);

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/close-batches/route');
    const req = makeRequest('/api/v1/finance/close-batches?status=open');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].status).toBe('open');
  });
});

describe('GET /api/v1/finance/vouchers — Voucher Lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminSession.mockResolvedValue(ADMIN_SESSION);
    mockGetAdminPermissions.mockResolvedValue(new Set(['tenants.read']));
  });

  it('returns vouchers with correct amount formatting', async () => {
    const mockVouchers = [
      {
        id: 'v_001',
        tenant_id: 'tenant_001',
        voucher_type_id: 'vt_001',
        voucher_number: 'GC-0001',
        voucher_amount_cents: 5000,
        redeemed_amount_cents: 2000,
        tax_cents: 0,
        total_cents: 5000,
        redemption_status: 'partially_redeemed',
        validity_start_date: '2026-01-01',
        validity_end_date: '2026-12-31',
        customer_id: 'cust_001',
        first_name: 'Jane',
        last_name: 'Doe',
        order_id: 'ord_001',
        notes: 'Birthday gift',
        created_at: '2026-01-01T10:00:00Z',
        updated_at: '2026-02-15T10:00:00Z',
        voucher_type_name: 'Gift Card',
        voucher_type_category: 'gift_card',
        tenant_name: 'Test Tenant',
        customer_name: 'Jane Doe',
      },
    ];

    const executeMock = vi.fn()
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce(mockVouchers);

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/vouchers/route');
    const req = makeRequest('/api/v1/finance/vouchers');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);

    const voucher = body.data.items[0];
    expect(voucher.voucher_number).toBe('GC-0001');
    expect(voucher.voucher_amount_cents).toBe(5000);
    expect(voucher.redeemed_amount_cents).toBe(2000);
    expect(voucher.redemption_status).toBe('partially_redeemed');
    expect(voucher.voucher_type_name).toBe('Gift Card');
    expect(voucher.voucher_type_category).toBe('gift_card');
    expect(voucher.tenant_name).toBe('Test Tenant');
    expect(voucher.customer_name).toBe('Jane Doe');
    expect(body.data.total).toBe(1);
  });

  it('searches by voucher code (ILIKE)', async () => {
    const executeMock = vi.fn()
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([{
        id: 'v_001',
        voucher_number: 'GC-0001',
        redemption_status: 'active',
      }]);

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/vouchers/route');
    const req = makeRequest('/api/v1/finance/vouchers?code=GC-0001');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].voucher_number).toBe('GC-0001');
  });

  it('filters by status', async () => {
    const executeMock = vi.fn()
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/vouchers/route');
    const req = makeRequest('/api/v1/finance/vouchers?status=expired');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(0);
  });

  it('filters by voucher_type', async () => {
    const executeMock = vi.fn()
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/vouchers/route');
    const req = makeRequest('/api/v1/finance/vouchers?voucher_type=gift_card');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(0);
  });

  it('supports pagination', async () => {
    const executeMock = vi.fn()
      .mockResolvedValueOnce([{ total: 100 }])
      .mockResolvedValueOnce([{ id: 'v_051' }]);

    mockWithAdminDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ execute: executeMock }));

    const { GET } = await import('../app/api/v1/finance/vouchers/route');
    const req = makeRequest('/api/v1/finance/vouchers?page=3&limit=25');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.total).toBe(100);
    expect(body.data.page).toBe(3);
    expect(body.data.limit).toBe(25);
  });

  it('returns 401 when not authenticated', async () => {
    mockGetAdminSession.mockResolvedValue(null);

    const { GET } = await import('../app/api/v1/finance/vouchers/route');
    const req = makeRequest('/api/v1/finance/vouchers');
    const res = await GET(req);

    expect(res.status).toBe(401);
  });
});
