import { describe, it, expect } from 'vitest';
import { computeCompositeScore } from '../training-store';

describe('computeCompositeScore', () => {
  const now = Date.now();

  it('weights similarity at 70%', () => {
    // sim=1.0, quality=null→0.5, recency=null→0.5
    const score = computeCompositeScore(1.0, null, null, now);
    // 1.0 * 0.70 + 0.5 * 0.20 + 0.5 * 0.10 = 0.70 + 0.10 + 0.05 = 0.85
    expect(score).toBeCloseTo(0.85, 2);
  });

  it('weights quality score at 20%', () => {
    // sim=0, quality=1.0, recency=null→0.5
    const score = computeCompositeScore(0, 1.0, null, now);
    // 0 * 0.70 + 1.0 * 0.20 + 0.5 * 0.10 = 0 + 0.20 + 0.05 = 0.25
    expect(score).toBeCloseTo(0.25, 2);
  });

  it('weights recency at 10% with exponential decay', () => {
    // Just created → recency ≈ 1.0
    const justCreated = new Date(now);
    const score = computeCompositeScore(0, null, justCreated, now);
    // 0 * 0.70 + 0.5 * 0.20 + 1.0 * 0.10 = 0 + 0.10 + 0.10 = 0.20
    expect(score).toBeCloseTo(0.20, 2);
  });

  it('decays recency over 30 days to ~0.37', () => {
    const thirtyDaysAgo = new Date(now - 30 * 86_400_000);
    const score = computeCompositeScore(0, null, thirtyDaysAgo, now);
    // recency = e^(-30/30) ≈ 0.368
    // 0 + 0.5 * 0.20 + 0.368 * 0.10 ≈ 0.137
    expect(score).toBeCloseTo(0.137, 1);
  });

  it('gives perfect score for sim=1, quality=1, brand new', () => {
    const justCreated = new Date(now);
    const score = computeCompositeScore(1.0, 1.0, justCreated, now);
    // 1.0 * 0.70 + 1.0 * 0.20 + 1.0 * 0.10 = 1.0
    expect(score).toBeCloseTo(1.0, 2);
  });

  it('handles zero similarity', () => {
    const score = computeCompositeScore(0, 0, null, now);
    // 0 + 0 + 0.5 * 0.10 = 0.05
    expect(score).toBeCloseTo(0.05, 2);
  });

  it('treats null quality as 0.5 (neutral)', () => {
    const a = computeCompositeScore(0.5, null, null, now);
    const b = computeCompositeScore(0.5, 0.5, null, now);
    expect(a).toBeCloseTo(b, 4);
  });

  it('ranks high-quality older pair above low-quality recent pair', () => {
    const oldHighQuality = computeCompositeScore(0.6, 1.0, new Date(now - 60 * 86_400_000), now);
    const newLowQuality = computeCompositeScore(0.6, 0.1, new Date(now), now);
    // Both have same similarity, but quality difference (0.20 weight) should dominate recency (0.10 weight)
    expect(oldHighQuality).toBeGreaterThan(newLowQuality);
  });
});
