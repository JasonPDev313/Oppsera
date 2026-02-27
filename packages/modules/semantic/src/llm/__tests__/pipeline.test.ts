import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────

const {
  mockLLMComplete,
  mockCompilePlan,
  mockExecuteCompiledQuery,
  mockBuildRegistryCatalog,
  mockGetLens,
  mockRecordTurn,
  mockValidatePlan,
  mockBuildSchemaCatalog,
  mockGenerateSql,
  mockValidateGeneratedSql,
  mockExecuteSqlQuery,
  mockRetrySqlGeneration,
  _mockAdapterRef,
} = vi.hoisted(() => ({
  mockLLMComplete: vi.fn(),
  mockCompilePlan: vi.fn(),
  mockExecuteCompiledQuery: vi.fn(),
  mockBuildRegistryCatalog: vi.fn(),
  mockGetLens: vi.fn(),
  mockRecordTurn: vi.fn(),
  mockValidatePlan: vi.fn(),
  mockBuildSchemaCatalog: vi.fn(),
  mockGenerateSql: vi.fn(),
  mockValidateGeneratedSql: vi.fn(),
  mockExecuteSqlQuery: vi.fn(),
  mockRetrySqlGeneration: vi.fn(),
  _mockAdapterRef: { current: null as unknown },
}));

vi.mock('../executor', () => ({
  executeCompiledQuery: mockExecuteCompiledQuery,
}));

vi.mock('@oppsera/db', () => ({
  db: {
    transaction: vi.fn(),
    execute: vi.fn(),
  },
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      _tag: 'SQL',
      strings,
      values,
    }),
    {
      raw: (s: string) => ({ _tag: 'SQL_RAW', raw: s }),
    },
  ),
}));

vi.mock('../../registry/registry', () => ({
  buildRegistryCatalog: mockBuildRegistryCatalog,
  getLens: mockGetLens,
  validatePlan: mockValidatePlan,
}));

vi.mock('../../compiler/compiler', () => ({
  compilePlan: mockCompilePlan,
}));

vi.mock('../../evaluation/capture', () => ({
  getEvalCaptureService: () => ({
    recordTurn: mockRecordTurn,
  }),
  setEvalCaptureService: vi.fn(),
}));

// Always return cache miss — tests control executor behavior directly
vi.mock('../../cache/query-cache', () => ({
  getFromQueryCache: vi.fn().mockReturnValue(null),
  setInQueryCache: vi.fn(),
}));

vi.mock('../../observability/metrics', () => ({
  recordSemanticRequest: vi.fn(),
}));

vi.mock('../../schema/schema-catalog', () => ({
  buildSchemaCatalog: mockBuildSchemaCatalog,
}));

vi.mock('../sql-generator', () => ({
  generateSql: mockGenerateSql,
}));

vi.mock('../sql-validator', () => ({
  validateGeneratedSql: mockValidateGeneratedSql,
}));

vi.mock('../sql-executor', () => ({
  executeSqlQuery: mockExecuteSqlQuery,
}));

vi.mock('../sql-retry', () => ({
  retrySqlGeneration: mockRetrySqlGeneration,
}));

vi.mock('../adapters/anthropic', () => ({
  getLLMAdapter: vi.fn().mockImplementation(() => _mockAdapterRef.current),
  setLLMAdapter: vi.fn().mockImplementation((a: unknown) => { _mockAdapterRef.current = a; }),
  SEMANTIC_FAST_MODEL: 'fast-model',
}));

vi.mock('../adapters/resilience', () => ({
  guardPromptSize: vi.fn().mockImplementation((parts: Record<string, unknown>) => ({
    basePrompt: parts.basePrompt ?? '',
    schemaSection: parts.schemaSection ?? null,
    examplesSection: parts.examplesSection ?? null,
    ragSection: parts.ragSection ?? null,
    wasTruncated: false,
  })),
  coalesceRequest: vi.fn().mockImplementation((_key: string, fn: () => Promise<unknown>) => fn()),
  buildCoalesceKey: vi.fn().mockReturnValue('mock-key'),
  getCircuitBreakerStatus: vi.fn().mockReturnValue({ state: 'CLOSED', totalTrips: 0, totalRejected: 0 }),
}));

vi.mock('../../rag/few-shot-retriever', () => ({
  retrieveFewShotExamples: vi.fn().mockResolvedValue({ examples: [], snippet: '' }),
}));

vi.mock('../conversation-pruner', () => ({
  pruneForIntentResolver: vi.fn().mockImplementation(
    (msgs: Array<{ role: string; content: string }>) =>
      msgs.filter((m) => m.role === 'user'),
  ),
}));

vi.mock('../../cache/llm-cache', () => ({
  getFromLLMCache: vi.fn().mockReturnValue(null),
  setInLLMCache: vi.fn(),
  hashSystemPrompt: vi.fn().mockReturnValue('mock-hash'),
  getStaleFromLLMCache: vi.fn().mockReturnValue(null),
}));

