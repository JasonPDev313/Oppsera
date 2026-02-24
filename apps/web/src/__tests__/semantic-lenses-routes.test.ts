import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────

const {
  mockListCustomLenses,
  mockGetCustomLens,
  mockListLenses,
  mockGetLens,
  mockWithMiddleware,
} = vi.hoisted(() => ({
  mockListCustomLenses: vi.fn(),
  mockGetCustomLens: vi.fn(),
  mockListLenses: vi.fn(),
  mockGetLens: vi.fn(),
  mockWithMiddleware: vi.fn(),
}));

vi.mock('@oppsera/module-semantic/lenses', () => ({
  listCustomLenses: mockListCustomLenses,
  getCustomLens: mockGetCustomLens,
  LensNotFoundError: class LensNotFoundError extends Error {
    slug: string;
    constructor(slug: string) {
      super(`Not found: ${slug}`);
      this.slug = slug;
    }
  },
}));

vi.mock('@oppsera/module-semantic/registry', () => ({
  listLenses: mockListLenses,
  getLens: mockGetLens,
}));

vi.mock('@oppsera/core/auth/with-middleware', () => ({
  withMiddleware: (handler: (...args: unknown[]) => unknown, _opts?: unknown) => {
    mockWithMiddleware(handler, _opts);
    return (request: Request) => handler(request, makeMockCtx());
  },
}));

// ── Helpers ───────────────────────────────────────────────────────

function makeMockCtx(overrides = {}) {
  return {
    tenantId: 'TENANT_1',
    locationId: undefined,
    user: { id: 'USER_1', email: 'test@test.com', membershipStatus: 'manager' },
    ...overrides,
  };
}

function makeRequest(url: string) {
  return new Request(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeLensRow(overrides = {}) {
  return {
    id: 'LENS_1',
    tenantId: 'TENANT_1',
    slug: 'my_lens',
    displayName: 'My Lens',
    description: null,
    domain: 'golf',
    allowedMetrics: ['rounds_played'],
    allowedDimensions: ['date'],
    defaultMetrics: ['rounds_played'],
    defaultDimensions: ['date'],
    defaultFilters: null,
    systemPromptFragment: null,
    exampleQuestions: [],
    isActive: true,
    createdAt: '2026-02-20T10:00:00Z',
    updatedAt: '2026-02-20T10:00:00Z',
    ...overrides,
  };
}

// ── Lazy imports (after mocks) ────────────────────────────────────

const getRouteHandlers = async () => {
  const listRoute = await import('../app/api/v1/semantic/lenses/route');
  const detailRoute = await import('../app/api/v1/semantic/lenses/[slug]/route');
  return { listRoute, detailRoute };
};

// ── GET /api/v1/semantic/lenses ───────────────────────────────────

describe('GET /api/v1/semantic/lenses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListLenses.mockResolvedValue([
      {
        slug: 'golf_ops',
        displayName: 'Golf Operations',
        description: null,
        domain: 'golf',
        allowedMetrics: ['rounds_played'],
        allowedDimensions: ['date'],
        defaultMetrics: null,
        defaultDimensions: null,
        exampleQuestions: null,
        isSystem: true,
        isActive: true,
      },
    ]);
    mockListCustomLenses.mockResolvedValue([makeLensRow()]);
  });

  it('returns system + custom lenses', async () => {
    const { listRoute } = await getRouteHandlers();
    const req = makeRequest('http://localhost/api/v1/semantic/lenses');
    const res = await listRoute.GET(req as never);
    const body = await res.json();

    expect(body.data).toHaveLength(2);
    expect(body.data.some((l: { isSystem: boolean }) => l.isSystem)).toBe(true);
    expect(body.data.some((l: { isSystem: boolean }) => !l.isSystem)).toBe(true);
    expect(body.meta.count).toBe(2);
  });

  it('passes domain filter to listLenses and listCustomLenses', async () => {
    const { listRoute } = await getRouteHandlers();
    const req = makeRequest('http://localhost/api/v1/semantic/lenses?domain=golf');
    await listRoute.GET(req as never);

    expect(mockListLenses).toHaveBeenCalledWith('golf');
    expect(mockListCustomLenses).toHaveBeenCalledWith(
      expect.objectContaining({ domain: 'golf' }),
    );
  });

  it('excludes system lenses when includeSystem=false', async () => {
    const { listRoute } = await getRouteHandlers();
    const req = makeRequest('http://localhost/api/v1/semantic/lenses?includeSystem=false');
    const res = await listRoute.GET(req as never);
    const body = await res.json();

    expect(mockListLenses).not.toHaveBeenCalled();
    expect(body.data.every((l: { isSystem: boolean }) => !l.isSystem)).toBe(true);
  });
});

// ── GET /api/v1/semantic/lenses/[slug] ───────────────────────────

describe('GET /api/v1/semantic/lenses/[slug]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a custom lens', async () => {
    mockGetCustomLens.mockResolvedValue(makeLensRow());
    const { detailRoute } = await getRouteHandlers();
    const req = makeRequest('http://localhost/api/v1/semantic/lenses/my_lens');
    const res = await detailRoute.GET(req as never);
    const body = await res.json();

    expect(body.data.slug).toBe('my_lens');
    expect(body.data.isSystem).toBe(false);
  });

  it('falls back to system lens when custom not found', async () => {
    const { LensNotFoundError } = await import('@oppsera/module-semantic/lenses');
    mockGetCustomLens.mockRejectedValue(new LensNotFoundError('golf_ops'));
    mockGetLens.mockResolvedValue({
      slug: 'golf_ops',
      displayName: 'Golf Operations',
      domain: 'golf',
      isSystem: true,
      isActive: true,
    });

    const { detailRoute } = await getRouteHandlers();
    const req = makeRequest('http://localhost/api/v1/semantic/lenses/golf_ops');
    const res = await detailRoute.GET(req as never);
    const body = await res.json();

    expect(body.data.slug).toBe('golf_ops');
    expect(body.data.isSystem).toBe(true);
  });

  it('returns 404 when neither custom nor system lens found', async () => {
    const { LensNotFoundError } = await import('@oppsera/module-semantic/lenses');
    mockGetCustomLens.mockRejectedValue(new LensNotFoundError('missing'));
    mockGetLens.mockResolvedValue(null);

    const { detailRoute } = await getRouteHandlers();
    const req = makeRequest('http://localhost/api/v1/semantic/lenses/missing');
    const res = await detailRoute.GET(req as never);
    expect(res.status).toBe(404);
  });
});

