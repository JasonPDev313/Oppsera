import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────

const { mockRunPipeline, mockWithMiddleware, mockListMetrics, mockListDimensions } =
  vi.hoisted(() => ({
    mockRunPipeline: vi.fn(),
    mockWithMiddleware: vi.fn(),
    mockListMetrics: vi.fn(),
    mockListDimensions: vi.fn(),
  }));

vi.mock('@oppsera/module-semantic/llm', () => ({
  runPipeline: mockRunPipeline,
}));

vi.mock('@oppsera/module-semantic/registry', () => ({
  listMetrics: mockListMetrics,
  listDimensions: mockListDimensions,
}));

// Middleware mock: pass ctx directly to handler so we can test route logic
vi.mock('@oppsera/core/auth/with-middleware', () => ({
  withMiddleware: (handler: Function, _opts?: unknown) => {
    mockWithMiddleware(handler, _opts);
    return (request: Request, ctx?: unknown) =>
      handler(request, ctx ?? makeMockCtx());
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
  AppError: class extends Error {
    constructor(
      public code: string,
      message: string,
      public statusCode: number,
    ) {
      super(message);
    }
  },
}));

// ── Helpers ───────────────────────────────────────────────────────

function makeMockCtx() {
  return {
    tenantId: 'tenant_abc',
    locationId: 'loc_001',
    user: {
      id: 'user_123',
      email: 'test@example.com',
      name: 'Test User',
      tenantId: 'tenant_abc',
      tenantStatus: 'active',
      membershipStatus: 'active',
    },
    requestId: 'req_xyz',
    isPlatformAdmin: false,
  };
}

function makeRequest(body: unknown, url = 'http://localhost/api/v1/semantic/query'): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_QUERY_BODY = {
  message: 'Show me net sales last month',
  sessionId: 'sess_123',
};

const MOCK_PIPELINE_OUTPUT = {
  narrative: null,
  sections: [],
  data: {
    rows: [{ date: '2026-01-01', net_sales: '1200.00' }],
    rowCount: 1,
    executionTimeMs: 45,
    truncated: false,
  },
  plan: {
    metrics: ['net_sales'],
    dimensions: ['date'],
    filters: [],
    dateRange: { start: '2026-01-01', end: '2026-01-31' },
  },
  isClarification: false,
  clarificationText: null,
  llmConfidence: 0.92,
  llmLatencyMs: 300,
  executionTimeMs: 45,
  tokensInput: 200,
  tokensOutput: 80,
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  compiledSql: 'SELECT ... FROM rm_daily_sales ...',
  compilationErrors: [],
  tablesAccessed: ['rm_daily_sales'],
  cacheStatus: 'MISS' as const,
};

// ── Tests: /query route ───────────────────────────────────────────

describe('POST /api/v1/semantic/query', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunPipeline.mockResolvedValue(MOCK_PIPELINE_OUTPUT);
  });

  it('calls runPipeline with skipNarrative=true and correct context', async () => {
    const { POST } = await import('../app/api/v1/semantic/query/route');
    const req = makeRequest(VALID_QUERY_BODY);
    await POST(req as never);

    expect(mockRunPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Show me net sales last month',
        skipNarrative: true,
        context: expect.objectContaining({
          tenantId: 'tenant_abc',
          userId: 'user_123',
          sessionId: 'sess_123',
        }),
      }),
    );
  });

  it('returns data rows and plan in response', async () => {
    const { POST } = await import('../app/api/v1/semantic/query/route');
    const req = makeRequest(VALID_QUERY_BODY);
    const response = await POST(req as never);
    const json = await response.json();

    expect(json.data.rows).toHaveLength(1);
    expect(json.data.rowCount).toBe(1);
    expect(json.data.plan.metrics).toEqual(['net_sales']);
    expect(json.data.compiledSql).toBeTruthy();
    expect(json.data.llmConfidence).toBe(0.92);
    expect(json.data.provider).toBe('anthropic');
    expect(json.data.cacheStatus).toBe('MISS');
  });

  it('passes locationId from context to pipeline', async () => {
    const { POST } = await import('../app/api/v1/semantic/query/route');
    const req = makeRequest(VALID_QUERY_BODY);
    await POST(req as never);

    const pipelineArg = mockRunPipeline.mock.calls[0]![0] as { context: { locationId?: string } };
    expect(pipelineArg.context.locationId).toBe('loc_001');
  });

  it('passes history and lensSlug from body to pipeline', async () => {
    const { POST } = await import('../app/api/v1/semantic/query/route');
    const body = {
      ...VALID_QUERY_BODY,
      lensSlug: 'golf_ops',
      history: [{ role: 'user', content: 'hello' }],
    };
    const req = makeRequest(body);
    await POST(req as never);

    const pipelineArg = mockRunPipeline.mock.calls[0]![0] as { context: { lensSlug?: string; history?: unknown[] } };
    expect(pipelineArg.context.lensSlug).toBe('golf_ops');
    expect(pipelineArg.context.history).toHaveLength(1);
  });

  it('returns 400 on missing message', async () => {
    const { POST } = await import('../app/api/v1/semantic/query/route');

    // ValidationError should be thrown and caught by withMiddleware
    // In our mock, withMiddleware doesn't catch errors — it just passes through
    const req = makeRequest({ sessionId: 'sess_123' }); // missing message
    await expect(POST(req as never)).rejects.toThrow();
  });

  it('returns 400 on missing sessionId', async () => {
    const { POST } = await import('../app/api/v1/semantic/query/route');
    const req = makeRequest({ message: 'net sales' }); // missing sessionId
    await expect(POST(req as never)).rejects.toThrow();
  });

  it('handles clarification response from pipeline', async () => {
    mockRunPipeline.mockResolvedValueOnce({
      ...MOCK_PIPELINE_OUTPUT,
      isClarification: true,
      clarificationText: 'Which location?',
      data: null,
    });

    const { POST } = await import('../app/api/v1/semantic/query/route');
    const req = makeRequest(VALID_QUERY_BODY);
    const response = await POST(req as never);
    const json = await response.json();

    expect(json.data.isClarification).toBe(true);
    expect(json.data.clarificationText).toBe('Which location?');
    expect(json.data.rows).toHaveLength(0);
    expect(json.data.rowCount).toBe(0);
  });
});

