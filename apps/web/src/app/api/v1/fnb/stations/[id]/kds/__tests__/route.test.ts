import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// ── Hoisted mocks ───────────────────────────────────────────────
const { mockGetKdsView, mockGetKdsHistory, mockWithMiddleware } = vi.hoisted(() => {
  const mockGetKdsView = vi.fn();
  const mockGetKdsHistory = vi.fn();

  const mockWithMiddleware = vi.fn(
    (handler: (...args: unknown[]) => unknown, _options: unknown) => {
      return async (request: unknown) => {
        const ctx = {
          user: { id: 'user_001' },
          tenantId: 'tenant_001',
          locationId: 'loc_001',
          requestId: 'req_001',
          isPlatformAdmin: false,
        };
        return handler(request as Parameters<typeof handler>[0], ctx);
      };
    },
  );

  return { mockGetKdsView, mockGetKdsHistory, mockWithMiddleware };
});

vi.mock('@oppsera/core/auth/with-middleware', () => ({
  withMiddleware: mockWithMiddleware,
}));

vi.mock('@oppsera/module-fnb', () => ({
  getKdsView: mockGetKdsView,
  getKdsHistory: mockGetKdsHistory,
  resolveKdsLocationId: vi.fn().mockResolvedValue('loc_001'),
}));

// ── NextResponse mock ───────────────────────────────────────────
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => ({
      _body: body,
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

// ── Helpers ─────────────────────────────────────────────────────

function makeRequest(pathname: string, searchParams: Record<string, string> = {}) {
  return {
    nextUrl: {
      pathname,
      searchParams: {
        get: (key: string) => searchParams[key] ?? null,
      },
    },
  };
}

// ── Route module — imported once so withMiddleware is invoked exactly once ──
// Using beforeAll ensures the module is loaded before tests run, and the spy
// call record is preserved for the assertion in the last test.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GET: any;

beforeAll(async () => {
  const mod = await import('../route.js');
  GET = mod.GET;
});

// ── Tests ───────────────────────────────────────────────────────

describe('GET /api/v1/fnb/stations/[id]/kds', () => {
  beforeEach(() => {
    mockGetKdsView.mockReset();
    mockGetKdsHistory.mockReset();
  });

  it('extracts stationId from the URL path (second-to-last segment)', async () => {
    mockGetKdsView.mockResolvedValue({ tickets: [], rushMode: false });

    const req = makeRequest('/api/v1/fnb/stations/station_abc/kds');
    await GET(req as never);

    expect(mockGetKdsView).toHaveBeenCalledWith(
      expect.objectContaining({ stationId: 'station_abc' }),
    );
  });

  it('passes tenantId and locationId from middleware context', async () => {
    mockGetKdsView.mockResolvedValue({ tickets: [], rushMode: false });

    const req = makeRequest('/api/v1/fnb/stations/station_xyz/kds');
    await GET(req as never);

    expect(mockGetKdsView).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_001',
        locationId: 'loc_001',
      }),
    );
  });

  it('passes businessDate from query param when provided', async () => {
    mockGetKdsView.mockResolvedValue({ tickets: [], rushMode: false });

    const req = makeRequest('/api/v1/fnb/stations/station_abc/kds', {
      businessDate: '2026-03-13',
    });
    await GET(req as never);

    expect(mockGetKdsView).toHaveBeenCalledWith(
      expect.objectContaining({ businessDate: '2026-03-13' }),
    );
  });

  it('defaults businessDate to today (YYYY-MM-DD) when query param is absent', async () => {
    mockGetKdsView.mockResolvedValue({ tickets: [], rushMode: false });

    const today = new Date().toISOString().slice(0, 10);

    const req = makeRequest('/api/v1/fnb/stations/station_abc/kds');
    await GET(req as never);

    expect(mockGetKdsView).toHaveBeenCalledWith(
      expect.objectContaining({ businessDate: today }),
    );
  });

  it('wraps the view in { data: view } in the response', async () => {
    const stationView = {
      tickets: [{ ticketId: 'tkt_001', items: [] }],
      rushMode: true,
    };
    mockGetKdsView.mockResolvedValue(stationView);

    const req = makeRequest('/api/v1/fnb/stations/station_abc/kds');
    const response = await GET(req as never) as { _body: unknown };

    expect(response._body).toEqual({ data: stationView });
  });

  it('calls withMiddleware with kds entitlement, kds.view permission, and requireLocation: true', () => {
    // withMiddleware is called at module load time (not per-request).
    // The spy was set up before the import in beforeAll, so the call is recorded.
    expect(mockWithMiddleware).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        entitlement: 'kds',
        permission: 'kds.view',
        requireLocation: true,
      }),
    );
  });

  it('calls getKdsHistory when view=history query param is set', async () => {
    const historyResult = {
      stationId: 'station_abc',
      stationName: 'Grill',
      stationType: 'grill',
      tickets: [{ ticketId: 'tkt_001', items: [] }],
      totalCount: 1,
    };
    mockGetKdsHistory.mockResolvedValue(historyResult);

    const req = makeRequest('/api/v1/fnb/stations/station_abc/kds', {
      view: 'history',
      businessDate: '2026-03-13',
    });
    const response = await GET(req as never) as { _body: unknown };

    expect(mockGetKdsHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        stationId: 'station_abc',
        tenantId: 'tenant_001',
        locationId: 'loc_001',
        businessDate: '2026-03-13',
      }),
    );
    expect(response._body).toEqual({ data: historyResult });
    // getKdsView should NOT have been called
    expect(mockGetKdsView).not.toHaveBeenCalled();
  });

  it('calls getKdsView (not getKdsHistory) when view param is absent', async () => {
    mockGetKdsView.mockResolvedValue({ tickets: [], rushMode: false });

    const req = makeRequest('/api/v1/fnb/stations/station_abc/kds', {
      businessDate: '2026-03-13',
    });
    await GET(req as never);

    expect(mockGetKdsView).toHaveBeenCalled();
    expect(mockGetKdsHistory).not.toHaveBeenCalled();
  });
});
