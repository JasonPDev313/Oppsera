import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

type RouteHandler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

// ── Hoisted mocks ─────────────────────────────────────────────
const {
  // Reservation commands
  mockCreateReservation,
  mockUpdateReservation,
  mockConfirmReservation,
  mockCheckInReservation,
  mockSeatReservation,
  mockCancelReservation,
  mockCompleteReservation,
  mockNoShowReservation,
  // Reservation queries
  mockGetReservations,
  mockHostGetUpcomingReservations,
  // Waitlist commands
  mockAddToWaitlist,
  mockUpdateWaitlistEntry,
  mockRemoveFromWaitlist,
  mockNotifyWaitlistGuest,
  mockSeatFromWaitlist,
  mockHostRemoveFromWaitlist,
  // Waitlist queries
  mockGetWaitlist,
  mockHostGetWaitlistStats,
  // Intelligence queries
  mockGetWaitTimeEstimate,
  mockSuggestTables,
  // Dashboard / reports
  mockGetHostDashboard,
  mockHostGetPreShiftReport,
  mockHostGetTableTurnStats,
  // Notifications
  mockSendGuestNotification,
  // Middleware
  mockWithMiddleware,
  // Schema helpers
  makeSafeParse,
  // DB mock for guest routes
  mockDbExecute,
} = vi.hoisted(() => {
  const mockCreateReservation = vi.fn();
  const mockUpdateReservation = vi.fn();
  const mockConfirmReservation = vi.fn();
  const mockCheckInReservation = vi.fn();
  const mockSeatReservation = vi.fn();
  const mockCancelReservation = vi.fn();
  const mockCompleteReservation = vi.fn();
  const mockNoShowReservation = vi.fn();
  const mockGetReservations = vi.fn();
  const mockHostGetUpcomingReservations = vi.fn();
  const mockAddToWaitlist = vi.fn();
  const mockUpdateWaitlistEntry = vi.fn();
  const mockRemoveFromWaitlist = vi.fn();
  const mockNotifyWaitlistGuest = vi.fn();
  const mockSeatFromWaitlist = vi.fn();
  const mockHostRemoveFromWaitlist = vi.fn();
  const mockGetWaitlist = vi.fn();
  const mockHostGetWaitlistStats = vi.fn();
  const mockGetWaitTimeEstimate = vi.fn();
  const mockSuggestTables = vi.fn();
  const mockGetHostDashboard = vi.fn();
  const mockHostGetPreShiftReport = vi.fn();
  const mockHostGetTableTurnStats = vi.fn();
  const mockSendGuestNotification = vi.fn();
  const mockDbExecute = vi.fn();

  const mockWithMiddleware = vi.fn(
    (handler: (...args: any[]) => any, _options: unknown) => {
      return async (request: any, routeCtx?: any) => {
        const ctx = {
          user: { id: 'user_001' },
          tenantId: 'tenant_001',
          locationId: 'loc_001',
          requestId: 'req_001',
          isPlatformAdmin: false,
        };
        return handler(request, ctx, routeCtx);
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
    mockCreateReservation,
    mockUpdateReservation,
    mockConfirmReservation,
    mockCheckInReservation,
    mockSeatReservation,
    mockCancelReservation,
    mockCompleteReservation,
    mockNoShowReservation,
    mockGetReservations,
    mockHostGetUpcomingReservations,
    mockAddToWaitlist,
    mockUpdateWaitlistEntry,
    mockRemoveFromWaitlist,
    mockNotifyWaitlistGuest,
    mockSeatFromWaitlist,
    mockHostRemoveFromWaitlist,
    mockGetWaitlist,
    mockHostGetWaitlistStats,
    mockGetWaitTimeEstimate,
    mockSuggestTables,
    mockGetHostDashboard,
    mockHostGetPreShiftReport,
    mockHostGetTableTurnStats,
    mockSendGuestNotification,
    mockWithMiddleware,
    makeSafeParse,
    mockDbExecute,
  };
});

// ── Module mocks ──────────────────────────────────────────────

vi.mock('@oppsera/core/auth/with-middleware', () => ({
  withMiddleware: mockWithMiddleware,
}));

vi.mock('@oppsera/module-fnb', () => ({
  // Reservation commands — both legacy and host-prefixed names
  createReservation: mockCreateReservation,
  hostCreateReservation: mockCreateReservation,
  createReservationSchema: makeSafeParse(['guestName', 'partySize']),
  hostCreateReservationSchema: makeSafeParse(['guestName', 'partySize']),
  updateReservation: mockUpdateReservation,
  updateReservationSchema: makeSafeParse([]),
  confirmReservation: mockConfirmReservation,
  confirmReservationSchema: makeSafeParse([]),
  checkInReservation: mockCheckInReservation,
  checkInReservationSchema: makeSafeParse([]),
  seatReservation: mockSeatReservation,
  seatReservationSchema: makeSafeParse(['tableIds']),
  cancelReservation: mockCancelReservation,
  completeReservation: mockCompleteReservation,
  completeReservationSchema: makeSafeParse([]),
  noShowReservation: mockNoShowReservation,
  // Reservation queries
  getReservations: mockGetReservations,
  hostGetUpcomingReservations: mockHostGetUpcomingReservations,
  // Waitlist commands — both legacy and host-prefixed names
  addToWaitlist: mockAddToWaitlist,
  hostAddToWaitlist: mockAddToWaitlist,
  addToWaitlistSchema: makeSafeParse(['guestName', 'partySize']),
  hostAddToWaitlistSchema: makeSafeParse(['guestName', 'partySize']),
  updateWaitlistEntry: mockUpdateWaitlistEntry,
  updateWaitlistEntrySchema: makeSafeParse([]),
  removeFromWaitlist: mockRemoveFromWaitlist,
  notifyWaitlistGuest: mockNotifyWaitlistGuest,
  notifyWaitlistGuestSchema: makeSafeParse([]),
  seatFromWaitlist: mockSeatFromWaitlist,
  seatFromWaitlistSchema: makeSafeParse(['tableIds']),
  hostRemoveFromWaitlist: mockHostRemoveFromWaitlist,
  hostRemoveFromWaitlistSchema: makeSafeParse([]),
  // Waitlist queries
  getWaitlist: mockGetWaitlist,
  hostGetWaitlistStats: mockHostGetWaitlistStats,
  // Intelligence
  getWaitTimeEstimate: mockGetWaitTimeEstimate,
  suggestTables: mockSuggestTables,
  // Dashboard / reports
  getHostDashboard: mockGetHostDashboard,
  hostGetPreShiftReport: mockHostGetPreShiftReport,
  hostGetPreShiftReportSchema: makeSafeParse(['tenantId', 'locationId']),
  hostGetTableTurnStats: mockHostGetTableTurnStats,
  // Notifications
  sendGuestNotification: mockSendGuestNotification,
  sendGuestNotificationSchema: makeSafeParse(['guestId', 'templateKey']),
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

vi.mock('@oppsera/db', () => ({
  db: {
    execute: mockDbExecute,
  },
  withTenant: async (_tenantId: string, fn: (tx: any) => any) => {
    const tx = { execute: mockDbExecute };
    return fn(tx);
  },
}));

vi.mock('drizzle-orm', () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
    __isSql: true,
  }),
}));

// ── Helpers ───────────────────────────────────────────────────

function makeGetRequest(url: string) {
  const urlObj = new URL(url);
  return {
    url,
    method: 'GET',
    nextUrl: urlObj,
    json: vi.fn(),
    headers: { get: vi.fn().mockReturnValue(null) },
  } as any;
}

function makePostRequest(url: string, body: unknown) {
  const urlObj = new URL(url);
  return {
    url,
    method: 'POST',
    nextUrl: urlObj,
    json: vi.fn().mockResolvedValue(body),
    headers: { get: vi.fn().mockReturnValue(null) },
  } as any;
}

function makePatchRequest(url: string, body: unknown) {
  const urlObj = new URL(url);
  return {
    url,
    method: 'PATCH',
    nextUrl: urlObj,
    json: vi.fn().mockResolvedValue(body),
    headers: { get: vi.fn().mockReturnValue(null) },
  } as any;
}

const BASE = 'http://localhost/api/v1/fnb/host';

// ── Route imports (after mocks) ──────────────────────────────

// Reservations
import {
  GET as reservationsGET,
  POST as reservationsPOST,
} from '../app/api/v1/fnb/host/reservations/route';
import { PATCH as reservationPATCH } from '../app/api/v1/fnb/host/reservations/[id]/route';
import { POST as confirmPOST } from '../app/api/v1/fnb/host/reservations/[id]/confirm/route';
import { POST as checkInPOST } from '../app/api/v1/fnb/host/reservations/[id]/check-in/route';
import { POST as seatPOST } from '../app/api/v1/fnb/host/reservations/[id]/seat/route';
import { POST as cancelPOST } from '../app/api/v1/fnb/host/reservations/[id]/cancel/route';
import { POST as completePOST } from '../app/api/v1/fnb/host/reservations/[id]/complete/route';
import { POST as noShowPOST } from '../app/api/v1/fnb/host/reservations/[id]/no-show/route';
import { GET as upcomingGET } from '../app/api/v1/fnb/host/reservations/upcoming/route';

// Waitlist
import {
  GET as waitlistGET,
  POST as waitlistPOST,
} from '../app/api/v1/fnb/host/waitlist/route';
import { POST as waitlistNotifyPOST } from '../app/api/v1/fnb/host/waitlist/[id]/notify/route';
import { POST as waitlistSeatPOST } from '../app/api/v1/fnb/host/waitlist/[id]/seat/route';
import { POST as waitlistRemovePOST } from '../app/api/v1/fnb/host/waitlist/[id]/remove/route';
import { GET as waitlistStatsGET } from '../app/api/v1/fnb/host/waitlist/stats/route';

// Intelligence
import { GET as waitEstimateGET } from '../app/api/v1/fnb/host/wait-estimate/route';
import { POST as suggestTablesPOST } from '../app/api/v1/fnb/host/suggest-tables/route';

// Dashboard / Reports
import { GET as dashboardGET } from '../app/api/v1/fnb/host/dashboard/route';
import { GET as preShiftGET } from '../app/api/v1/fnb/host/pre-shift/route';
import { GET as turnStatsGET } from '../app/api/v1/fnb/host/turn-stats/route';

// Notifications
import { POST as notifSendPOST } from '../app/api/v1/fnb/host/notifications/send/route';

// Guest (public — no auth)
import { GET as guestWaitlistGET } from '../app/api/v1/fnb/host/guest/waitlist/[token]/route';
import { POST as guestWaitlistJoinPOST } from '../app/api/v1/fnb/host/guest/waitlist/join/route';
import { PATCH as guestWaitlistUpdatePATCH } from '../app/api/v1/fnb/host/guest/waitlist/[token]/update/route';

// ═══════════════════════════════════════════════════════════════
// 1. Reservations — List & Create
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/fnb/host/reservations', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns reservations list with filters', async () => {
    const items = [
      { id: 'res_001', guestName: 'Smith', partySize: 4, status: 'confirmed' },
      { id: 'res_002', guestName: 'Jones', partySize: 2, status: 'confirmed' },
    ];
    mockGetReservations.mockResolvedValue({ items, totalCount: 2 });

    const res = await reservationsGET(
      makeGetRequest(`${BASE}/reservations?dateFrom=2026-02-25&status=confirmed`),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.meta.totalCount).toBe(2);
    expect(mockGetReservations).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        dateFrom: '2026-02-25',
        status: 'confirmed',
      }),
    );
  });
});

