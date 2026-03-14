import { describe, it, expect, vi, beforeAll } from 'vitest';

// ── Hoisted mocks ───────────────────────────────────────────────
const { mockBumpTicket, mockWithMiddleware } = vi.hoisted(() => {
  const mockBumpTicket = vi.fn();
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
  return { mockBumpTicket, mockWithMiddleware };
});

vi.mock('@oppsera/core/auth/with-middleware', () => ({
  withMiddleware: mockWithMiddleware,
}));

vi.mock('@oppsera/module-fnb', () => ({
  bumpTicket: mockBumpTicket,
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

function makeRequest(pathname: string, body?: unknown) {
  return {
    url: `http://localhost:3000${pathname}`,
    json: body !== undefined
      ? () => Promise.resolve(body)
      : () => Promise.reject(new SyntaxError('Unexpected end of JSON input')),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: any;

beforeAll(async () => {
  const mod = await import('../route.js');
  POST = mod.POST;
});

describe('POST /api/v1/fnb/stations/[id]/bump-ticket', () => {
  it('returns validation error (not 500) when request body is malformed JSON', async () => {
    const req = makeRequest('/api/v1/fnb/stations/station-1/bump-ticket');

    await expect(POST(req as never)).rejects.toThrow('Validation failed');
  });

  it('returns validation error when body is empty object (no ticketId)', async () => {
    const req = makeRequest('/api/v1/fnb/stations/station-1/bump-ticket', {});

    await expect(POST(req as never)).rejects.toThrow('Validation failed');
  });

  it('succeeds with valid body', async () => {
    mockBumpTicket.mockResolvedValue({ ticketId: 'tkt-1', status: 'ready' });

    const req = makeRequest('/api/v1/fnb/stations/station-1/bump-ticket', {
      ticketId: 'tkt-1',
      clientRequestId: 'req-1',
    });
    const response = await POST(req as never) as { _body: unknown };

    expect(response._body).toEqual({ data: { ticketId: 'tkt-1', status: 'ready' } });
  });

  it('extracts stationId from URL path', async () => {
    mockBumpTicket.mockResolvedValue({ ticketId: 'tkt-1', status: 'ready' });

    const req = makeRequest('/api/v1/fnb/stations/my-grill/bump-ticket', {
      ticketId: 'tkt-1',
      clientRequestId: 'req-1',
    });
    await POST(req as never);

    expect(mockBumpTicket).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ stationId: 'my-grill' }),
    );
  });

  it('calls withMiddleware with kds entitlement, kds.bump permission, writeAccess', () => {
    expect(mockWithMiddleware).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        entitlement: 'kds',
        permission: 'kds.bump',
        writeAccess: true,
      }),
    );
  });
});
