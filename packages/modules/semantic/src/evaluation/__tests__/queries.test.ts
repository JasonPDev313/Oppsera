import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (vi.hoisted) ──────────────────────────────────────────
const { mockDbSelect, mockDbExecute, makeChain, makeTurnRow, makeSessionRow, makeExampleRow } =
  vi.hoisted(() => {
    const defaultTurnRow = {
      id: 'turn_001',
      tenantId: 'tenant_001',
      sessionId: 'session_001',
      userId: 'user_001',
      userRole: 'manager',
      turnNumber: 1,
      userMessage: 'How were sales yesterday?',
      contextSnapshot: null,
      llmProvider: 'anthropic',
      llmModel: 'claude-sonnet-4-6',
      llmPlan: { metrics: ['net_sales'], intent: 'report' },
      llmRationale: null,
      llmConfidence: '0.9',
      llmTokensInput: 1200,
      llmTokensOutput: 450,
      llmLatencyMs: 980,
      planHash: 'abc123def456',
      wasClarification: false,
      clarificationMessage: null,
      compiledSql: 'SELECT SUM(net_sales) FROM rm_daily_sales',
      sqlHash: 'def456abc123',
      compilationErrors: null,
      safetyFlags: null,
      tablesAccessed: null,
      executionTimeMs: 200,
      rowCount: 10,
      resultSample: null,
      resultFingerprint: null,
      executionError: null,
      cacheStatus: null,
      narrative: 'Net sales were $10,000',
      narrativeLensId: null,
      responseSections: null,
      playbooksFired: null,
      userRating: null,
      userThumbsUp: null,
      userFeedbackText: null,
      userFeedbackTags: null,
      userFeedbackAt: null,
      adminReviewerId: null,
      adminScore: null,
      adminVerdict: null,
      adminNotes: null,
      adminCorrectedPlan: null,
      adminCorrectedNarrative: null,
      adminReviewedAt: null,
      adminActionTaken: null,
      qualityScore: '0.85',
      qualityFlags: null,
      createdAt: new Date('2026-01-15T10:00:00.000Z'),
      updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    };

    const defaultSessionRow = {
      id: 'session_001',
      tenantId: 'tenant_001',
      userId: 'user_001',
      sessionId: 'ext_session_001',
      startedAt: new Date('2026-01-15T09:00:00.000Z'),
      endedAt: null,
      messageCount: 3,
      avgUserRating: '4.00',
      avgAdminScore: null,
      status: 'active',
      lensId: null,
      metadata: null,
      createdAt: new Date('2026-01-15T09:00:00.000Z'),
      updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    };

    const defaultExampleRow = {
      id: 'example_001',
      tenantId: null,
      sourceEvalTurnId: 'turn_001',
      question: 'How were sales yesterday?',
      plan: { metrics: ['net_sales'], intent: 'report' },
      rationale: null,
      category: 'metrics',
      difficulty: 'easy',
      qualityScore: '0.95',
      isActive: true,
      addedBy: 'admin_001',
      createdAt: new Date('2026-01-15T09:00:00.000Z'),
      updatedAt: new Date('2026-01-15T09:00:00.000Z'),
    };

    const makeChain = (result: unknown[] = []): Record<string, unknown> => {
      const chain: Record<string, unknown> = {};
      chain.from = vi.fn(() => chain);
      chain.where = vi.fn(() => chain);
      chain.limit = vi.fn(() => chain);
      chain.orderBy = vi.fn(() => chain);
      chain.then = vi.fn((resolve: (v: unknown) => unknown) => resolve(result));
      return chain;
    };

    return {
      makeChain,
      makeTurnRow: (overrides: Record<string, unknown> = {}) => ({
        ...defaultTurnRow,
        ...overrides,
      }),
      makeSessionRow: (overrides: Record<string, unknown> = {}) => ({
        ...defaultSessionRow,
        ...overrides,
      }),
      makeExampleRow: (overrides: Record<string, unknown> = {}) => ({
        ...defaultExampleRow,
        ...overrides,
      }),
      mockDbSelect: vi.fn(() => makeChain([])),
      mockDbExecute: vi.fn().mockResolvedValue([]),
    };
  });

