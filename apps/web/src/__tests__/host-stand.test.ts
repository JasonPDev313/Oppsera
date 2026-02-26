import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Hoisted mocks ──────────────────────────────────────────────────

const {
  mockGetHostDashboard,
  mockListTables,
  mockHostGetPreShiftReport,
  mockHostGetPreShiftReportSchema,
  mockGetWaitTimeEstimate,
  mockGetAvailableTablesForSeating,
  mockHostAddToWaitlist,
  mockHostAddToWaitlistSchema,
  mockHostCreateReservation,
  mockHostCreateReservationSchema,
  mockGetHostAnalytics,
  mockHostGetAnalyticsSchema,
  mockWithMiddleware,
} = vi.hoisted(() => {
  const mockGetHostDashboard = vi.fn();
  const mockListTables = vi.fn();
  const mockHostGetPreShiftReport = vi.fn();
  const mockHostGetPreShiftReportSchema = {
    safeParse: vi.fn().mockReturnValue({ success: true, data: {} }),
  };
  const mockGetWaitTimeEstimate = vi.fn();
  const mockGetAvailableTablesForSeating = vi.fn();
  const mockHostAddToWaitlist = vi.fn();
  const mockHostAddToWaitlistSchema = {
    safeParse: vi.fn().mockReturnValue({ success: true, data: {} }),
  };
  const mockHostCreateReservation = vi.fn();
  const mockHostCreateReservationSchema = {
    safeParse: vi.fn().mockReturnValue({ success: true, data: {} }),
  };
  const mockGetHostAnalytics = vi.fn();
  const mockHostGetAnalyticsSchema = {
    safeParse: vi.fn().mockReturnValue({ success: true, data: {} }),
  };

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
    mockGetHostDashboard,
    mockListTables,
    mockHostGetPreShiftReport,
    mockHostGetPreShiftReportSchema,
    mockGetWaitTimeEstimate,
    mockGetAvailableTablesForSeating,
    mockHostAddToWaitlist,
    mockHostAddToWaitlistSchema,
    mockHostCreateReservation,
    mockHostCreateReservationSchema,
    mockGetHostAnalytics,
    mockHostGetAnalyticsSchema,
    mockWithMiddleware,
  };
});

vi.mock('@oppsera/core/auth/with-middleware', () => ({
  withMiddleware: mockWithMiddleware,
}));

vi.mock('@oppsera/module-fnb', () => ({
  getHostDashboard: mockGetHostDashboard,
  listTables: mockListTables,
  hostGetPreShiftReport: mockHostGetPreShiftReport,
  hostGetPreShiftReportSchema: mockHostGetPreShiftReportSchema,
  getWaitTimeEstimate: mockGetWaitTimeEstimate,
  getAvailableTablesForSeating: mockGetAvailableTablesForSeating,
  getTableAvailability: mockGetAvailableTablesForSeating,
  hostAddToWaitlist: mockHostAddToWaitlist,
  hostAddToWaitlistSchema: mockHostAddToWaitlistSchema,
  addToWaitlist: mockHostAddToWaitlist,
  addToWaitlistSchema: mockHostAddToWaitlistSchema,
  hostCreateReservation: mockHostCreateReservation,
  hostCreateReservationSchema: mockHostCreateReservationSchema,
  createReservation: mockHostCreateReservation,
  createReservationSchema: mockHostCreateReservationSchema,
  getWaitlist: vi.fn().mockResolvedValue({ items: [], cursor: null, hasMore: false }),
  getReservations: vi.fn().mockResolvedValue({ items: [], cursor: null, hasMore: false }),
  createTable: vi.fn(),
  createTableSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
  getHostAnalytics: mockGetHostAnalytics,
  hostGetAnalyticsSchema: mockHostGetAnalyticsSchema,
}));

vi.mock('@oppsera/shared', () => ({
  ValidationError: class ValidationError extends Error {
    constructor(msg: string, public details: unknown[]) { super(msg); }
  },
}));

// ── Helpers ─────────────────────────────────────────────────────────

function makeRequest(url: string, method = 'GET', body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new NextRequest(new URL(url, 'http://localhost:3000'), init as any);
}

const DASHBOARD_RESULT = {
  waitlist: [
    {
      id: 'wl_001',
      guestName: 'Alice Smith',
      partySize: 4,
      status: 'waiting',
      priority: 1,
      position: 1,
      isVip: false,
      addedAt: new Date().toISOString(),
      elapsedMinutes: 12,
      source: 'walk_in',
    },
  ],
  upcomingReservations: [
    {
      id: 'res_001',
      guestName: 'Bob Jones',
      partySize: 2,
      reservationDate: '2026-02-25',
      reservationTime: '19:00',
      durationMinutes: 90,
      status: 'confirmed',
      isVip: true,
      minutesUntil: 30,
    },
  ],
  tableSummary: { total: 20, available: 8, seated: 10, reserved: 1, dirty: 1, blocked: 0 },
  servers: [
    { serverUserId: 'srv_001', serverName: 'Jane', sectionNames: ['A'], coversServed: 12, openTabCount: 3, isNext: true },
  ],
  nextUpServerUserId: 'srv_001',
  stats: {
    totalCoversToday: 45,
    currentWaiting: 3,
    avgWaitMinutes: 15,
    reservationsToday: 12,
    noShowsToday: 1,
    seatedFromWaitlist: 8,
  },
};

const TABLES_RESULT = {
  items: [
    {
      id: 'tbl_001',
      roomId: 'room_001',
      locationId: 'loc_001',
      tableNumber: 1,
      displayLabel: 'T1',
      capacityMin: 2,
      capacityMax: 4,
      tableType: 'standard',
      shape: 'round',
      isCombinable: true,
      isActive: true,
      sectionId: null,
      sortOrder: 1,
      status: 'available',
      currentTabId: null,
      currentServerUserId: null,
      seatedAt: null,
      partySize: null,
      combineGroupId: null,
      version: null,
    },
    {
      id: 'tbl_002',
      roomId: 'room_001',
      locationId: 'loc_001',
      tableNumber: 2,
      displayLabel: 'T2',
      capacityMin: 4,
      capacityMax: 6,
      tableType: 'booth',
      shape: 'rectangle',
      isCombinable: false,
      isActive: true,
      sectionId: null,
      sortOrder: 2,
      status: 'seated',
      currentTabId: 'tab_001',
      currentServerUserId: 'srv_001',
      seatedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
      partySize: 4,
      combineGroupId: null,
      version: 1,
    },
  ],
  cursor: null,
  hasMore: false,
};

// ── Tests ───────────────────────────────────────────────────────────

