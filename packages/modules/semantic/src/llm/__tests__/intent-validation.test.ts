import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────

const { mockLLMComplete: _mockLLMComplete } = vi.hoisted(() => ({
  mockLLMComplete: vi.fn(),
}));

vi.mock('@oppsera/db', () => ({
  db: { transaction: vi.fn(), execute: vi.fn() },
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ _tag: 'SQL', strings, values }),
    { raw: (s: string) => ({ _tag: 'SQL_RAW', raw: s }) },
  ),
}));

vi.mock('../../registry/registry', () => ({
  buildRegistryCatalog: vi.fn().mockReturnValue({ metrics: [], dimensions: [], lenses: [], generatedAt: '' }),
  getLens: vi.fn().mockReturnValue(null),
  validatePlan: vi.fn(),
}));

vi.mock('../../cache/query-cache', () => ({
  getFromQueryCache: vi.fn().mockReturnValue(null),
  setInQueryCache: vi.fn(),
}));

vi.mock('../../observability/metrics', () => ({
  recordSemanticRequest: vi.fn(),
}));

vi.mock('../../rag/few-shot-retriever', () => ({
  retrieveFewShotExamples: vi.fn().mockResolvedValue({ examples: [], snippet: '' }),
}));

vi.mock('../adapters/anthropic', () => ({
  getLLMAdapter: vi.fn(),
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
}));

vi.mock('../conversation-pruner', () => ({
  pruneForIntentResolver: vi.fn().mockReturnValue([]),
}));

// ── Imports ───────────────────────────────────────────────────────

import { resolveIntent } from '../intent-resolver';
import type { LLMAdapter, LLMResponse, IntentContext } from '../types';
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

// ── Tests: SEM-01 Zod Schema Validation ──────────────────────────