describe('POST /api/v1/fnb/host/reservations', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates a reservation and returns 201', async () => {
    const created = {
      id: 'res_new',
      guestName: 'Taylor',
      partySize: 6,
      status: 'pending',
      reservationDate: '2026-02-26',
      reservationTime: '19:00',
    };
    mockCreateReservation.mockResolvedValue(created);

    const req = makePostRequest(`${BASE}/reservations`, {
      guestName: 'Taylor',
      partySize: 6,
      reservationDate: '2026-02-26',
      reservationTime: '19:00',
    });
    const res = await reservationsPOST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.id).toBe('res_new');
    expect(body.data.guestName).toBe('Taylor');
    expect(mockCreateReservation).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      expect.objectContaining({ guestName: 'Taylor', partySize: 6 }),
    );
  });

  it('rejects reservation without required guestName', async () => {
    const req = makePostRequest(`${BASE}/reservations`, { partySize: 4 });
    await expect(reservationsPOST(req)).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. Reservations — Detail & Update
// ═══════════════════════════════════════════════════════════════

describe('PATCH /api/v1/fnb/host/reservations/[id]', () => {
  beforeEach(() => vi.resetAllMocks());

  it('updates a reservation', async () => {
    const updated = { id: 'res_001', guestName: 'Smith', partySize: 6, status: 'confirmed' };
    mockUpdateReservation.mockResolvedValue(updated);

    const req = makePatchRequest(`${BASE}/reservations/res_001`, {
      partySize: 6,
      specialRequests: 'Window seat',
    });
    const res = await reservationPATCH(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.partySize).toBe(6);
    expect(mockUpdateReservation).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      'res_001',
      expect.objectContaining({ partySize: 6 }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. Reservations — Lifecycle Transitions
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/fnb/host/reservations/[id]/confirm', () => {
  beforeEach(() => vi.resetAllMocks());

  it('confirms a reservation', async () => {
    const result = { id: 'res_001', status: 'confirmed', confirmedAt: '2026-02-25T10:00:00Z' };
    mockConfirmReservation.mockResolvedValue(result);

    const req = makePostRequest(`${BASE}/reservations/res_001/confirm`, {});
    const res = await (confirmPOST as RouteHandler)(req, { params: Promise.resolve({ id: 'res_001' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('confirmed');
    expect(mockConfirmReservation).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      'res_001',
      expect.any(Object),
    );
  });
});

describe('POST /api/v1/fnb/host/reservations/[id]/check-in', () => {
  beforeEach(() => vi.resetAllMocks());

  it('checks in a reservation', async () => {
    const result = { id: 'res_001', status: 'checked_in', checkedInAt: '2026-02-25T18:55:00Z' };
    mockCheckInReservation.mockResolvedValue(result);

    const req = makePostRequest(`${BASE}/reservations/res_001/check-in`, {
      actualPartySize: 4,
    });
    const res = await checkInPOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('checked_in');
    expect(mockCheckInReservation).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      'res_001',
      expect.any(Object),
    );
  });
});

describe('POST /api/v1/fnb/host/reservations/[id]/seat', () => {
  beforeEach(() => vi.resetAllMocks());

  it('seats a reservation when tableIds are provided', async () => {
    const result = { id: 'res_001', status: 'seated', tableIds: ['t_001', 't_002'] };
    mockSeatReservation.mockResolvedValue(result);

    const req = makePostRequest(`${BASE}/reservations/res_001/seat`, {
      tableIds: ['t_001', 't_002'],
    });
    const res = await (seatPOST as RouteHandler)(req, { params: Promise.resolve({ id: 'res_001' }) });
    await res.json();

    expect(res.status).toBe(200);
    expect(mockSeatReservation).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      'res_001',
      expect.objectContaining({ tableIds: ['t_001', 't_002'] }),
    );
  });

  it('returns suggestions when no tableIds provided', async () => {
    const suggestions = { suggestions: [{ tableId: 't_003', score: 0.95 }] };
    mockSeatReservation.mockResolvedValue(suggestions);

    const req = makePostRequest(`${BASE}/reservations/res_001/seat`, {});
    const res = await (seatPOST as RouteHandler)(req, { params: Promise.resolve({ id: 'res_001' }) });
    await res.json();

    expect(res.status).toBe(200);
    expect(mockSeatReservation).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      'res_001',
      {},
    );
  });
});

describe('POST /api/v1/fnb/host/reservations/[id]/cancel', () => {
  beforeEach(() => vi.resetAllMocks());

  it('cancels a reservation', async () => {
    mockCancelReservation.mockResolvedValue(undefined);

    const req = makePostRequest(`${BASE}/reservations/res_001/cancel`, {
      reason: 'Guest called to cancel',
    });
    const res = await cancelPOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.success).toBe(true);
    expect(mockCancelReservation).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      'res_001',
      'Guest called to cancel',
    );
  });
});

describe('POST /api/v1/fnb/host/reservations/[id]/complete', () => {
  beforeEach(() => vi.resetAllMocks());

  it('completes a reservation', async () => {
    const result = { id: 'res_001', status: 'completed', completedAt: '2026-02-25T21:00:00Z' };
    mockCompleteReservation.mockResolvedValue(result);

    const req = makePostRequest(`${BASE}/reservations/res_001/complete`, {});
    const res = await (completePOST as RouteHandler)(req, { params: Promise.resolve({ id: 'res_001' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('completed');
    expect(mockCompleteReservation).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      'res_001',
      expect.any(Object),
    );
  });
});

describe('POST /api/v1/fnb/host/reservations/[id]/no-show', () => {
  beforeEach(() => vi.resetAllMocks());

  it('marks a reservation as no-show', async () => {
    mockNoShowReservation.mockResolvedValue(undefined);

    const req = makePostRequest(`${BASE}/reservations/res_001/no-show`, {});
    const res = await noShowPOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.success).toBe(true);
    expect(mockNoShowReservation).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      'res_001',
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. Reservations — Upcoming
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/fnb/host/reservations/upcoming', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns upcoming reservations with limit', async () => {
    const upcoming = [
      { id: 'res_010', guestName: 'Brown', reservationTime: '19:00', partySize: 4 },
      { id: 'res_011', guestName: 'Davis', reservationTime: '19:30', partySize: 2 },
    ];
    mockHostGetUpcomingReservations.mockResolvedValue(upcoming);

    const res = await upcomingGET(makeGetRequest(`${BASE}/reservations/upcoming?limit=10`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(mockHostGetUpcomingReservations).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        locationId: 'loc_001',
        limit: 10,
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. Waitlist — List & Add
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/fnb/host/waitlist', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns sorted waitlist entries', async () => {
    const items = [
      { id: 'wl_001', guestName: 'Wilson', position: 1, partySize: 3, status: 'waiting' },
      { id: 'wl_002', guestName: 'Clark', position: 2, partySize: 5, status: 'waiting' },
    ];
    mockGetWaitlist.mockResolvedValue({ items, totalCount: 2 });

    const res = await waitlistGET(
      makeGetRequest(`${BASE}/waitlist?businessDate=2026-02-25&status=waiting`),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.meta.totalCount).toBe(2);
    expect(mockGetWaitlist).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        businessDate: '2026-02-25',
        status: 'waiting',
      }),
    );
  });
});

describe('POST /api/v1/fnb/host/waitlist', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates a waitlist entry and returns 201', async () => {
    const created = {
      id: 'wl_new',
      guestName: 'Reed',
      partySize: 4,
      position: 3,
      status: 'waiting',
      guestToken: 'tok_abc123',
    };
    mockAddToWaitlist.mockResolvedValue(created);

    const req = makePostRequest(`${BASE}/waitlist`, {
      guestName: 'Reed',
      partySize: 4,
      guestPhone: '555-0123',
    });
    const res = await waitlistPOST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.id).toBe('wl_new');
    expect(body.data.position).toBe(3);
    expect(mockAddToWaitlist).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      expect.objectContaining({ guestName: 'Reed', partySize: 4 }),
    );
  });

  it('rejects waitlist entry without guestName', async () => {
    const req = makePostRequest(`${BASE}/waitlist`, { partySize: 2 });
    await expect(waitlistPOST(req)).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. Waitlist — Actions
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/fnb/host/waitlist/[id]/notify', () => {
  beforeEach(() => vi.resetAllMocks());

  it('notifies a waitlist guest', async () => {
    const result = { id: 'wl_001', status: 'notified', notifiedAt: '2026-02-25T18:30:00Z' };
    mockNotifyWaitlistGuest.mockResolvedValue(result);

    const req = makePostRequest(`${BASE}/waitlist/wl_001/notify`, {
      method: 'sms',
    });
    const res = await waitlistNotifyPOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('notified');
    expect(mockNotifyWaitlistGuest).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      'wl_001',
      expect.any(Object),
    );
  });
});

describe('POST /api/v1/fnb/host/waitlist/[id]/seat', () => {
  beforeEach(() => vi.resetAllMocks());

  it('seats a guest from the waitlist', async () => {
    const result = { id: 'wl_001', status: 'seated', tableIds: ['t_005'] };
    mockSeatFromWaitlist.mockResolvedValue(result);

    const req = makePostRequest(`${BASE}/waitlist/wl_001/seat`, {
      tableIds: ['t_005'],
    });
    const res = await waitlistSeatPOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('seated');
    expect(mockSeatFromWaitlist).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      'wl_001',
      expect.objectContaining({ tableIds: ['t_005'] }),
    );
  });
});

describe('POST /api/v1/fnb/host/waitlist/[id]/remove', () => {
  beforeEach(() => vi.resetAllMocks());

  it('removes a guest from the waitlist', async () => {
    const result = { id: 'wl_001', status: 'removed' };
    mockHostRemoveFromWaitlist.mockResolvedValue(result);

    const req = makePostRequest(`${BASE}/waitlist/wl_001/remove`, {
      reason: 'left',
    });
    const res = await (waitlistRemovePOST as RouteHandler)(req, { params: Promise.resolve({ id: 'wl_001' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('removed');
    expect(mockHostRemoveFromWaitlist).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      'wl_001',
      expect.any(Object),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. Waitlist Stats
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/fnb/host/waitlist/stats', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns waitlist statistics', async () => {
    const stats = {
      totalWaiting: 8,
      totalNotified: 2,
      avgWaitMinutes: 22,
      longestWaitMinutes: 45,
    };
    mockHostGetWaitlistStats.mockResolvedValue(stats);

    const res = await waitlistStatsGET(makeGetRequest(`${BASE}/waitlist/stats`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.totalWaiting).toBe(8);
    expect(body.data.avgWaitMinutes).toBe(22);
    expect(mockHostGetWaitlistStats).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        locationId: 'loc_001',
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. Wait Time Estimate
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/fnb/host/wait-estimate', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns wait time estimate with confidence', async () => {
    const estimate = {
      estimatedMinutes: 25,
      confidence: 0.85,
      basedOn: 'historical',
      partySizeBucket: '3-4',
    };
    mockGetWaitTimeEstimate.mockResolvedValue(estimate);

    const res = await waitEstimateGET(
      makeGetRequest(`${BASE}/wait-estimate?partySize=4&seatingPreference=indoor`),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.estimatedMinutes).toBe(25);
    expect(body.data.confidence).toBe(0.85);
    expect(mockGetWaitTimeEstimate).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        partySize: 4,
        seatingPreference: 'indoor',
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. Suggest Tables
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/fnb/host/suggest-tables', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns scored table suggestions', async () => {
    const suggestions = [
      { tableId: 't_001', tableName: 'Table 1', score: 0.95, reasons: ['Perfect capacity fit'] },
      { tableId: 't_003', tableName: 'Table 3', score: 0.78, reasons: ['Slight oversize'] },
    ];
    mockSuggestTables.mockResolvedValue(suggestions);

    const req = makePostRequest(`${BASE}/suggest-tables`, {
      partySize: 4,
      seatingPreference: 'patio',
      isVip: false,
    });
    const res = await suggestTablesPOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].score).toBe(0.95);
    expect(mockSuggestTables).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        locationId: 'loc_001',
        partySize: 4,
        seatingPreference: 'patio',
        isVip: false,
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. Dashboard
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/fnb/host/dashboard', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns all dashboard metrics', async () => {
    const data = {
      reservations: { total: 24, confirmed: 18, checkedIn: 4, noShow: 2 },
      waitlist: { totalWaiting: 5, avgWaitMinutes: 15 },
      tables: { total: 30, occupied: 22, available: 8 },
      covers: { current: 85, expected: 120 },
    };
    mockGetHostDashboard.mockResolvedValue(data);

    const res = await dashboardGET(
      makeGetRequest(`${BASE}/dashboard?businessDate=2026-02-25`),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.reservations.total).toBe(24);
    expect(body.data.tables.available).toBe(8);
    expect(mockGetHostDashboard).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        locationId: 'loc_001',
        businessDate: '2026-02-25',
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// 11. Pre-Shift Report
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/fnb/host/pre-shift', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns pre-shift report', async () => {
    const report = {
      reservationCount: 12,
      expectedCovers: 48,
      vipReservations: 3,
      specialRequests: ['Wheelchair access', 'Birthday cake'],
      staffAssignments: [{ sectionId: 'sec_001', serverId: 'user_002' }],
    };
    mockHostGetPreShiftReport.mockResolvedValue(report);

    const res = await preShiftGET(
      makeGetRequest(`${BASE}/pre-shift?date=2026-02-25&mealPeriod=dinner`),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.reservationCount).toBe(12);
    expect(body.data.expectedCovers).toBe(48);
    expect(mockHostGetPreShiftReport).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// 12. Turn Stats
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/fnb/host/turn-stats', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns table turn statistics', async () => {
    const stats = {
      avgTurnTimeMinutes: 52,
      totalTurns: 340,
      turnsByDaypart: [
        { daypart: 'lunch', avgMinutes: 42, count: 150 },
        { daypart: 'dinner', avgMinutes: 62, count: 190 },
      ],
    };
    mockHostGetTableTurnStats.mockResolvedValue(stats);

    const res = await turnStatsGET(makeGetRequest(`${BASE}/turn-stats?days=14`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.avgTurnTimeMinutes).toBe(52);
    expect(body.data.totalTurns).toBe(340);
    expect(mockHostGetTableTurnStats).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        locationId: 'loc_001',
        days: 14,
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// 13. Notification Send
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/fnb/host/notifications/send', () => {
  beforeEach(() => vi.resetAllMocks());

  it('sends a guest notification and returns 201', async () => {
    const result = { id: 'notif_001', sentAt: '2026-02-25T18:30:00Z', status: 'sent' };
    mockSendGuestNotification.mockResolvedValue(result);

    const req = makePostRequest(`${BASE}/notifications/send`, {
      guestId: 'wl_001',
      templateKey: 'table_ready',
      channel: 'sms',
    });
    const res = await notifSendPOST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.status).toBe('sent');
    expect(mockSendGuestNotification).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      expect.objectContaining({ guestId: 'wl_001', templateKey: 'table_ready' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// 14. Guest Public Routes (no auth)
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/fnb/host/guest/waitlist/[token] (public)', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns waitlist entry by token', async () => {
    const row = {
      id: 'wl_001',
      guest_name: 'Wilson',
      party_size: 3,
      position: 2,
      status: 'waiting',
      quoted_wait_minutes: 20,
      estimated_ready_at: '2026-02-25T19:00:00Z',
      seating_preference: 'indoor',
      created_at: '2026-02-25T18:40:00Z',
    };
    mockDbExecute.mockResolvedValue([row]);

    const req = makeGetRequest(`${BASE}/guest/waitlist/tok_abc123`);
    const res = await guestWaitlistGET(req, {
      params: Promise.resolve({ token: 'tok_abc123' }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.guestName).toBe('Wilson');
    expect(body.data.position).toBe(2);
    expect(body.data.status).toBe('waiting');
  });

  it('returns 404 when token not found', async () => {
    mockDbExecute.mockResolvedValue([]);

    const req = makeGetRequest(`${BASE}/guest/waitlist/tok_invalid`);
    const res = await guestWaitlistGET(req, {
      params: Promise.resolve({ token: 'tok_invalid' }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/v1/fnb/host/guest/waitlist/join (public)', () => {
  beforeEach(() => vi.resetAllMocks());

  it('adds a guest to the waitlist via self-service', async () => {
    // Mock single atomic INSERT (position computed via subquery)
    mockDbExecute.mockResolvedValueOnce([{
      id: 'wl_new',
      guest_name: 'Guest',
      party_size: 2,
      position: 4,
      quoted_wait_minutes: 15,
      guest_token: 'tok_generated',
      estimated_ready_at: '2026-02-25T19:15:00Z',
    }]);

    const req = makePostRequest(`${BASE}/guest/waitlist/join`, {
      tenantId: 'tenant_001',
      locationId: 'loc_001',
      guestName: 'Guest',
      partySize: 2,
    });
    const res = await guestWaitlistJoinPOST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.guestName).toBe('Guest');
    expect(body.data.position).toBe(4);
    expect(body.data.guestToken).toBe('tok_generated');
  });

  it('rejects guest join without locationId', async () => {
    const req = makePostRequest(`${BASE}/guest/waitlist/join`, {
      guestName: 'Guest',
      partySize: 2,
    });
    const res = await guestWaitlistJoinPOST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /api/v1/fnb/host/guest/waitlist/[token]/update (public)', () => {
  beforeEach(() => vi.resetAllMocks());

  it('updates a waitlist entry by guest token', async () => {
    // Mock lookup query
    mockDbExecute.mockResolvedValueOnce([{ id: 'wl_001', status: 'waiting' }]);
    // Mock update query
    mockDbExecute.mockResolvedValueOnce([]);

    const req = makePatchRequest(`${BASE}/guest/waitlist/tok_abc123/update`, {
      partySize: 5,
    });
    const res = await guestWaitlistUpdatePATCH(req, {
      params: Promise.resolve({ token: 'tok_abc123' }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.updated).toBe(true);
  });

  it('returns 404 when token is not found or entry is inactive', async () => {
    mockDbExecute.mockResolvedValueOnce([]);

    const req = makePatchRequest(`${BASE}/guest/waitlist/tok_old/update`, {
      partySize: 3,
    });
    const res = await guestWaitlistUpdatePATCH(req, {
      params: Promise.resolve({ token: 'tok_old' }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

// ═══════════════════════════════════════════════════════════════
// Route exports verification
// ═══════════════════════════════════════════════════════════════

describe('Host API route exports', () => {
  it('exports reservation route handlers', () => {
    expect(typeof reservationsGET).toBe('function');
    expect(typeof reservationsPOST).toBe('function');
    expect(typeof reservationPATCH).toBe('function');
    expect(typeof confirmPOST).toBe('function');
    expect(typeof checkInPOST).toBe('function');
    expect(typeof seatPOST).toBe('function');
    expect(typeof cancelPOST).toBe('function');
    expect(typeof completePOST).toBe('function');
    expect(typeof noShowPOST).toBe('function');
    expect(typeof upcomingGET).toBe('function');
  });

  it('exports waitlist route handlers', () => {
    expect(typeof waitlistGET).toBe('function');
    expect(typeof waitlistPOST).toBe('function');
    expect(typeof waitlistNotifyPOST).toBe('function');
    expect(typeof waitlistSeatPOST).toBe('function');
    expect(typeof waitlistRemovePOST).toBe('function');
    expect(typeof waitlistStatsGET).toBe('function');
  });

  it('exports intelligence, dashboard, and report route handlers', () => {
    expect(typeof waitEstimateGET).toBe('function');
    expect(typeof suggestTablesPOST).toBe('function');
    expect(typeof dashboardGET).toBe('function');
    expect(typeof preShiftGET).toBe('function');
    expect(typeof turnStatsGET).toBe('function');
  });

  it('exports notification and guest route handlers', () => {
    expect(typeof notifSendPOST).toBe('function');
    expect(typeof guestWaitlistGET).toBe('function');
    expect(typeof guestWaitlistJoinPOST).toBe('function');
    expect(typeof guestWaitlistUpdatePATCH).toBe('function');
  });
});
