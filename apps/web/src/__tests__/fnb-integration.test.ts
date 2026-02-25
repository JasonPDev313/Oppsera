import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Hoisted mocks ─────────────────────────────────────────────
const {
  mockGetFloorPlanWithLiveStatus,
  mockSeatTable,
  mockOpenTab,
  mockGetTabDetail,
  mockSendCourse,
  mockListKitchenTickets,
  mockApplySplitStrategy,
  mockStartPaymentSession,
  mockCompletePaymentSession,
  mockCloseTab,
  mockVoidCheck,
  mockStartCloseBatch,
  mockGetZReport,
  mockPostCloseBatch,
  mockWithMiddleware,
} = vi.hoisted(() => {
  const mockGetFloorPlanWithLiveStatus = vi.fn();
  const mockSeatTable = vi.fn();
  const mockOpenTab = vi.fn();
  const mockGetTabDetail = vi.fn();
  const mockSendCourse = vi.fn();
  const mockListKitchenTickets = vi.fn();
  const mockApplySplitStrategy = vi.fn();
  const mockStartPaymentSession = vi.fn();
  const mockCompletePaymentSession = vi.fn();
  const mockCloseTab = vi.fn();
  const mockVoidCheck = vi.fn();
  const mockStartCloseBatch = vi.fn();
  const mockGetZReport = vi.fn();
  const mockPostCloseBatch = vi.fn();

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

  return {
    mockGetFloorPlanWithLiveStatus,
    mockSeatTable,
    mockOpenTab,
    mockGetTabDetail,
    mockSendCourse,
    mockListKitchenTickets,
    mockApplySplitStrategy,
    mockStartPaymentSession,
    mockCompletePaymentSession,
    mockCloseTab,
    mockVoidCheck,
    mockStartCloseBatch,
    mockGetZReport,
    mockPostCloseBatch,
    mockWithMiddleware,
  };
});

// ── Module mocks ──────────────────────────────────────────────
vi.mock('@oppsera/core/auth/with-middleware', () => ({
  withMiddleware: mockWithMiddleware,
}));

const passThroughSchema = {
  safeParse: (data: any) => ({ success: true, data }),
};

vi.mock('@oppsera/module-fnb', () => ({
  getFloorPlanWithLiveStatus: mockGetFloorPlanWithLiveStatus,
  seatTable: mockSeatTable,
  seatTableSchema: passThroughSchema,
  openTab: mockOpenTab,
  openTabSchema: passThroughSchema,
  listTabs: vi.fn(),
  getTabDetail: mockGetTabDetail,
  updateTab: vi.fn(),
  updateTabSchema: passThroughSchema,
  sendCourse: mockSendCourse,
  sendCourseSchema: passThroughSchema,
  listKitchenTickets: mockListKitchenTickets,
  createKitchenTicket: vi.fn(),
  createKitchenTicketSchema: passThroughSchema,
  applySplitStrategy: mockApplySplitStrategy,
  applySplitStrategySchema: passThroughSchema,
  startPaymentSession: mockStartPaymentSession,
  startPaymentSessionSchema: passThroughSchema,
  listPaymentSessions: vi.fn(),
  listPaymentSessionsSchema: passThroughSchema,
  completePaymentSession: mockCompletePaymentSession,
  completePaymentSessionSchema: passThroughSchema,
  closeTab: mockCloseTab,
  closeTabSchema: passThroughSchema,
  voidCheck: mockVoidCheck,
  voidCheckSchema: passThroughSchema,
  startCloseBatch: mockStartCloseBatch,
  getZReport: mockGetZReport,
  getZReportSchema: passThroughSchema,
  postCloseBatch: mockPostCloseBatch,
}));

vi.mock('@oppsera/shared', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    AppError: class AppError extends Error {
      code: string;
      statusCode: number;
      constructor(code: string, message: string, statusCode: number) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
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
  };
});

// ── Helpers ───────────────────────────────────────────────────
const BASE = 'http://localhost/api/v1/fnb';

function makeGet(path: string): NextRequest {
  return new NextRequest(`${BASE}${path}`);
}

