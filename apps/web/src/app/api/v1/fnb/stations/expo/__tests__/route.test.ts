import { describe, it, expect, vi, beforeAll } from 'vitest';

// ── Hoisted mocks ───────────────────────────────────────────────
const { mockBumpTicket, mockGetExpoView, mockWithMiddleware } = vi.hoisted(() => {
  const mockBumpTicket = vi.fn();
  const mockGetExpoView = vi.fn();
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
  return { mockBumpTicket, mockGetExpoView, mockWithMiddleware };
});

vi.mock('@oppsera/core/auth/with-middleware', () => ({
  withMiddleware: mockWithMiddleware,
}));

vi.mock('@oppsera/module-fnb', () => ({
  bumpTicket: mockBumpTicket,
  getExpoView: mockGetExpoView,
  resolveKdsLocationId: vi.fn().mockResolvedValue({ locationId: 'test-location-id', resolved: false, warning: null }),
  getExpoViewSchema: {
    safeParse: (data: unknown) => {
      const d = data as Record<string, unknown>;
      if (!d.locationId) return { success: false, error: { issues: [{ path: ['locationId'], message: 'Required' }] } };
      return { success: true, data: d };
    },
  },
  bumpTicketSchema: {
    safeParse: (data: unknown) => {
      const d = data as Record<string, unknown>;
      if (!d.ticketId) return { success: false, error: { issues: [{ path: ['ticketId'], message: 'Required' }] } };
      return { success: true, data: d };
    },
  },
}));

vi.mock('@oppsera/core/realtime', () => ({
  broadcastFnb: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@oppsera/shared', () => ({
  ValidationError: class ValidationError extends Error {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    details: unknown;
    constructor(msg: string, details: unknown) {
      super(msg);
      this.details = details;
    }
  },
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => ({
      _body: body,
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

function makePostRequest(pathname: string, body?: unknown) {
  return {
    url: `http://localhost:3000${pathname}`,
    json: body !== undefined
      ? () => Promise.resolve(body)
      : () => Promise.reject(new SyntaxError('Unexpected end of JSON input')),
  };
}

function makeGetRequest(pathname: string, searchParams: Record<string, string> = {}) {
  return {
    url: `http://localhost:3000${pathname}`,
    nextUrl: {
      pathname,
      searchParams: {
        get: (key: string) => searchParams[key] ?? null,
      },
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GET: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: any;

beforeAll(async () => {
  const mod = await import('../route.js');
  GET = mod.GET;
  POST = mod.POST;
});

describe('POST /api/v1/fnb/stations/expo (bump)', () => {
  it('returns validation error (not 500) when request body is malformed JSON', async () => {
    const req = makePostRequest('/api/v1/fnb/stations/expo');

    await expect(POST(req as never)).rejects.toThrow('Validation failed');
  });

  it('returns validation error when body is empty object (no ticketId)', async () => {
    const req = makePostRequest('/api/v1/fnb/stations/expo', {});

    await expect(POST(req as never)).rejects.toThrow('Validation failed');
  });

  it('strips stationId from body to prevent prep-station injection', async () => {
    mockBumpTicket.mockResolvedValue({ ticketId: 'tkt-1', status: 'served' });

    const req = makePostRequest('/api/v1/fnb/stations/expo', {
      ticketId: 'tkt-1',
      stationId: 'injected-station',
      clientRequestId: 'req-1',
    });
    await POST(req as never);

    // stationId should be stripped — not passed to bumpTicket
    expect(mockBumpTicket).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ stationId: 'injected-station' }),
    );
  });

  it('succeeds with valid body', async () => {
    mockBumpTicket.mockResolvedValue({ ticketId: 'tkt-1', status: 'served' });

    const req = makePostRequest('/api/v1/fnb/stations/expo', {
      ticketId: 'tkt-1',
      clientRequestId: 'req-1',
    });
    const response = await POST(req as never) as { _body: unknown };

    expect(response._body).toEqual({ data: { ticketId: 'tkt-1', status: 'served' } });
  });
});

describe('GET /api/v1/fnb/stations/expo', () => {
  it('returns expo view data', async () => {
    const expoView = { tickets: [], totalActiveTickets: 0 };
    mockGetExpoView.mockResolvedValue(expoView);

    const req = makeGetRequest('/api/v1/fnb/stations/expo', {
      businessDate: '2026-03-13',
    });
    const response = await GET(req as never) as { _body: unknown };

    expect(response._body).toEqual({ data: expoView });
  });
});
