/**
 * Tag Suggestion Engine — Multi-signal fuzzy matching with weighted scoring
 *
 * Pure functions for matching user intent to smart tag templates.
 * Used by CreateTagDialog and SmartTagRuleBuilder to suggest templates.
 */

import type { SmartTagTemplate } from '@oppsera/module-customers/services/smart-tag-templates';
import { SMART_TAG_TEMPLATES } from '@oppsera/module-customers/services/smart-tag-templates';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SuggestionMatch {
  template: SmartTagTemplate;
  /** Overall match score (0-1.0) */
  score: number;
  /** Human-readable reason for the match */
  reason: string;
  /** Which signals contributed to the match */
  signals: SuggestionSignal[];
}

export interface SuggestionSignal {
  type: 'name' | 'keyword' | 'description' | 'category' | 'metric';
  label: string;
  weight: number;
}

// ── Signal Weights ───────────────────────────────────────────────────────────

const WEIGHTS = {
  /** Exact keyword match (e.g., user typed "churn", template keyword is "churn") */
  exactKeyword: 0.4,
  /** Name contains search term */
  nameMatch: 0.3,
  /** Description contains search term */
  descriptionMatch: 0.15,
  /** Category match (user selected a category that matches) */
  categoryMatch: 0.25,
  /** Metric overlap (user already selected a metric that the template uses) */
  metricOverlap: 0.35,
  /** Partial keyword match (search term is a substring of a keyword) */
  partialKeyword: 0.2,
} as const;

// ── Core Suggestion Functions ────────────────────────────────────────────────

/**
 * Get template suggestions based on free-text input.
 * Splits input into terms and scores templates by multi-signal matching.
 */
export function suggestFromText(
  query: string,
  options?: { category?: string; limit?: number },
): SuggestionMatch[] {
  const terms = tokenize(query);
  if (terms.length === 0 && !options?.category) {
    return SMART_TAG_TEMPLATES
      .slice(0, options?.limit ?? 6)
      .map((t) => ({ template: t, score: 0, reason: 'Popular template', signals: [] }));
  }

  let candidates = SMART_TAG_TEMPLATES;
  if (options?.category) {
    candidates = candidates.filter((t) => t.category === options.category);
  }

  const matches = candidates
    .map((template) => scoreTemplate(template, terms))
    .filter((m) => m.score > 0 || (terms.length === 0 && options?.category))
    .sort((a, b) => b.score - a.score);

  // If category filter is active but no text, return all in category with 0 score
  if (terms.length === 0 && options?.category) {
    return candidates
      .slice(0, options?.limit ?? 6)
      .map((t) => ({
        template: t,
        score: 0,
        reason: `${capitalize(t.category)} template`,
        signals: [{ type: 'category' as const, label: t.category, weight: WEIGHTS.categoryMatch }],
      }));
  }

  return matches.slice(0, options?.limit ?? 6);
}

/**
 * Get template suggestions based on metrics already selected in the condition builder.
 * Matches templates that use the same metrics.
 */
