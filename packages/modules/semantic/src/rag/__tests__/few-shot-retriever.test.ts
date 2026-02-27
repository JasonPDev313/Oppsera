import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────

const { mockFindSimilar, mockIncrementUsageCounts } = vi.hoisted(() => ({
  mockFindSimilar: vi.fn(),
  mockIncrementUsageCounts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../training-store', () => ({
  findSimilar: mockFindSimilar,
  incrementUsageCounts: mockIncrementUsageCounts,
}));

import { retrieveFewShotExamples, formatAsPromptExamples } from '../few-shot-retriever';
import type { SimilarTrainingPair } from '../training-store';

// ── Helpers ────────────────────────────────────────────────────

function makePair(overrides: Partial<SimilarTrainingPair> = {}): SimilarTrainingPair {
  return {
    id: 'pair_001',
    question: 'How were sales yesterday?',
    compiledSql: 'SELECT SUM(net_sales) FROM rm_daily_sales',
    plan: { metrics: ['net_sales'], intent: 'report' },
    mode: 'metrics',
    qualityScore: 0.85,
    similarity: 0.75,
    compositeScore: 0.70,
    usageCount: 5,
    createdAt: new Date('2026-02-20'),
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────

describe('retrieveFewShotExamples', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindSimilar.mockResolvedValue([]);
  });

  it('returns empty string when no similar pairs found', async () => {
    const result = await retrieveFewShotExamples('test', 'tenant_001');
    expect(result).toBe('');
  });

  it('returns formatted examples when pairs found', async () => {
    mockFindSimilar.mockResolvedValue([makePair()]);
    const result = await retrieveFewShotExamples('sales', 'tenant_001');
    expect(result).toContain('Similar Past Queries');
    expect(result).toContain('sales yesterday');
  });

  it('filters by minimum similarity', async () => {
    mockFindSimilar.mockResolvedValue([
      makePair({ similarity: 0.4, compositeScore: 0.5 }),
      makePair({ id: 'pair_002', similarity: 0.2, compositeScore: 0.3 }),
    ]);

    const result = await retrieveFewShotExamples('sales', 'tenant_001', {
      minSimilarity: 0.3,
    });

    // Only the 0.4 similarity pair should pass
    expect(result).toContain('sales yesterday');
    expect(result).not.toContain('pair_002');
  });

  it('filters by mode preference', async () => {
    mockFindSimilar.mockResolvedValue([
      makePair({ id: 'pair_metrics', mode: 'metrics', compositeScore: 0.9 }),
      makePair({ id: 'pair_sql', mode: 'sql', question: 'Show vendors', compositeScore: 0.8 }),
    ]);

    const result = await retrieveFewShotExamples('vendors', 'tenant_001', {
      includeMetricsMode: false,
      includeSqlMode: true,
    });

    expect(result).toContain('Show vendors');
  });

  it('sorts by composite score when enabled', async () => {
    mockFindSimilar.mockResolvedValue([
      makePair({ id: 'p1', question: 'Q1', similarity: 0.9, compositeScore: 0.6 }),
      makePair({ id: 'p2', question: 'Q2', similarity: 0.5, compositeScore: 0.8 }),
    ]);

    const result = await retrieveFewShotExamples('test', 'tenant_001', { maxExamples: 2 });

    // Q2 (higher composite) should appear first
    const q2Pos = result.indexOf('Q2');
    const q1Pos = result.indexOf('Q1');
    expect(q2Pos).toBeLessThan(q1Pos);
  });

  it('applies diversity filter to remove near-duplicate questions', async () => {
    mockFindSimilar.mockResolvedValue([
      makePair({ id: 'p1', question: 'How were sales yesterday?', compositeScore: 0.9 }),
      makePair({ id: 'p2', question: 'How were sales yesterday at Main Street?', compositeScore: 0.85 }),
      makePair({ id: 'p3', question: 'What are top items by revenue?', compositeScore: 0.7 }),
    ]);

    const result = await retrieveFewShotExamples('sales', 'tenant_001', {
      maxExamples: 2,
      diversityThreshold: 0.5, // strict threshold — the two sales questions have ~57% token overlap
    });

    // Should pick p1 and p3 (diverse), skipping p2 (too similar to p1)
    expect(result).toContain('sales yesterday');
    expect(result).toContain('top items by revenue');
  });

  it('increments usage counts fire-and-forget', async () => {
    mockFindSimilar.mockResolvedValue([makePair()]);
    await retrieveFewShotExamples('sales', 'tenant_001');
    expect(mockIncrementUsageCounts).toHaveBeenCalledWith(['pair_001']);
  });

  it('does not throw when incrementUsageCounts fails', async () => {
    mockFindSimilar.mockResolvedValue([makePair()]);
    mockIncrementUsageCounts.mockRejectedValueOnce(new Error('DB error'));

    // Should not throw
    const result = await retrieveFewShotExamples('sales', 'tenant_001');
    expect(result).toContain('Similar Past Queries');
  });

  it('limits results to maxExamples', async () => {
    mockFindSimilar.mockResolvedValue([
      makePair({ id: 'p1', question: 'Q1', compositeScore: 0.9 }),
      makePair({ id: 'p2', question: 'Q2 different', compositeScore: 0.8 }),
      makePair({ id: 'p3', question: 'Q3 another', compositeScore: 0.7 }),
    ]);

    const result = await retrieveFewShotExamples('test', 'tenant_001', { maxExamples: 2 });

    // Count "Past Query" occurrences
    const matches = result.match(/Past Query/g);
    expect(matches?.length).toBe(2);
  });
});

describe('formatAsPromptExamples', () => {
  it('returns empty string for empty array', () => {
    expect(formatAsPromptExamples([])).toBe('');
  });

  it('includes question, mode, plan, SQL, and quality score', () => {
    const result = formatAsPromptExamples([makePair()]);
    expect(result).toContain('Similar Past Queries');
    expect(result).toContain('sales yesterday');
    expect(result).toContain('Mode: metrics');
    expect(result).toContain('Plan:');
    expect(result).toContain('net_sales');
    expect(result).toContain('SQL:');
    expect(result).toContain('Quality Score: 0.85');
  });

  it('shows similarity percentage', () => {
    const result = formatAsPromptExamples([makePair({ similarity: 0.82 })]);
    expect(result).toContain('82% similar');
  });

  it('omits plan section when null', () => {
    const result = formatAsPromptExamples([makePair({ plan: null })]);
    expect(result).not.toContain('Plan:');
  });

  it('omits SQL when null', () => {
    const result = formatAsPromptExamples([makePair({ compiledSql: null })]);
    expect(result).not.toContain('SQL:');
  });

  it('omits quality score when null', () => {
    const result = formatAsPromptExamples([makePair({ qualityScore: null })]);
    expect(result).not.toContain('Quality Score');
  });

  it('numbers multiple examples', () => {
    const result = formatAsPromptExamples([
      makePair({ id: 'p1', question: 'Q1' }),
      makePair({ id: 'p2', question: 'Q2' }),
    ]);
    expect(result).toContain('Past Query 1');
    expect(result).toContain('Past Query 2');
  });
});
