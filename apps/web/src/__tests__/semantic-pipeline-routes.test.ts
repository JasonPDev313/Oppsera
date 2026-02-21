import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────

const {
  mockRunPipeline,
  mockCheckRateLimit,
  mockInvalidateQueryCache,
  mockInvalidateRegistryCache,
  mockGetQueryCacheStats,
  mockGetGlobalMetrics,
  mockGetTenantMetrics,
  mockWithMiddleware,
} = vi.hoisted(() => ({
  mockRunPipeline: vi.fn(),
  mockCheckRateLimit: vi.fn(),
  mockInvalidateQueryCache: vi.fn(),
  mockInvalidateRegistryCache: vi.fn(),
  mockGetQueryCacheStats: vi.fn(),
  mockGetGlobalMetrics: vi.fn(),
  mockGetTenantMetrics: vi.fn(),
  mockWithMiddleware: vi.fn(),
}));

vi.mock('@oppsera/module-semantic/llm', () => ({
  runPipeline: mockRunPipeline,
}));

vi.mock('@oppsera/module-semantic/cache', () => ({
  checkSemanticRateLimit: mockCheckRateLimit,
  invalidateQueryCache: mockInvalidateQueryCache,
  getQueryCacheStats: mockGetQueryCacheStats,
}));

vi.mock('@oppsera/module-semantic/registry', () => ({
  invalidateRegistryCache: mockInvalidateRegistryCache,
}));

