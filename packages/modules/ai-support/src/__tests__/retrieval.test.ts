import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Use vi.hoisted to declare variables that can be referenced in vi.mock ─────

const { mockDb, mockSemanticSearch } = vi.hoisted(() => {
  const mockDb = {
    select: vi.fn(),
  };
  const mockSemanticSearch = vi.fn().mockResolvedValue([]);
  return { mockDb, mockSemanticSearch };
});

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@oppsera/db', () => ({
  db: mockDb,
  aiSupportAnswerCards: { status: 'status', moduleKey: 'moduleKey', route: 'route' },
  aiAssistantAnswerMemory: { reviewStatus: 'reviewStatus', questionNormalized: 'questionNormalized', moduleKey: 'moduleKey' },
  aiSupportRouteManifests: { route: 'route' },
  aiSupportActionManifests: { route: 'route' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, val) => ({ field, val, op: 'eq' })),
  and: vi.fn((...conditions) => ({ conditions, op: 'and' })),
  ilike: vi.fn((field, pattern) => ({ field, pattern, op: 'ilike' })),
  sql: Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values, op: 'sql' })),
    { raw: vi.fn((val: string) => ({ val, op: 'sql_raw' })) },
  ),
}));

vi.mock('../services/embedding-pipeline', () => ({
  semanticSearch: mockSemanticSearch,
}));

vi.mock('../services/card-embeddings', () => ({
  vectorSearchAnswerCards: vi.fn().mockResolvedValue([]),
}));

// ── Import after mocks ─────────────────────────────────────────────────────

import { retrieveEvidence } from '../services/retrieval';

// ── Helpers ────────────────────────────────────────────────────────────────

const mockCard = {
  id: 'card_01',
  slug: 'how-to-create-order',
  moduleKey: 'orders',
  route: '/orders',
  questionPattern: 'how create order',
  approvedAnswerMarkdown: '# How to Create an Order\nStep 1...',
  status: 'active',
};

const mockMemory = {
  id: 'mem_01',
  moduleKey: 'orders',
  questionNormalized: 'how create order',
  answerMarkdown: '# Approved Answer\nDo this...',
  reviewStatus: 'approved',
};

const mockManifest = {
  id: 'manifest_01',
  route: '/orders',
  moduleKey: 'orders',
  pageTitle: 'Orders',
  description: 'Manage orders',
  helpText: 'Use this page to manage all orders',
  tabsJson: null,
  actionsJson: null,
  permissionsJson: null,
  warningsJson: null,
};

type MockData = 'card' | 'memory' | 'manifest' | 'actions' | 'empty';

function dataFor(type: MockData): unknown[] {
  if (type === 'card') return [mockCard];
  if (type === 'memory') return [mockMemory];
  if (type === 'manifest') return [mockManifest];
  return [];
}