vi.mock('@oppsera/db', () => ({
  db: {
    select: mockDbSelect,
    execute: mockDbExecute,
  },
  semanticEvalTurns: {
    id: 'id',
    tenantId: 'tenant_id',
    sessionId: 'session_id',
    userId: 'user_id',
    userRole: 'user_role',
    turnNumber: 'turn_number',
    userMessage: 'user_message',
    contextSnapshot: 'context_snapshot',
    llmProvider: 'llm_provider',
    llmModel: 'llm_model',
    llmPlan: 'llm_plan',
    llmRationale: 'llm_rationale',
    llmConfidence: 'llm_confidence',
    llmTokensInput: 'llm_tokens_input',
    llmTokensOutput: 'llm_tokens_output',
    llmLatencyMs: 'llm_latency_ms',
    planHash: 'plan_hash',
    wasClarification: 'was_clarification',
    clarificationMessage: 'clarification_message',
    compiledSql: 'compiled_sql',
    sqlHash: 'sql_hash',
    compilationErrors: 'compilation_errors',
    safetyFlags: 'safety_flags',
    tablesAccessed: 'tables_accessed',
    executionTimeMs: 'execution_time_ms',
    rowCount: 'row_count',
    resultSample: 'result_sample',
    resultFingerprint: 'result_fingerprint',
    executionError: 'execution_error',
    cacheStatus: 'cache_status',
    narrative: 'narrative',
    narrativeLensId: 'narrative_lens_id',
    responseSections: 'response_sections',
    playbooksFired: 'playbooks_fired',
    userRating: 'user_rating',
    userThumbsUp: 'user_thumbs_up',
    userFeedbackText: 'user_feedback_text',
    userFeedbackTags: 'user_feedback_tags',
    userFeedbackAt: 'user_feedback_at',
    adminReviewerId: 'admin_reviewer_id',
    adminScore: 'admin_score',
    adminVerdict: 'admin_verdict',
    adminNotes: 'admin_notes',
    adminCorrectedPlan: 'admin_corrected_plan',
    adminCorrectedNarrative: 'admin_corrected_narrative',
    adminReviewedAt: 'admin_reviewed_at',
    adminActionTaken: 'admin_action_taken',
    qualityScore: 'quality_score',
    qualityFlags: 'quality_flags',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  semanticEvalSessions: {
    id: 'id',
    tenantId: 'tenant_id',
    userId: 'user_id',
    sessionId: 'session_id',
    startedAt: 'started_at',
    endedAt: 'ended_at',
    messageCount: 'message_count',
    avgUserRating: 'avg_user_rating',
    avgAdminScore: 'avg_admin_score',
    status: 'status',
    lensId: 'lens_id',
    metadata: 'metadata',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  semanticEvalExamples: {
    id: 'id',
    tenantId: 'tenant_id',
    sourceEvalTurnId: 'source_eval_turn_id',
    question: 'question',
    plan: 'plan',
    rationale: 'rationale',
    category: 'category',
    difficulty: 'difficulty',
    qualityScore: 'quality_score',
    isActive: 'is_active',
    addedBy: 'added_by',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  semanticEvalQualityDaily: {},
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings.join('?'), values }),
  eq: vi.fn(() => ({ type: 'eq' })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  gte: vi.fn(() => ({ type: 'gte' })),
  lte: vi.fn(() => ({ type: 'lte' })),
  desc: vi.fn(() => ({ type: 'desc' })),
  asc: vi.fn(() => ({ type: 'asc' })),
  isNotNull: vi.fn(() => ({ type: 'isNotNull' })),
  like: vi.fn(() => ({ type: 'like' })),
  inArray: vi.fn(() => ({ type: 'inArray' })),
}));

import {
  getEvalFeed,
  getEvalTurnDetail,
  getEvalSession,
  getGoldenExamples,
  getQualityDashboard,
  getProblematicPatterns,
} from '../queries';

// ── getEvalFeed ─────────────────────────────────────────────────

describe('getEvalFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns turns from mock and sets hasMore=false when exactly at limit', async () => {
    const turns = [makeTurnRow({ id: 'turn_002' }), makeTurnRow({ id: 'turn_001' })];
    mockDbSelect.mockReturnValueOnce(makeChain(turns));

    const result = await getEvalFeed('tenant_001');

    expect(result.turns).toHaveLength(2);
    expect(result.hasMore).toBe(false);
    expect(result.cursor).toBeNull();
  });

  it('sets hasMore=true and exposes cursor when limit+1 rows returned', async () => {
    // With limit=2, the query fetches 3. Returning 3 rows signals hasMore.
    const turns = [
      makeTurnRow({ id: 'turn_003' }),
      makeTurnRow({ id: 'turn_002' }),
      makeTurnRow({ id: 'turn_001' }), // the extra sentinel row
    ];
    mockDbSelect.mockReturnValueOnce(makeChain(turns));

    const result = await getEvalFeed('tenant_001', { limit: 2 });

    expect(result.turns).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    expect(result.cursor).toBe('turn_002'); // last item in the slice
  });

  it('returns empty result with hasMore=false when no turns exist', async () => {
    mockDbSelect.mockReturnValueOnce(makeChain([]));

    const result = await getEvalFeed('tenant_001');

    expect(result.turns).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(result.cursor).toBeNull();
  });

  it('passes null tenantId through for cross-tenant admin queries', async () => {
    const turns = [
      makeTurnRow({ id: 'turn_001', tenantId: 'tenant_001' }),
      makeTurnRow({ id: 'turn_002', tenantId: 'tenant_002' }),
    ];
    mockDbSelect.mockReturnValueOnce(makeChain(turns));

    const result = await getEvalFeed(null);

    expect(result.turns).toHaveLength(2);
    expect(mockDbSelect).toHaveBeenCalledOnce();
  });

  it('maps turn fields to correct types', async () => {
    const turnRow = makeTurnRow({
      qualityScore: '0.87',
      llmConfidence: '0.93',
      userFeedbackAt: new Date('2026-01-15T12:00:00.000Z'),
    });
    mockDbSelect.mockReturnValueOnce(makeChain([turnRow]));

    const result = await getEvalFeed('tenant_001');
    const turn = result.turns[0]!;

    expect(turn.id).toBe('turn_001');
    expect(turn.qualityScore).toBe(0.87);
    expect(turn.llmConfidence).toBe(0.93);
    expect(turn.createdAt).toBe('2026-01-15T10:00:00.000Z');
    expect(turn.userFeedbackAt).toBe('2026-01-15T12:00:00.000Z');
  });

  it('maps null numeric fields to null', async () => {
    const turnRow = makeTurnRow({ qualityScore: null, llmConfidence: null });
    mockDbSelect.mockReturnValueOnce(makeChain([turnRow]));

    const result = await getEvalFeed('tenant_001');
    const turn = result.turns[0]!;

    expect(turn.qualityScore).toBeNull();
    expect(turn.llmConfidence).toBeNull();
  });

  it('caps limit at 100 without throwing', async () => {
    mockDbSelect.mockReturnValueOnce(makeChain([]));

    await expect(getEvalFeed('tenant_001', { limit: 999 })).resolves.not.toThrow();
    expect(mockDbSelect).toHaveBeenCalledOnce();
  });
});

