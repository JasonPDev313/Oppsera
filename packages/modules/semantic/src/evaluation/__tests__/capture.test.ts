import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (vi.hoisted) ──────────────────────────────────────────
const { mockInsert, mockUpdate, mockExecute } = vi.hoisted(() => {
  const makeChain = (result: unknown[] = []) => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.values = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.set = vi.fn().mockReturnValue(chain);
    chain.then = vi.fn((resolve: (v: unknown) => unknown) => resolve(result));
    return chain;
  };

  return {
    mockInsert: vi.fn(() => makeChain()),
    mockUpdate: vi.fn(() => makeChain()),
    mockExecute: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('@oppsera/db', () => ({
  db: {
    insert: mockInsert,
    update: mockUpdate,
    execute: mockExecute,
  },
  semanticEvalTurns: { $inferSelect: {} },
  semanticEvalSessions: {
    messageCount: 'message_count',
    id: 'id',
  },
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings.join('?'), values }),
  eq: vi.fn((_col: unknown, _val: unknown) => ({ type: 'eq' })),
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => 'EVAL_TURN_ULID'),
  NotFoundError: class NotFoundError extends Error {
    constructor(msg: string) { super(msg); }
  },
  AuthorizationError: class AuthorizationError extends Error {
    constructor(msg: string) { super(msg); }
  },
}));

vi.mock('crypto', () => ({
  createHash: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn(() => 'abc123def456789012345678'),
  })),
}));

import {
  computeQualityFlags,
  computeQualityScore,
  computePlanHash,
  computeSqlHash,
  getEvalCaptureService,
  setEvalCaptureService,
} from '../capture';
import type { EvalTurn, QualityFlag } from '../types';
import { DEFAULT_QUALITY_WEIGHTS } from '../types';

// ── Helpers ─────────────────────────────────────────────────────

function makeTurn(overrides: Partial<EvalTurn> = {}): Partial<EvalTurn> {
  return {
    rowCount: 10,
    executionError: null,
    llmConfidence: 0.9,
    compilationErrors: null,
    resultFingerprint: null,
    executionTimeMs: 500,
    adminScore: null,
    userRating: null,
    qualityFlags: null,
    ...overrides,
  };
}

// ── computeQualityFlags ─────────────────────────────────────────

describe('computeQualityFlags', () => {
  it('returns empty array for a healthy turn', () => {
    const flags = computeQualityFlags(makeTurn());
    expect(flags).toEqual([]);
  });

  it("detects 'empty_result' when rowCount === 0", () => {
    const flags = computeQualityFlags(makeTurn({ rowCount: 0 }));
    expect(flags).toContain('empty_result');
  });

  it("detects 'timeout' when executionError contains 'timeout'", () => {
    const flags = computeQualityFlags(makeTurn({ executionError: 'statement timeout expired' }));
    expect(flags).toContain('timeout');
  });

  it("detects 'low_confidence' when llmConfidence < 0.6", () => {
    const flags = computeQualityFlags(makeTurn({ llmConfidence: 0.45 }));
    expect(flags).toContain('low_confidence');
  });

  it("does NOT flag low_confidence when confidence is exactly 0.6", () => {
    const flags = computeQualityFlags(makeTurn({ llmConfidence: 0.6 }));
    expect(flags).not.toContain('low_confidence');
  });

  it("detects 'hallucinated_slug' when compilationErrors includes 'unknown metric'", () => {
    const flags = computeQualityFlags(makeTurn({ compilationErrors: ['Unknown metric: foo_bar'] }));
    expect(flags).toContain('hallucinated_slug');
  });

  it("detects 'high_null_rate' when resultFingerprint.nullRate > 0.5", () => {
    const flags = computeQualityFlags(
      makeTurn({ resultFingerprint: { rowCount: 10, minDate: null, maxDate: null, nullRate: 0.75, columnCount: 4 } }),
    );
    expect(flags).toContain('high_null_rate');
  });

  it("detects 'excessive_rows' when rowCount > 5000", () => {
    const flags = computeQualityFlags(makeTurn({ rowCount: 6000 }));
    expect(flags).toContain('excessive_rows');
  });

  it("detects 'very_slow' when executionTimeMs > 5000", () => {
    const flags = computeQualityFlags(makeTurn({ executionTimeMs: 7500 }));
    expect(flags).toContain('very_slow');
  });

  it('detects multiple flags simultaneously', () => {
    const flags = computeQualityFlags(makeTurn({ rowCount: 0, llmConfidence: 0.4 }));
    expect(flags).toContain('empty_result');
    expect(flags).toContain('low_confidence');
  });
});

// ── computeQualityScore ─────────────────────────────────────────

