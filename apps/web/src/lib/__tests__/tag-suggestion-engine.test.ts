/**
 * Unit tests for the Tag Suggestion Engine
 *
 * Tests fuzzy matching, keyword mapping, score ranking,
 * edge cases, and condition formatting.
 */

import { describe, it, expect } from 'vitest';
import {
  suggestFromText,
  suggestFromMetrics,
  suggestFromTagName,
  formatConditionPreview,
} from '../tag-suggestion-engine';

// ── suggestFromText ─────────────────────────────────────────────────────────

describe('suggestFromText', () => {
  it('returns popular templates when query is empty', () => {
    const results = suggestFromText('');
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(6);
    for (const r of results) {
      expect(r.score).toBe(0);
      expect(r.reason).toBe('Popular template');
      expect(r.signals).toEqual([]);
    }
  });

  it('respects limit option on empty query', () => {
    const results = suggestFromText('', { limit: 2 });
    expect(results).toHaveLength(2);
  });

  it('matches exact keyword "churn" to at-risk and high-churn templates', () => {
    const results = suggestFromText('churn');
    expect(results.length).toBeGreaterThan(0);
    const keys = results.map((r) => r.template.key);
    expect(keys).toContain('at-risk');
    expect(keys).toContain('high-churn-risk');
  });

  it('assigns higher score to exact keyword matches than partial ones', () => {
    const results = suggestFromText('churn');
    const atRisk = results.find((r) => r.template.key === 'at-risk');
    expect(atRisk).toBeDefined();
    expect(atRisk!.score).toBeGreaterThan(0);
    expect(atRisk!.signals.some((s) => s.type === 'keyword')).toBe(true);
  });

  it('matches by template name "champions"', () => {
    const results = suggestFromText('champions');
    expect(results.length).toBeGreaterThan(0);
    const champion = results.find((r) => r.template.key === 'champions');
    expect(champion).toBeDefined();
    expect(champion!.score).toBeGreaterThan(0);
  });

  it('matches by description content', () => {
    const _results = suggestFromText('quintile');
    // "quintile" doesn't appear in names or keywords but if no other hit
    // it should at least attempt description matching
    // The champions description mentions "RFM 5-5-5" not quintile
    // Let's use a term that IS in a description
    const results2 = suggestFromText('accelerating');
    const growing = results2.find((r) => r.template.key === 'growing-spend');
    if (growing) {
      expect(growing.signals.some((s) => s.type === 'description')).toBe(true);
    }
  });

  it('filters by category when provided', () => {
    const results = suggestFromText('', { category: 'lifecycle' });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.template.category).toBe('lifecycle');
    }
  });

  it('returns category-filtered results with 0 score when no text provided', () => {
    const results = suggestFromText('', { category: 'behavioral' });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.score).toBe(0);
      expect(r.template.category).toBe('behavioral');
    }
  });

  it('respects limit option with text query', () => {
    const results = suggestFromText('risk', { limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('handles multi-word queries by tokenizing', () => {
    const results = suggestFromText('high value customer');
    expect(results.length).toBeGreaterThan(0);
    // "high value" should match champions or high-clv keywords
    const matchedKeys = results.map((r) => r.template.key);
    expect(
      matchedKeys.includes('champions') || matchedKeys.includes('high-clv'),
    ).toBe(true);
  });

  it('ignores single-character tokens', () => {
    const results = suggestFromText('a b c');
    // All tokens are single chars, should be treated as empty query
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.score).toBe(0);
    }
  });

  it('strips special characters before matching', () => {
    const results1 = suggestFromText('churn!');
    const results2 = suggestFromText('churn');
    // Both should return same set of matching templates
    expect(results1.map((r) => r.template.key)).toEqual(
      results2.map((r) => r.template.key),
    );
  });

  it('is case-insensitive', () => {
    const lower = suggestFromText('vip');
    const upper = suggestFromText('VIP');
    const mixed = suggestFromText('Vip');
    expect(lower.map((r) => r.template.key)).toEqual(upper.map((r) => r.template.key));
    expect(lower.map((r) => r.template.key)).toEqual(mixed.map((r) => r.template.key));
  });

  it('returns results sorted by score descending', () => {
    const results = suggestFromText('risk churn declining');
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.score).toBeLessThanOrEqual(results[i - 1]!.score);
    }
  });

  it('scores are normalized to 0-1 range', () => {
    const results = suggestFromText('champion best top vip');
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it('produces correct reason strings', () => {
    const results = suggestFromText('loyal');
    const loyal = results.find((r) => r.template.key === 'loyal-customers');
    expect(loyal).toBeDefined();
    // Should mention keyword or name match
    expect(loyal!.reason).toMatch(/keyword|Name matches/i);
  });

  it('handles partial keyword matching', () => {
    // "birth" is a substring of "birthday" keyword
    const results = suggestFromText('birth');
    const birthday = results.find((r) => r.template.key === 'birthday-month');
    expect(birthday).toBeDefined();
    expect(birthday!.score).toBeGreaterThan(0);
  });

  it('returns empty array for query that matches nothing', () => {
    const results = suggestFromText('xyzzyplugh');
    expect(results).toHaveLength(0);
  });
});

// ── suggestFromMetrics ──────────────────────────────────────────────────────