vi.mock('../../cache/semantic-rate-limiter', () => ({
  setAdaptiveBackoffLevel: vi.fn(),
}));

vi.mock('../../intelligence/follow-up-generator', () => ({
  generateFollowUps: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../intelligence/chart-inferrer', () => ({
  inferChartConfig: vi.fn().mockReturnValue(null),
  inferChartConfigFromSqlResult: vi.fn().mockReturnValue(null),
}));

vi.mock('../fast-path', () => ({
  tryFastPath: vi.fn().mockReturnValue(null),
}));

vi.mock('../../intelligence/data-quality-scorer', () => ({
  scoreDataQuality: vi.fn().mockReturnValue({ score: 0.95, grade: 'A', factors: [] }),
}));

vi.mock('../../intelligence/plausibility-checker', () => ({
  checkPlausibility: vi.fn().mockReturnValue({ plausible: true, grade: 'A', warnings: [] }),
  formatPlausibilityForNarrative: vi.fn().mockReturnValue(null),
}));

vi.mock('../../pii/pii-masker', () => ({
  maskRowsForLLM: vi.fn().mockImplementation((rows: unknown[]) => rows),
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn().mockReturnValue('mock-ulid-123'),
}));

// ── Imports ───────────────────────────────────────────────────────

import { resolveIntent } from '../intent-resolver';
import { generateNarrative, buildEmptyResultNarrative, _parseMarkdownNarrative } from '../narrative';
import { runPipeline, setLLMAdapter } from '../pipeline';
import { ExecutionError } from '../types';
import type { LLMAdapter, LLMResponse, IntentContext, QueryResult } from '../types';
import type { RegistryCatalog } from '../../registry/types';

// ── Fixtures ──────────────────────────────────────────────────────

function makeLLMResponse(content: string): LLMResponse {
  return {
    content,
    tokensInput: 100,
    tokensOutput: 50,
    model: 'mock-model',
    provider: 'mock',
    latencyMs: 200,
    stopReason: 'end_turn',
  };
}

function makeMockAdapter(content: string): LLMAdapter {
  return {
    provider: 'mock',
    model: 'mock-model',
    complete: vi.fn().mockResolvedValue(makeLLMResponse(content)),
  };
}

const mockCatalog: RegistryCatalog = {
  metrics: [
    {
      slug: 'net_sales',
      displayName: 'Net Sales',
      description: 'Total net sales',
      domain: 'core',
      category: 'revenue',
      tags: null,
      sqlExpression: 'SUM(net_sales)',
      sqlTable: 'rm_daily_sales',
      sqlAggregation: 'sum',
      sqlFilter: null,
      dataType: 'currency',
      formatPattern: '$0,0.00',
      unit: 'USD',
      higherIsBetter: true,
      aliases: null,
      examplePhrases: null,
      relatedMetrics: null,
      requiresDimensions: null,
      incompatibleWith: null,
      isActive: true,
      isExperimental: false,
    },
  ],
  dimensions: [
    {
      slug: 'date',
      displayName: 'Date',
      description: null,
      domain: 'core',
      category: 'time',
      tags: null,
      sqlExpression: 'business_date',
      sqlTable: 'rm_daily_sales',
      sqlDataType: 'date',
      sqlCast: null,
      hierarchyParent: null,
      hierarchyLevel: 0,
      isTimeDimension: true,
      timeGranularities: ['day', 'week', 'month'],
      lookupTable: null,
      lookupKeyColumn: null,
      lookupLabelColumn: null,
      aliases: null,
      exampleValues: null,
      examplePhrases: null,
      isActive: true,
    },
  ],
  lenses: [],
  generatedAt: new Date().toISOString(),
};

const mockContext: IntentContext = {
  tenantId: 'tenant_abc',
  userId: 'user_123',
  userRole: 'manager',
  sessionId: 'session_xyz',
  currentDate: '2026-02-20',
};

const VALID_PLAN_JSON = JSON.stringify({
  plan: {
    metrics: ['net_sales'],
    dimensions: ['date'],
    filters: [],
    dateRange: { start: '2026-01-01', end: '2026-01-31' },
    timeGranularity: 'day',
    intent: 'Show net sales by day for January 2026',
    rationale: 'User wants daily revenue trend',
  },
  confidence: 0.92,
  clarificationNeeded: false,
  clarificationMessage: null,
});

const CLARIFICATION_JSON = JSON.stringify({
  plan: null,
  confidence: 0.3,
  clarificationNeeded: true,
  clarificationMessage: 'Which location would you like to see data for?',
});

const NARRATIVE_JSON = JSON.stringify({
  text: 'Net sales for January 2026 totalled **$45,230.00** across 12 days.',
  sections: [
    { type: 'summary', content: 'Net sales totalled $45,230 in January 2026.' },
    { type: 'detail', content: 'Peak day was January 15 at $5,200.' },
  ],
});

