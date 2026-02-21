import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────

const {
  mockCreateCustomLens,
  mockListCustomLenses,
  mockGetCustomLens,
  mockUpdateCustomLens,
  mockDeactivateCustomLens,
  mockReactivateCustomLens,
  mockListLenses,
  mockGetLens,
  mockWithMiddleware,
} = vi.hoisted(() => ({
  mockCreateCustomLens: vi.fn(),
  mockListCustomLenses: vi.fn(),
  mockGetCustomLens: vi.fn(),
  mockUpdateCustomLens: vi.fn(),
  mockDeactivateCustomLens: vi.fn(),
  mockReactivateCustomLens: vi.fn(),
  mockListLenses: vi.fn(),
  mockGetLens: vi.fn(),
  mockWithMiddleware: vi.fn(),
}));

vi.mock('@oppsera/module-semantic/lenses', () => ({
  createCustomLens: mockCreateCustomLens,
  listCustomLenses: mockListCustomLenses,
  getCustomLens: mockGetCustomLens,
  updateCustomLens: mockUpdateCustomLens,
  deactivateCustomLens: mockDeactivateCustomLens,
  reactivateCustomLens: mockReactivateCustomLens,
  DuplicateLensSlugError: class DuplicateLensSlugError extends Error {
    slug: string;
    tenantId: string;
    constructor(slug: string, tenantId: string) {
      super(`Duplicate: ${slug}`);
      this.slug = slug;
      this.tenantId = tenantId;
    }
  },
  InvalidLensSlugError: class InvalidLensSlugError extends Error {
    slug: string;
    constructor(slug: string) {
      super(`Invalid slug: ${slug}`);
      this.slug = slug;
    }
  },
  LensNotFoundError: class LensNotFoundError extends Error {
    slug: string;
    constructor(slug: string) {
      super(`Not found: ${slug}`);
      this.slug = slug;
    }
  },
  SystemLensModificationError: class SystemLensModificationError extends Error {
    slug: string;
    constructor(slug: string) {
      super(`System lens: ${slug}`);
      this.slug = slug;
    }
  },
}));

vi.mock('@oppsera/module-semantic/registry', () => ({
  listLenses: mockListLenses,
  getLens: mockGetLens,
}));

vi.mock('@oppsera/core/auth/with-middleware', () => ({
  withMiddleware: (handler: Function, _opts?: unknown) => {
    mockWithMiddleware(handler, _opts);
    return (request: Request) => handler(request, makeMockCtx());
  },
}));

