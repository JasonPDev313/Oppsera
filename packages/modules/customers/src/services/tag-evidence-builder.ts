/**
 * Tag Evidence Builder Service
 *
 * Builds rich evidence snapshots that explain WHY a customer was tagged.
 * Evidence is stored as JSONB on `customer_tags.evidence` and powers
 * the "Why was this customer tagged?" display in the profile drawer.
 */

import type { SmartTagEvidence } from '../types/smart-tag-conditions';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Extended evidence with confidence scoring and template rendering */
export interface TagEvidenceSnapshot {
  /** Core evidence from the rule evaluator */
  ruleId: string;
  ruleName: string;
  evaluatedAt: string;
  conditions: SmartTagEvidence['conditions'];
  /** Computed confidence (0.0 – 1.0) based on how strongly conditions passed */
  confidence: number;
  /** Human-readable summary using the tag's evidence_template */
  summary: string | null;
  /** Source of the tag application */
  source: 'smart_rule' | 'manual' | 'bulk' | 'api' | 'predictive';
  /** Additional context */
  metadata?: Record<string, unknown>;
}

// ── Evidence Builder ──────────────────────────────────────────────────────────

/**
 * Build a full evidence snapshot from a rule evaluation result.
 *
 * @param evidence - The raw evidence from `evaluateAllGroups()`
 * @param options - Additional context for enrichment
 */
export function buildTagEvidenceSnapshot(
  evidence: SmartTagEvidence,
  options: {
    source?: TagEvidenceSnapshot['source'];
    evidenceTemplate?: string | null;
    metadata?: Record<string, unknown>;
  } = {},
): TagEvidenceSnapshot {
  const confidence = computeConfidence(evidence.conditions);
  const summary = renderEvidenceTemplate(
    options.evidenceTemplate ?? null,
    evidence.conditions,
  );

  return {
    ruleId: evidence.ruleId,
    ruleName: evidence.ruleName,
    evaluatedAt: evidence.evaluatedAt,
    conditions: evidence.conditions,
    confidence,
    summary,
    source: options.source ?? 'smart_rule',
    ...(options.metadata ? { metadata: options.metadata } : {}),
  };
}

/**
 * Build evidence for a manual tag application (no rule involved).
 */
export function buildManualTagEvidence(
  appliedBy: string,
  reason?: string,
): TagEvidenceSnapshot {
  return {
    ruleId: '',
    ruleName: '',
    evaluatedAt: new Date().toISOString(),
    conditions: [],
    confidence: 1.0, // Manual tags have full confidence (human decision)
    summary: reason ?? 'Manually applied',
    source: 'manual',
    metadata: { appliedBy },
  };
}

// ── Confidence Computation ────────────────────────────────────────────────────

/**
 * Compute a confidence score (0.0 – 1.0) based on condition results.
 *
 * Scoring logic:
 * - Base: percentage of conditions that passed
 * - Bonus for numeric conditions that exceed threshold by large margins
 * - Penalty for conditions that barely passed
 */
export function computeConfidence(
  conditions: SmartTagEvidence['conditions'],
): number {
  if (conditions.length === 0) return 1.0;

  const passedCount = conditions.filter((c) => c.passed).length;
  const baseScore = passedCount / conditions.length;

  if (baseScore === 0) return 0;

  // For passed numeric conditions, compute margin scores
  let marginSum = 0;
  let marginCount = 0;

  for (const cond of conditions) {
    if (!cond.passed) continue;

    const margin = computeMarginScore(cond);
    if (margin !== null) {
      marginSum += margin;
      marginCount++;
    }
  }

  if (marginCount === 0) return baseScore;

  // Blend: 70% base + 30% margin bonus
  const avgMargin = marginSum / marginCount;
  const blended = baseScore * 0.7 + Math.min(avgMargin, 1.0) * 0.3;

  return Math.round(blended * 100) / 100;
}

/**
 * Compute how far a condition exceeded its threshold (0.0 – 1.0+).
 * Returns null for non-numeric or non-comparable conditions.
 */
function computeMarginScore(
  condition: SmartTagEvidence['conditions'][0],
): number | null {
  const { operator, threshold, actualValue } = condition;

  if (actualValue == null || threshold == null) return null;

  const actual = typeof actualValue === 'number' ? actualValue : Number(actualValue);
  const thresh = typeof threshold === 'number' ? threshold : Number(threshold);

  if (isNaN(actual) || isNaN(thresh)) return null;
  if (thresh === 0) return actual > 0 ? 1.0 : 0;

  switch (operator) {
    case 'gt':
    case 'gte':
      // How much does actual exceed threshold?
      return Math.min((actual - thresh) / Math.abs(thresh), 2.0) / 2.0;
    case 'lt':
    case 'lte':
      // How much is actual below threshold?
      return Math.min((thresh - actual) / Math.abs(thresh), 2.0) / 2.0;
    case 'eq':
      return 1.0; // Exact match is full confidence
    default:
      return null;
  }
}

// ── Evidence Template Rendering ───────────────────────────────────────────────

/**
 * Render a human-readable summary using the tag's evidence_template.
 *
 * Template supports `{{metric}}` and `{{value:metric}}` placeholders.
 * Example template: "Customer has spent {{value:total_spend_cents}} (threshold: {{threshold:total_spend_cents}})"
 *
 * Returns null if no template is provided.
 */
export function renderEvidenceTemplate(
  template: string | null,
  conditions: SmartTagEvidence['conditions'],
): string | null {
  if (!template) return null;

  const conditionMap = new Map<string, SmartTagEvidence['conditions'][0]>();
  for (const cond of conditions) {
    conditionMap.set(cond.metric, cond);
  }

  return template.replace(
    /\{\{(value|threshold|operator|passed):(\w+)\}\}/g,
    (_match, field: string, metric: string) => {
      const cond = conditionMap.get(metric);
      if (!cond) return `[unknown:${metric}]`;

      switch (field) {
        case 'value':
          return formatEvidenceValue(cond.actualValue);
        case 'threshold':
          return formatEvidenceValue(cond.threshold);
        case 'operator':
          return cond.operator;
        case 'passed':
          return cond.passed ? 'yes' : 'no';
        default:
          return `[unknown:${field}]`;
      }
    },
  );
}

/**
 * Format a value for display in an evidence summary.
 */
function formatEvidenceValue(value: unknown): string {
  if (value == null) return 'N/A';
  if (typeof value === 'number') {
    return value.toLocaleString('en-US');
  }
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return String(value);
}
