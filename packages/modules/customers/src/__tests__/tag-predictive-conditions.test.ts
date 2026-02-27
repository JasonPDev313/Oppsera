import { describe, it, expect } from 'vitest';
import {
  METRIC_DEFINITIONS,
  type ConditionMetric,
  type SmartTagCondition,
  type SmartTagConditionGroup,
} from '../types/smart-tag-conditions';
import {
  evaluateCondition,
  evaluateConditionGroup,
  evaluateAllGroups,
  extractNeededMetrics,
} from '../services/smart-tag-evaluator';

// ═══════════════════════════════════════════════════════════════════
// Predictive Intelligence Condition Tests
//
// Tests the evaluator with predictive metrics (RFM, churn, CLV,
// spend velocity, predicted visit) and complex multi-group rules.
// ═══════════════════════════════════════════════════════════════════

describe('Predictive Intelligence Conditions', () => {
  // ── METRIC_DEFINITIONS registry ─────────────────────────────────

  describe('METRIC_DEFINITIONS', () => {
    it('has 9 predictive metrics', () => {
      const predictive = METRIC_DEFINITIONS.filter((m) => m.category === 'predictive');
      expect(predictive.length).toBe(9);
    });

    it('all predictive metrics have descriptions', () => {
      const predictive = METRIC_DEFINITIONS.filter((m) => m.category === 'predictive');
      for (const m of predictive) {
        expect(m.description).toBeTruthy();
      }
    });

    it('all metric keys are unique', () => {
      const keys = METRIC_DEFINITIONS.map((m) => m.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('has all 8 metric categories', () => {
      const categories = new Set(METRIC_DEFINITIONS.map((m) => m.category));
      expect(categories).toEqual(
        new Set(['visits', 'spending', 'lifecycle', 'membership', 'financial', 'demographic', 'operational', 'predictive']),
      );
    });

    const predictiveKeys: ConditionMetric[] = [
      'rfm_segment',
      'rfm_score',
      'rfm_recency',
      'rfm_frequency',
      'rfm_monetary',
      'churn_risk',
      'predicted_clv',
      'spend_velocity',
      'days_until_predicted_visit',
    ];

    it.each(predictiveKeys)('includes predictive metric: %s', (key) => {
      const found = METRIC_DEFINITIONS.find((m) => m.key === key);
      expect(found).toBeDefined();
      expect(found!.category).toBe('predictive');
    });
  });

  // ── RFM Score Conditions ─────────────────────────────────────────

  describe('RFM score conditions', () => {
    it('matches Champions with high RFM score (>= 12)', () => {
      expect(evaluateCondition(15, 'gte', 12)).toBe(true);
      expect(evaluateCondition(12, 'gte', 12)).toBe(true);
      expect(evaluateCondition(11, 'gte', 12)).toBe(false);
    });

    it('matches RFM segment by string equality', () => {
      expect(evaluateCondition('Champions', 'eq', 'Champions')).toBe(true);
      expect(evaluateCondition('At Risk', 'eq', 'Champions')).toBe(false);
    });

    it('matches RFM segment with in operator', () => {
      expect(evaluateCondition('Champions', 'in', ['Champions', 'Loyal'])).toBe(true);
      expect(evaluateCondition('At Risk', 'in', ['Champions', 'Loyal'])).toBe(false);
    });

    it('matches RFM recency quintile', () => {
      expect(evaluateCondition(5, 'gte', 4)).toBe(true); // Top quintile
      expect(evaluateCondition(1, 'lte', 2)).toBe(true);  // Bottom quintiles
    });

    it('matches RFM score between range', () => {
      expect(evaluateCondition(10, 'between', [8, 12])).toBe(true);
      expect(evaluateCondition(5, 'between', [8, 12])).toBe(false);
    });
  });

  // ── Churn Risk Conditions ────────────────────────────────────────

  describe('Churn risk conditions', () => {
    it('identifies high churn risk (> 0.7)', () => {
      expect(evaluateCondition(0.85, 'gt', 0.7)).toBe(true);
      expect(evaluateCondition(0.5, 'gt', 0.7)).toBe(false);
    });

    it('identifies low churn risk (< 0.2)', () => {
      expect(evaluateCondition(0.05, 'lt', 0.2)).toBe(true);
      expect(evaluateCondition(0.3, 'lt', 0.2)).toBe(false);
    });

    it('uses between for moderate risk band', () => {
      expect(evaluateCondition(0.4, 'between', [0.3, 0.7])).toBe(true);
      expect(evaluateCondition(0.8, 'between', [0.3, 0.7])).toBe(false);
    });
  });

  // ── CLV Conditions ───────────────────────────────────────────────

  describe('CLV conditions', () => {
    it('identifies high CLV customers (> $5,000)', () => {
      expect(evaluateCondition(8000, 'gt', 5000)).toBe(true);
      expect(evaluateCondition(3000, 'gt', 5000)).toBe(false);
    });

    it('identifies low CLV customers (< $500)', () => {
      expect(evaluateCondition(200, 'lt', 500)).toBe(true);
    });

    it('uses between for mid-tier CLV', () => {
      expect(evaluateCondition(2500, 'between', [1000, 5000])).toBe(true);
    });
  });

  // ── Spend Velocity Conditions ────────────────────────────────────

  describe('Spend velocity conditions', () => {
    it('identifies growing customers (positive velocity)', () => {
      expect(evaluateCondition(0.5, 'gt', 0)).toBe(true);
      expect(evaluateCondition(-0.3, 'gt', 0)).toBe(false);
    });

    it('identifies declining customers (negative velocity)', () => {
      expect(evaluateCondition(-0.4, 'lt', 0)).toBe(true);
      expect(evaluateCondition(0.1, 'lt', 0)).toBe(false);
    });

    it('identifies rapidly growing customers', () => {
      expect(evaluateCondition(0.8, 'gte', 0.5)).toBe(true);
    });
  });

  // ── Predicted Visit Conditions ───────────────────────────────────

  describe('Predicted visit conditions', () => {
    it('identifies overdue visits (0 or less days)', () => {
      expect(evaluateCondition(0, 'lte', 0)).toBe(true);
    });

    it('identifies imminent visits (within 3 days)', () => {
      expect(evaluateCondition(2, 'lte', 3)).toBe(true);
      expect(evaluateCondition(5, 'lte', 3)).toBe(false);
    });

    it('identifies distant predicted visits', () => {
      expect(evaluateCondition(30, 'gt', 14)).toBe(true);
    });
  });

  // ── Complex Multi-Group Rules ────────────────────────────────────

  describe('Complex multi-group rules with predictive metrics', () => {
    it('Champions rule: high RFM AND low churn AND high CLV', () => {
      const conditions: SmartTagCondition[] = [
        { metric: 'rfm_score', operator: 'gte', value: 12 },
        { metric: 'churn_risk', operator: 'lt', value: 0.2 },
        { metric: 'predicted_clv', operator: 'gt', value: 5000 },
      ];

      const metrics = new Map<string, unknown>([
        ['rfm_score', 15],
        ['churn_risk', 0.05],
        ['predicted_clv', 8000],
      ]);

      const result = evaluateConditionGroup(conditions, metrics);
      expect(result.passed).toBe(true);
      expect(result.details).toHaveLength(3);
      expect(result.details.every((c) => c.passed)).toBe(true);
    });

    it('At Risk rule: declining spend OR high churn', () => {
      const groups: SmartTagConditionGroup[] = [
        {
          conditions: [
            { metric: 'spend_velocity', operator: 'lt', value: -0.3 },
            { metric: 'days_since_last_visit', operator: 'gt', value: 60 },
          ],
        },
        {
          conditions: [
            { metric: 'churn_risk', operator: 'gt', value: 0.7 },
          ],
        },
      ];

      // Customer has high churn (second group passes)
      const metrics = new Map<string, unknown>([
        ['spend_velocity', 0.1], // Positive (first group fails)
        ['days_since_last_visit', 10],
        ['churn_risk', 0.85], // High (second group passes)
      ]);

      const result = evaluateAllGroups(groups, metrics);
      expect(result.passed).toBe(true);
    });

    it('Win-back rule: lapsed customer with high CLV potential', () => {
      const groups: SmartTagConditionGroup[] = [
        {
          conditions: [
            { metric: 'days_since_last_visit', operator: 'gt', value: 90 },
            { metric: 'predicted_clv', operator: 'gt', value: 2000 },
            { metric: 'rfm_recency', operator: 'lte', value: 2 }, // Low recency
          ],
        },
      ];

      const metrics = new Map<string, unknown>([
        ['days_since_last_visit', 120],
        ['predicted_clv', 3500],
        ['rfm_recency', 1],
      ]);

      const result = evaluateAllGroups(groups, metrics);
      expect(result.passed).toBe(true);
    });

    it('fails when metrics are missing', () => {
      const conditions: SmartTagCondition[] = [
        { metric: 'rfm_score', operator: 'gte', value: 12 },
        { metric: 'churn_risk', operator: 'lt', value: 0.2 },
      ];

      // Only has rfm_score, missing churn_risk
      const metrics = new Map<string, unknown>([
        ['rfm_score', 15],
      ]);

      const result = evaluateConditionGroup(conditions, metrics);
      // Missing metric → condition fails → AND group fails
      expect(result.passed).toBe(false);
    });
  });

  // ── extractNeededMetrics ─────────────────────────────────────────

  describe('extractNeededMetrics for predictive rules', () => {
    it('extracts unique predictive metrics from groups', () => {
      const groups: SmartTagConditionGroup[] = [
        {
          conditions: [
            { metric: 'rfm_score', operator: 'gte', value: 12 },
            { metric: 'churn_risk', operator: 'lt', value: 0.2 },
          ],
        },
        {
          conditions: [
            { metric: 'rfm_score', operator: 'gte', value: 10 }, // Duplicate
            { metric: 'predicted_clv', operator: 'gt', value: 5000 },
          ],
        },
      ];

      const metrics = extractNeededMetrics(groups);
      expect(metrics.has('rfm_score')).toBe(true);
      expect(metrics.has('churn_risk')).toBe(true);
      expect(metrics.has('predicted_clv')).toBe(true);
      // Should be deduplicated (Set guarantees uniqueness)
      expect([...metrics].filter((m) => m === 'rfm_score')).toHaveLength(1);
    });

    it('extracts all 9 predictive metric types', () => {
      const groups: SmartTagConditionGroup[] = [
        {
          conditions: [
            { metric: 'rfm_segment', operator: 'eq', value: 'Champions' },
            { metric: 'rfm_score', operator: 'gte', value: 12 },
            { metric: 'rfm_recency', operator: 'gte', value: 4 },
            { metric: 'rfm_frequency', operator: 'gte', value: 4 },
            { metric: 'rfm_monetary', operator: 'gte', value: 4 },
            { metric: 'churn_risk', operator: 'lt', value: 0.2 },
            { metric: 'predicted_clv', operator: 'gt', value: 5000 },
            { metric: 'spend_velocity', operator: 'gt', value: 0 },
            { metric: 'days_until_predicted_visit', operator: 'lte', value: 7 },
          ],
        },
      ];

      const metrics = extractNeededMetrics(groups);
      expect(metrics.size).toBe(9);
    });
  });

  // ── Edge Cases ───────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('handles zero churn risk', () => {
      expect(evaluateCondition(0, 'lt', 0.1)).toBe(true);
      expect(evaluateCondition(0, 'eq', 0)).toBe(true);
    });

    it('handles negative spend velocity', () => {
      expect(evaluateCondition(-1.0, 'lt', -0.5)).toBe(true);
      expect(evaluateCondition(-0.3, 'between', [-0.5, 0.5])).toBe(true);
    });

    it('handles max RFM scores', () => {
      expect(evaluateCondition(125, 'eq', 125)).toBe(true);
      expect(evaluateCondition(5, 'eq', 5)).toBe(true);
    });

    it('handles null predictive values (missing scores)', () => {
      expect(evaluateCondition(null, 'gt', 10)).toBe(false);
      expect(evaluateCondition(undefined, 'gte', 0.5)).toBe(false);
      expect(evaluateCondition(null, 'is_null', null)).toBe(true);
    });

    it('handles string RFM segment with neq', () => {
      expect(evaluateCondition('Champions', 'neq', 'At Risk')).toBe(true);
      expect(evaluateCondition('At Risk', 'neq', 'At Risk')).toBe(false);
    });

    it('handles not_in for RFM segments', () => {
      expect(evaluateCondition('Champions', 'not_in', ['At Risk', 'Hibernating'])).toBe(true);
      expect(evaluateCondition('At Risk', 'not_in', ['At Risk', 'Hibernating'])).toBe(false);
    });
  });
});