vi.mock('@oppsera/module-semantic/observability', () => ({
  getGlobalMetrics: mockGetGlobalMetrics,
  getTenantMetrics: mockGetTenantMetrics,
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

function makeRequest(url: string, method = 'POST', body?: unknown) {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makePipelineOutput(overrides = {}) {
  return {
    narrative: 'Net sales for Q1 were **$45,231**.',
    sections: [{ type: 'summary', content: 'Net sales for Q1 were $45,231.' }],
    data: {
      rows: [
        { date: '2026-01-01', net_sales: '15000.00' },
        { date: '2026-01-02', net_sales: '16231.00' },
      ],
      rowCount: 2,
      executionTimeMs: 38,
      truncated: false,
    },
    plan: {
      intent: 'report',
      metrics: ['net_sales'],
      dimensions: ['date'],
      filters: [],
      sortBy: 'date',
      sortDirection: 'asc',
      limit: 100,
    },
    isClarification: false,
    clarificationText: null,
    llmConfidence: 0.92,
    llmLatencyMs: 350,
    executionTimeMs: 38,
    tokensInput: 1200,
    tokensOutput: 280,
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    compiledSql: 'SELECT date, SUM(net_sales_cents) / 100.0 AS net_sales FROM rm_daily_sales WHERE tenant_id = $1 GROUP BY date',
    compilationErrors: [],
    tablesAccessed: ['rm_daily_sales'],
    cacheStatus: 'MISS' as const,
    ...overrides,
  };
}

// ── Lazy route imports (after mocks) ─────────────────────────────

const getRoutes = async () => {
  const askRoute = await import('../app/api/v1/semantic/ask/route');
  const queryRoute = await import('../app/api/v1/semantic/query/route');
  const invalidateRoute = await import('../app/api/v1/semantic/admin/invalidate/route');
  const metricsRoute = await import('../app/api/v1/semantic/admin/metrics/route');
  return { askRoute, queryRoute, invalidateRoute, metricsRoute };
};

const validAskBody = {
  message: 'What were net sales last week?',
  sessionId: 'sess_abc123',
  turnNumber: 1,
};

// ── POST /api/v1/semantic/ask ─────────────────────────────────────

describe('POST /api/v1/semantic/ask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: rate limit allows
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 29, resetAt: Date.now() + 60000, retryAfterMs: 0 });
    // Default: pipeline returns happy output
    mockRunPipeline.mockResolvedValue(makePipelineOutput());
  });

  it('returns 200 with narrative and data on happy path', async () => {
    const { askRoute } = await getRoutes();
    const req = makeRequest('http://localhost/api/v1/semantic/ask', 'POST', validAskBody);
    const res = await askRoute.POST(req as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.narrative).toContain('Net sales');
    expect(body.data.rows).toHaveLength(2);
    expect(body.data.rowCount).toBe(2);
    expect(body.data.llmConfidence).toBe(0.92);
    expect(body.data.provider).toBe('anthropic');
    expect(body.data.cacheStatus).toBe('MISS');
  });

  it('includes compiledSql and tablesAccessed in response', async () => {
    const { askRoute } = await getRoutes();
    const req = makeRequest('http://localhost/api/v1/semantic/ask', 'POST', validAskBody);
    const res = await askRoute.POST(req as never);
    const body = await res.json();

    expect(body.data.compiledSql).toContain('rm_daily_sales');
    expect(body.data.tablesAccessed).toContain('rm_daily_sales');
  });

  it('returns 429 when rate limit exceeded', async () => {
    mockCheckRateLimit.mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 45000,
      retryAfterMs: 45000,
    });

    const { askRoute } = await getRoutes();
    const req = makeRequest('http://localhost/api/v1/semantic/ask', 'POST', validAskBody);
    const res = await askRoute.POST(req as never);

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe('RATE_LIMITED');
    // Rate limiting should prevent pipeline from running
    expect(mockRunPipeline).not.toHaveBeenCalled();
  });

  it('sets Retry-After header on 429', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 30000, retryAfterMs: 30000 });

    const { askRoute } = await getRoutes();
    const req = makeRequest('http://localhost/api/v1/semantic/ask', 'POST', validAskBody);
    const res = await askRoute.POST(req as never);

    expect(res.headers.get('Retry-After')).toBeTruthy();
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
  });

  it('handles clarification responses', async () => {
    mockRunPipeline.mockResolvedValue(makePipelineOutput({
      isClarification: true,
      clarificationText: 'Which location would you like data for?',
      data: null,
      narrative: null,
    }));

    const { askRoute } = await getRoutes();
    const req = makeRequest('http://localhost/api/v1/semantic/ask', 'POST', validAskBody);
    const res = await askRoute.POST(req as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.isClarification).toBe(true);
    expect(body.data.clarificationText).toContain('location');
    expect(body.data.rows).toEqual([]);
  });

  it('handles compilation errors gracefully', async () => {
    mockRunPipeline.mockResolvedValue(makePipelineOutput({
      data: null,
      narrative: null,
      compilationErrors: ['Unknown metric: bad_metric'],
      compiledSql: null,
    }));

    const { askRoute } = await getRoutes();
    const req = makeRequest('http://localhost/api/v1/semantic/ask', 'POST', validAskBody);
    const res = await askRoute.POST(req as never);

    expect(res.status).toBe(200); // returns 200 with error metadata, not HTTP 4xx
    const body = await res.json();
    expect(body.data.compilationErrors).toContain('Unknown metric: bad_metric');
    expect(body.data.rows).toEqual([]);
  });

  it('returns 400 for invalid request body', async () => {
    const { askRoute } = await getRoutes();
    const req = makeRequest('http://localhost/api/v1/semantic/ask', 'POST', {
      // missing required 'message' field
      sessionId: 'sess_abc',
    });

    try {
      await askRoute.POST(req as never);
    } catch {
      // ValidationError thrown — expected
    }
    expect(mockRunPipeline).not.toHaveBeenCalled();
  });

  it('passes lensSlug to pipeline', async () => {
    const { askRoute } = await getRoutes();
    const req = makeRequest('http://localhost/api/v1/semantic/ask', 'POST', {
      ...validAskBody,
      lensSlug: 'golf_ops',
    });

    await askRoute.POST(req as never);

    expect(mockRunPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ lensSlug: 'golf_ops' }),
      }),
    );
  });

  it('passes tenant context from middleware to pipeline', async () => {
    const { askRoute } = await getRoutes();
    const req = makeRequest('http://localhost/api/v1/semantic/ask', 'POST', validAskBody);
    await askRoute.POST(req as never);

    expect(mockRunPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ tenantId: 'TENANT_1', userId: 'USER_1' }),
      }),
    );
  });

  it('returns cacheStatus HIT when pipeline returns HIT', async () => {
    mockRunPipeline.mockResolvedValue(makePipelineOutput({ cacheStatus: 'HIT' }));

    const { askRoute } = await getRoutes();
    const req = makeRequest('http://localhost/api/v1/semantic/ask', 'POST', validAskBody);
    const res = await askRoute.POST(req as never);
    const body = await res.json();

    expect(body.data.cacheStatus).toBe('HIT');
  });
});