const mockCompiledQuery = {
  sql: 'SELECT SUM(net_sales) AS "net_sales", business_date AS "date" FROM rm_daily_sales WHERE tenant_id = $1 GROUP BY business_date ORDER BY "date" ASC LIMIT $2',
  params: ['tenant_abc', 10_000],
  primaryTable: 'rm_daily_sales',
  joinTables: [],
  metaDefs: [mockCatalog.metrics[0]],
  dimensionDefs: [mockCatalog.dimensions[0]],
  warnings: [],
};

const mockQueryResult: QueryResult = {
  rows: [
    { date: '2026-01-01', net_sales: '1200.00' },
    { date: '2026-01-02', net_sales: '980.50' },
  ],
  rowCount: 2,
  executionTimeMs: 45,
  truncated: false,
};

// ── Tests: resolveIntent ──────────────────────────────────────────

describe('resolveIntent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns ResolvedIntent with parsed plan on valid LLM response', async () => {
    const adapter = makeMockAdapter(VALID_PLAN_JSON);

    const result = await resolveIntent('Show me net sales by day last month', mockContext, {
      catalog: mockCatalog,
      adapter,
    });

    expect(result.isClarification).toBe(false);
    expect(result.confidence).toBe(0.92);
    expect(result.plan.metrics).toEqual(['net_sales']);
    expect(result.plan.dimensions).toEqual(['date']);
    expect(result.plan.dateRange).toEqual({ start: '2026-01-01', end: '2026-01-31' });
    expect(result.plan.timeGranularity).toBe('day');
    expect(result.provider).toBe('mock');
    expect(result.tokensInput).toBe(100);
  });

  it('sets isClarification = true when LLM requests clarification', async () => {
    const adapter = makeMockAdapter(CLARIFICATION_JSON);

    const result = await resolveIntent('Show me sales', mockContext, {
      catalog: mockCatalog,
      adapter,
    });

    expect(result.isClarification).toBe(true);
    expect(result.clarificationText).toBe('Which location would you like to see data for?');
    expect(result.confidence).toBe(0.3);
  });

  it('strips markdown fences from LLM response before parsing', async () => {
    const fencedJson = `\`\`\`json\n${VALID_PLAN_JSON}\n\`\`\``;
    const adapter = makeMockAdapter(fencedJson);

    const result = await resolveIntent('net sales last month', mockContext, {
      catalog: mockCatalog,
      adapter,
    });

    expect(result.isClarification).toBe(false);
    expect(result.plan.metrics).toEqual(['net_sales']);
  });

  it('throws LLMError when LLM returns non-JSON prose', async () => {
    const adapter = makeMockAdapter('Sorry, I cannot help with that.');

    await expect(
      resolveIntent('net sales', mockContext, { catalog: mockCatalog, adapter }),
    ).rejects.toThrow();
  });

  it('includes only user messages from history, filters out assistant messages', async () => {
    const completeSpy = vi.fn().mockResolvedValue(makeLLMResponse(VALID_PLAN_JSON));
    const adapter: LLMAdapter = { provider: 'mock', model: 'mock', complete: completeSpy };

    const contextWithHistory: IntentContext = {
      ...mockContext,
      history: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
      ],
    };

    await resolveIntent('now show me sales', contextWithHistory, {
      catalog: mockCatalog,
      adapter,
    });

    const callArgs = completeSpy.mock.calls[0]!;
    const messages = callArgs[0] as { role: string; content: string }[];
    // 1 history user + 1 current user = 2 (assistant message filtered out)
    expect(messages).toHaveLength(2);
    expect(messages[0]!.content).toBe('hello');
    expect(messages[0]!.role).toBe('user');
    expect(messages[1]!.role).toBe('user');
    expect(messages[1]!.content).toContain('now show me sales');
  });

  it('clamps confidence to [0, 1] range', async () => {
    const outOfRange = JSON.stringify({
      plan: { metrics: ['net_sales'], dimensions: ['date'], filters: [] },
      confidence: 1.5,
      clarificationNeeded: false,
      clarificationMessage: null,
    });
    const adapter = makeMockAdapter(outOfRange);

    const result = await resolveIntent('net sales', mockContext, {
      catalog: mockCatalog,
      adapter,
    });

    expect(result.confidence).toBe(1);
  });

  it('treats plan=null with clarificationNeeded=false as clarification', async () => {
    const ambiguous = JSON.stringify({
      plan: null,
      confidence: 0.5,
      clarificationNeeded: false, // inconsistent — plan is null
      clarificationMessage: null,
    });
    const adapter = makeMockAdapter(ambiguous);

    const result = await resolveIntent('?', mockContext, {
      catalog: mockCatalog,
      adapter,
    });

    // plan = null means we can't execute → treat as clarification
    expect(result.isClarification).toBe(true);
  });
});

// ── Tests: generateNarrative ──────────────────────────────────────