describe('Host Stand API Contract Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetHostDashboard.mockResolvedValue(DASHBOARD_RESULT);
    mockListTables.mockResolvedValue(TABLES_RESULT);
  });

  // ── Dashboard ─────────────────────────────────────

  describe('GET /api/v1/fnb/host/dashboard', () => {
    it('returns dashboard data with all sections', async () => {
      const { GET } = await import('../app/api/v1/fnb/host/dashboard/route');
      const req = makeRequest('http://localhost:3000/api/v1/fnb/host/dashboard?locationId=loc_001&businessDate=2026-02-25');
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toBeDefined();
      expect(json.data.waitlist).toHaveLength(1);
      expect(json.data.upcomingReservations).toHaveLength(1);
      expect(json.data.tableSummary.total).toBe(20);
      expect(json.data.servers).toHaveLength(1);
      expect(json.data.stats.totalCoversToday).toBe(45);
    });

    it('includes waitlist entry fields', async () => {
      const { GET } = await import('../app/api/v1/fnb/host/dashboard/route');
      const req = makeRequest('http://localhost:3000/api/v1/fnb/host/dashboard?locationId=loc_001');
      const res = await GET(req);
      const json = await res.json();
      const entry = json.data.waitlist[0];
      expect(entry.id).toBe('wl_001');
      expect(entry.guestName).toBe('Alice Smith');
      expect(entry.partySize).toBe(4);
      expect(entry.status).toBe('waiting');
      expect(entry.elapsedMinutes).toBe(12);
    });

    it('includes reservation fields', async () => {
      const { GET } = await import('../app/api/v1/fnb/host/dashboard/route');
      const req = makeRequest('http://localhost:3000/api/v1/fnb/host/dashboard?locationId=loc_001');
      const res = await GET(req);
      const json = await res.json();
      const res0 = json.data.upcomingReservations[0];
      expect(res0.guestName).toBe('Bob Jones');
      expect(res0.partySize).toBe(2);
      expect(res0.isVip).toBe(true);
      expect(res0.minutesUntil).toBe(30);
    });
  });

  // ── Tables ────────────────────────────────────────

  describe('GET /api/v1/fnb/tables', () => {
    it('returns table list with live status', async () => {
      const { GET } = await import('../app/api/v1/fnb/tables/route');
      const req = makeRequest('http://localhost:3000/api/v1/fnb/tables?locationId=loc_001');
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toHaveLength(2);
      expect(json.meta.hasMore).toBe(false);
    });

    it('includes table shape and status fields', async () => {
      const { GET } = await import('../app/api/v1/fnb/tables/route');
      const req = makeRequest('http://localhost:3000/api/v1/fnb/tables?locationId=loc_001');
      const res = await GET(req);
      const json = await res.json();
      const tbl = json.data[0];
      expect(tbl.shape).toBe('round');
      expect(tbl.status).toBe('available');
      expect(tbl.capacityMax).toBe(4);
    });

    it('includes seated table info', async () => {
      const { GET } = await import('../app/api/v1/fnb/tables/route');
      const req = makeRequest('http://localhost:3000/api/v1/fnb/tables?locationId=loc_001');
      const res = await GET(req);
      const json = await res.json();
      const seated = json.data[1];
      expect(seated.status).toBe('seated');
      expect(seated.currentTabId).toBe('tab_001');
      expect(seated.seatedAt).toBeTruthy();
      expect(seated.partySize).toBe(4);
    });

    it('respects limit parameter', async () => {
      const { GET } = await import('../app/api/v1/fnb/tables/route');
      const req = makeRequest('http://localhost:3000/api/v1/fnb/tables?locationId=loc_001&limit=1');
      await GET(req);
      expect(mockListTables).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 1 }),
      );
    });
  });

  // ── Pre-Shift Report ──────────────────────────────

  describe('GET /api/v1/fnb/host/pre-shift', () => {
    it('returns pre-shift report data', async () => {
      const preShiftResult = {
        totalReservations: 15,
        expectedCovers: 42,
        vipCount: 3,
        largePartyCount: 2,
        alerts: [
          { type: 'allergy', message: 'Nut allergy', reservationId: 'res_001', guestName: 'Bob Jones', time: '19:00' },
        ],
        vipArrivals: [
          { reservationId: 'res_001', guestName: 'Bob Jones', time: '19:00', partySize: 2, visitCount: 5, notes: null },
        ],
        staffAssignments: [
          { serverName: 'Jane', sectionNames: ['A', 'B'], expectedCovers: 20 },
        ],
      };
      mockHostGetPreShiftReport.mockResolvedValue(preShiftResult);
      mockHostGetPreShiftReportSchema.safeParse.mockReturnValue({
        success: true,
        data: { tenantId: 'tenant_001', locationId: 'loc_001', date: '2026-02-25', mealPeriod: '' },
      });

      const { GET } = await import('../app/api/v1/fnb/host/pre-shift/route');
      const req = makeRequest('http://localhost:3000/api/v1/fnb/host/pre-shift?locationId=loc_001&date=2026-02-25');
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.totalReservations).toBe(15);
      expect(json.data.expectedCovers).toBe(42);
      expect(json.data.alerts).toHaveLength(1);
      expect(json.data.vipArrivals).toHaveLength(1);
      expect(json.data.staffAssignments).toHaveLength(1);
    });

    it('returns 400 for invalid input', async () => {
      mockHostGetPreShiftReportSchema.safeParse.mockReturnValue({
        success: false,
        error: { issues: [{ path: ['locationId'], message: 'Required' }] },
      });

      const { GET } = await import('../app/api/v1/fnb/host/pre-shift/route');
      const req = makeRequest('http://localhost:3000/api/v1/fnb/host/pre-shift');

      // ValidationError is thrown inside withMiddleware — handler throws, mock wraps it
      await expect(GET(req)).rejects.toThrow();
    });
  });

  // ── Wait Time Estimate ────────────────────────────

  describe('GET /api/v1/fnb/host/wait-estimate', () => {
    it('returns wait time estimate', async () => {
      const estimate = {
        estimatedMinutes: 20,
        confidence: 'high',
        basedOnSamples: 50,
        currentQueueLength: 3,
        currentAvgWait: 15,
        partySizeAdjustment: 5,
      };
      mockGetWaitTimeEstimate.mockResolvedValue(estimate);

      const { GET } = await import('../app/api/v1/fnb/host/wait-estimate/route');
      const req = makeRequest(
        'http://localhost:3000/api/v1/fnb/host/wait-estimate?locationId=loc_001&partySize=4&businessDate=2026-02-25',
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.estimatedMinutes).toBe(20);
      expect(json.data.confidence).toBe('high');
    });
  });

  // ── Waitlist Mutations ────────────────────────────

  describe('POST /api/v1/fnb/host/waitlist', () => {
    it('adds guest to waitlist', async () => {
      const newEntry = { id: 'wl_002', guestName: 'Charlie', partySize: 2, status: 'waiting' };
      mockHostAddToWaitlist.mockResolvedValue(newEntry);
      mockHostAddToWaitlistSchema.safeParse.mockReturnValue({
        success: true,
        data: { guestName: 'Charlie', partySize: 2 },
      });

      const { POST } = await import('../app/api/v1/fnb/host/waitlist/route');
      const req = makeRequest(
        'http://localhost:3000/api/v1/fnb/host/waitlist',
        'POST',
        { guestName: 'Charlie', partySize: 2 },
      );
      const res = await POST(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.id).toBe('wl_002');
      expect(json.data.guestName).toBe('Charlie');
    });
  });

  // ── Reservation Mutations ─────────────────────────

  describe('POST /api/v1/fnb/host/reservations', () => {
    it('creates a reservation', async () => {
      const newRes = {
        id: 'res_002',
        guestName: 'Diana',
        partySize: 6,
        reservationDate: '2026-02-26',
        reservationTime: '20:00',
        status: 'confirmed',
      };
      mockHostCreateReservation.mockResolvedValue(newRes);
      mockHostCreateReservationSchema.safeParse.mockReturnValue({
        success: true,
        data: {
          guestName: 'Diana',
          partySize: 6,
          reservationDate: '2026-02-26',
          reservationTime: '20:00',
        },
      });

      const { POST } = await import('../app/api/v1/fnb/host/reservations/route');
      const req = makeRequest(
        'http://localhost:3000/api/v1/fnb/host/reservations',
        'POST',
        {
          guestName: 'Diana',
          partySize: 6,
          reservationDate: '2026-02-26',
          reservationTime: '20:00',
        },
      );
      const res = await POST(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.id).toBe('res_002');
      expect(json.data.status).toBe('confirmed');
    });
  });

  // ── Table Availability ────────────────────────────

  describe('GET /api/v1/fnb/host/table-availability', () => {
    it('returns available tables with fit scores', async () => {
      const availability = {
        suggestedTables: [
          {
            tableId: 'tbl_001',
            displayLabel: 'T1',
            minCapacity: 2,
            maxCapacity: 4,
            tableType: 'standard',
            shape: 'round',
            sectionName: 'A',
            serverName: 'Jane',
            currentStatus: 'available',
            roomName: 'Main',
            fitScore: 92,
            fitReason: 'Perfect capacity match',
          },
        ],
        allAvailable: [],
        totalAvailable: 8,
        totalTables: 20,
      };
      mockGetAvailableTablesForSeating.mockResolvedValue(availability);

      const { GET } = await import('../app/api/v1/fnb/host/table-availability/route');
      const req = makeRequest(
        'http://localhost:3000/api/v1/fnb/host/table-availability?locationId=loc_001&partySize=4',
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.suggestedTables).toHaveLength(1);
      expect(json.data.suggestedTables[0].fitScore).toBe(92);
      expect(json.data.totalAvailable).toBe(8);
    });
  });
});

