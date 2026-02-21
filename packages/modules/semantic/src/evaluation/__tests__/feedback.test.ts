import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (vi.hoisted) ──────────────────────────────────────────
const { mockDbSelect, mockDbUpdate, mockDbInsert, mockDbExecute, makeChain, makeTurnRow } =
  vi.hoisted(() => {
    const defaultTurnRow = {
      id: 'turn_001',
      tenantId: 'tenant_001',
      sessionId: 'session_001',
      userId: 'user_001',
      userRole: 'manager',
      userMessage: 'How were sales yesterday?',
      llmPlan: { metrics: ['net_sales'], intent: 'report' },
      llmRationale: { intentReason: 'sales query' },
      llmConfidence: '0.9',
      adminScore: null,
      userRating: null,
      qualityFlags: null,
      userThumbsUp: null,
      userFeedbackText: null,
      userFeedbackTags: null,
      userFeedbackAt: null,
      adminReviewerId: null,
      adminVerdict: null,
      adminNotes: null,
      adminCorrectedPlan: null,
      adminCorrectedNarrative: null,
      adminReviewedAt: null,
      adminActionTaken: null,
      qualityScore: null,
      rowCount: 10,
      executionError: null,
      compilationErrors: null,
      resultFingerprint: null,
      executionTimeMs: 200,
    };

    const makeTurnRow = (overrides: Record<string, unknown> = {}) => ({
      ...defaultTurnRow,
      ...overrides,
    });

    const makeChain = (result: unknown[] = []): Record<string, unknown> => {
      const chain: Record<string, unknown> = {};
      chain.from = vi.fn(() => chain);
      chain.where = vi.fn(() => chain);
      chain.limit = vi.fn(() => chain);
      chain.orderBy = vi.fn(() => chain);
      chain.set = vi.fn(() => chain);
      chain.values = vi.fn(() => chain);
      chain.then = vi.fn((resolve: (v: unknown) => unknown) => resolve(result));
      return chain;
    };

    return {
      makeTurnRow,
      makeChain,
      mockDbSelect: vi.fn(() => makeChain([])),
      mockDbUpdate: vi.fn(() => makeChain()),
      mockDbInsert: vi.fn(() => makeChain()),
      mockDbExecute: vi.fn().mockResolvedValue([{ avg_rating: '4.00' }]),
    };
  });

vi.mock('@oppsera/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    insert: mockDbInsert,
    execute: mockDbExecute,
  },
  semanticEvalTurns: {
    id: 'id',
    tenantId: 'tenant_id',
    sessionId: 'session_id',
    userId: 'user_id',
    adminReviewedAt: 'admin_reviewed_at',
    adminVerdict: 'admin_verdict',
    adminNotes: 'admin_notes',
    adminCorrectedPlan: 'admin_corrected_plan',
    adminCorrectedNarrative: 'admin_corrected_narrative',
    adminReviewerId: 'admin_reviewer_id',
    adminScore: 'admin_score',
    adminActionTaken: 'admin_action_taken',
    userRating: 'user_rating',
    userThumbsUp: 'user_thumbs_up',
    userFeedbackText: 'user_feedback_text',
    userFeedbackTags: 'user_feedback_tags',
    userFeedbackAt: 'user_feedback_at',
    qualityFlags: 'quality_flags',
    qualityScore: 'quality_score',
    updatedAt: 'updated_at',
  },
  semanticEvalSessions: {
    id: 'id',
    avgUserRating: 'avg_user_rating',
    avgAdminScore: 'avg_admin_score',
    updatedAt: 'updated_at',
  },
  semanticEvalExamples: {
    id: 'id',
    isActive: 'is_active',
    tenantId: 'tenant_id',
  },
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings.join('?'), values }),
  eq: vi.fn(() => ({ type: 'eq' })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => 'EXAMPLE_ULID'),
  NotFoundError: class NotFoundError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'NotFoundError';
    }
  },
  AuthorizationError: class AuthorizationError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'AuthorizationError';
    }
  },
}));

// Mock capture so quality-score math doesn't pull in DB / crypto deps
vi.mock('../capture', () => ({
  computeQualityFlags: vi.fn(() => []),
  computeQualityScore: vi.fn(() => 0.85),
}));

import { submitUserRating, submitAdminReview, promoteToExample } from '../feedback';

// ── submitUserRating ─────────────────────────────────────────────