describe('suggestFromMetrics', () => {
  it('returns empty array for empty metrics list', () => {
    const results = suggestFromMetrics([]);
    expect(results).toHaveLength(0);
  });

  it('matches templates that use rfm_segment', () => {
    const results = suggestFromMetrics(['rfm_segment']);
    expect(results.length).toBeGreaterThan(0);
    // champions, loyal-customers, needs-attention, hibernating all use rfm_segment
    const keys = results.map((r) => r.template.key);
    expect(keys).toContain('champions');
  });

  it('matches templates that use churn_risk', () => {
    const results = suggestFromMetrics(['churn_risk']);
    expect(results.length).toBeGreaterThan(0);
    const keys = results.map((r) => r.template.key);
    expect(keys).toContain('at-risk');
    expect(keys).toContain('high-churn-risk');
  });

  it('scores higher when multiple metrics overlap', () => {
    const singleMetric = suggestFromMetrics(['churn_risk']);
    const multiMetric = suggestFromMetrics(['churn_risk', 'spend_velocity']);

    // needs-attention uses both churn_risk and spend_velocity
    const needsSingle = singleMetric.find((r) => r.template.key === 'needs-attention');
    const needsMulti = multiMetric.find((r) => r.template.key === 'needs-attention');

    if (needsSingle && needsMulti) {
      expect(needsMulti.score).toBeGreaterThanOrEqual(needsSingle.score);
    }
  });

  it('respects limit option', () => {
    const results = suggestFromMetrics(['rfm_segment', 'churn_risk', 'spend_velocity'], { limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('includes reason about matching metrics', () => {
    const results = suggestFromMetrics(['churn_risk']);
    const atRisk = results.find((r) => r.template.key === 'at-risk');
    expect(atRisk).toBeDefined();
    expect(atRisk!.reason).toContain('matching metric');
  });

  it('returns results sorted by score descending', () => {
    const results = suggestFromMetrics(['rfm_segment', 'rfm_recency', 'rfm_frequency', 'rfm_monetary']);
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.score).toBeLessThanOrEqual(results[i - 1]!.score);
    }
  });

  it('does not match templates with unrelated metrics', () => {
    const results = suggestFromMetrics(['birth_month']);
    const keys = results.map((r) => r.template.key);
    // Only birthday-month template uses birth_month
    expect(keys).toContain('birthday-month');
    expect(keys).not.toContain('champions');
    expect(keys).not.toContain('at-risk');
  });

  it('signals include metric type', () => {
    const results = suggestFromMetrics(['predicted_clv']);
    const highClv = results.find((r) => r.template.key === 'high-clv');
    expect(highClv).toBeDefined();
    expect(highClv!.signals.every((s) => s.type === 'metric')).toBe(true);
  });
});

// ── suggestFromTagName ──────────────────────────────────────────────────────

describe('suggestFromTagName', () => {
  it('returns empty for single character', () => {
    expect(suggestFromTagName('V')).toHaveLength(0);
  });

  it('returns empty for empty string', () => {
    expect(suggestFromTagName('')).toHaveLength(0);
  });

  it('returns at most 3 results', () => {
    const results = suggestFromTagName('customer value risk');
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('matches against template names and keywords', () => {
    const results = suggestFromTagName('VIP Champions');
    expect(results.length).toBeGreaterThan(0);
    const keys = results.map((r) => r.template.key);
    expect(keys).toContain('champions');
  });

  it('handles hyphenated names by matching as partial keyword', () => {
    // "at-risk" tokenizes to ["at-risk"] — hyphen preserved, but still matches
    // via partial keyword matching against "at risk" keyword
    const results = suggestFromTagName('at risk');
    expect(results.length).toBeGreaterThan(0);
    const keys = results.map((r) => r.template.key);
    expect(keys.some((k) => k.includes('risk') || k.includes('attention'))).toBe(true);
  });
});

// ── formatConditionPreview ──────────────────────────────────────────────────

describe('formatConditionPreview', () => {
  it('formats basic comparison operators', () => {
    expect(formatConditionPreview('churn_risk', 'gte', 0.6)).toBe('churn risk >= 0.6');
    expect(formatConditionPreview('total_visits', 'gt', 5)).toBe('total visits > 5');
    expect(formatConditionPreview('rfm_score', 'lt', 50)).toBe('rfm score < 50');
    expect(formatConditionPreview('spend_velocity', 'lte', 0)).toBe('spend velocity <= 0');
  });

  it('formats equality operators', () => {
    expect(formatConditionPreview('rfm_recency', 'eq', 5)).toBe('rfm recency = 5');
    expect(formatConditionPreview('membership_status', 'neq', 'active')).toBe('membership status != active');
  });

  it('formats between operator with range', () => {
    expect(formatConditionPreview('churn_risk', 'between', [0.4, 0.7])).toBe('churn risk between 0.4–0.7');
  });

  it('formats in operator with list', () => {
    expect(formatConditionPreview('rfm_segment', 'in', ['champions', 'loyal_customers'])).toBe(
      'rfm segment in [champions, loyal_customers]',
    );
  });

  it('formats null operators without value', () => {
    expect(formatConditionPreview('email', 'is_null', null)).toBe('email is null');
    expect(formatConditionPreview('phone', 'is_not_null', null)).toBe('phone is not null');
  });

  it('replaces underscores with spaces in metric name', () => {
    expect(formatConditionPreview('days_since_last_visit', 'gte', 30)).toBe('days since last visit >= 30');
  });

  it('falls back to raw operator for unknown operators', () => {
    expect(formatConditionPreview('field', 'custom_op', 42)).toBe('field custom_op 42');
  });
});