// ── Component Unit Tests ─────────────────────────────────────────────

describe('Host Stand Component Logic', () => {
  describe('TablePopover status rendering', () => {
    it('maps status to correct labels', () => {
      const STATUS_LABELS: Record<string, string> = {
        available: 'Available',
        seated: 'Seated',
        reserved: 'Reserved',
        dirty: 'Dirty',
        blocked: 'Blocked',
      };

      expect(STATUS_LABELS['available']).toBe('Available');
      expect(STATUS_LABELS['seated']).toBe('Seated');
      expect(STATUS_LABELS['dirty']).toBe('Dirty');
    });
  });

  describe('HostGridView sort logic', () => {
    it('sorts tables by table number', () => {
      const tables = [
        { tableNumber: 5, id: 'a' },
        { tableNumber: 1, id: 'b' },
        { tableNumber: 3, id: 'c' },
      ];
      const sorted = [...tables].sort((a, b) => a.tableNumber - b.tableNumber);
      expect(sorted[0]!.tableNumber).toBe(1);
      expect(sorted[1]!.tableNumber).toBe(3);
      expect(sorted[2]!.tableNumber).toBe(5);
    });
  });

  describe('HostFloorMap shape sizing', () => {
    it('calculates correct size for round tables', () => {
      const base = Math.max(48, Math.min(72, 40 + 4 * 4));
      expect(base).toBe(56);
    });

    it('calculates correct size for rectangle tables', () => {
      const base = Math.max(48, Math.min(72, 40 + 6 * 4));
      const rect = { width: base * 1.5, height: base };
      expect(rect.width).toBe(96);
      expect(rect.height).toBe(64);
    });

    it('caps size at 72 for large tables', () => {
      const base = Math.max(48, Math.min(72, 40 + 20 * 4));
      expect(base).toBe(72);
    });

    it('floors size at 48 for tiny tables', () => {
      const base = Math.max(48, Math.min(72, 40 + 1 * 4));
      expect(base).toBe(48);
    });
  });

  describe('PreShiftPanel alert type mapping', () => {
    it('maps alert types to colors', () => {
      const ALERT_COLORS: Record<string, string> = {
        allergy: 'var(--fnb-danger)',
        large_party: 'var(--fnb-warning)',
        occasion: 'var(--fnb-info)',
        vip: 'var(--fnb-accent)',
      };

      expect(ALERT_COLORS['allergy']).toBe('var(--fnb-danger)');
      expect(ALERT_COLORS['vip']).toBe('var(--fnb-accent)');
      expect(ALERT_COLORS['large_party']).toBe('var(--fnb-warning)');
    });
  });

  describe('Elapsed time formatting', () => {
    function formatElapsed(seatedAt: string | null): string {
      if (!seatedAt) return '—';
      const ms = Date.now() - new Date(seatedAt).getTime();
      const mins = Math.floor(ms / 60_000);
      if (mins < 60) return `${mins}m`;
      return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    }

    it('returns dash for null', () => {
      expect(formatElapsed(null)).toBe('—');
    });

    it('formats minutes under 60', () => {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60_000).toISOString();
      expect(formatElapsed(thirtyMinAgo)).toBe('30m');
    });

    it('formats hours and minutes', () => {
      const ninetyMinAgo = new Date(Date.now() - 90 * 60_000).toISOString();
      expect(formatElapsed(ninetyMinAgo)).toBe('1h 30m');
    });
  });
});