describe('generateNarrative', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns parsed narrative sections from LLM response', async () => {
    const adapter = makeMockAdapter(NARRATIVE_JSON);
    const intent = {
      plan: {
        metrics: ['net_sales'],
        dimensions: ['date'],
        filters: [],
        intent: 'daily sales trend',
      },
      confidence: 0.9,
      isClarification: false,
      rawResponse: '',
      tokensInput: 100,
      tokensOutput: 50,
      latencyMs: 200,
      provider: 'mock',
      model: 'mock-model',
    };

    const result = await generateNarrative(
      mockQueryResult,
      intent as never,
      'net sales last month',
      mockContext,
      { adapter },
    );

    expect(result.text).toContain('$45,230.00');
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]!.type).toBe('summary');
    expect(result.sections[1]!.type).toBe('detail');
    expect(result.tokensInput).toBe(100);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('falls back to markdown parsing on non-JSON narrative response', async () => {
    const adapter = makeMockAdapter('Net sales were strong in January.');
    const minimalIntent = {
      plan: { metrics: ['net_sales'], dimensions: [], filters: [] },
      confidence: 0.8, isClarification: false, rawResponse: '',
      tokensInput: 0, tokensOutput: 0, latencyMs: 0, provider: 'mock', model: 'mock',
    };

    const result = await generateNarrative(
      mockQueryResult,
      minimalIntent as never,
      'net sales',
      mockContext,
      { adapter },
    );

    expect(result.text).toBe('Net sales were strong in January.');
    expect(result.sections).toHaveLength(1);
    // Markdown parser creates 'answer' type for unstructured text
    expect(result.sections[0]!.type).toBe('answer');
  });

  it('passes data table in the user message to the LLM', async () => {
    const completeSpy = vi.fn().mockResolvedValue(makeLLMResponse(NARRATIVE_JSON));
    const adapter: LLMAdapter = { provider: 'mock', model: 'mock', complete: completeSpy };
    const minimalIntent2 = {
      plan: { metrics: ['net_sales'], dimensions: ['date'], filters: [] },
      confidence: 0.9,
      isClarification: false,
      rawResponse: '',
      tokensInput: 0,
      tokensOutput: 0,
      latencyMs: 0,
      provider: 'mock',
      model: 'mock',
    };

    await generateNarrative(mockQueryResult, minimalIntent2 as never, 'net sales', mockContext, { adapter });

    const callArgs = completeSpy.mock.calls[0]!;
    const messages = callArgs[0] as { role: string; content: string }[];
    expect(messages[0]!.content).toContain('net_sales');
    expect(messages[0]!.content).toContain('date');
  });
});

// ── Tests: parseMarkdownNarrative ─────────────────────────────────