describe('submitUserRating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbExecute.mockResolvedValue([{ avg_rating: '4.00' }]);
  });

  it('updates the eval turn and session rolling avg on success', async () => {
    const turnRow = makeTurnRow();
    mockDbSelect.mockReturnValueOnce(makeChain([turnRow]));

    await submitUserRating('turn_001', 'tenant_001', 'user_001', {
      rating: 4,
      thumbsUp: true,
      text: 'Good answer!',
      tags: ['great_insight'],
    });

    expect(mockDbSelect).toHaveBeenCalledOnce();
    // update turn + update session = 2 calls
    expect(mockDbUpdate).toHaveBeenCalledTimes(2);
  });

  it('throws AuthorizationError when userId does not match turn owner', async () => {
    const turnRow = makeTurnRow({ userId: 'different_user' });
    mockDbSelect.mockReturnValueOnce(makeChain([turnRow]));

    await expect(
      submitUserRating('turn_001', 'tenant_001', 'user_001', { rating: 5 }),
    ).rejects.toMatchObject({ name: 'AuthorizationError' });

    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when turn does not exist', async () => {
    mockDbSelect.mockReturnValueOnce(makeChain([]));

    await expect(
      submitUserRating('nonexistent', 'tenant_001', 'user_001', { rating: 3 }),
    ).rejects.toMatchObject({ name: 'NotFoundError' });

    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('allows rating when turn.userId is null (shared/anonymous session)', async () => {
    const turnRow = makeTurnRow({ userId: null });
    mockDbSelect.mockReturnValueOnce(makeChain([turnRow]));

    await expect(
      submitUserRating('turn_001', 'tenant_001', 'user_001', { rating: 4 }),
    ).resolves.toBeUndefined();

    expect(mockDbUpdate).toHaveBeenCalledTimes(2);
  });

  it('accepts tags-only feedback with no numeric rating', async () => {
    const turnRow = makeTurnRow({ userRating: 3 });
    mockDbSelect.mockReturnValueOnce(makeChain([turnRow]));

    await submitUserRating('turn_001', 'tenant_001', 'user_001', {
      tags: ['slow', 'wrong_data'],
    });

    expect(mockDbUpdate).toHaveBeenCalledTimes(2);
  });
});

// ── submitAdminReview ────────────────────────────────────────────

describe('submitAdminReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbExecute.mockResolvedValue([{ avg_score: '4.00' }]);
  });

  it('stores admin review fields and updates session avg admin score', async () => {
    const turnRow = makeTurnRow();
    mockDbSelect.mockReturnValueOnce(makeChain([turnRow]));

    await submitAdminReview('turn_001', 'admin_001', {
      score: 4,
      verdict: 'partially_correct',
      notes: 'Good intent but wrong metric',
      correctedPlan: { metrics: ['gross_sales'], intent: 'report' },
      correctedNarrative: 'Use gross_sales instead',
      actionTaken: 'adjusted_metric',
    });

    // update turn + update session avg
    expect(mockDbUpdate).toHaveBeenCalledTimes(2);
  });

  it('throws NotFoundError when turn does not exist', async () => {
    mockDbSelect.mockReturnValueOnce(makeChain([]));

    await expect(
      submitAdminReview('nonexistent', 'admin_001', {
        score: 3,
        verdict: 'incorrect',
        actionTaken: 'none',
      }),
    ).rejects.toMatchObject({ name: 'NotFoundError' });

    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('calls computeQualityScore after review to recompute the score', async () => {
    const { computeQualityScore } = await import('../capture');
    const turnRow = makeTurnRow();
    mockDbSelect.mockReturnValueOnce(makeChain([turnRow]));

    await submitAdminReview('turn_001', 'admin_001', {
      score: 5,
      verdict: 'correct',
      actionTaken: 'none',
    });

    expect(computeQualityScore).toHaveBeenCalledOnce();
  });

  it('works without optional fields (notes, correctedPlan, correctedNarrative)', async () => {
    const turnRow = makeTurnRow();
    mockDbSelect.mockReturnValueOnce(makeChain([turnRow]));

    await expect(
      submitAdminReview('turn_001', 'admin_001', {
        score: 2,
        verdict: 'hallucination',
        actionTaken: 'filed_bug',
      }),
    ).resolves.toBeUndefined();

    expect(mockDbUpdate).toHaveBeenCalledTimes(2);
  });
});

// ── promoteToExample ─────────────────────────────────────────────

describe('promoteToExample', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts an eval_examples row and returns the new ULID', async () => {
    const turnRow = makeTurnRow({
      llmPlan: { metrics: ['net_sales'], intent: 'report' },
      qualityScore: '0.92',
    });
    mockDbSelect.mockReturnValueOnce(makeChain([turnRow]));

    const exampleId = await promoteToExample('turn_001', 'admin_001', {
      category: 'sales',
      difficulty: 'simple',
    });

    expect(exampleId).toBe('EXAMPLE_ULID');
    expect(mockDbInsert).toHaveBeenCalledOnce();
    // marks the source turn with adminActionTaken = 'added_to_examples'
    expect(mockDbUpdate).toHaveBeenCalledOnce();
  });

  it('throws AuthorizationError when turn has no LLM plan', async () => {
    const turnRow = makeTurnRow({ llmPlan: null });
    mockDbSelect.mockReturnValueOnce(makeChain([turnRow]));

    await expect(
      promoteToExample('turn_001', 'admin_001', {
        category: 'comparison',
        difficulty: 'medium',
      }),
    ).rejects.toMatchObject({ name: 'AuthorizationError' });

    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when turn does not exist', async () => {
    mockDbSelect.mockReturnValueOnce(makeChain([]));

    await expect(
      promoteToExample('nonexistent', 'admin_001', {
        category: 'sales',
        difficulty: 'complex',
      }),
    ).rejects.toMatchObject({ name: 'NotFoundError' });

    expect(mockDbInsert).not.toHaveBeenCalled();
  });
});