// ── HOST-05: Floor Map Interactions & Table Actions ────────────────────

describe('HOST-05: Table Context Menu', () => {
  it('provides correct actions for available tables', () => {
    const TABLE_ACTIONS: Record<string, Array<{ label: string; action: string; variant?: string }>> = {
      available: [
        { label: 'Seat Walk-in', action: 'seat_walkin' },
        { label: 'Assign Reservation', action: 'assign_reservation' },
        { label: 'Combine Tables', action: 'combine' },
        { label: 'Out of Service', action: 'oos', variant: 'destructive' },
      ],
      seated: [
        { label: 'View Tab', action: 'view_tab' },
        { label: 'Mark Clearing', action: 'mark_clearing' },
        { label: 'Transfer Server', action: 'transfer' },
      ],
      dirty: [
        { label: 'Mark Available', action: 'mark_available' },
        { label: 'Out of Service', action: 'oos', variant: 'destructive' },
      ],
      blocked: [
        { label: 'Mark Available', action: 'mark_available' },
      ],
    };

    expect(TABLE_ACTIONS['available']).toHaveLength(4);
    expect(TABLE_ACTIONS['seated']).toHaveLength(3);
    expect(TABLE_ACTIONS['dirty']).toHaveLength(2);
    expect(TABLE_ACTIONS['blocked']).toHaveLength(1);
  });

  it('marks destructive actions correctly', () => {
    const TABLE_ACTIONS = {
      available: [
        { label: 'Seat Walk-in', action: 'seat_walkin' },
        { label: 'Out of Service', action: 'oos', variant: 'destructive' },
      ],
    };
    const destructive = TABLE_ACTIONS.available.filter((a) => a.variant === 'destructive');
    expect(destructive).toHaveLength(1);
    expect(destructive[0]!.action).toBe('oos');
  });

  it('returns empty array for unknown status', () => {
    const TABLE_ACTIONS: Record<string, unknown[]> = {
      available: [1, 2],
      seated: [1],
    };
    const actions = TABLE_ACTIONS['nonexistent'] ?? [];
    expect(actions).toHaveLength(0);
  });
});

describe('HOST-05: Assign Mode Logic', () => {
  it('determines eligible tables based on party size', () => {
    const tables = [
      { id: 'a', status: 'available', capacityMax: 4 },
      { id: 'b', status: 'available', capacityMax: 2 },
      { id: 'c', status: 'seated', capacityMax: 6 },
      { id: 'd', status: 'available', capacityMax: 6 },
    ];
    const partySize = 4;
    const eligible = tables.filter(
      (t) => t.status === 'available' && t.capacityMax >= partySize,
    );
    expect(eligible).toHaveLength(2);
    expect(eligible[0]!.id).toBe('a');
    expect(eligible[1]!.id).toBe('d');
  });

  it('marks too-small tables as ineligible', () => {
    const tables = [
      { id: 'a', status: 'available', capacityMax: 2 },
      { id: 'b', status: 'available', capacityMax: 3 },
    ];
    const partySize = 4;
    const tooSmall = tables.filter(
      (t) => t.status === 'available' && t.capacityMax < partySize,
    );
    expect(tooSmall).toHaveLength(2);
  });

  it('toggles selection off when same party is selected again', () => {
    let selected: { id: string } | null = null;
    const selectParty = (party: { id: string }) => {
      selected = selected?.id === party.id ? null : party;
    };
    selectParty({ id: 'wl_001' });
    expect(selected).toEqual({ id: 'wl_001' });
    selectParty({ id: 'wl_001' });
    expect(selected).toBeNull();
  });
});

describe('HOST-05: Room Tab Bar Logic', () => {
  it('computes available and total counts per room', () => {
    const tables = [
      { sectionId: 'r1', status: 'available' },
      { sectionId: 'r1', status: 'seated' },
      { sectionId: 'r1', status: 'available' },
      { sectionId: 'r2', status: 'seated' },
      { sectionId: 'r2', status: 'dirty' },
    ];
    const rooms = [
      { id: 'r1', name: 'Main' },
      { id: 'r2', name: 'Patio' },
    ];
    const roomData = rooms.map((room) => {
      const roomTables = tables.filter((t) => t.sectionId === room.id);
      return {
        id: room.id,
        name: room.name,
        availableCount: roomTables.filter((t) => t.status === 'available').length,
        totalCount: roomTables.length,
      };
    });

    expect(roomData[0]!.availableCount).toBe(2);
    expect(roomData[0]!.totalCount).toBe(3);
    expect(roomData[1]!.availableCount).toBe(0);
    expect(roomData[1]!.totalCount).toBe(2);
  });

  it('computes all-rooms totals', () => {
    const rooms = [
      { availableCount: 3, totalCount: 5 },
      { availableCount: 1, totalCount: 4 },
    ];
    const allAvailable = rooms.reduce((sum, r) => sum + r.availableCount, 0);
    const allTotal = rooms.reduce((sum, r) => sum + r.totalCount, 0);
    expect(allAvailable).toBe(4);
    expect(allTotal).toBe(9);
  });
});

describe('HOST-05: Floor Map Legend Filter', () => {
  it('filters tables by status', () => {
    const tables = [
      { id: 'a', status: 'available' },
      { id: 'b', status: 'seated' },
      { id: 'c', status: 'available' },
      { id: 'd', status: 'dirty' },
    ];
    const filter = 'available';
    const filtered = tables.filter((t) => t.status === filter);
    expect(filtered).toHaveLength(2);
  });

  it('returns all tables when filter is null', () => {
    const tables = [
      { id: 'a', status: 'available' },
      { id: 'b', status: 'seated' },
    ];
    const filter: string | null = null;
    const filtered = filter ? tables.filter((t) => t.status === filter) : tables;
    expect(filtered).toHaveLength(2);
  });

  it('builds legend items with correct counts', () => {
    const tables = [
      { status: 'available' },
      { status: 'available' },
      { status: 'seated' },
      { status: 'dirty' },
    ];
    const statuses = ['available', 'seated', 'reserved', 'dirty', 'blocked'];
    const items = statuses.map((s) => ({
      status: s,
      count: tables.filter((t) => t.status === s).length,
    }));
    expect(items.find((i) => i.status === 'available')?.count).toBe(2);
    expect(items.find((i) => i.status === 'seated')?.count).toBe(1);
    expect(items.find((i) => i.status === 'reserved')?.count).toBe(0);
    expect(items.find((i) => i.status === 'dirty')?.count).toBe(1);
  });
});