function makePost(path: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`${BASE}${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Reset ─────────────────────────────────────────────────────
beforeEach(() => {
  vi.resetAllMocks();
  // Re-apply the middleware mock after resetAllMocks (gotcha #58)
  mockWithMiddleware.mockImplementation(
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
});

// ── Flow 1: Floor -> Seat -> Open Tab -> Send -> Kitchen Ticket ──
describe('Flow 1: Dine-In Lifecycle', () => {
  it('GET /tables/floor-plan returns tables with live status', async () => {
    const mockData = {
      tables: [
        { id: 'tbl_01', tableNumber: 1, status: 'available', seats: 4 },
        { id: 'tbl_02', tableNumber: 2, status: 'occupied', seats: 6 },
      ],
    };
    mockGetFloorPlanWithLiveStatus.mockResolvedValue(mockData);

    const { GET } = await import('../app/api/v1/fnb/tables/floor-plan/route');
    const res = await GET(makeGet('/tables/floor-plan?roomId=room_01'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.tables).toHaveLength(2);
    expect(json.data.tables[0].status).toBe('available');
    expect(mockGetFloorPlanWithLiveStatus).toHaveBeenCalledWith({
      tenantId: 'tenant_001',
      roomId: 'room_01',
      lite: false,
    });
  });

  it('POST /tables/:id/seat seats guests at a table', async () => {
    const seated = { id: 'tbl_01', status: 'occupied', partySize: 4 };
    mockSeatTable.mockResolvedValue(seated);

    const { POST } = await import('../app/api/v1/fnb/tables/[id]/[action]/route');
    const res = await POST(makePost('/tables/tbl_01/seat', { partySize: 4, serverUserId: 'user_001' }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.partySize).toBe(4);
    expect(mockSeatTable).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      'tbl_01',
      expect.objectContaining({ partySize: 4 }),
    );
  });

  it('POST /tabs opens a tab linked to table', async () => {
    const tab = { id: 'tab_01', tableId: 'tbl_01', status: 'open', tabNumber: 101 };
    mockOpenTab.mockResolvedValue(tab);

    const { POST } = await import('../app/api/v1/fnb/tabs/route');
    const res = await POST(
      makePost('/tabs', { tableId: 'tbl_01', serverUserId: 'user_001', guestCount: 4 }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.id).toBe('tab_01');
    expect(json.data.tableId).toBe('tbl_01');
    expect(mockOpenTab).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      expect.objectContaining({ tableId: 'tbl_01' }),
    );
  });

  it('GET /tabs/:id returns tab detail', async () => {
    const tab = { id: 'tab_01', status: 'open', checks: [], totalCents: 0 };
    mockGetTabDetail.mockResolvedValue(tab);

    const { GET } = await import('../app/api/v1/fnb/tabs/[id]/route');
    const res = await GET(makeGet('/tabs/tab_01'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.id).toBe('tab_01');
    expect(mockGetTabDetail).toHaveBeenCalledWith({ tenantId: 'tenant_001', tabId: 'tab_01' });
  });

  it('GET /tabs/:id returns 404 when tab not found', async () => {
    mockGetTabDetail.mockResolvedValue(null);

    const { GET } = await import('../app/api/v1/fnb/tabs/[id]/route');
    const res = await GET(makeGet('/tabs/nonexistent'));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe('NOT_FOUND');
  });

  it('POST /tabs/:id/course/send sends course to kitchen', async () => {
    const result = { ticketId: 'tkt_01', courseNumber: 1, itemCount: 3 };
    mockSendCourse.mockResolvedValue(result);

    const { POST } = await import('../app/api/v1/fnb/tabs/[id]/course/send/route');
    const res = await POST(
      makePost('/tabs/tab_01/course/send', { courseNumber: 1 }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.ticketId).toBe('tkt_01');
    expect(mockSendCourse).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      expect.objectContaining({ tabId: 'tab_01', courseNumber: 1 }),
    );
  });

  it('GET /kitchen/tickets verifies kitchen ticket was created', async () => {
    const tickets = {
      items: [
        { id: 'tkt_01', tabId: 'tab_01', status: 'pending', courseNumber: 1 },
      ],
      cursor: null,
      hasMore: false,
    };
    mockListKitchenTickets.mockResolvedValue(tickets);

    const { GET } = await import('../app/api/v1/fnb/kitchen/tickets/route');
    const res = await GET(
      makeGet('/kitchen/tickets?businessDate=2026-02-21&tabId=tab_01'),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].tabId).toBe('tab_01');
    expect(mockListKitchenTickets).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        tabId: 'tab_01',
      }),
    );
  });
});

// ── Flow 2: Split Check by Seat -> Pay Each Check ────────────
describe('Flow 2: Split Check & Payment', () => {
  it('POST /tabs/:id/split applies split strategy by_seat', async () => {
    const checks = [
      { id: 'chk_01', seatNumber: 1, totalCents: 2500 },
      { id: 'chk_02', seatNumber: 2, totalCents: 3200 },
    ];
    mockApplySplitStrategy.mockResolvedValue({ checks });

    const { POST } = await import('../app/api/v1/fnb/tabs/[id]/split/route');
    const res = await POST(
      makePost('/tabs/tab_01/split', { strategy: 'by_seat', tabId: 'tab_01' }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.checks).toHaveLength(2);
    expect(mockApplySplitStrategy).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      'loc_001',
      expect.objectContaining({ strategy: 'by_seat' }),
    );
  });

  it('POST /payments/sessions creates payment session per check', async () => {
    const session = { id: 'ps_01', checkId: 'chk_01', status: 'active', amountDueCents: 2500 };
    mockStartPaymentSession.mockResolvedValue(session);

    const { POST } = await import('../app/api/v1/fnb/payments/sessions/route');
    const res = await POST(
      makePost('/payments/sessions', { tabId: 'tab_01', checkId: 'chk_01' }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.id).toBe('ps_01');
    expect(json.data.status).toBe('active');
    expect(mockStartPaymentSession).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      'loc_001',
      expect.objectContaining({ checkId: 'chk_01' }),
    );
  });

  it('POST /payments/sessions/:id/complete completes payment', async () => {
    const completed = { id: 'ps_01', status: 'completed', amountPaidCents: 2500 };
    mockCompletePaymentSession.mockResolvedValue(completed);

    const { POST } = await import(
      '../app/api/v1/fnb/payments/sessions/[id]/[action]/route'
    );
    const res = await POST(
      makePost('/payments/sessions/ps_01/complete', {
        sessionId: 'ps_01',
        tenderType: 'cash',
        amountCents: 2500,
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.status).toBe('completed');
    expect(mockCompletePaymentSession).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      'loc_001',
      expect.objectContaining({ tenderType: 'cash' }),
    );
  });

  it('POST /tabs/:id/close closes tab after all checks paid', async () => {
    const closed = { id: 'tab_01', status: 'closed', closedAt: '2026-02-21T20:00:00Z' };
    mockCloseTab.mockResolvedValue(closed);

    const { POST } = await import('../app/api/v1/fnb/tabs/[id]/[action]/route');
    const res = await POST(
      makePost('/tabs/tab_01/close', { reason: 'all_paid' }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.status).toBe('closed');
    expect(mockCloseTab).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      'tab_01',
      expect.objectContaining({ reason: 'all_paid' }),
    );
  });
});

// ── Flow 3: Manager Override — Void Sent Item ────────────────
describe('Flow 3: Manager Override - Void Check Item', () => {
  it('POST /tabs/:id/check/void voids item with manager PIN', async () => {
    const result = {
      checkId: 'chk_01',
      voidedItemId: 'item_01',
      voidReason: 'wrong_order',
      managerUserId: 'mgr_001',
    };
    mockVoidCheck.mockResolvedValue(result);

    const { POST } = await import('../app/api/v1/fnb/tabs/[id]/check/void/route');
    const res = await POST(
      makePost('/tabs/tab_01/check/void', {
        checkId: 'chk_01',
        itemId: 'item_01',
        reason: 'wrong_order',
        managerPin: '1234',
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.voidReason).toBe('wrong_order');
    // voidCheck receives (ctx, locationId, tabId, data)
    expect(mockVoidCheck).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001', user: { id: 'user_001' } }),
      'loc_001',
      'tab_01',
      expect.objectContaining({ reason: 'wrong_order', managerPin: '1234' }),
    );
  });
});

// ── Flow 4: Close Batch -> Z-Report -> Post GL ───────────────
describe('Flow 4: Close Batch & Z-Report', () => {
  it('POST /close-batch starts close batch', async () => {
    const batch = { id: 'batch_01', status: 'started', businessDate: '2026-02-21' };
    mockStartCloseBatch.mockResolvedValue(batch);

    const { POST } = await import('../app/api/v1/fnb/close-batch/route');
    const res = await POST(
      makePost('/close-batch', { businessDate: '2026-02-21' }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.id).toBe('batch_01');
    expect(json.data.status).toBe('started');
    expect(mockStartCloseBatch).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      expect.objectContaining({ businessDate: '2026-02-21' }),
    );
  });

  it('GET /close-batch/:id/z-report returns Z-report', async () => {
    const report = {
      closeBatchId: 'batch_01',
      grossSalesCents: 125000,
      netSalesCents: 118750,
      taxCollectedCents: 8900,
      tenderBreakdown: [
        { tenderType: 'cash', totalCents: 50000 },
        { tenderType: 'credit', totalCents: 68750 },
      ],
    };
    mockGetZReport.mockResolvedValue(report);

    const { GET } = await import('../app/api/v1/fnb/close-batch/[id]/z-report/route');
    const res = await GET(makeGet('/close-batch/batch_01/z-report'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.grossSalesCents).toBe(125000);
    expect(json.data.tenderBreakdown).toHaveLength(2);
    expect(mockGetZReport).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001', closeBatchId: 'batch_01' }),
    );
  });

  it('GET /close-batch/:id/z-report returns 404 when not found', async () => {
    mockGetZReport.mockResolvedValue(null);

    const { GET } = await import('../app/api/v1/fnb/close-batch/[id]/z-report/route');
    const res = await GET(makeGet('/close-batch/nonexistent/z-report'));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe('NOT_FOUND');
  });

  it('POST /close-batch/:id/post posts close batch to GL', async () => {
    const posted = { id: 'batch_01', status: 'posted', journalEntryId: 'je_01' };
    mockPostCloseBatch.mockResolvedValue(posted);

    const { POST } = await import('../app/api/v1/fnb/close-batch/[id]/[action]/route');
    const res = await POST(
      makePost('/close-batch/batch_01/post', { closeBatchId: 'batch_01' }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.status).toBe('posted');
    expect(json.data.journalEntryId).toBe('je_01');
    expect(mockPostCloseBatch).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      expect.objectContaining({ closeBatchId: 'batch_01' }),
    );
  });
});