describe('SEM-01: Intent Resolver Zod Validation', () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Valid outputs ──────────────────────────────────────────────

  describe('valid LLM outputs', () => {
    it('parses a complete valid response', async () => {
      const json = JSON.stringify({
        mode: 'metrics',
        plan: {
          metrics: ['net_sales'],
          dimensions: ['date'],
          filters: [],
          dateRange: { start: '2026-01-01', end: '2026-01-31' },
          timeGranularity: 'day',
          intent: 'Show sales by day',
          rationale: 'User wants daily trend',
        },
        confidence: 0.92,
        clarificationNeeded: false,
        clarificationMessage: null,
      });

      const adapter = makeMockAdapter(json);
      const result = await resolveIntent('sales by day', mockContext, {
        catalog: mockCatalog,
        adapter,
      });

      expect(result.mode).toBe('metrics');
      expect(result.confidence).toBe(0.92);
      expect(result.isClarification).toBe(false);
      expect(result.plan.metrics).toEqual(['net_sales']);
      expect(result.plan.dimensions).toEqual(['date']);
    });

    it('parses SQL mode response', async () => {
      const json = JSON.stringify({
        mode: 'sql',
        plan: {
          metrics: [],
          dimensions: [],
          filters: [],
          intent: 'List all vendors',
          rationale: 'Operational query — needs direct table access',
        },
        confidence: 0.85,
        clarificationNeeded: false,
      });

      const adapter = makeMockAdapter(json);
      const result = await resolveIntent('show me vendors', mockContext, {
        catalog: mockCatalog,
        adapter,
      });

      expect(result.mode).toBe('sql');
      expect(result.confidence).toBe(0.85);
    });

    it('handles clarification response', async () => {
      const json = JSON.stringify({
        plan: null,
        confidence: 0.2,
        clarificationNeeded: true,
        clarificationMessage: 'Which location?',
        clarificationOptions: ['All locations', 'Main Street', 'Downtown'],
      });

      const adapter = makeMockAdapter(json);
      const result = await resolveIntent('show sales', mockContext, {
        catalog: mockCatalog,
        adapter,
      });

      expect(result.isClarification).toBe(true);
      expect(result.clarificationText).toBe('Which location?');
      expect(result.clarificationOptions).toEqual(['All locations', 'Main Street', 'Downtown']);
    });

    it('strips markdown fences before parsing', async () => {
      const json = JSON.stringify({
        mode: 'metrics',
        plan: { metrics: ['net_sales'], dimensions: [], filters: [] },
        confidence: 0.9,
        clarificationNeeded: false,
      });

      const adapter = makeMockAdapter(`\`\`\`json\n${json}\n\`\`\``);
      const result = await resolveIntent('net sales', mockContext, {
        catalog: mockCatalog,
        adapter,
      });

      expect(result.plan.metrics).toEqual(['net_sales']);
    });

    it('extracts JSON from prose wrapper', async () => {
      const json = JSON.stringify({
        mode: 'metrics',
        plan: { metrics: ['net_sales'], dimensions: [], filters: [] },
        confidence: 0.8,
        clarificationNeeded: false,
      });

      const adapter = makeMockAdapter(`Here is the result:\n${json}\nLet me know if you need more.`);
      const result = await resolveIntent('net sales', mockContext, {
        catalog: mockCatalog,
        adapter,
      });

      expect(result.plan.metrics).toEqual(['net_sales']);
    });
  });

  // ── Zod defaults and coercion ─────────────────────────────────

  describe('defaults and coercion', () => {
    it('defaults mode to "metrics" when not provided', async () => {
      const json = JSON.stringify({
        plan: { metrics: ['net_sales'], dimensions: [], filters: [] },
        confidence: 0.9,
        clarificationNeeded: false,
      });

      const adapter = makeMockAdapter(json);
      const result = await resolveIntent('net sales', mockContext, {
        catalog: mockCatalog,
        adapter,
      });

      expect(result.mode).toBe('metrics');
    });

    it('clamps confidence above 1.0 to 1.0', async () => {
      const json = JSON.stringify({
        plan: { metrics: ['net_sales'], dimensions: [], filters: [] },
        confidence: 1.5,
        clarificationNeeded: false,
      });

      const adapter = makeMockAdapter(json);
      const result = await resolveIntent('net sales', mockContext, {
        catalog: mockCatalog,
        adapter,
      });

      expect(result.confidence).toBe(1.0);
    });

    it('clamps confidence below 0 to 0', async () => {
      const json = JSON.stringify({
        plan: { metrics: [], dimensions: [], filters: [] },
        confidence: -0.5,
        clarificationNeeded: false,
      });

      const adapter = makeMockAdapter(json);
      const result = await resolveIntent('something', mockContext, {
        catalog: mockCatalog,
        adapter,
      });

      expect(result.confidence).toBe(0);
    });

    it('coerces string confidence to number', async () => {
      const json = JSON.stringify({
        plan: { metrics: ['net_sales'], dimensions: [], filters: [] },
        confidence: '0.75',
        clarificationNeeded: false,
      });

      const adapter = makeMockAdapter(json);
      const result = await resolveIntent('net sales', mockContext, {
        catalog: mockCatalog,
        adapter,
      });

      expect(result.confidence).toBe(0.75);
    });

    it('defaults empty plan arrays when not provided', async () => {
      const json = JSON.stringify({
        plan: { intent: 'Something' },
        confidence: 0.5,
        clarificationNeeded: false,
      });

      const adapter = makeMockAdapter(json);
      const result = await resolveIntent('something', mockContext, {
        catalog: mockCatalog,
        adapter,
      });

      expect(result.plan.metrics).toEqual([]);
      expect(result.plan.dimensions).toEqual([]);
      expect(result.plan.filters).toEqual([]);
    });

    it('defaults clarificationMessage to null when missing', async () => {
      const json = JSON.stringify({
        plan: null,
        confidence: 0.2,
        clarificationNeeded: true,
      });

      const adapter = makeMockAdapter(json);
      const result = await resolveIntent('ambiguous', mockContext, {
        catalog: mockCatalog,
        adapter,
      });

      expect(result.isClarification).toBe(true);
      // Zod defaults to null, but resolveIntent maps null → undefined via ?? undefined
      expect(result.clarificationText).toBeUndefined();
    });
  });

  // ── Filters with various operators ────────────────────────────

  describe('filter parsing', () => {
    it('parses eq filter correctly', async () => {
      const json = JSON.stringify({
        plan: {
          metrics: ['net_sales'],
          dimensions: ['date'],
          filters: [{ dimensionSlug: 'location', operator: 'eq', value: 'main_street' }],
          dateRange: { start: '2026-01-01', end: '2026-01-31' },
        },
        confidence: 0.9,
        clarificationNeeded: false,
      });

      const adapter = makeMockAdapter(json);
      const result = await resolveIntent('sales at main street', mockContext, {
        catalog: mockCatalog,
        adapter,
      });

      expect(result.plan.filters).toHaveLength(1);
      expect(result.plan.filters![0]!.dimensionSlug).toBe('location');
      expect(result.plan.filters![0]!.operator).toBe('eq');
    });

    it('parses in filter with values array', async () => {
      const json = JSON.stringify({
        plan: {
          metrics: ['net_sales'],
          dimensions: [],
          filters: [{ dimensionSlug: 'category', operator: 'in', values: ['food', 'beverage'] }],
        },
        confidence: 0.8,
        clarificationNeeded: false,
      });

      const adapter = makeMockAdapter(json);
      const result = await resolveIntent('sales for food and beverage', mockContext, {
        catalog: mockCatalog,
        adapter,
      });

      expect(result.plan.filters![0]!.operator).toBe('in');
    });

    it('parses between filter with range values', async () => {
      const json = JSON.stringify({
        plan: {
          metrics: ['net_sales'],
          dimensions: [],
          filters: [{ dimensionSlug: 'amount', operator: 'between', rangeStart: 100, rangeEnd: 500 }],
        },
        confidence: 0.7,
        clarificationNeeded: false,
      });

      const adapter = makeMockAdapter(json);
      const result = await resolveIntent('sales between 100 and 500', mockContext, {
        catalog: mockCatalog,
        adapter,
      });

      expect(result.plan.filters).toHaveLength(1);
    });
  });

  // ── Sort parsing ──────────────────────────────────────────────

  describe('sort parsing', () => {
    it('parses sort with default direction', async () => {
      const json = JSON.stringify({
        plan: {
          metrics: ['net_sales'],
          dimensions: [],
          filters: [],
          sort: [{ metricSlug: 'net_sales' }],
        },
        confidence: 0.9,
        clarificationNeeded: false,
      });

      const adapter = makeMockAdapter(json);
      const result = await resolveIntent('top sales', mockContext, {
        catalog: mockCatalog,
        adapter,
      });

      expect(result.plan.sort).toHaveLength(1);
      expect(result.plan.sort![0]!.direction).toBe('desc'); // default from Zod
    });
  });

  // ── Error handling ────────────────────────────────────────────

  describe('error handling', () => {
    it('throws LLMError for pure prose (no JSON)', async () => {
      const adapter = makeMockAdapter('I cannot help with that request.');

      await expect(
        resolveIntent('what is the weather', mockContext, { catalog: mockCatalog, adapter }),
      ).rejects.toThrow();
    });

    it('throws LLMError for missing required field (clarificationNeeded)', async () => {
      const json = JSON.stringify({
        plan: { metrics: [], dimensions: [], filters: [] },
        confidence: 0.5,
        // missing clarificationNeeded — required by schema
      });

      const adapter = makeMockAdapter(json);

      await expect(
        resolveIntent('something', mockContext, { catalog: mockCatalog, adapter }),
      ).rejects.toThrow();
    });

    it('throws LLMError for invalid JSON', async () => {
      const adapter = makeMockAdapter('{ broken json }}}');

      await expect(
        resolveIntent('sales', mockContext, { catalog: mockCatalog, adapter }),
      ).rejects.toThrow();
    });
  });

  // ── Plan edge cases ───────────────────────────────────────────

  describe('plan edge cases', () => {
    it('handles null plan for clarification', async () => {
      const json = JSON.stringify({
        plan: null,
        confidence: 0.1,
        clarificationNeeded: true,
        clarificationMessage: 'Please be more specific.',
      });

      const adapter = makeMockAdapter(json);
      const result = await resolveIntent('help', mockContext, {
        catalog: mockCatalog,
        adapter,
      });

      expect(result.isClarification).toBe(true);
      // Plan should be empty defaults for clarifications
      expect(result.plan.metrics).toEqual([]);
    });

    it('handles extra fields in plan gracefully (Zod strip)', async () => {
      const json = JSON.stringify({
        plan: {
          metrics: ['net_sales'],
          dimensions: [],
          filters: [],
          unknownField: 'should be ignored',
          anotherExtra: 42,
        },
        confidence: 0.9,
        clarificationNeeded: false,
      });

      const adapter = makeMockAdapter(json);
      const result = await resolveIntent('net sales', mockContext, {
        catalog: mockCatalog,
        adapter,
      });

      // Should parse without error — extra fields are stripped
      expect(result.plan.metrics).toEqual(['net_sales']);
    });

    it('preserves clarificationOptions (max 5)', async () => {
      const json = JSON.stringify({
        plan: null,
        confidence: 0.2,
        clarificationNeeded: true,
        clarificationMessage: 'Which metric?',
        clarificationOptions: ['Sales', 'Revenue', 'Profit', 'Cost', 'Margin'],
      });

      const adapter = makeMockAdapter(json);
      const result = await resolveIntent('show me data', mockContext, {
        catalog: mockCatalog,
        adapter,
      });

      expect(result.clarificationOptions).toHaveLength(5);
    });
  });
});