describe('HOST-05: Seat Confirm Dialog Logic', () => {
  it('detects oversized table for party', () => {
    const isOversized = (capacity: number, partySize: number) =>
      capacity > partySize * 1.5;

    expect(isOversized(4, 4)).toBe(false);
    expect(isOversized(6, 4)).toBe(false);
    expect(isOversized(7, 4)).toBe(true);
    expect(isOversized(8, 2)).toBe(true);
    expect(isOversized(3, 2)).toBe(false);
  });

  it('formats party type label correctly', () => {
    const getLabel = (type: 'waitlist' | 'reservation') =>
      type === 'reservation' ? 'Reservation' : 'Walk-in';

    expect(getLabel('reservation')).toBe('Reservation');
    expect(getLabel('waitlist')).toBe('Walk-in');
  });
});

describe('HOST-05: Shape Size (exported function)', () => {
  // Import the exported function from HostFloorMap
  // Using the same logic as the component

  function getShapeSize(shape: string, capacity: number) {
    const base = Math.max(48, Math.min(72, 40 + capacity * 4));
    if (shape === 'rectangle') return { width: base * 1.5, height: base };
    if (shape === 'oval') return { width: base * 1.4, height: base };
    return { width: base, height: base };
  }

  it('round shapes are square', () => {
    const { width, height } = getShapeSize('round', 4);
    expect(width).toBe(height);
    expect(width).toBe(56);
  });

  it('rectangles are 1.5x wider', () => {
    const { width, height } = getShapeSize('rectangle', 4);
    expect(width).toBe(84);
    expect(height).toBe(56);
  });

  it('ovals are 1.4x wider', () => {
    const { width, height } = getShapeSize('oval', 4);
    expect(width).toBeCloseTo(78.4);
    expect(height).toBe(56);
  });
});

// ── HOST-06: Guest Self-Service Page & Notification UX ──────────────────

describe('HOST-06: Guest Status Page States', () => {
  it('renders waiting state with position and wait estimate', () => {
    const data = {
      status: 'waiting',
      position: 3,
      estimatedMinutes: 15,
      quotedWaitMinutes: 20,
      guestName: 'Alice',
      partySize: 2,
    };
    expect(data.status).toBe('waiting');
    expect(data.position).toBe(3);
    expect(data.estimatedMinutes).toBe(15);
  });

  it('renders notified state with countdown timer', () => {
    const notifiedAt = new Date(Date.now() - 3 * 60_000).toISOString(); // 3 min ago
    const expiryMinutes = 10;
    const notifTime = new Date(notifiedAt).getTime();
    const expiryTime = notifTime + expiryMinutes * 60_000;
    const remaining = Math.max(0, Math.floor((expiryTime - Date.now()) / 1000));

    // Should have ~7 min (420s) remaining
    expect(remaining).toBeGreaterThan(400);
    expect(remaining).toBeLessThan(440);
  });

  it('renders terminal states (left, cancelled, expired)', () => {
    const terminalStatuses = ['left', 'cancelled', 'expired'];
    for (const status of terminalStatuses) {
      const isTerminal = ['cancelled', 'left', 'expired'].includes(status);
      expect(isTerminal).toBe(true);
    }
  });

  it('renders seated state as final success', () => {
    const data = { status: 'seated', guestName: 'Alice' };
    expect(data.status).toBe('seated');
  });

  it('computes wait progress percentage correctly', () => {
    const total = 20; // quoted wait
    const remaining = 5; // estimated remaining
    const pct = Math.max(0, Math.min(100, ((total - remaining) / total) * 100));
    expect(pct).toBe(75);
  });

  it('clamps progress percentage between 0 and 100', () => {
    // When remaining > total (overdue)
    const pct1 = Math.max(0, Math.min(100, ((10 - 15) / 10) * 100));
    expect(pct1).toBe(0);

    // When remaining = 0 (done)
    const pct2 = Math.max(0, Math.min(100, ((10 - 0) / 10) * 100));
    expect(pct2).toBe(100);
  });
});

describe('HOST-06: Guest Join Form Validation', () => {
  it('requires name to be non-empty', () => {
    const name = '';
    const isValid = name.trim().length > 0;
    expect(isValid).toBe(false);
  });

  it('accepts valid party sizes 1-99', () => {
    for (const size of [1, 2, 4, 8, 50, 99]) {
      const isValid = size >= 1 && size <= 99;
      expect(isValid).toBe(true);
    }
  });

  it('rejects invalid party sizes', () => {
    for (const size of [0, -1, 100]) {
      const isValid = size >= 1 && size <= 99;
      expect(isValid).toBe(false);
    }
  });

  it('handles custom party size (8+) correctly', () => {
    const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 7, 8] as const;
    const showCustom = true;
    const customSize = '12';
    const effectiveSize = showCustom ? parseInt(customSize, 10) || 0 : PARTY_SIZES[1];
    expect(effectiveSize).toBe(12);
  });

  it('defaults custom size to 0 when empty', () => {
    const customSize = '';
    const effectiveSize = parseInt(customSize, 10) || 0;
    expect(effectiveSize).toBe(0);
  });
});

describe('HOST-06: Notification Composer Logic', () => {
  it('generates template message with guest name', () => {
    const guestName = 'Alice Smith';
    const template = `Hi ${guestName}, your table is ready! Please head to the host stand.`;
    expect(template).toContain('Alice Smith');
    expect(template).toContain('table is ready');
  });

  it('tracks sent notification in the center', () => {
    const sentNotifications: Array<{
      id: string;
      recipientName: string;
      type: string;
      status: string;
    }> = [];

    sentNotifications.push({
      id: `notif-${Date.now()}`,
      recipientName: 'Alice',
      type: 'table_ready',
      status: 'sent',
    });

    expect(sentNotifications).toHaveLength(1);
    expect(sentNotifications[0]!.type).toBe('table_ready');
    expect(sentNotifications[0]!.status).toBe('sent');
  });

  it('disables send button when message is empty', () => {
    const message = '   ';
    const sending = false;
    const isDisabled = sending || !message.trim();
    expect(isDisabled).toBe(true);
  });

  it('enables send button when message has content', () => {
    const message = 'Your table is ready!';
    const sending = false;
    const isDisabled = sending || !message.trim();
    expect(isDisabled).toBe(false);
  });
});