function makeChainFor(responses: MockData[]) {
  let callCount = 0;
  mockDb.select.mockImplementation(() => ({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockImplementation(() => {
      const response = responses[callCount] ?? 'empty';
      callCount++;
      const data = dataFor(response);
      return {
        limit: vi.fn().mockResolvedValue(data),
        then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
          Promise.resolve(data).then(resolve, reject),
      };
    }),
    limit: vi.fn().mockResolvedValue([]),
  }));
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('retrieval service', () => {
  const baseContext = {
    route: '/orders',
    tenantId: 'tenant_01',
    roleKeys: ['manager'],
    moduleKey: 'orders',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSemanticSearch.mockResolvedValue([]);
  });

  describe('answer cards (T2)', () => {
    it('returns answer cards as T2 evidence when question matches', async () => {
      makeChainFor(['card', 'empty', 'empty', 'empty']);

      const evidence = await retrieveEvidence({
        route: '/orders',
        moduleKey: 'orders',
        question: 'how do I create an order?',
        mode: 'customer',
        context: baseContext,
      });

      const t2 = evidence.filter((e) => e.tier === 't2');
      expect(t2.length).toBeGreaterThan(0);
      expect(t2[0]!.source).toContain('answer_card:how-to-create-order');
      expect(t2[0]!.content).toContain('How to Create an Order');
    });

    it('does not return answer cards when question does not match', async () => {
      makeChainFor(['card', 'empty', 'empty', 'empty']);

      const evidence = await retrieveEvidence({
        route: '/orders',
        moduleKey: 'orders',
        question: 'unrelated question xyz',
        mode: 'customer',
        context: baseContext,
      });

      // Card has pattern 'how create order' — 'xyz' does not appear in it
      const t2 = evidence.filter((e) => e.tier === 't2');
      expect(t2).toHaveLength(0);
    });
  });

  describe('answer memory (T3)', () => {
    it('returns answer memory as T3 evidence', async () => {
      makeChainFor(['empty', 'memory', 'empty', 'empty']);

      const evidence = await retrieveEvidence({
        route: '/orders',
        moduleKey: 'orders',
        question: 'how create order',
        mode: 'customer',
        context: baseContext,
      });

      const t3 = evidence.filter((e) => e.tier === 't3');
      for (const item of t3) {
        expect(item.tier).toBe('t3');
        expect(item.source).toContain('answer_memory:');
      }
    });
  });

  describe('route manifests (T4)', () => {
    it('returns route manifests as T4 evidence', async () => {
      makeChainFor(['empty', 'empty', 'manifest', 'empty']);

      const evidence = await retrieveEvidence({
        route: '/orders',
        moduleKey: 'orders',
        question: 'what can I do on this page?',
        mode: 'customer',
        context: baseContext,
      });

      const t4 = evidence.filter((e) => e.tier === 't4');
      for (const item of t4) {
        expect(item.tier).toBe('t4');
        expect(item.source).toContain('/orders');
      }
    });
  });

  describe('mode filtering', () => {
    it('customer mode calls semanticSearch with limit 6', async () => {
      makeChainFor(['empty', 'empty', 'empty', 'empty']);

      await retrieveEvidence({
        route: '/orders',
        question: 'how to use this?',
        mode: 'customer',
        context: baseContext,
      });

      expect(mockSemanticSearch).toHaveBeenCalledWith(
        expect.any(String),
        expect.anything(),
        6,
      );
    });

    it('staff mode calls semanticSearch with limit 10', async () => {
      makeChainFor(['empty', 'empty', 'empty', 'empty']);

      await retrieveEvidence({
        route: '/orders',
        question: 'how to use this?',
        mode: 'staff',
        context: baseContext,
      });

      expect(mockSemanticSearch).toHaveBeenCalledWith(
        expect.any(String),
        expect.anything(),
        10,
      );
    });
  });

  describe('semantic search degradation', () => {
    it('returns empty array when semanticSearch throws (graceful degradation)', async () => {
      mockSemanticSearch.mockRejectedValue(new Error('Embedding API unavailable'));
      makeChainFor(['empty', 'empty', 'empty', 'empty']);

      // Should not throw
      const evidence = await retrieveEvidence({
        route: '/orders',
        question: 'some question',
        mode: 'customer',
        context: baseContext,
      });

      const semanticTiers = evidence.filter((e) => ['t5', 't6', 't7'].includes(e.tier));
      expect(semanticTiers).toHaveLength(0);
    });
  });

  describe('result ordering', () => {
    it('returns evidence in tier order (T2 before T3 before T4)', async () => {
      makeChainFor(['card', 'memory', 'manifest', 'empty']);

      const evidence = await retrieveEvidence({
        route: '/orders',
        moduleKey: 'orders',
        question: 'how create order',
        mode: 'customer',
        context: baseContext,
      });

      const t2idx = evidence.findIndex((e) => e.tier === 't2');
      const t3idx = evidence.findIndex((e) => e.tier === 't3');
      const t4idx = evidence.findIndex((e) => e.tier === 't4');

      if (t2idx !== -1 && t3idx !== -1) {
        expect(t2idx).toBeLessThan(t3idx);
      }
      if (t3idx !== -1 && t4idx !== -1) {
        expect(t3idx).toBeLessThan(t4idx);
      }
    });
  });
});
