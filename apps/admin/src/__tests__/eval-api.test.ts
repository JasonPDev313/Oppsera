import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ── Mocks ────────────────────────────────────────────────────────

const {
  mockGetAdminSession,
  mockGetEvalFeed,
  mockGetEvalTurnDetail,
  mockSubmitAdminReview,
  mockPromoteToExample,
  mockGetQualityDashboard,
  mockGetGoldenExamples,
  mockGetProblematicPatterns,
  mockAggregateQualityDaily,
} = vi.hoisted(() => ({
  mockGetAdminSession: vi.fn(),
  mockGetEvalFeed: vi.fn(),
  mockGetEvalTurnDetail: vi.fn(),
  mockSubmitAdminReview: vi.fn(),
  mockPromoteToExample: vi.fn(),
  mockGetQualityDashboard: vi.fn(),
  mockGetGoldenExamples: vi.fn(),
  mockGetProblematicPatterns: vi.fn(),
  mockAggregateQualityDaily: vi.fn(),
}));

vi.mock('../lib/auth', () => ({
  getAdminSession: mockGetAdminSession,
  requireRole: vi.fn().mockReturnValue(true),
}));

vi.mock('@oppsera/module-semantic', () => ({
  getEvalFeed: mockGetEvalFeed,
  getEvalTurnDetail: mockGetEvalTurnDetail,
  submitAdminReview: mockSubmitAdminReview,
  promoteToExample: mockPromoteToExample,
  getQualityDashboard: mockGetQualityDashboard,
  getGoldenExamples: mockGetGoldenExamples,
  getProblematicPatterns: mockGetProblematicPatterns,
  aggregateQualityDaily: mockAggregateQualityDaily,
  getEvalSession: vi.fn().mockResolvedValue({ id: 'sess_001' }),
  adminReviewSchema: {
    safeParse: vi.fn().mockReturnValue({
      success: true,
      data: { verdict: 'correct', score: 5, notes: undefined, action: undefined },
    }),
  },
  promoteExampleSchema: {
    safeParse: vi.fn().mockReturnValue({
      success: true,
      data: { category: 'sales', difficulty: 'easy', tags: ['test'] },
    }),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────

const ADMIN_SESSION = {
  adminId: 'admin_001',
  email: 'admin@oppsera.com',
  name: 'Admin',
  role: 'admin' as const,
};

function makeRequest(url: string, options: RequestInit = {}): NextRequest {
  const req = new Request(`http://localhost${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  // Add nextUrl to mimic NextRequest (plain Request doesn't have it)
  (req as unknown as Record<string, unknown>).nextUrl = new URL(req.url);
  return req as unknown as NextRequest;
}

// ── Tests ────────────────────────────────────────────────────────

describe('GET /api/v1/eval/feed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminSession.mockResolvedValue(ADMIN_SESSION);
  });

  it('returns feed data with 200', async () => {
    const mockFeed = {
      turns: [{ id: 'turn_001', userMessage: 'How were sales?' }],
      cursor: null,
      hasMore: false,
    };
    mockGetEvalFeed.mockResolvedValue(mockFeed);

    const { GET } = await import('../app/api/v1/eval/feed/route');
    const req = makeRequest('/api/v1/eval/feed?sortBy=newest');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.turns).toHaveLength(1);
    expect(body.data.hasMore).toBe(false);
  });

  it('returns 401 when not authenticated', async () => {
    mockGetAdminSession.mockResolvedValue(null);

    const { GET } = await import('../app/api/v1/eval/feed/route');
    const req = makeRequest('/api/v1/eval/feed');
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it('passes tenantId filter to getEvalFeed', async () => {
    mockGetEvalFeed.mockResolvedValue({ turns: [], cursor: null, hasMore: false });

    const { GET } = await import('../app/api/v1/eval/feed/route');
    const req = makeRequest('/api/v1/eval/feed?tenantId=tenant_abc&status=unreviewed');
    await GET(req);

    expect(mockGetEvalFeed).toHaveBeenCalledWith('tenant_abc', expect.objectContaining({
      status: 'unreviewed',
    }));
  });
});

describe('GET /api/v1/eval/turns/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminSession.mockResolvedValue(ADMIN_SESSION);
  });

  it('returns turn detail', async () => {
    mockGetEvalTurnDetail.mockResolvedValue({
      id: 'turn_001',
      userMessage: 'Show sales',
      llmConfidence: '0.95',
    });

    const { GET } = await import('../app/api/v1/eval/turns/[id]/route');
    const req = makeRequest('/api/v1/eval/turns/turn_001');
    const res = await GET(req, { params: Promise.resolve({ id: 'turn_001' }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe('turn_001');
  });

  it('returns 404 when turn not found', async () => {
    mockGetEvalTurnDetail.mockResolvedValue(null);

    const { GET } = await import('../app/api/v1/eval/turns/[id]/route');
    const req = makeRequest('/api/v1/eval/turns/nonexistent');
    const res = await GET(req, { params: Promise.resolve({ id: 'nonexistent' }) });

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/eval/turns/[id]/review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminSession.mockResolvedValue(ADMIN_SESSION);
  });

  it('calls submitAdminReview and returns 200', async () => {
    mockSubmitAdminReview.mockResolvedValue(undefined);

    const { POST } = await import('../app/api/v1/eval/turns/[id]/review/route');
    const req = makeRequest('/api/v1/eval/turns/turn_001/review', {
      method: 'POST',
      body: JSON.stringify({ verdict: 'correct', score: 5 }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: 'turn_001' }) });

    expect(res.status).toBe(200);
    expect(mockSubmitAdminReview).toHaveBeenCalledWith(
      'turn_001',
      'admin_001',
      expect.objectContaining({ verdict: 'correct', score: 5 }),
    );
  });
});

describe('POST /api/v1/eval/turns/[id]/promote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminSession.mockResolvedValue(ADMIN_SESSION);
  });

  it('calls promoteToExample and returns 201', async () => {
    mockPromoteToExample.mockResolvedValue('example_001');

    const { POST } = await import('../app/api/v1/eval/turns/[id]/promote/route');
    const req = makeRequest('/api/v1/eval/turns/turn_001/promote', {
      method: 'POST',
      body: JSON.stringify({ category: 'sales', difficulty: 'easy' }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: 'turn_001' }) });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.exampleId).toBe('example_001');
  });
});

describe('GET /api/v1/eval/dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminSession.mockResolvedValue(ADMIN_SESSION);
  });

  it('returns dashboard data', async () => {
    const mockDashboard = {
      overallAvgUserRating: 4.2,
      overallAvgAdminScore: 3.8,
      totalTurns: 100,
      reviewedTurns: 50,
      ratingDistribution: {},
      hallucinationRateTrend: [],
      clarificationRateTrend: [],
      avgExecutionTimeTrend: [],
      byLens: [],
    };
    mockGetQualityDashboard.mockResolvedValue(mockDashboard);

    const { GET } = await import('../app/api/v1/eval/dashboard/route');
    const req = makeRequest('/api/v1/eval/dashboard');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.totalTurns).toBe(100);
    expect(body.data.avgUserRating).toBe(4.2);
  });
});

describe('GET /api/v1/eval/examples', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminSession.mockResolvedValue(ADMIN_SESSION);
  });

  it('returns examples list', async () => {
    mockGetGoldenExamples.mockResolvedValue([
      { id: 'ex_001', userMessage: 'How were sales?', category: 'sales' },
    ]);

    const { GET } = await import('../app/api/v1/eval/examples/route');
    const req = makeRequest('/api/v1/eval/examples');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('ex_001');
  }, 15_000);
});

describe('GET /api/v1/eval/patterns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminSession.mockResolvedValue(ADMIN_SESSION);
  });

  it('returns problematic patterns', async () => {
    mockGetProblematicPatterns.mockResolvedValue([
      {
        planHash: 'abc123',
        occurrenceCount: 5,
        avgUserRating: 2.0,
        commonVerdicts: ['incorrect'],
        commonFlags: ['hallucinated_slug'],
        exampleMessages: ['Show me data'],
      },
    ]);

    const { GET } = await import('../app/api/v1/eval/patterns/route');
    const req = makeRequest('/api/v1/eval/patterns');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].planHash).toBe('abc123');
    expect(body.data[0].occurrenceCount).toBe(5);
  });
});

describe('POST /api/v1/eval/aggregation/trigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminSession.mockResolvedValue(ADMIN_SESSION);
  });

  it('triggers aggregation and returns result', async () => {
    mockAggregateQualityDaily.mockResolvedValue({ rowsWritten: 3, date: '2026-02-19' });

    const { POST } = await import('../app/api/v1/eval/aggregation/trigger/route');
    const req = makeRequest('/api/v1/eval/aggregation/trigger', {
      method: 'POST',
      body: JSON.stringify({ date: '2026-02-19' }),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.rowsWritten).toBe(3);
  });
});