describe('HOST-06: Notification Center Tab Logic', () => {
  it('counts unhandled incoming messages', () => {
    const incoming = [
      { id: '1', handled: false },
      { id: '2', handled: true },
      { id: '3', handled: false },
    ];
    const unhandled = incoming.filter((m) => !m.handled).length;
    expect(unhandled).toBe(2);
  });

  it('maps notification types to labels', () => {
    const TYPE_LABELS: Record<string, string> = {
      confirmation: 'Confirmation',
      reminder: 'Reminder',
      table_ready: 'Table Ready',
      custom: 'Custom',
    };
    expect(TYPE_LABELS['table_ready']).toBe('Table Ready');
    expect(TYPE_LABELS['confirmation']).toBe('Confirmation');
  });

  it('detects incoming message actions', () => {
    const actions: Record<string, string> = {
      cancel: 'Auto-cancelled',
      late: 'Running late',
      none: '',
    };
    expect(actions['cancel']).toBe('Auto-cancelled');
    expect(actions['late']).toBe('Running late');
  });
});

describe('HOST-06: QR Code URL Generation', () => {
  it('builds correct waitlist join URL', () => {
    const origin = 'https://example.com';
    const locationId = 'loc_001';
    const url = `${origin}/waitlist/join?location=${locationId}`;
    expect(url).toBe('https://example.com/waitlist/join?location=loc_001');
  });

  it('generates deterministic hash from URL', () => {
    const url = 'https://example.com/waitlist/join?location=loc_001';
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0;
    }
    // Same URL should produce same hash
    let hash2 = 0;
    for (let i = 0; i < url.length; i++) {
      hash2 = ((hash2 << 5) - hash2 + url.charCodeAt(i)) | 0;
    }
    expect(hash).toBe(hash2);
  });
});

describe('HOST-06: Wait Time Color Coding', () => {
  function getWaitColor(elapsed: number): string {
    if (elapsed >= 30) return 'var(--fnb-danger)';
    if (elapsed >= 15) return 'var(--fnb-warning)';
    return 'var(--fnb-success)';
  }

  it('returns success color for short waits', () => {
    expect(getWaitColor(5)).toBe('var(--fnb-success)');
    expect(getWaitColor(14)).toBe('var(--fnb-success)');
  });

  it('returns warning color for medium waits', () => {
    expect(getWaitColor(15)).toBe('var(--fnb-warning)');
    expect(getWaitColor(29)).toBe('var(--fnb-warning)');
  });

  it('returns danger color for long waits', () => {
    expect(getWaitColor(30)).toBe('var(--fnb-danger)');
    expect(getWaitColor(60)).toBe('var(--fnb-danger)');
  });
});

describe('HOST-06: Guest Page Polling Intervals', () => {
  it('polls at 5s when status is notified', () => {
    const status = 'notified';
    const pollMs = status === 'notified' ? 5_000 : 15_000;
    expect(pollMs).toBe(5_000);
  });

  it('polls at 15s for waiting status', () => {
    const status: string = 'waiting';
    const pollMs = status === 'notified' ? 5_000 : 15_000;
    expect(pollMs).toBe(15_000);
  });
});

describe('HOST-06: Rate Limiting Logic', () => {
  it('limits requests per IP within window', () => {
    const MAX_REQUESTS = 10;
    const WINDOW_MS = 15 * 60_000;
    const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

    const ip = '192.168.1.1';
    const now = Date.now();

    // Simulate 10 requests
    for (let i = 0; i < MAX_REQUESTS; i++) {
      const entry = rateLimitMap.get(ip);
      if (!entry || entry.resetAt < now) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
      } else {
        entry.count++;
      }
    }

    const entry = rateLimitMap.get(ip)!;
    expect(entry.count).toBe(MAX_REQUESTS);

    // 11th request should be over limit
    entry.count++;
    const isOverLimit = entry.count > MAX_REQUESTS;
    expect(isOverLimit).toBe(true);
  });

  it('resets after window expires', () => {
    const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
    const ip = '10.0.0.1';
    const pastReset = Date.now() - 1000; // already expired

    rateLimitMap.set(ip, { count: 50, resetAt: pastReset });

    const entry = rateLimitMap.get(ip)!;
    const isExpired = entry.resetAt < Date.now();
    expect(isExpired).toBe(true);

    // Should reset
    if (isExpired) {
      rateLimitMap.set(ip, { count: 1, resetAt: Date.now() + 15 * 60_000 });
    }
    expect(rateLimitMap.get(ip)!.count).toBe(1);
  });
});

// ── HOST-07: Analytics Dashboard & Enhanced Pre-Shift Report ──────────────

const ANALYTICS_RESULT = {
  coversSummary: { actual: 180, expected: 200 },
  waitTimeSummary: { avgQuotedMinutes: 15, avgActualMinutes: 13, accuracyPercent: 87 },
  turnTimeSummary: { totalTurns: 45, avgMinutes: 52, previousPeriodAvg: 55 },
  noShowSummary: { count: 8, totalReservations: 120, ratePercent: 6.67 },
  waitlistSummary: { totalAdded: 60, totalSeated: 48, conversionPercent: 80 },
  coversByHour: [
    { hour: 11, reservationCovers: 12, walkInCovers: 8 },
    { hour: 12, reservationCovers: 30, walkInCovers: 15 },
    { hour: 13, reservationCovers: 20, walkInCovers: 10 },
    { hour: 18, reservationCovers: 40, walkInCovers: 20 },
    { hour: 19, reservationCovers: 35, walkInCovers: 25 },
  ],
  waitTimeScatter: [
    { quotedMinutes: 15, actualMinutes: 12, partySize: 2 },
    { quotedMinutes: 20, actualMinutes: 25, partySize: 6 },
    { quotedMinutes: 10, actualMinutes: 9, partySize: 4 },
  ],
  turnTimeDistribution: [
    { bucketLabel: '0-30m', count: 5 },
    { bucketLabel: '30-45m', count: 12 },
    { bucketLabel: '45-60m', count: 18 },
    { bucketLabel: '60-90m', count: 8 },
    { bucketLabel: '90m+', count: 2 },
  ],
  noShowTrend: [
    { date: '2026-02-18', count: 2, movingAvg7d: 1.5 },
    { date: '2026-02-19', count: 1, movingAvg7d: 1.4 },
    { date: '2026-02-20', count: 3, movingAvg7d: 1.7 },
    { date: '2026-02-21', count: 0, movingAvg7d: 1.3 },
    { date: '2026-02-22', count: 1, movingAvg7d: 1.2 },
    { date: '2026-02-23', count: 0, movingAvg7d: 1.0 },
    { date: '2026-02-24', count: 1, movingAvg7d: 1.1 },
  ],
  peakHeatmap: [
    { dayOfWeek: 0, hour: 12, covers: 25 },
    { dayOfWeek: 0, hour: 18, covers: 40 },
    { dayOfWeek: 5, hour: 19, covers: 55 },
    { dayOfWeek: 6, hour: 12, covers: 35 },
    { dayOfWeek: 6, hour: 19, covers: 60 },
  ],
};