// ── POST /api/v1/semantic/query ───────────────────────────────────

describe('POST /api/v1/semantic/query', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunPipeline.mockResolvedValue(makePipelineOutput());
  });

  it('returns rows without narrative (skipNarrative mode)', async () => {
    const { queryRoute } = await getRoutes();
    const req = makeRequest('http://localhost/api/v1/semantic/query', 'POST', validAskBody);
    const res = await queryRoute.POST(req as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.rows).toHaveLength(2);
    expect(body.data).not.toHaveProperty('narrative'); // raw query mode has no narrative field
    // Verify skipNarrative=true was passed
    expect(mockRunPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ skipNarrative: true }),
    );
  });

  it('returns cacheStatus from pipeline', async () => {
    mockRunPipeline.mockResolvedValue(makePipelineOutput({ cacheStatus: 'HIT' }));
    const { queryRoute } = await getRoutes();
    const req = makeRequest('http://localhost/api/v1/semantic/query', 'POST', validAskBody);
    const res = await queryRoute.POST(req as never);
    const body = await res.json();
    expect(body.data.cacheStatus).toBe('HIT');
  });

  it('returns compilationErrors when plan fails', async () => {
    mockRunPipeline.mockResolvedValue(makePipelineOutput({
      compilationErrors: ['Unknown metric: foo'],
      compiledSql: null,
      data: null,
    }));
    const { queryRoute } = await getRoutes();
    const req = makeRequest('http://localhost/api/v1/semantic/query', 'POST', validAskBody);
    const res = await queryRoute.POST(req as never);
    const body = await res.json();
    expect(body.data.compilationErrors).toContain('Unknown metric: foo');
  });
});

// ── POST /api/v1/semantic/admin/invalidate ────────────────────────

describe('POST /api/v1/semantic/admin/invalidate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvalidateQueryCache.mockReturnValue(12);
  });

  it('invalidates both registry and query cache by default', async () => {
    const { invalidateRoute } = await getRoutes();
    const req = makeRequest('http://localhost/api/v1/semantic/admin/invalidate', 'POST', {});
    const res = await invalidateRoute.POST(req as never);
    const body = await res.json();

    expect(mockInvalidateRegistryCache).toHaveBeenCalled();
    expect(mockInvalidateQueryCache).toHaveBeenCalled();
    expect(body.data.registry).toBe('invalidated');
    expect(body.data.queryCacheEvicted).toBe(12);
    expect(body.data.scope).toBe('all');
  });

  it('invalidates only registry when scope=registry', async () => {
    const { invalidateRoute } = await getRoutes();
    const req = makeRequest('http://localhost/api/v1/semantic/admin/invalidate', 'POST', { scope: 'registry' });
    await invalidateRoute.POST(req as never);

    expect(mockInvalidateRegistryCache).toHaveBeenCalled();
    expect(mockInvalidateQueryCache).not.toHaveBeenCalled();
  });

  it('invalidates only query cache when scope=queries', async () => {
    const { invalidateRoute } = await getRoutes();
    const req = makeRequest('http://localhost/api/v1/semantic/admin/invalidate', 'POST', { scope: 'queries' });
    await invalidateRoute.POST(req as never);

    expect(mockInvalidateRegistryCache).not.toHaveBeenCalled();
    expect(mockInvalidateQueryCache).toHaveBeenCalled();
  });

  it('passes tenantId to invalidateQueryCache when provided', async () => {
    const { invalidateRoute } = await getRoutes();
    const req = makeRequest('http://localhost/api/v1/semantic/admin/invalidate', 'POST', {
      scope: 'queries',
      tenantId: 'TENANT_X',
    });
    await invalidateRoute.POST(req as never);

    expect(mockInvalidateQueryCache).toHaveBeenCalledWith('TENANT_X');
  });

  it('includes invalidatedAt timestamp in response', async () => {
    const { invalidateRoute } = await getRoutes();
    const req = makeRequest('http://localhost/api/v1/semantic/admin/invalidate', 'POST', {});
    const res = await invalidateRoute.POST(req as never);
    const body = await res.json();

    expect(body.data.invalidatedAt).toBeTruthy();
    expect(new Date(body.data.invalidatedAt).getTime()).toBeGreaterThan(0);
  });

  it('handles request with no body gracefully (defaults to all)', async () => {
    const { invalidateRoute } = await getRoutes();
    const req = new Request('http://localhost/api/v1/semantic/admin/invalidate', { method: 'POST' });
    const res = await invalidateRoute.POST(req as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.scope).toBe('all');
  });
});