// ── Tests: /ask route ─────────────────────────────────────────────

describe('POST /api/v1/semantic/ask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunPipeline.mockResolvedValue({
      ...MOCK_PIPELINE_OUTPUT,
      narrative: 'Net sales were **$45,230** in January.',
      sections: [{ type: 'summary', content: 'Net sales totalled $45,230.' }],
    });
  });

  it('calls runPipeline with skipNarrative=false', async () => {
    const { POST } = await import('../app/api/v1/semantic/ask/route');
    const req = makeRequest(VALID_QUERY_BODY, 'http://localhost/api/v1/semantic/ask');
    await POST(req as never);

    expect(mockRunPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ skipNarrative: false }),
    );
  });

  it('returns narrative and sections in response', async () => {
    const { POST } = await import('../app/api/v1/semantic/ask/route');
    const req = makeRequest(VALID_QUERY_BODY, 'http://localhost/api/v1/semantic/ask');
    const response = await POST(req as never);
    const json = await response.json();

    expect(json.data.narrative).toBe('Net sales were **$45,230** in January.');
    expect(json.data.sections).toHaveLength(1);
    expect(json.data.sections[0].type).toBe('summary');
  });

  it('includes data rows alongside narrative', async () => {
    const { POST } = await import('../app/api/v1/semantic/ask/route');
    const req = makeRequest(VALID_QUERY_BODY, 'http://localhost/api/v1/semantic/ask');
    const response = await POST(req as never);
    const json = await response.json();

    expect(json.data.rows).toHaveLength(1);
    expect(json.data.plan.metrics).toEqual(['net_sales']);
  });
});

// ── Tests: /metrics route ─────────────────────────────────────────

describe('GET /api/v1/semantic/metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListMetrics.mockResolvedValue([
      {
        slug: 'net_sales',
        displayName: 'Net Sales',
        description: 'Total net sales',
        domain: 'core',
        category: 'revenue',
        dataType: 'currency',
        formatPattern: '$0,0.00',
        unit: 'USD',
        higherIsBetter: true,
        aliases: null,
        examplePhrases: ['what were my sales'],
        isExperimental: false,
      },
    ]);
  });

  it('returns list of metrics', async () => {
    const { GET } = await import('../app/api/v1/semantic/metrics/route');
    const req = new Request('http://localhost/api/v1/semantic/metrics');
    const response = await GET(req as never);
    const json = await response.json();

    expect(json.data).toHaveLength(1);
    expect(json.data[0].slug).toBe('net_sales');
    expect(json.data[0].displayName).toBe('Net Sales');
    expect(json.meta.count).toBe(1);
  });

  it('passes domain filter from query param', async () => {
    const { GET } = await import('../app/api/v1/semantic/metrics/route');
    const req = new Request('http://localhost/api/v1/semantic/metrics?domain=golf');
    await GET(req as never);

    expect(mockListMetrics).toHaveBeenCalledWith('golf');
  });

  it('passes undefined when no domain filter', async () => {
    const { GET } = await import('../app/api/v1/semantic/metrics/route');
    const req = new Request('http://localhost/api/v1/semantic/metrics');
    await GET(req as never);

    expect(mockListMetrics).toHaveBeenCalledWith(undefined);
  });
});

// ── Tests: /dimensions route ──────────────────────────────────────

describe('GET /api/v1/semantic/dimensions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListDimensions.mockResolvedValue([
      {
        slug: 'date',
        displayName: 'Date',
        description: null,
        domain: 'core',
        category: 'time',
        sqlDataType: 'date',
        isTimeDimension: true,
        timeGranularities: ['day', 'week', 'month'],
        hierarchyParent: null,
        hierarchyLevel: 0,
        aliases: null,
        exampleValues: null,
        examplePhrases: null,
      },
    ]);
  });

  it('returns list of dimensions', async () => {
    const { GET } = await import('../app/api/v1/semantic/dimensions/route');
    const req = new Request('http://localhost/api/v1/semantic/dimensions');
    const response = await GET(req as never);
    const json = await response.json();

    expect(json.data).toHaveLength(1);
    expect(json.data[0].slug).toBe('date');
    expect(json.data[0].isTimeDimension).toBe(true);
    expect(json.data[0].timeGranularities).toEqual(['day', 'week', 'month']);
    expect(json.meta.count).toBe(1);
  });

  it('passes domain filter from query param', async () => {
    const { GET } = await import('../app/api/v1/semantic/dimensions/route');
    const req = new Request('http://localhost/api/v1/semantic/dimensions?domain=core');
    await GET(req as never);

    expect(mockListDimensions).toHaveBeenCalledWith('core');
  });
});