describe('parseMarkdownNarrative', () => {
  it('parses structured markdown into sections', () => {
    const md = [
      '## Answer',
      'We did $12,400 in net sales — solid for a Tuesday.',
      '',
      '### Key Takeaways',
      '- Revenue was up 8% compared to last week',
      '- Lunch drove most of the volume',
      '',
      '### What I\'d Do Next',
      '- Review the lunch menu for upsell opportunities',
      '',
      '---',
      '*Data: net_sales. Period: 2026-02-19.*',
    ].join('\n');

    const result = _parseMarkdownNarrative(md);

    expect(result.sections.some((s) => s.type === 'answer')).toBe(true);
    expect(result.sections.some((s) => s.type === 'takeaway')).toBe(true);
    expect(result.sections.some((s) => s.type === 'action')).toBe(true);
    expect(result.sections.some((s) => s.type === 'data_sources')).toBe(true);
    expect(result.text).toContain('$12,400');
  });

  it('handles plain text without headings', () => {
    const result = _parseMarkdownNarrative('Sales were great today.');
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]!.type).toBe('answer');
    expect(result.sections[0]!.content).toBe('Sales were great today.');
  });

  it('parses Risks to Watch section', () => {
    const md = [
      '## Answer',
      'Revenue is trending down.',
      '',
      '### Risks to Watch',
      '- If this continues, we may miss our monthly target',
    ].join('\n');

    const result = _parseMarkdownNarrative(md);
    expect(result.sections.some((s) => s.type === 'risk')).toBe(true);
  });

  it('parses THE OPPS ERA LENS response structure (Options, Recommendation, Quick Wins, ROI, What to Track, Next Steps)', () => {
    const md = [
      '## Answer',
      'We did $12,400 in net sales — solid for a Tuesday, about 8% above our weekday average.',
      '',
      '### Options',
      '**Option 1: Extend happy hour** — What + why. Effort: Low. Impact: Med.',
      '**Option 2: Launch a loyalty program** — What + why. Effort: Med. Impact: High.',
      '**Option 3: Add weekend brunch** — What + why. Effort: High. Impact: High.',
      '',
      '### Recommendation',
      'Best option: **Extend happy hour** — low effort, quick revenue boost. Confidence: 75%.',
      '',
      '### Quick Wins',
      '- Upsell appetizers during peak hours',
      '- Train staff on wine pairings',
      '- Add a lunch combo deal',
      '',
      '### ROI Snapshot',
      '- Estimated cost: $200',
      '- Potential monthly impact: $1,500',
      '- Rough payback: 2 weeks',
      '',
      '### What to Track',
      '- Average ticket size',
      '- Happy hour conversion rate',
      '',
      '### Next Steps',
      'Want to go deeper on pricing, staffing, or growth?',
      '',
      '---',
      '*THE OPPS ERA LENS. net_sales. Period: 2026-02-19.*',
    ].join('\n');

    const result = _parseMarkdownNarrative(md);

    expect(result.sections.some((s) => s.type === 'answer')).toBe(true);
    expect(result.sections.some((s) => s.type === 'options')).toBe(true);
    expect(result.sections.some((s) => s.type === 'recommendation')).toBe(true);
    expect(result.sections.some((s) => s.type === 'quick_wins')).toBe(true);
    expect(result.sections.some((s) => s.type === 'roi_snapshot')).toBe(true);
    expect(result.sections.some((s) => s.type === 'what_to_track')).toBe(true);
    expect(result.sections.some((s) => s.type === 'conversation_driver')).toBe(true);
    expect(result.sections.some((s) => s.type === 'data_sources')).toBe(true);
  });

  it('parses Assumptions section', () => {
    const md = [
      '## Answer',
      'Based on typical industry patterns, here\'s what I\'d recommend.',
      '',
      '### Assumptions',
      '- Using industry average of 65% tee sheet utilization',
      '- Assuming 4.5-hour average round time',
    ].join('\n');

    const result = _parseMarkdownNarrative(md);
    expect(result.sections.some((s) => s.type === 'assumptions')).toBe(true);
  });

  it('parses Deep Analysis mode heading as answer', () => {
    const md = [
      '## Deep Analysis — THE OPPS ERA LENS',
      'A deep dive into your revenue performance.',
    ].join('\n');

    const result = _parseMarkdownNarrative(md);
    expect(result.sections.some((s) => s.type === 'answer')).toBe(true);
  });

  it('parses Quick Wins mode heading', () => {
    const md = [
      '## Quick Wins — THE OPPS ERA LENS',
      '- Action 1: highest leverage first',
      '- Action 2: second priority',
    ].join('\n');

    const result = _parseMarkdownNarrative(md);
    expect(result.sections.some((s) => s.type === 'quick_wins')).toBe(true);
  });

  it('extracts THE OPPS ERA LENS footer from end of text', () => {
    const md = [
      '## Answer',
      'Sales look good.',
      '',
      '---',
      '*THE OPPS ERA LENS. net_sales, order_count. Jan 2026.*',
    ].join('\n');

    const result = _parseMarkdownNarrative(md);
    const dataSources = result.sections.find((s) => s.type === 'data_sources');
    expect(dataSources).toBeDefined();
    expect(dataSources!.content).toContain('net_sales');
  });

  it('maps Metrics heading to what_to_track', () => {
    const md = [
      '## Answer',
      'Revenue is on track.',
      '',
      '### Metrics',
      '- Net Sales',
      '- Average Ticket',
    ].join('\n');

    const result = _parseMarkdownNarrative(md);
    expect(result.sections.some((s) => s.type === 'what_to_track')).toBe(true);
  });
});

// ── Tests: buildEmptyResultNarrative ─────────────────────────────

describe('buildEmptyResultNarrative', () => {
  it('returns no-token fallback narrative without calling LLM', () => {
    const result = buildEmptyResultNarrative('show me sales', mockContext);

    expect(result.tokensInput).toBe(0);
    expect(result.tokensOutput).toBe(0);
    expect(result.latencyMs).toBe(0);
    expect(result.text).toContain('data');
    expect(result.sections.some((s) => s.type === 'answer')).toBe(true);
    expect(result.sections.some((s) => s.type === 'quick_wins')).toBe(true);
  });

  it('includes the original question in the text', () => {
    const result = buildEmptyResultNarrative('show rounds by channel', mockContext);
    expect(result.text).toContain('show rounds by channel');
  });

  it('includes THE OPPS ERA LENS footer', () => {
    const result = buildEmptyResultNarrative('show sales', mockContext);
    expect(result.text).toContain('THE OPPS ERA LENS');
  });
});

// ── Tests: runPipeline ────────────────────────────────────────────

function setupHappyPathMocks() {
  mockBuildRegistryCatalog.mockResolvedValue(mockCatalog);
  mockBuildSchemaCatalog.mockRejectedValue(new Error('DATABASE_URL is required'));
  mockGetLens.mockResolvedValue(null);
  mockRecordTurn.mockResolvedValue('turn_id_123');
  mockValidatePlan.mockResolvedValue({
    valid: true,
    errors: [],
    metrics: mockCatalog.metrics,
    dimensions: mockCatalog.dimensions,
  });
  mockCompilePlan.mockResolvedValue(mockCompiledQuery);
  mockExecuteCompiledQuery.mockResolvedValue(mockQueryResult);
}