export function suggestFromMetrics(
  selectedMetrics: string[],
  options?: { limit?: number },
): SuggestionMatch[] {
  if (selectedMetrics.length === 0) return [];

  const metricSet = new Set(selectedMetrics);

  return SMART_TAG_TEMPLATES
    .map((template) => {
      const templateMetrics = extractTemplateMetrics(template);
      const overlap = templateMetrics.filter((m) => metricSet.has(m));

      if (overlap.length === 0) return null;

      const overlapRatio = overlap.length / templateMetrics.length;
      const score = Math.min(1.0, overlapRatio * WEIGHTS.metricOverlap * 3);

      const signals: SuggestionSignal[] = overlap.map((m) => ({
        type: 'metric' as const,
        label: m,
        weight: WEIGHTS.metricOverlap,
      }));

      return {
        template,
        score: Math.round(score * 100) / 100,
        reason: `Uses ${overlap.length} matching metric${overlap.length > 1 ? 's' : ''}`,
        signals,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b!.score - a!.score)
    .slice(0, options?.limit ?? 4) as SuggestionMatch[];
}

/**
 * Get template suggestions based on tag name being typed.
 * Uses fuzzy matching against template names and keywords.
 */
export function suggestFromTagName(tagName: string): SuggestionMatch[] {
  if (!tagName || tagName.length < 2) return [];

  const _terms = tokenize(tagName);
  return suggestFromText(tagName, { limit: 3 });
}

// ── Scoring Engine ───────────────────────────────────────────────────────────

function scoreTemplate(
  template: SmartTagTemplate,
  terms: string[],
): SuggestionMatch {
  let totalScore = 0;
  const signals: SuggestionSignal[] = [];

  const nameLower = template.name.toLowerCase();
  const descLower = template.description.toLowerCase();

  for (const term of terms) {
    // 1. Exact keyword match
    const exactKeywordMatch = template.keywords.some(
      (kw) => kw.toLowerCase() === term,
    );
    if (exactKeywordMatch) {
      totalScore += WEIGHTS.exactKeyword;
      signals.push({ type: 'keyword', label: term, weight: WEIGHTS.exactKeyword });
      continue; // Don't double-count
    }

    // 2. Name match
    if (nameLower.includes(term)) {
      totalScore += WEIGHTS.nameMatch;
      signals.push({ type: 'name', label: term, weight: WEIGHTS.nameMatch });
      continue;
    }

    // 3. Partial keyword match (term is substring of a keyword)
    const partialMatch = template.keywords.some(
      (kw) => kw.toLowerCase().includes(term) || term.includes(kw.toLowerCase()),
    );
    if (partialMatch) {
      totalScore += WEIGHTS.partialKeyword;
      signals.push({ type: 'keyword', label: term, weight: WEIGHTS.partialKeyword });
      continue;
    }

    // 4. Description match
    if (descLower.includes(term)) {
      totalScore += WEIGHTS.descriptionMatch;
      signals.push({ type: 'description', label: term, weight: WEIGHTS.descriptionMatch });
    }
  }

  // Normalize score to 0-1 range (max possible = terms.length * 0.4)
  const maxPossible = terms.length * WEIGHTS.exactKeyword;
  const normalizedScore = maxPossible > 0
    ? Math.min(1.0, totalScore / maxPossible)
    : 0;

  const finalScore = Math.round(normalizedScore * 100) / 100;

  // Build reason string from top signals
  const reason = buildReasonString(signals, template);

  return { template, score: finalScore, reason, signals };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function extractTemplateMetrics(template: SmartTagTemplate): string[] {
  const metrics = new Set<string>();
  for (const group of template.conditions) {
    for (const cond of group.conditions) {
      metrics.add(cond.metric);
    }
  }
  return Array.from(metrics);
}

function buildReasonString(signals: SuggestionSignal[], template: SmartTagTemplate): string {
  if (signals.length === 0) return 'Suggested template';

  const topSignal = signals[0]!;
  switch (topSignal.type) {
    case 'keyword':
      return `Matches keyword "${topSignal.label}"`;
    case 'name':
      return `Name matches "${topSignal.label}"`;
    case 'description':
      return `Description matches "${topSignal.label}"`;
    case 'metric':
      return `Uses metric "${topSignal.label}"`;
    case 'category':
      return `${capitalize(template.category)} template`;
    default:
      return 'Suggested template';
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Format a condition value for display (human-readable).
 */
export function formatConditionPreview(
  metric: string,
  operator: string,
  value: unknown,
): string {
  const opLabels: Record<string, string> = {
    gt: '>', gte: '>=', lt: '<', lte: '<=',
    eq: '=', neq: '!=', between: 'between',
    in: 'in', not_in: 'not in', contains: 'contains',
    is_null: 'is null', is_not_null: 'is not null',
  };

  const metricLabel = metric.replace(/_/g, ' ');
  const opLabel = opLabels[operator] ?? operator;

  if (operator === 'between' && Array.isArray(value)) {
    return `${metricLabel} ${opLabel} ${value[0]}–${value[1]}`;
  }
  if (operator === 'in' && Array.isArray(value)) {
    return `${metricLabel} ${opLabel} [${value.join(', ')}]`;
  }
  if (operator === 'is_null' || operator === 'is_not_null') {
    return `${metricLabel} ${opLabel}`;
  }

  return `${metricLabel} ${opLabel} ${value}`;
}