// ── getEvalTurnDetail ───────────────────────────────────────────

describe('getEvalTurnDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a mapped turn for an existing id', async () => {
    const turnRow = makeTurnRow({ id: 'turn_abc' });
    mockDbSelect.mockReturnValueOnce(makeChain([turnRow]));

    const result = await getEvalTurnDetail('turn_abc');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('turn_abc');
    expect(result!.planHash).toBe('abc123def456');
  });

  it('returns null when turn does not exist', async () => {
    mockDbSelect.mockReturnValueOnce(makeChain([]));

    const result = await getEvalTurnDetail('nonexistent');

    expect(result).toBeNull();
  });
});

// ── getEvalSession ──────────────────────────────────────────────

describe('getEvalSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns session and all turns sorted by turnNumber', async () => {
    const sessionRow = makeSessionRow();
    const turns = [
      makeTurnRow({ id: 'turn_001', turnNumber: 1 }),
      makeTurnRow({ id: 'turn_002', turnNumber: 2 }),
    ];
    mockDbSelect
      .mockReturnValueOnce(makeChain([sessionRow]))
      .mockReturnValueOnce(makeChain(turns));

    const result = await getEvalSession('session_001');

    expect(result).not.toBeNull();
    expect(result!.session.id).toBe('session_001');
    expect(result!.turns).toHaveLength(2);
    expect(result!.turns[0]!.id).toBe('turn_001');
  });

  it('maps session numeric fields correctly', async () => {
    const sessionRow = makeSessionRow({ avgUserRating: '3.75', avgAdminScore: '4.50' });
    mockDbSelect
      .mockReturnValueOnce(makeChain([sessionRow]))
      .mockReturnValueOnce(makeChain([]));

    const result = await getEvalSession('session_001');

    expect(result!.session.avgUserRating).toBe(3.75);
    expect(result!.session.avgAdminScore).toBe(4.5);
    expect(result!.session.messageCount).toBe(3);
  });

  it('returns null when session does not exist', async () => {
    mockDbSelect.mockReturnValueOnce(makeChain([]));

    const result = await getEvalSession('nonexistent');

    expect(result).toBeNull();
    // second query (turns) should not run
    expect(mockDbSelect).toHaveBeenCalledOnce();
  });
});