describe('runPipeline — happy path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHappyPathMocks();
  });

  it('returns full PipelineOutput with data and narrative on success', async () => {
    const adapter: LLMAdapter = {
      provider: 'mock',
      model: 'mock-model',
      complete: mockLLMComplete
        .mockResolvedValueOnce(makeLLMResponse(VALID_PLAN_JSON))
        .mockResolvedValueOnce(makeLLMResponse(NARRATIVE_JSON)),
    };
    setLLMAdapter(adapter);

    const result = await runPipeline({
      message: 'Show me net sales by day last month',
      context: mockContext,
    });

    expect(result.isClarification).toBe(false);
    expect(result.plan).not.toBeNull();
    expect(result.plan!.metrics).toEqual(['net_sales']);
    expect(result.compiledSql).toBe(mockCompiledQuery.sql);
    expect(result.data).not.toBeNull();
    expect(result.narrative).toContain('$45,230.00');
    expect(result.provider).toBe('mock');
    expect(result.compilationErrors).toHaveLength(0);
  });

  it('short-circuits on clarification — does not compile or execute', async () => {
    const adapter: LLMAdapter = {
      provider: 'mock',
      model: 'mock-model',
      complete: mockLLMComplete.mockResolvedValueOnce(makeLLMResponse(CLARIFICATION_JSON)),
    };
    setLLMAdapter(adapter);

    const result = await runPipeline({
      message: 'Show me sales',
      context: mockContext,
    });

    expect(result.isClarification).toBe(true);
    expect(result.clarificationText).toBe('Which location would you like to see data for?');
    expect(result.data).toBeNull();
    expect(result.compiledSql).toBeNull();
    expect(mockCompilePlan).not.toHaveBeenCalled();
    expect(mockExecuteCompiledQuery).not.toHaveBeenCalled();
  });

  it('returns compilationErrors and ADVISOR narrative when compilePlan throws', async () => {
    const ADVISOR_FALLBACK = '## Answer\nI couldn\'t run that query, but here\'s what I can tell you.';
    const adapter: LLMAdapter = {
      provider: 'mock',
      model: 'mock-model',
      complete: mockLLMComplete
        .mockResolvedValueOnce(makeLLMResponse(VALID_PLAN_JSON))
        .mockResolvedValueOnce(makeLLMResponse(ADVISOR_FALLBACK)),
    };
    setLLMAdapter(adapter);
    mockCompilePlan.mockRejectedValueOnce(new Error('NO_METRICS: empty plan'));

    const result = await runPipeline({ message: 'broken plan', context: mockContext });

    expect(result.data).toBeNull();
    expect(result.compilationErrors.some((e) => e.includes('NO_METRICS'))).toBe(true);
    expect(result.compiledSql).toBeNull();
    // ADVISOR MODE narrative should be present even on compilation failure
    expect(result.narrative).not.toBeNull();
    expect(result.narrative).toContain('Answer');
  });

  it('skips narrative LLM call when skipNarrative = true', async () => {
    const adapter: LLMAdapter = {
      provider: 'mock',
      model: 'mock-model',
      complete: mockLLMComplete.mockResolvedValueOnce(makeLLMResponse(VALID_PLAN_JSON)),
    };
    setLLMAdapter(adapter);

    const result = await runPipeline({
      message: 'net sales last month',
      context: mockContext,
      skipNarrative: true,
    });

    // LLM called once only (for intent)
    expect(mockLLMComplete).toHaveBeenCalledTimes(1);
    expect(result.narrative).toBeNull();
    expect(result.data).not.toBeNull();
  });

  it('always attempts eval capture regardless of errors', async () => {
    const adapter: LLMAdapter = {
      provider: 'mock',
      model: 'mock-model',
      complete: mockLLMComplete
        .mockResolvedValueOnce(makeLLMResponse(VALID_PLAN_JSON))
        .mockResolvedValueOnce(makeLLMResponse('## Answer\nFallback advice.')),
    };
    setLLMAdapter(adapter);
    mockCompilePlan.mockRejectedValueOnce(new Error('compile failed'));

    await runPipeline({ message: 'test', context: mockContext });

    expect(mockRecordTurn).toHaveBeenCalledTimes(1);
  });

  it('handles execution errors without throwing', async () => {
    const adapter: LLMAdapter = {
      provider: 'mock',
      model: 'mock-model',
      complete: mockLLMComplete.mockResolvedValueOnce(makeLLMResponse(VALID_PLAN_JSON)),
    };
    setLLMAdapter(adapter);
    mockExecuteCompiledQuery.mockRejectedValueOnce(new Error('query failed'));

    const result = await runPipeline({ message: 'net sales', context: mockContext });

    expect(result.data).toBeNull();
    expect(result.compilationErrors.some((e) => e.includes('query failed'))).toBe(true);
  });

  it('calls LLM for narrative even when query returns 0 rows (ADVISOR MODE)', async () => {
    const ADVISOR_NARRATIVE = '## Answer\nNo transactions were recorded for that period.\n\n### What I\'d Do Next\n- Check a broader date range';
    const adapter: LLMAdapter = {
      provider: 'mock',
      model: 'mock-model',
      complete: mockLLMComplete
        .mockResolvedValueOnce(makeLLMResponse(VALID_PLAN_JSON))
        .mockResolvedValueOnce(makeLLMResponse(ADVISOR_NARRATIVE)),
    };
    setLLMAdapter(adapter);

    mockExecuteCompiledQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
      executionTimeMs: 5,
      truncated: false,
    });

    const result = await runPipeline({ message: 'net sales', context: mockContext });

    expect(result.narrative).not.toBeNull();
    expect(result.narrative).toContain('Answer');
    // LLM called twice: intent + narrative (ADVISOR MODE)
    expect(mockLLMComplete).toHaveBeenCalledTimes(2);
  });

  it('loads lens domain when lensSlug is provided in context', async () => {
    const adapter: LLMAdapter = {
      provider: 'mock',
      model: 'mock-model',
      complete: mockLLMComplete
        .mockResolvedValueOnce(makeLLMResponse(VALID_PLAN_JSON))
        .mockResolvedValueOnce(makeLLMResponse(NARRATIVE_JSON)),
    };
    setLLMAdapter(adapter);

    mockGetLens.mockResolvedValue({
      slug: 'golf_ops',
      domain: 'golf',
      systemPromptFragment: 'Focus on golf metrics only.',
      displayName: 'Golf Ops',
      isActive: true,
      isSystem: true,
    });

    const contextWithLens: IntentContext = { ...mockContext, lensSlug: 'golf_ops' };

    await runPipeline({ message: 'rounds last month', context: contextWithLens });

    // buildRegistryCatalog should be called with the lens domain
    expect(mockBuildRegistryCatalog).toHaveBeenCalledWith('golf');
  });
});