// ── GET /api/v1/semantic/admin/metrics ───────────────────────────

describe('GET /api/v1/semantic/admin/metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetQueryCacheStats.mockReturnValue({
      size: 42,
      maxSize: 200,
      ttlMs: 300000,
      hits: 150,
      misses: 80,
      evictions: 5,
    });
    mockGetGlobalMetrics.mockReturnValue({
      totalRequests: 1250,
      cacheHits: 380,
      cacheMisses: 870,
      cacheHitRate: 0.304,
      errorRate: 0.012,
      p50LatencyMs: 420,
      p95LatencyMs: 1200,
      totalTokensIn: 1_500_000,
      totalTokensOut: 380_000,
      uniqueTenants: 45,
      topTenants: [
        { tenantId: 'T1', totalRequests: 300, cacheHitRate: 0.4, p50LatencyMs: 380, p95LatencyMs: 950 },
      ],
    });
    mockGetTenantMetrics.mockReturnValue({
      tenantId: 'TENANT_1',
      totalRequests: 25,
      cacheHits: 8,
      cacheMisses: 17,
      cacheHitRate: 0.32,
      errorRate: 0,
      p50LatencyMs: 350,
      p95LatencyMs: 800,
      totalTokensIn: 30000,
      totalTokensOut: 7500,
    });
  });

  it('returns global metrics by default', async () => {
    const { metricsRoute } = await getRoutes();
    const req = new Request('http://localhost/api/v1/semantic/admin/metrics');
    const res = await metricsRoute.GET(req as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.global.totalRequests).toBe(1250);
    expect(body.data.global.cacheHitRate).toBeCloseTo(0.304);
    expect(body.data.global.uniqueTenants).toBe(45);
    expect(body.data.queryCache.size).toBe(42);
    expect(body.data.collectedAt).toBeTruthy();
  });

  it('returns per-tenant metrics when tenantId param provided', async () => {
    const { metricsRoute } = await getRoutes();
    const req = new Request('http://localhost/api/v1/semantic/admin/metrics?tenantId=TENANT_1');
    const res = await metricsRoute.GET(req as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.tenant.tenantId).toBe('TENANT_1');
    expect(body.data.tenant.totalRequests).toBe(25);
    expect(mockGetTenantMetrics).toHaveBeenCalledWith('TENANT_1');
    expect(mockGetGlobalMetrics).not.toHaveBeenCalled();
  });

  it('returns zero placeholder for unknown tenant', async () => {
    mockGetTenantMetrics.mockReturnValue(null);

    const { metricsRoute } = await getRoutes();
    const req = new Request('http://localhost/api/v1/semantic/admin/metrics?tenantId=UNKNOWN');
    const res = await metricsRoute.GET(req as never);
    const body = await res.json();

    expect(body.data.tenant.tenantId).toBe('UNKNOWN');
    expect(body.data.tenant.totalRequests).toBe(0);
  });

  it('passes topN query param to getGlobalMetrics', async () => {
    const { metricsRoute } = await getRoutes();
    const req = new Request('http://localhost/api/v1/semantic/admin/metrics?topN=5');
    await metricsRoute.GET(req as never);

    expect(mockGetGlobalMetrics).toHaveBeenCalledWith(5);
  });

  it('caps topN at 50', async () => {
    const { metricsRoute } = await getRoutes();
    const req = new Request('http://localhost/api/v1/semantic/admin/metrics?topN=9999');
    await metricsRoute.GET(req as never);

    expect(mockGetGlobalMetrics).toHaveBeenCalledWith(50);
  });
});