// ── getGoldenExamples ───────────────────────────────────────────

describe('getGoldenExamples', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns system examples (tenantId=null) when no tenantId given', async () => {
    const example = makeExampleRow({ tenantId: null });
    mockDbSelect.mockReturnValueOnce(makeChain([example]));

    const result = await getGoldenExamples();

    expect(result).toHaveLength(1);
    expect(result[0]!.tenantId).toBeNull();
    expect(result[0]!.isActive).toBe(true);
  });

  it('maps example numeric fields correctly', async () => {
    const example = makeExampleRow({ qualityScore: '0.97' });
    mockDbSelect.mockReturnValueOnce(makeChain([example]));

    const result = await getGoldenExamples('tenant_001');

    expect(result[0]!.qualityScore).toBe(0.97);
    expect(result[0]!.plan).toEqual({ metrics: ['net_sales'], intent: 'report' });
    expect(result[0]!.category).toBe('metrics');
    expect(result[0]!.difficulty).toBe('easy');
  });

  it('returns empty array when no examples match', async () => {
    mockDbSelect.mockReturnValueOnce(makeChain([]));

    const result = await getGoldenExamples('tenant_001', 'edge_case' as never);

    expect(result).toEqual([]);
  });
});

// ── getQualityDashboard ─────────────────────────────────────────

describe('getQualityDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes all 6 aggregation queries', async () => {
    // summary, ratingDist, hallucinationTrend, clarificationTrend, execTimeTrend, byLens
    mockDbExecute
      .mockResolvedValueOnce([
        {
          avg_user_rating: '4.20',
          avg_admin_score: '4.50',
          total_turns: '100',
          reviewed_turns: '60',
          flagged_turns: '15',
          cache_hit_rate: '72.00',
        },
      ])
      .mockResolvedValueOnce([{ rating: '4', count: '50' }])
      .mockResolvedValueOnce([{ date: '2026-01-01', rate: '2.00' }])
      .mockResolvedValueOnce([{ date: '2026-01-01', rate: '5.00' }])
      .mockResolvedValueOnce([{ date: '2026-01-01', avg_ms: '500' }])
      .mockResolvedValueOnce([
        { lens_id: null, count: '100', avg_rating: '4.20', top_verdict: 'correct' },
      ]);

    await getQualityDashboard('tenant_001', { start: '2026-01-01', end: '2026-01-31' });

    expect(mockDbExecute).toHaveBeenCalledTimes(6);
  });

  it('returns correct shape with required keys', async () => {
    mockDbExecute.mockResolvedValue([]);

    const result = await getQualityDashboard('tenant_001', {
      start: '2026-01-01',
      end: '2026-01-31',
    });

    expect(result).toHaveProperty('overallAvgUserRating');
    expect(result).toHaveProperty('overallAvgAdminScore');
    expect(result).toHaveProperty('totalTurns');
    expect(result).toHaveProperty('reviewedTurns');
    expect(result).toHaveProperty('flaggedTurns');
    expect(result).toHaveProperty('ratingDistribution');
    expect(result).toHaveProperty('hallucinationRateTrend');
    expect(result).toHaveProperty('clarificationRateTrend');
    expect(result).toHaveProperty('avgExecutionTimeTrend');
    expect(result).toHaveProperty('byLens');
    expect(result).toHaveProperty('cacheHitRate');
  });

  it('maps rating distribution from execute results', async () => {
    mockDbExecute
      .mockResolvedValueOnce([]) // summary
      .mockResolvedValueOnce([
        { rating: '4', count: '50' },
        { rating: '5', count: '30' },
      ]) // ratingDist
      .mockResolvedValueOnce([]) // hallucinationTrend
      .mockResolvedValueOnce([]) // clarificationTrend
      .mockResolvedValueOnce([]) // execTimeTrend
      .mockResolvedValueOnce([]); // byLens

    const result = await getQualityDashboard('tenant_001', {
      start: '2026-01-01',
      end: '2026-01-31',
    });

    expect(result.ratingDistribution['4']).toBe(50);
    expect(result.ratingDistribution['5']).toBe(30);
    expect(result.ratingDistribution['1']).toBe(0);
  });

  it('maps byLens data from execute results', async () => {
    mockDbExecute
      .mockResolvedValueOnce([]) // summary
      .mockResolvedValueOnce([]) // ratingDist
      .mockResolvedValueOnce([]) // hallucinationTrend
      .mockResolvedValueOnce([]) // clarificationTrend
      .mockResolvedValueOnce([]) // execTimeTrend
      .mockResolvedValueOnce([
        { lens_id: 'lens_golf', count: '42', avg_rating: '3.80', top_verdict: 'correct' },
      ]);

    const result = await getQualityDashboard(null, { start: '2026-01-01', end: '2026-01-31' });

    expect(result.byLens).toHaveLength(1);
    expect(result.byLens[0]!.lensId).toBe('lens_golf');
    expect(result.byLens[0]!.count).toBe(42);
    expect(result.byLens[0]!.avgRating).toBe(3.8);
  });
});