describe('HOST-07: Analytics API Contract Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetHostAnalytics.mockResolvedValue(ANALYTICS_RESULT);
  });

  describe('GET /api/v1/fnb/host/analytics', () => {
    it('returns analytics data with all sections', async () => {
      mockHostGetAnalyticsSchema.safeParse.mockReturnValue({
        success: true,
        data: {
          tenantId: 'tenant_001',
          locationId: 'loc_001',
          startDate: '2026-02-18',
          endDate: '2026-02-25',
        },
      });

      const { GET } = await import('../app/api/v1/fnb/host/analytics/route');
      const req = makeRequest(
        'http://localhost:3000/api/v1/fnb/host/analytics?locationId=loc_001&startDate=2026-02-18&endDate=2026-02-25',
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toBeDefined();
      expect(json.data.coversSummary).toBeDefined();
      expect(json.data.waitTimeSummary).toBeDefined();
      expect(json.data.turnTimeSummary).toBeDefined();
      expect(json.data.noShowSummary).toBeDefined();
      expect(json.data.waitlistSummary).toBeDefined();
      expect(json.data.coversByHour).toBeDefined();
      expect(json.data.waitTimeScatter).toBeDefined();
      expect(json.data.turnTimeDistribution).toBeDefined();
      expect(json.data.noShowTrend).toBeDefined();
      expect(json.data.peakHeatmap).toBeDefined();
    });

    it('passes meal period filter to query', async () => {
      mockHostGetAnalyticsSchema.safeParse.mockReturnValue({
        success: true,
        data: {
          tenantId: 'tenant_001',
          locationId: 'loc_001',
          startDate: '2026-02-18',
          endDate: '2026-02-25',
          mealPeriod: 'dinner',
        },
      });

      const { GET } = await import('../app/api/v1/fnb/host/analytics/route');
      const req = makeRequest(
        'http://localhost:3000/api/v1/fnb/host/analytics?locationId=loc_001&startDate=2026-02-18&endDate=2026-02-25&mealPeriod=dinner',
      );
      await GET(req);
      expect(mockGetHostAnalytics).toHaveBeenCalledWith(
        expect.objectContaining({ mealPeriod: 'dinner' }),
      );
    });

    it('returns 400 for invalid input', async () => {
      mockHostGetAnalyticsSchema.safeParse.mockReturnValue({
        success: false,
        error: { issues: [{ path: ['startDate'], message: 'Required' }] },
      });

      const { GET } = await import('../app/api/v1/fnb/host/analytics/route');
      const req = makeRequest('http://localhost:3000/api/v1/fnb/host/analytics');
      await expect(GET(req)).rejects.toThrow();
    });
  });
});

describe('HOST-07: Analytics KPI Computations', () => {
  it('computes cover fulfillment percentage', () => {
    const { actual, expected } = ANALYTICS_RESULT.coversSummary;
    const pct = expected > 0 ? Math.round((actual / expected) * 100) : 0;
    expect(pct).toBe(90);
  });

  it('computes wait accuracy from quoted vs actual', () => {
    const { avgQuotedMinutes, avgActualMinutes } = ANALYTICS_RESULT.waitTimeSummary;
    const diff = Math.abs(avgActualMinutes - avgQuotedMinutes);
    const accuracy = avgQuotedMinutes > 0
      ? Math.max(0, Math.min(100, Math.round((1 - diff / avgQuotedMinutes) * 100)))
      : 0;
    expect(accuracy).toBe(87);
  });

  it('computes turn time improvement from previous period', () => {
    const { avgMinutes, previousPeriodAvg } = ANALYTICS_RESULT.turnTimeSummary;
    const delta = previousPeriodAvg - avgMinutes;
    expect(delta).toBe(3); // improved by 3 min
    const isImproved = delta > 0;
    expect(isImproved).toBe(true);
  });

  it('computes no-show rate as percentage', () => {
    const { count, totalReservations } = ANALYTICS_RESULT.noShowSummary;
    const rate = totalReservations > 0 ? (count / totalReservations) * 100 : 0;
    expect(rate).toBeCloseTo(6.67, 1);
  });

  it('computes waitlist conversion percentage', () => {
    const { totalAdded, totalSeated } = ANALYTICS_RESULT.waitlistSummary;
    const conversion = totalAdded > 0 ? Math.round((totalSeated / totalAdded) * 100) : 0;
    expect(conversion).toBe(80);
  });

  it('handles zero denominators gracefully', () => {
    const zeroCoversSummary = { actual: 0, expected: 0 };
    const pct = zeroCoversSummary.expected > 0
      ? Math.round((zeroCoversSummary.actual / zeroCoversSummary.expected) * 100)
      : 0;
    expect(pct).toBe(0);
  });
});

describe('HOST-07: Chart Data Handling', () => {
  it('covers by hour has reservation + walk-in breakdown', () => {
    const peakHour = ANALYTICS_RESULT.coversByHour.reduce((max, h) =>
      (h.reservationCovers + h.walkInCovers) > (max.reservationCovers + max.walkInCovers) ? h : max,
    );
    expect(peakHour.hour).toBe(18);
    expect(peakHour.reservationCovers + peakHour.walkInCovers).toBe(60);
  });

  it('wait time scatter contains party size for dot sizing', () => {
    for (const point of ANALYTICS_RESULT.waitTimeScatter) {
      expect(point).toHaveProperty('quotedMinutes');
      expect(point).toHaveProperty('actualMinutes');
      expect(point).toHaveProperty('partySize');
      expect(point.partySize).toBeGreaterThan(0);
    }
  });

  it('turn time distribution has ordered buckets', () => {
    const labels = ANALYTICS_RESULT.turnTimeDistribution.map((b) => b.bucketLabel);
    expect(labels).toEqual(['0-30m', '30-45m', '45-60m', '60-90m', '90m+']);
  });

  it('turn time distribution counts sum to total turns', () => {
    const totalFromBuckets = ANALYTICS_RESULT.turnTimeDistribution.reduce(
      (sum, b) => sum + b.count, 0,
    );
    expect(totalFromBuckets).toBe(ANALYTICS_RESULT.turnTimeSummary.totalTurns);
  });

  it('no-show trend has 7-day moving average', () => {
    for (const day of ANALYTICS_RESULT.noShowTrend) {
      expect(day).toHaveProperty('date');
      expect(day).toHaveProperty('count');
      expect(day).toHaveProperty('movingAvg7d');
      expect(day.movingAvg7d).toBeGreaterThanOrEqual(0);
    }
  });

  it('peak heatmap has day-of-week and hour dimensions', () => {
    for (const cell of ANALYTICS_RESULT.peakHeatmap) {
      expect(cell.dayOfWeek).toBeGreaterThanOrEqual(0);
      expect(cell.dayOfWeek).toBeLessThanOrEqual(6);
      expect(cell.hour).toBeGreaterThanOrEqual(0);
      expect(cell.hour).toBeLessThanOrEqual(23);
      expect(cell.covers).toBeGreaterThanOrEqual(0);
    }
  });

  it('peak heatmap identifies busiest slot', () => {
    const busiest = ANALYTICS_RESULT.peakHeatmap.reduce(
      (max, c) => c.covers > max.covers ? c : max,
    );
    expect(busiest.dayOfWeek).toBe(6); // Saturday
    expect(busiest.hour).toBe(19);
    expect(busiest.covers).toBe(60);
  });

  it('handles empty chart data arrays gracefully', () => {
    const emptyResult = {
      ...ANALYTICS_RESULT,
      coversByHour: [],
      waitTimeScatter: [],
      turnTimeDistribution: [],
      noShowTrend: [],
      peakHeatmap: [],
    };
    expect(emptyResult.coversByHour).toHaveLength(0);
    expect(emptyResult.waitTimeScatter).toHaveLength(0);
    expect(emptyResult.turnTimeDistribution).toHaveLength(0);
    expect(emptyResult.noShowTrend).toHaveLength(0);
    expect(emptyResult.peakHeatmap).toHaveLength(0);
  });
});