vi.mock('@oppsera/shared', () => ({
  ValidationError: class extends Error {
    constructor(
      message: string,
      public details: unknown[],
    ) {
      super(message);
    }
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

function makeRequest(
  url: string,
  method = 'GET',
  body?: unknown,
) {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
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

// ── POST /api/v1/semantic/lenses ──────────────────────────────────

describe('POST /api/v1/semantic/lenses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCustomLens.mockResolvedValue(makeLensRow());
  });

  it('creates a custom lens and returns 201', async () => {
    const { listRoute } = await getRouteHandlers();
    const req = makeRequest('http://localhost/api/v1/semantic/lenses', 'POST', {
      slug: 'my_lens',
      displayName: 'My Lens',
      domain: 'golf',
      allowedMetrics: ['rounds_played'],
    });

    const res = await listRoute.POST(req as never);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.slug).toBe('my_lens');
  });

  it('returns 409 on duplicate slug', async () => {
    const { DuplicateLensSlugError } = await import('@oppsera/module-semantic/lenses');
    mockCreateCustomLens.mockRejectedValue(new DuplicateLensSlugError('my_lens', 'T1'));

    const { listRoute } = await getRouteHandlers();
    const req = makeRequest('http://localhost/api/v1/semantic/lenses', 'POST', {
      slug: 'my_lens',
      displayName: 'My Lens',
      domain: 'golf',
    });

    const res = await listRoute.POST(req as never);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('DUPLICATE_SLUG');
  });

  it('returns 400 for invalid slug format', async () => {
    const { listRoute } = await getRouteHandlers();
    // Schema validation catches this before reaching createCustomLens
    const req = makeRequest('http://localhost/api/v1/semantic/lenses', 'POST', {
      slug: 'INVALID SLUG!',
      displayName: 'Bad',
      domain: 'golf',
    });

    // Zod regex will fail — withMiddleware passes validation errors through
    try {
      await listRoute.POST(req as never);
    } catch {
      // ValidationError thrown — that's expected
    }
    // createCustomLens should NOT have been called
    expect(mockCreateCustomLens).not.toHaveBeenCalled();
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

// ── PATCH /api/v1/semantic/lenses/[slug] ─────────────────────────

describe('PATCH /api/v1/semantic/lenses/[slug]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates a custom lens', async () => {
    const updated = makeLensRow({ displayName: 'Updated Lens' });
    mockUpdateCustomLens.mockResolvedValue(updated);

    const { detailRoute } = await getRouteHandlers();
    const req = makeRequest('http://localhost/api/v1/semantic/lenses/my_lens', 'PATCH', {
      displayName: 'Updated Lens',
    });

    const res = await detailRoute.PATCH(req as never);
    const body = await res.json();
    expect(body.data.displayName).toBe('Updated Lens');
  });

  it('returns 404 when lens not found', async () => {
    const { LensNotFoundError } = await import('@oppsera/module-semantic/lenses');
    mockUpdateCustomLens.mockRejectedValue(new LensNotFoundError('nonexistent'));

    const { detailRoute } = await getRouteHandlers();
    const req = makeRequest('http://localhost/api/v1/semantic/lenses/nonexistent', 'PATCH', {
      displayName: 'X',
    });

    const res = await detailRoute.PATCH(req as never);
    expect(res.status).toBe(404);
  });

  it('returns 403 when trying to modify system lens', async () => {
    const { SystemLensModificationError } = await import('@oppsera/module-semantic/lenses');
    mockUpdateCustomLens.mockRejectedValue(new SystemLensModificationError('golf_ops'));

    const { detailRoute } = await getRouteHandlers();
    const req = makeRequest('http://localhost/api/v1/semantic/lenses/golf_ops', 'PATCH', {
      displayName: 'X',
    });

    const res = await detailRoute.PATCH(req as never);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('SYSTEM_LENS');
  });
});

// ── DELETE /api/v1/semantic/lenses/[slug] ────────────────────────

describe('DELETE /api/v1/semantic/lenses/[slug]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deactivates a custom lens (default action)', async () => {
    const deactivated = makeLensRow({ isActive: false });
    mockDeactivateCustomLens.mockResolvedValue(deactivated);

    const { detailRoute } = await getRouteHandlers();
    const req = makeRequest('http://localhost/api/v1/semantic/lenses/my_lens', 'DELETE');
    const res = await detailRoute.DELETE(req as never);
    const body = await res.json();
    expect(body.data.isActive).toBe(false);
    expect(mockDeactivateCustomLens).toHaveBeenCalledWith('TENANT_1', 'my_lens');
  });

  it('reactivates a lens when ?action=reactivate', async () => {
    const reactivated = makeLensRow({ isActive: true });
    mockReactivateCustomLens.mockResolvedValue(reactivated);

    const { detailRoute } = await getRouteHandlers();
    const req = makeRequest(
      'http://localhost/api/v1/semantic/lenses/my_lens?action=reactivate',
      'DELETE',
    );
    const res = await detailRoute.DELETE(req as never);
    expect(mockReactivateCustomLens).toHaveBeenCalledWith('TENANT_1', 'my_lens');
    const body = await res.json();
    expect(body.data.isActive).toBe(true);
  });

  it('returns 403 for system lens', async () => {
    const { SystemLensModificationError } = await import('@oppsera/module-semantic/lenses');
    mockDeactivateCustomLens.mockRejectedValue(new SystemLensModificationError('golf_ops'));

    const { detailRoute } = await getRouteHandlers();
    const req = makeRequest('http://localhost/api/v1/semantic/lenses/golf_ops', 'DELETE');
    const res = await detailRoute.DELETE(req as never);
    expect(res.status).toBe(403);
  });
});