// ── getProblematicPatterns ──────────────────────────────────────

describe('getProblematicPatterns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns patterns grouped by planHash', async () => {
    mockDbExecute.mockResolvedValueOnce([
      {
        plan_hash: 'hash_abc',
        count: '5',
        avg_user_rating: '2.00',
        avg_admin_score: '2.50',
        sample_question: 'What were total sales?',
      },
      {
        plan_hash: 'hash_def',
        count: '4',
        avg_user_rating: '1.80',
        avg_admin_score: null,
        sample_question: 'Show me revenue',
      },
    ]);

    const result = await getProblematicPatterns('tenant_001', {
      start: '2026-01-01',
      end: '2026-01-31',
    });

    expect(result).toHaveLength(2);
    expect(result[0]!.planHash).toBe('hash_abc');
    expect(result[0]!.count).toBe(5);
    expect(result[0]!.avgUserRating).toBe(2.0);
    expect(result[0]!.avgAdminScore).toBe(2.5);
    expect(result[0]!.sampleQuestion).toBe('What were total sales?');
    expect(result[1]!.planHash).toBe('hash_def');
    expect(result[1]!.avgAdminScore).toBeNull();
  });

  it('returns empty array when no problematic patterns found', async () => {
    mockDbExecute.mockResolvedValueOnce([]);

    const result = await getProblematicPatterns('tenant_001', {
      start: '2026-01-01',
      end: '2026-01-31',
    });

    expect(result).toEqual([]);
  });

  it('works with null tenantId for cross-tenant admin view', async () => {
    mockDbExecute.mockResolvedValueOnce([]);

    await getProblematicPatterns(null, { start: '2026-01-01', end: '2026-01-31' });

    expect(mockDbExecute).toHaveBeenCalledOnce();
  });

  it('includes commonVerdicts and commonFlags as empty arrays', async () => {
    mockDbExecute.mockResolvedValueOnce([
      {
        plan_hash: 'hash_abc',
        count: '3',
        avg_user_rating: '2.30',
        avg_admin_score: null,
        sample_question: 'Trend over time?',
      },
    ]);

    const result = await getProblematicPatterns('tenant_001', {
      start: '2026-01-01',
      end: '2026-01-31',
    });

    expect(result[0]!.commonVerdicts).toEqual([]);
    expect(result[0]!.commonFlags).toEqual([]);
  });
});
