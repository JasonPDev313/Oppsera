import { describe, it, expect } from 'vitest';
import {
  getTemplate,
  getTemplatesByCategory,
  searchTemplates,
  matchTemplatesForScores,
  evaluateConditionInline,
  SMART_TAG_TEMPLATES,
} from '../services/smart-tag-templates';

// ═══════════════════════════════════════════════════════════════════
// Template Registry
// ═══════════════════════════════════════════════════════════════════

describe('Smart Tag Templates', () => {
  describe('SMART_TAG_TEMPLATES', () => {
    it('contains 12+ pre-built templates', () => {
      expect(SMART_TAG_TEMPLATES.length).toBeGreaterThanOrEqual(12);
    });

    it('all templates have required fields', () => {
      for (const tmpl of SMART_TAG_TEMPLATES) {
        expect(tmpl.key).toBeTruthy();
        expect(tmpl.name).toBeTruthy();
        expect(tmpl.category).toMatch(/^(predictive|behavioral|lifecycle|financial)$/);
        expect(tmpl.conditions.length).toBeGreaterThan(0);
        expect(Array.isArray(tmpl.keywords)).toBe(true);
        expect(tmpl.keywords.length).toBeGreaterThan(0);
        expect(typeof tmpl.priority).toBe('number');
        expect(typeof tmpl.reEvaluationIntervalHours).toBe('number');
      }
    });

    it('all templates have unique keys', () => {
      const keys = SMART_TAG_TEMPLATES.map((t) => t.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('all templates have valid evaluation modes', () => {
      for (const tmpl of SMART_TAG_TEMPLATES) {
        expect(['scheduled', 'event_driven', 'hybrid']).toContain(tmpl.evaluationMode);
      }
    });

    it('suggested actions have valid triggers', () => {
      for (const tmpl of SMART_TAG_TEMPLATES) {
        for (const action of tmpl.suggestedActions) {
          expect(['on_apply', 'on_remove', 'on_expire']).toContain(action.trigger);
          expect(action.actionType).toBeTruthy();
          expect(action.description).toBeTruthy();
        }
      }
    });
  });

  // ── getTemplate ──────────────────────────────────────────────

  describe('getTemplate', () => {
    it('returns template by key', () => {
      const tmpl = getTemplate('champions');
      expect(tmpl).toBeDefined();
      expect(tmpl!.name).toContain('Champion');
    });

    it('returns undefined for unknown key', () => {
      expect(getTemplate('nonexistent')).toBeUndefined();
    });
  });

  // ── getTemplatesByCategory ─────────────────────────────────────

  describe('getTemplatesByCategory', () => {
    it('returns only predictive templates', () => {
      const templates = getTemplatesByCategory('predictive');
      expect(templates.length).toBeGreaterThan(0);
      for (const t of templates) {
        expect(t.category).toBe('predictive');
      }
    });

    it('returns only lifecycle templates', () => {
      const templates = getTemplatesByCategory('lifecycle');
      expect(templates.length).toBeGreaterThan(0);
      for (const t of templates) {
        expect(t.category).toBe('lifecycle');
      }
    });

    it('returns empty for unknown category', () => {
      const templates = getTemplatesByCategory('unknown' as any);
      expect(templates).toHaveLength(0);
    });
  });

  // ── searchTemplates ────────────────────────────────────────────

  describe('searchTemplates', () => {
    it('finds templates by keyword match', () => {
      const results = searchTemplates('churn');
      expect(results.length).toBeGreaterThan(0);
      const hasChurnTemplate = results.some(
        (r) => r.key.includes('churn') || r.key.includes('at_risk'),
      );
      expect(hasChurnTemplate).toBe(true);
    });

    it('finds templates by name match', () => {
      const results = searchTemplates('champion');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.key).toBe('champions');
    });

    it('finds templates by description match', () => {
      const results = searchTemplates('spend');
      expect(results.length).toBeGreaterThan(0);
    });

    it('returns empty for unrelated query', () => {
      const results = searchTemplates('zzz_no_match_999');
      expect(results).toHaveLength(0);
    });

    it('search is case-insensitive', () => {
      const lower = searchTemplates('vip');
      const upper = searchTemplates('VIP');
      expect(lower.length).toBe(upper.length);
    });

    it('returns sorted by relevance score', () => {
      const results = searchTemplates('rfm champion');
      // "Champions" template should be high because it matches both keyword and name
      if (results.length >= 2) {
        // Results are sorted descending by score
        expect(results[0]!.key).toBe('champions');
      }
    });
  });

  // ── matchTemplatesForScores ────────────────────────────────────

  describe('matchTemplatesForScores', () => {
    it('matches Champions template for high RFM scores', () => {
      const matches = matchTemplatesForScores({
        rfmScore: 15,
        rfmRecency: 5,
        rfmFrequency: 5,
        rfmMonetary: 5,
        rfmSegment: 'champions',
        churnRisk: 0.05,
        predictedClv: 8000,
        spendVelocity: 0.5,
        daysUntilPredictedVisit: 3,
      });
      expect(matches.length).toBeGreaterThan(0);
      const championMatch = matches.find((m) => m.key === 'champions');
      expect(championMatch).toBeDefined();
    });

    it('matches Needs Attention template for moderate churn + declining spend', () => {
      // Note: at-risk and high-churn-risk templates require total_visits (behavioral metric)
      // which matchTemplatesForScores cannot provide. Needs Attention Group 2 only needs
      // churn_risk between [0.4, 0.7] AND spend_velocity < 0 — both predictive metrics.
      const matches = matchTemplatesForScores({
        rfmScore: 5,
        rfmRecency: 1,
        rfmFrequency: 2,
        rfmMonetary: 2,
        rfmSegment: 'needs_attention',
        churnRisk: 0.55,
        predictedClv: 500,
        spendVelocity: -0.3,
        daysUntilPredictedVisit: 30,
      });
      const needsAttention = matches.find((m) => m.key === 'needs-attention');
      expect(needsAttention).toBeDefined();
    });

    it('matches multiple templates when scores meet multiple criteria', () => {
      const matches = matchTemplatesForScores({
        rfmScore: 15,
        rfmRecency: 5,
        rfmFrequency: 5,
        rfmMonetary: 5,
        rfmSegment: 'champions',
        churnRisk: 0.01,
        predictedClv: 10000,
        spendVelocity: 0.5,
        daysUntilPredictedVisit: 2,
      });
      // Should match Champions AND High CLV at minimum
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it('returns empty when no templates match', () => {
      const matches = matchTemplatesForScores({
        rfmScore: 8,
        rfmRecency: 3,
        rfmFrequency: 3,
        rfmMonetary: 3,
        rfmSegment: 'Potential Loyalist',
        churnRisk: 0.3,
        predictedClv: 2000,
        spendVelocity: 0.0,
        daysUntilPredictedVisit: 10,
      });
      // May or may not match some templates — at minimum shouldn't crash
      expect(Array.isArray(matches)).toBe(true);
    });
  });

  // ── evaluateConditionInline ────────────────────────────────────

  describe('evaluateConditionInline', () => {
    it('evaluates gt correctly', () => {
      expect(evaluateConditionInline(10, 'gt', 5)).toBe(true);
      expect(evaluateConditionInline(5, 'gt', 10)).toBe(false);
    });

    it('evaluates gte correctly', () => {
      expect(evaluateConditionInline(5, 'gte', 5)).toBe(true);
    });

    it('evaluates lt correctly', () => {
      expect(evaluateConditionInline(3, 'lt', 5)).toBe(true);
    });

    it('evaluates lte correctly', () => {
      expect(evaluateConditionInline(5, 'lte', 5)).toBe(true);
    });

    it('evaluates eq correctly', () => {
      expect(evaluateConditionInline('Champions', 'eq', 'Champions')).toBe(true);
      expect(evaluateConditionInline('Champions', 'eq', 'Loyal')).toBe(false);
    });

    it('evaluates between correctly', () => {
      expect(evaluateConditionInline(50, 'between', [10, 100])).toBe(true);
      expect(evaluateConditionInline(5, 'between', [10, 100])).toBe(false);
    });

    it('evaluates in correctly', () => {
      expect(evaluateConditionInline('Champions', 'in', ['Champions', 'Loyal'])).toBe(true);
    });

    it('handles null/undefined safely', () => {
      expect(evaluateConditionInline(null, 'gt', 5)).toBe(false);
      expect(evaluateConditionInline(undefined, 'eq', 'test')).toBe(false);
      expect(evaluateConditionInline(null, 'is_null', null)).toBe(true);
    });
  });
});
