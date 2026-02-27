import { describe, it, expect } from 'vitest';
import {
  buildTagEvidenceSnapshot,
  buildManualTagEvidence,
  computeConfidence,
  renderEvidenceTemplate,
} from '../services/tag-evidence-builder';
import type { SmartTagEvidence } from '../types/smart-tag-conditions';

// ═══════════════════════════════════════════════════════════════════
// Evidence Builder Tests
// ═══════════════════════════════════════════════════════════════════

describe('Tag Evidence Builder', () => {
  // ── computeConfidence ──────────────────────────────────────────

  describe('computeConfidence', () => {
    it('returns 1.0 for empty conditions', () => {
      expect(computeConfidence([])).toBe(1.0);
    });

    it('returns 0 when no conditions passed', () => {
      const conditions: SmartTagEvidence['conditions'] = [
        { metric: 'total_visits', operator: 'gt', threshold: 10, actualValue: 5, passed: false },
        { metric: 'total_spend_cents', operator: 'gt', threshold: 5000, actualValue: 2000, passed: false },
      ];
      expect(computeConfidence(conditions)).toBe(0);
    });

    it('computes base score as ratio of passed conditions', () => {
      const conditions: SmartTagEvidence['conditions'] = [
        { metric: 'total_visits', operator: 'eq', threshold: 'Champions', actualValue: 'Champions', passed: true },
        { metric: 'churn_risk', operator: 'eq', threshold: 'low', actualValue: 'low', passed: true },
        { metric: 'rfm_segment', operator: 'eq', threshold: 'Gold', actualValue: 'Silver', passed: false },
      ];
      // 2/3 passed, eq margin = 1.0 each
      // blended = 0.667 * 0.7 + 1.0 * 0.3 = 0.4669 + 0.3 = 0.7669
      const confidence = computeConfidence(conditions);
      expect(confidence).toBeGreaterThan(0.5);
      expect(confidence).toBeLessThanOrEqual(1.0);
    });

    it('gives higher confidence for conditions exceeding thresholds', () => {
      // Condition far exceeds threshold
      const high: SmartTagEvidence['conditions'] = [
        { metric: 'total_visits', operator: 'gt', threshold: 10, actualValue: 100, passed: true },
      ];
      // Condition barely passes
      const low: SmartTagEvidence['conditions'] = [
        { metric: 'total_visits', operator: 'gt', threshold: 10, actualValue: 11, passed: true },
      ];
      const highConf = computeConfidence(high);
      const lowConf = computeConfidence(low);
      expect(highConf).toBeGreaterThan(lowConf);
    });

    it('handles mixed pass/fail conditions', () => {
      const conditions: SmartTagEvidence['conditions'] = [
        { metric: 'total_visits', operator: 'gt', threshold: 5, actualValue: 20, passed: true },
        { metric: 'total_spend_cents', operator: 'gt', threshold: 10000, actualValue: 3000, passed: false },
      ];
      const confidence = computeConfidence(conditions);
      // 1/2 passed
      expect(confidence).toBeGreaterThan(0);
      expect(confidence).toBeLessThan(1.0);
    });

    it('handles lt operator margin', () => {
      const conditions: SmartTagEvidence['conditions'] = [
        { metric: 'churn_risk', operator: 'lt', threshold: 0.5, actualValue: 0.1, passed: true },
      ];
      const confidence = computeConfidence(conditions);
      expect(confidence).toBeGreaterThan(0.7);
    });

    it('handles non-numeric values gracefully', () => {
      const conditions: SmartTagEvidence['conditions'] = [
        { metric: 'rfm_segment', operator: 'in', threshold: ['Champions', 'Loyal'], actualValue: 'Champions', passed: true },
      ];
      // 'in' operator returns null margin, so falls back to base score
      const confidence = computeConfidence(conditions);
      expect(confidence).toBe(1); // All passed, no margin data
    });
  });

  // ── renderEvidenceTemplate ──────────────────────────────────────

  describe('renderEvidenceTemplate', () => {
    const conditions: SmartTagEvidence['conditions'] = [
      { metric: 'total_visits', operator: 'gt', threshold: 10, actualValue: 25, passed: true },
      { metric: 'total_spend_cents', operator: 'gt', threshold: 5000, actualValue: 12000, passed: true },
    ];

    it('returns null for null template', () => {
      expect(renderEvidenceTemplate(null, conditions)).toBeNull();
    });

    it('substitutes value placeholders', () => {
      const template = 'Visits: {{value:total_visits}}';
      const result = renderEvidenceTemplate(template, conditions);
      expect(result).toContain('25');
    });

    it('substitutes threshold placeholders', () => {
      const template = 'Min visits: {{threshold:total_visits}}';
      const result = renderEvidenceTemplate(template, conditions);
      expect(result).toContain('10');
    });

    it('substitutes operator placeholders', () => {
      const template = 'Operator: {{operator:total_visits}}';
      const result = renderEvidenceTemplate(template, conditions);
      expect(result).toBe('Operator: gt');
    });

    it('substitutes passed placeholders', () => {
      const template = 'Passed: {{passed:total_visits}}';
      const result = renderEvidenceTemplate(template, conditions);
      expect(result).toBe('Passed: yes');
    });

    it('handles unknown metric gracefully', () => {
      const template = 'Unknown: {{value:nonexistent}}';
      const result = renderEvidenceTemplate(template, conditions);
      expect(result).toContain('[unknown:nonexistent]');
    });

    it('handles multiple substitutions', () => {
      const template = 'Customer visited {{value:total_visits}} times (min: {{threshold:total_visits}}) and spent {{value:total_spend_cents}}';
      const result = renderEvidenceTemplate(template, conditions);
      expect(result).toContain('25');
      expect(result).toContain('10');
      expect(result).toContain('12,000'); // toLocaleString formats numbers
    });

    it('handles array threshold values', () => {
      const arrayConditions: SmartTagEvidence['conditions'] = [
        { metric: 'rfm_segment', operator: 'in', threshold: ['Champions', 'Loyal'], actualValue: 'Champions', passed: true },
      ];
      const template = 'Allowed segments: {{threshold:rfm_segment}}';
      const result = renderEvidenceTemplate(template, arrayConditions);
      expect(result).toContain('Champions, Loyal');
    });

    it('handles null actualValue', () => {
      const nullConditions: SmartTagEvidence['conditions'] = [
        { metric: 'churn_risk', operator: 'is_null', threshold: null, actualValue: null, passed: true },
      ];
      const template = 'Value: {{value:churn_risk}}';
      const result = renderEvidenceTemplate(template, nullConditions);
      expect(result).toBe('Value: N/A');
    });
  });

  // ── buildTagEvidenceSnapshot ────────────────────────────────────

  describe('buildTagEvidenceSnapshot', () => {
    const evidence: SmartTagEvidence = {
      ruleId: 'rule-1',
      ruleName: 'VIP Rule',
      evaluatedAt: '2026-01-15T12:00:00.000Z',
      conditions: [
        { metric: 'total_visits', operator: 'gt', threshold: 10, actualValue: 25, passed: true },
      ],
    };

    it('builds snapshot with default source', () => {
      const snapshot = buildTagEvidenceSnapshot(evidence);
      expect(snapshot.ruleId).toBe('rule-1');
      expect(snapshot.ruleName).toBe('VIP Rule');
      expect(snapshot.source).toBe('smart_rule');
      expect(snapshot.confidence).toBeGreaterThan(0);
      expect(snapshot.summary).toBeNull(); // No template
    });

    it('builds snapshot with custom source', () => {
      const snapshot = buildTagEvidenceSnapshot(evidence, { source: 'predictive' });
      expect(snapshot.source).toBe('predictive');
    });

    it('renders evidence template', () => {
      const snapshot = buildTagEvidenceSnapshot(evidence, {
        evidenceTemplate: 'Visits: {{value:total_visits}}',
      });
      expect(snapshot.summary).toContain('25');
    });

    it('includes metadata when provided', () => {
      const snapshot = buildTagEvidenceSnapshot(evidence, {
        metadata: { batchId: 'batch-1' },
      });
      expect(snapshot.metadata).toEqual({ batchId: 'batch-1' });
    });

    it('omits metadata when not provided', () => {
      const snapshot = buildTagEvidenceSnapshot(evidence);
      expect(snapshot.metadata).toBeUndefined();
    });
  });

  // ── buildManualTagEvidence ──────────────────────────────────────

  describe('buildManualTagEvidence', () => {
    it('builds evidence for manual tag application', () => {
      const evidence = buildManualTagEvidence('user-123', 'Customer requested');
      expect(evidence.source).toBe('manual');
      expect(evidence.confidence).toBe(1.0);
      expect(evidence.summary).toBe('Customer requested');
      expect(evidence.conditions).toHaveLength(0);
      expect(evidence.metadata).toEqual({ appliedBy: 'user-123' });
    });

    it('uses default summary when no reason provided', () => {
      const evidence = buildManualTagEvidence('user-123');
      expect(evidence.summary).toBe('Manually applied');
    });

    it('has valid evaluatedAt timestamp', () => {
      const before = new Date().toISOString();
      const evidence = buildManualTagEvidence('user-123');
      const after = new Date().toISOString();
      expect(evidence.evaluatedAt >= before).toBe(true);
      expect(evidence.evaluatedAt <= after).toBe(true);
    });
  });
});