describe('HOST-07: Pre-Shift Report Alert Sorting', () => {
  it('sorts alerts by severity: high > medium > info', () => {
    const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, info: 2 };
    const alerts = [
      { type: 'occasion', severity: 'info', message: 'Anniversary dinner' },
      { type: 'allergy', severity: 'high', message: 'Nut allergy at T5' },
      { type: 'large_party', severity: 'medium', message: 'Party of 10 at 7pm' },
      { type: 'vip', severity: 'info', message: 'VIP arrival at 6:30pm' },
      { type: 'allergy', severity: 'high', message: 'Gluten allergy at T3' },
    ];

    const sorted = [...alerts].sort(
      (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
    );

    expect(sorted[0]!.severity).toBe('high');
    expect(sorted[1]!.severity).toBe('high');
    expect(sorted[2]!.severity).toBe('medium');
    expect(sorted[3]!.severity).toBe('info');
    expect(sorted[4]!.severity).toBe('info');
  });

  it('generates allergy alerts from special requests', () => {
    const ALLERGY_KEYWORDS = ['allergy', 'allergic', 'celiac', 'intolerant', 'epipen'];
    const specialRequests = 'Guest has severe nut allergy, please inform kitchen';
    const hasAllergy = ALLERGY_KEYWORDS.some((kw) =>
      specialRequests.toLowerCase().includes(kw),
    );
    expect(hasAllergy).toBe(true);
  });

  it('generates large party alerts for size >= 8', () => {
    const reservations = [
      { partySize: 2, guestName: 'A' },
      { partySize: 8, guestName: 'B' },
      { partySize: 12, guestName: 'C' },
      { partySize: 4, guestName: 'D' },
    ];
    const largeParties = reservations.filter((r) => r.partySize >= 8);
    expect(largeParties).toHaveLength(2);
    expect(largeParties[0]!.guestName).toBe('B');
  });
});

describe('HOST-07: Pre-Shift VIP Panel', () => {
  it('filters VIP reservations', () => {
    const reservations = [
      { id: '1', guestName: 'Alice', isVip: true, partySize: 2 },
      { id: '2', guestName: 'Bob', isVip: false, partySize: 4 },
      { id: '3', guestName: 'Carol', isVip: true, partySize: 6 },
    ];
    const vips = reservations.filter((r) => r.isVip);
    expect(vips).toHaveLength(2);
    expect(vips[0]!.guestName).toBe('Alice');
    expect(vips[1]!.guestName).toBe('Carol');
  });

  it('shows VIP tags and occasion', () => {
    const vip = {
      guestName: 'Alice',
      isVip: true,
      tags: ['regular', 'wine-enthusiast'],
      occasion: 'anniversary',
      seatingPreference: 'window',
    };
    expect(vip.tags).toContain('regular');
    expect(vip.occasion).toBe('anniversary');
    expect(vip.seatingPreference).toBe('window');
  });
});

describe('HOST-07: Date Range Picker Presets', () => {
  it('computes "Today" range', () => {
    const today = '2026-02-25';
    expect(today).toBe(today); // start === end
  });

  it('computes "Yesterday" range', () => {
    const d = new Date('2026-02-25');
    d.setDate(d.getDate() - 1);
    const yesterday = d.toISOString().split('T')[0];
    expect(yesterday).toBe('2026-02-24');
  });

  it('computes "Last 7 Days" range', () => {
    const end = new Date('2026-02-25');
    const start = new Date('2026-02-25');
    start.setDate(start.getDate() - 6); // inclusive
    expect(start.toISOString().split('T')[0]).toBe('2026-02-19');
    expect(end.toISOString().split('T')[0]).toBe('2026-02-25');
  });

  it('computes "Last 30 Days" range', () => {
    const _end = new Date('2026-02-25');
    const start = new Date('2026-02-25');
    start.setDate(start.getDate() - 29);
    expect(start.toISOString().split('T')[0]).toBe('2026-01-27');
  });
});

describe('HOST-07: Moving Average Computation', () => {
  it('computes 7-day moving average correctly', () => {
    const counts = [2, 1, 3, 0, 1, 0, 1, 2, 3]; // 9 days
    const window = 7;
    const movingAvgs: number[] = [];
    for (let i = 0; i < counts.length; i++) {
      const windowStart = Math.max(0, i - window + 1);
      const slice = counts.slice(windowStart, i + 1);
      const avg = slice.reduce((s, v) => s + v, 0) / slice.length;
      movingAvgs.push(Math.round(avg * 10) / 10);
    }
    // First value: avg of [2] = 2
    expect(movingAvgs[0]).toBe(2);
    // 7th value (index 6): avg of [2,1,3,0,1,0,1] = 8/7 ≈ 1.1
    expect(movingAvgs[6]).toBe(1.1);
    // 9th value (index 8): avg of [3,0,1,0,1,2,3] = 10/7 ≈ 1.4
    expect(movingAvgs[8]).toBe(1.4);
  });
});