// ── Tests: Mode A → Mode B fallback ─────────────────────────────

describe('runPipeline — Mode A to Mode B fallback', () => {
  const mockSchemaCatalog = {
    tables: [{ name: 'orders', columns: ['id', 'tenant_id', 'subtotal_cents', 'status', 'business_date'] }],
    tableNames: new Set(['orders', 'tenders', 'customers', 'users']),
    summaryText: 'orders(id, tenant_id, subtotal_cents, status, business_date)',
    fullText: 'Table: orders\n  id TEXT\n  tenant_id TEXT\n  subtotal_cents INTEGER\n  status TEXT\n  business_date TEXT',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // mockReset clears mockResolvedValueOnce queues (clearAllMocks does not — gotcha #58)
    mockLLMComplete.mockReset();
    setupHappyPathMocks();
    // Override schema catalog to return a valid schema (enables SQL fallback)
    mockBuildSchemaCatalog.mockResolvedValue(mockSchemaCatalog);
  });

  it('falls back to SQL mode when metrics mode returns 0 rows', async () => {
    const SQL_NARRATIVE = '## Answer\nYou had **42 orders** last week totalling **$3,200**.\n\n### Quick Wins\n- Review peak hours';
    const adapter: LLMAdapter = {
      provider: 'mock',
      model: 'mock-model',
      // Call 1: intent resolution → returns metrics plan
      // Call 2: narrative generation in SQL mode (SQL gen uses mockGenerateSql, not LLM adapter)
      complete: mockLLMComplete
        .mockResolvedValueOnce(makeLLMResponse(VALID_PLAN_JSON))
        .mockResolvedValueOnce(makeLLMResponse(SQL_NARRATIVE)),
    };
    setLLMAdapter(adapter);

    // Metrics mode returns 0 rows
    mockExecuteCompiledQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
      executionTimeMs: 5,
      truncated: false,
    });

    // SQL generation mock
    mockGenerateSql.mockResolvedValueOnce({
      sql: "SELECT count(*) as total_orders FROM orders WHERE tenant_id = $1 AND status IN ('placed','paid')",
      explanation: 'Count orders',
      confidence: 0.95,
      tokensInput: 500,
      tokensOutput: 100,
      latencyMs: 300,
      provider: 'mock',
      model: 'mock-model',
    });

    // SQL validation passes
    mockValidateGeneratedSql.mockReturnValueOnce({
      valid: true,
      errors: [],
      sanitizedSql: "SELECT count(*) as total_orders FROM orders WHERE tenant_id = $1 AND status IN ('placed','paid')",
    });

    // SQL execution returns actual data
    mockExecuteSqlQuery.mockResolvedValueOnce({
      rows: [{ total_orders: 42 }],
      rowCount: 1,
      executionTimeMs: 15,
      truncated: false,
    });

    const result = await runPipeline({
      message: 'how many orders last week',
      context: mockContext,
    });

    // Should use SQL mode result since it found data
    expect(result.mode).toBe('sql');
    expect(result.data).not.toBeNull();
    expect(result.data!.rowCount).toBe(1);
    expect(result.data!.rows[0]).toEqual({ total_orders: 42 });
    // SQL generation should have been called (fallback triggered)
    expect(mockGenerateSql).toHaveBeenCalledTimes(1);
  });

  it('returns metrics result when SQL fallback also returns 0 rows', async () => {
    const ADVISOR_NARRATIVE = '## Answer\nNo data found for that period.';
    const adapter: LLMAdapter = {
      provider: 'mock',
      model: 'mock-model',
      // Call 1: intent resolution → metrics plan
      // Call 2: narrative in SQL mode (SQL gen uses mockGenerateSql)
      complete: mockLLMComplete
        .mockResolvedValueOnce(makeLLMResponse(VALID_PLAN_JSON))
        .mockResolvedValueOnce(makeLLMResponse(ADVISOR_NARRATIVE)),
    };
    setLLMAdapter(adapter);

    // Metrics mode returns 0 rows
    mockExecuteCompiledQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
      executionTimeMs: 5,
      truncated: false,
    });

    // SQL generation
    mockGenerateSql.mockResolvedValueOnce({
      sql: "SELECT count(*) as total FROM orders WHERE tenant_id = $1",
      explanation: 'Count orders',
      confidence: 0.9,
      tokensInput: 400,
      tokensOutput: 80,
      latencyMs: 250,
      provider: 'mock',
      model: 'mock-model',
    });

    mockValidateGeneratedSql.mockReturnValueOnce({
      valid: true,
      errors: [],
      sanitizedSql: "SELECT count(*) as total FROM orders WHERE tenant_id = $1",
    });

    // SQL also returns 0 rows
    mockExecuteSqlQuery.mockResolvedValueOnce({
      rows: [{ total: 0 }],
      rowCount: 1, // Note: COUNT queries return 1 row with value 0, not 0 rows
      executionTimeMs: 10,
      truncated: false,
    });

    const result = await runPipeline({
      message: 'orders last week',
      context: mockContext,
    });

    // SQL fallback returned data (1 row with count=0), so it uses SQL result
    expect(result.data).not.toBeNull();
    expect(mockGenerateSql).toHaveBeenCalledTimes(1);
  });

  it('returns metrics result when SQL fallback throws', async () => {
    const ADVISOR_NARRATIVE = '## Answer\nI could not retrieve data right now.';
    const adapter: LLMAdapter = {
      provider: 'mock',
      model: 'mock-model',
      // Call 1: intent resolution → metrics plan
      // Call 2: advisor narrative in runSqlMode catch (generateSql threw)
      // Call 3: deferred narrative generation (metrics result with 0 rows)
      complete: mockLLMComplete
        .mockResolvedValueOnce(makeLLMResponse(VALID_PLAN_JSON))
        .mockResolvedValueOnce(makeLLMResponse(ADVISOR_NARRATIVE))
        .mockResolvedValueOnce(makeLLMResponse(ADVISOR_NARRATIVE)),
    };
    setLLMAdapter(adapter);

    // Metrics mode returns 0 rows (only one run — no double-run)
    mockExecuteCompiledQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0, executionTimeMs: 5, truncated: false });

    // SQL generation fails
    mockGenerateSql.mockRejectedValueOnce(new Error('LLM timeout'));

    const result = await runPipeline({
      message: 'orders last week',
      context: mockContext,
    });

    // Falls back to metrics result (with ADVISOR narrative since 0 rows)
    expect(result.mode).toBe('metrics');
    expect(result.data).not.toBeNull();
    expect(result.data!.rowCount).toBe(0);
    // SQL fallback was attempted but failed gracefully
    expect(mockGenerateSql).toHaveBeenCalledTimes(1);
  });

  it('does NOT fall back to SQL when metrics returns data', async () => {
    const adapter: LLMAdapter = {
      provider: 'mock',
      model: 'mock-model',
      complete: mockLLMComplete
        .mockResolvedValueOnce(makeLLMResponse(VALID_PLAN_JSON))
        .mockResolvedValueOnce(makeLLMResponse(NARRATIVE_JSON)),
    };
    setLLMAdapter(adapter);

    // Metrics returns real data — no fallback needed
    mockExecuteCompiledQuery.mockResolvedValueOnce(mockQueryResult);

    const result = await runPipeline({
      message: 'net sales last month',
      context: mockContext,
    });

    expect(result.mode).toBe('metrics');
    expect(result.data!.rowCount).toBe(2);
    // SQL generation should NOT be called
    expect(mockGenerateSql).not.toHaveBeenCalled();
  });
});

// ── Tests: ExecutionError types ───────────────────────────────────

describe('ExecutionError', () => {
  it('has the correct code and name', () => {
    const err = new ExecutionError('timed out', 'QUERY_TIMEOUT');
    expect(err.code).toBe('QUERY_TIMEOUT');
    expect(err.name).toBe('ExecutionError');
    expect(err.message).toBe('timed out');
  });

  it('query error code is set correctly', () => {
    const err = new ExecutionError('bad SQL', 'QUERY_ERROR');
    expect(err.code).toBe('QUERY_ERROR');
  });
});