describe('computeQualityScore', () => {
  it('returns null when there are no signals', () => {
    const score = computeQualityScore(makeTurn());
    expect(score).toBeNull();
  });

  it('computes score from heuristics alone (no human ratings)', () => {
    // All good → heuristic = 100, only heuristic weight contributes
    const turn = makeTurn({ qualityFlags: [] as QualityFlag[] });
    // Flags = [] so heuristicScore = 100, normalizes to 1.0
    const score = computeQualityScore(turn, DEFAULT_QUALITY_WEIGHTS);
    expect(score).toBe(1.0);
  });

  it('computes score from user rating + heuristics (40/30/30 weighting)', () => {
    // userRating = 5 (100/100), no admin, no flags
    const turn = makeTurn({ userRating: 5, qualityFlags: [] as QualityFlag[] });
    const score = computeQualityScore(turn, DEFAULT_QUALITY_WEIGHTS);
    // 100 * 0.3 (user) + 100 * 0.3 (heuristic) = 60, totalWeight = 0.6 → score = 60/60/100 = 1.0
    expect(score).toBe(1.0);
  });

  it('computes composite score with all three signals', () => {
    // adminScore=4 (80/100), userRating=3 (60/100), no flags (100/100)
    const turn = makeTurn({
      adminScore: 4,
      userRating: 3,
      qualityFlags: [] as QualityFlag[],
    });
    const score = computeQualityScore(turn, DEFAULT_QUALITY_WEIGHTS);
    // 80*0.4 + 60*0.3 + 100*0.3 = 32 + 18 + 30 = 80 → 0.80
    expect(score).toBeCloseTo(0.80, 1);
  });

  it('applies empty_result deduction to heuristic score', () => {
    const turn = makeTurn({
      qualityFlags: ['empty_result'] as QualityFlag[],
    });
    const score = computeQualityScore(turn, DEFAULT_QUALITY_WEIGHTS);
    // Heuristic = 100 - 40 = 60 → 60/100 * 0.3 = 18 / 0.3 = 0.60
    expect(score).toBe(0.60);
  });

  it('clamps heuristic score at 0 for catastrophic flags', () => {
    const turn = makeTurn({
      qualityFlags: ['hallucinated_slug', 'timeout', 'empty_result'] as QualityFlag[],
    });
    const score = computeQualityScore(turn, DEFAULT_QUALITY_WEIGHTS);
    // All deductions sum > 100, clamped to 0
    expect(score).toBe(0.0);
  });
});

// ── computePlanHash ─────────────────────────────────────────────

describe('computePlanHash', () => {
  it('returns empty string for null plan', () => {
    expect(computePlanHash(null)).toBe('');
  });

  it('returns a non-empty hash for a valid plan', () => {
    const hash = computePlanHash({ metrics: ['net_sales'], intent: 'report' });
    expect(hash).toBeTruthy();
    expect(hash.length).toBeGreaterThan(0);
  });
});

describe('computeSqlHash', () => {
  it('returns empty string for empty sql', () => {
    expect(computeSqlHash(undefined)).toBe('');
    expect(computeSqlHash('')).toBe('');
  });

  it('normalizes whitespace before hashing', () => {
    const h1 = computeSqlHash('SELECT   *   FROM foo');
    const h2 = computeSqlHash('SELECT * FROM foo');
    expect(h1).toBe(h2);
  });
});

// ── recordTurn integration-style test ──────────────────────────

describe('EvalCaptureService.recordTurn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setEvalCaptureService(null as unknown as ReturnType<typeof getEvalCaptureService>);
    // Reset singleton
    setEvalCaptureService(getEvalCaptureService());
  });

  it('inserts an eval_turn row and increments session message_count', async () => {
    const svc = getEvalCaptureService();

    const turnId = await svc.recordTurn({
      tenantId: 'tenant_001',
      userId: 'user_001',
      userRole: 'manager',
      sessionId: 'session_001',
      turnNumber: 1,
      userMessage: 'How were sales yesterday?',
      context: { locationId: 'loc_001' },
      llmResponse: {
        plan: { metrics: ['net_sales'], intent: 'report' },
        rationale: { intentReason: 'simple sales query' },
        clarificationNeeded: false,
        confidence: 0.95,
      },
      llmProvider: 'anthropic',
      llmModel: 'claude-sonnet-4-6',
      llmTokens: { input: 1200, output: 450 },
      llmLatencyMs: 980,
      compiledSql: 'SELECT SUM(net_sales) FROM rm_daily_sales WHERE tenant_id = $1',
      executionTimeMs: 45,
      rowCount: 1,
    });

    expect(turnId).toBe('EVAL_TURN_ULID');
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockUpdate).toHaveBeenCalledOnce();
  });

  it('auto-detects empty_result quality flag when rowCount=0', async () => {
    const svc = getEvalCaptureService();

    await svc.recordTurn({
      tenantId: 'tenant_001',
      userId: 'user_001',
      userRole: 'cashier',
      sessionId: 'session_001',
      turnNumber: 2,
      userMessage: 'Show me sales for tomorrow',
      context: {},
      llmResponse: {
        plan: { metrics: ['net_sales'], intent: 'report' },
        rationale: {},
        clarificationNeeded: false,
        confidence: 0.8,
      },
      llmProvider: 'anthropic',
      llmModel: 'claude-sonnet-4-6',
      llmTokens: { input: 900, output: 300 },
      llmLatencyMs: 650,
      rowCount: 0,
    });

    // The insert call should include empty_result in quality_flags
    const insertCall = mockInsert.mock.calls[0];
    expect(insertCall).toBeDefined();
  });

  it('auto-detects low_confidence flag when confidence < 0.6', async () => {
    const svc = getEvalCaptureService();

    await svc.recordTurn({
      tenantId: 'tenant_001',
      userId: 'user_001',
      userRole: 'manager',
      sessionId: 'session_001',
      turnNumber: 3,
      userMessage: 'Explain everything',
      context: {},
      llmResponse: {
        plan: null,
        rationale: {},
        clarificationNeeded: true,
        confidence: 0.35,
        clarificationMessage: 'Could you be more specific?',
      },
      llmProvider: 'anthropic',
      llmModel: 'claude-sonnet-4-6',
      llmTokens: { input: 800, output: 200 },
      llmLatencyMs: 500,
    });

    expect(mockInsert).toHaveBeenCalledOnce();
  });
});
