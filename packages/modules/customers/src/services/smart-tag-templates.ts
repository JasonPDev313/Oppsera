/**
 * Smart Tag Templates — Predefined templates using predictive conditions
 *
 * Pre-built tag rule templates that businesses can one-click install.
 * Each template defines conditions, keywords for search, trigger events,
 * and suggested tag actions.
 */

import type { SmartTagConditionGroup } from '../types/smart-tag-conditions';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SmartTagTemplate {
  /** Unique template key (slug-like) */
  key: string;
  /** Display name */
  name: string;
  /** Short description for the template picker */
  description: string;
  /** Category for grouping in the UI */
  category: 'predictive' | 'behavioral' | 'lifecycle' | 'financial';
  /** Suggested tag color (hex) */
  color: string;
  /** Suggested lucide icon name */
  icon: string;
  /** Pre-built conditions for the smart tag rule */
  conditions: SmartTagConditionGroup[];
  /** Whether the tag should auto-remove when conditions no longer met */
  autoRemove: boolean;
  /** Evaluation mode for the rule */
  evaluationMode: 'scheduled' | 'event_driven' | 'hybrid';
  /** Events that should trigger re-evaluation */
  triggerEvents: string[];
  /** Keywords for search and suggestion matching */
  keywords: string[];
  /** Suggested tag actions (action types to configure) */
  suggestedActions: Array<{
    trigger: 'on_apply' | 'on_remove' | 'on_expire';
    actionType: string;
    description: string;
  }>;
  /** Default priority for conflict resolution (lower = higher priority) */
  priority: number;
  /** Re-evaluation interval in hours */
  reEvaluationIntervalHours: number;
}

// ── Template Definitions ─────────────────────────────────────────────────────

export const SMART_TAG_TEMPLATES: SmartTagTemplate[] = [
  // ── Champions ──────────────────────────────────────────────────────
  {
    key: 'champions',
    name: 'Champions',
    description: 'Top customers with high recency, frequency, and monetary scores (RFM 5-5-5 or 5-5-4)',
    category: 'predictive',
    color: '#f59e0b',
    icon: 'trophy',
    conditions: [
      {
        conditions: [
          { metric: 'rfm_segment', operator: 'in', value: ['champions'] },
        ],
      },
      {
        conditions: [
          { metric: 'rfm_recency', operator: 'eq', value: 5 },
          { metric: 'rfm_frequency', operator: 'gte', value: 4 },
          { metric: 'rfm_monetary', operator: 'gte', value: 4 },
        ],
      },
    ],
    autoRemove: true,
    evaluationMode: 'hybrid',
    triggerEvents: ['order.placed.v1', 'tender.recorded.v1'],
    keywords: ['champion', 'best', 'top', 'vip', 'high value', 'best customer', 'rfm'],
    suggestedActions: [
      { trigger: 'on_apply', actionType: 'set_customer_field', description: 'Set VIP level to gold' },
      { trigger: 'on_apply', actionType: 'log_activity', description: 'Log champion recognition' },
      { trigger: 'on_apply', actionType: 'create_alert', description: 'Alert staff about champion status' },
    ],
    priority: 10,
    reEvaluationIntervalHours: 24,
  },

  // ── Loyal Customers ────────────────────────────────────────────────
  {
    key: 'loyal-customers',
    name: 'Loyal Customers',
    description: 'Regular customers with strong frequency and monetary scores',
    category: 'predictive',
    color: '#6366f1',
    icon: 'heart',
    conditions: [
      {
        conditions: [
          { metric: 'rfm_segment', operator: 'in', value: ['loyal_customers'] },
        ],
      },
      {
        conditions: [
          { metric: 'rfm_frequency', operator: 'gte', value: 4 },
          { metric: 'rfm_monetary', operator: 'gte', value: 4 },
        ],
      },
    ],
    autoRemove: true,
    evaluationMode: 'hybrid',
    triggerEvents: ['order.placed.v1', 'tender.recorded.v1'],
    keywords: ['loyal', 'regular', 'repeat', 'frequent', 'reliable'],
    suggestedActions: [
      { trigger: 'on_apply', actionType: 'log_activity', description: 'Log loyalty recognition' },
      { trigger: 'on_apply', actionType: 'adjust_wallet', description: 'Award loyalty bonus points' },
    ],
    priority: 20,
    reEvaluationIntervalHours: 24,
  },

  // ── At Risk ────────────────────────────────────────────────────────
  {
    key: 'at-risk',
    name: 'At Risk',
    description: 'Previously active customers showing signs of churn (churn risk > 0.6)',
    category: 'predictive',
    color: '#ef4444',
    icon: 'alert-triangle',
    conditions: [
      {
        conditions: [
          { metric: 'churn_risk', operator: 'gte', value: 0.6 },
          { metric: 'total_visits', operator: 'gte', value: 3 },
        ],
      },
    ],
    autoRemove: true,
    evaluationMode: 'hybrid',
    triggerEvents: ['order.placed.v1', 'customer.visit.recorded.v1'],
    keywords: ['at risk', 'churn', 'leaving', 'losing', 'declining', 'lapsed', 'inactive'],
    suggestedActions: [
      { trigger: 'on_apply', actionType: 'create_alert', description: 'Alert manager about at-risk customer' },
      { trigger: 'on_apply', actionType: 'set_service_flag', description: 'Set re-engagement flag' },
      { trigger: 'on_apply', actionType: 'send_notification', description: 'Send win-back offer' },
      { trigger: 'on_remove', actionType: 'log_activity', description: 'Log recovery from at-risk status' },
    ],
    priority: 15,
    reEvaluationIntervalHours: 12,
  },

  // ── High Churn Risk ────────────────────────────────────────────────
  {
    key: 'high-churn-risk',
    name: 'High Churn Risk',
    description: 'Customers with very high probability of churning (churn risk > 0.8)',
    category: 'predictive',
    color: '#dc2626',
    icon: 'alert-octagon',
    conditions: [
      {
        conditions: [
          { metric: 'churn_risk', operator: 'gte', value: 0.8 },
          { metric: 'total_visits', operator: 'gte', value: 5 },
        ],
      },
    ],
    autoRemove: true,
    evaluationMode: 'scheduled',
    triggerEvents: [],
    keywords: ['high churn', 'critical risk', 'about to leave', 'urgent retention'],
    suggestedActions: [
      { trigger: 'on_apply', actionType: 'create_alert', description: 'Urgent: customer likely to churn' },
      { trigger: 'on_apply', actionType: 'send_notification', description: 'Send personal outreach' },
      { trigger: 'on_apply', actionType: 'adjust_wallet', description: 'Add retention credit' },
    ],
    priority: 5,
    reEvaluationIntervalHours: 12,
  },

  // ── Declining Spend ────────────────────────────────────────────────
  {
    key: 'declining-spend',
    name: 'Declining Spend',
    description: 'Customers whose spending velocity is negative (spending less than before)',
    category: 'predictive',
    color: '#f97316',
    icon: 'trending-down',
    conditions: [
      {
        conditions: [
          { metric: 'spend_velocity', operator: 'lt', value: -0.2 },
          { metric: 'total_visits', operator: 'gte', value: 3 },
        ],
      },
    ],
    autoRemove: true,
    evaluationMode: 'hybrid',
    triggerEvents: ['tender.recorded.v1'],
    keywords: ['declining', 'spend drop', 'less spending', 'reduced', 'downtrade', 'shrinking'],
    suggestedActions: [
      { trigger: 'on_apply', actionType: 'log_activity', description: 'Log declining spend detection' },
      { trigger: 'on_apply', actionType: 'set_service_flag', description: 'Flag for upsell opportunity' },
    ],
    priority: 40,
    reEvaluationIntervalHours: 24,
  },

  // ── Growing Spend ──────────────────────────────────────────────────
  {
    key: 'growing-spend',
    name: 'Growing Spend',
    description: 'Customers whose spending is accelerating (spend velocity > 20%)',
    category: 'predictive',
    color: '#22c55e',
    icon: 'trending-up',
    conditions: [
      {
        conditions: [
          { metric: 'spend_velocity', operator: 'gte', value: 0.2 },
          { metric: 'total_visits', operator: 'gte', value: 3 },
        ],
      },
    ],
    autoRemove: true,
    evaluationMode: 'hybrid',
    triggerEvents: ['tender.recorded.v1'],
    keywords: ['growing', 'increasing', 'spending more', 'uptrade', 'expanding'],
    suggestedActions: [
      { trigger: 'on_apply', actionType: 'log_activity', description: 'Log growing spend detection' },
    ],
    priority: 50,
    reEvaluationIntervalHours: 24,
  },

  // ── High CLV ───────────────────────────────────────────────────────
  {
    key: 'high-clv',
    name: 'High Lifetime Value',
    description: 'Customers with predicted CLV above $5,000',
    category: 'predictive',
    color: '#8b5cf6',
    icon: 'gem',
    conditions: [
      {
        conditions: [
          { metric: 'predicted_clv', operator: 'gte', value: 5000 },
        ],
      },
    ],
    autoRemove: true,
    evaluationMode: 'scheduled',
    triggerEvents: [],
    keywords: ['high value', 'clv', 'lifetime value', 'valuable', 'whale', 'premium'],
    suggestedActions: [
      { trigger: 'on_apply', actionType: 'set_customer_field', description: 'Set VIP level' },
      { trigger: 'on_apply', actionType: 'create_alert', description: 'Alert about high-value customer' },
    ],
    priority: 15,
    reEvaluationIntervalHours: 48,
  },

  // ── Visit Overdue ──────────────────────────────────────────────────
  {
    key: 'visit-overdue',
    name: 'Visit Overdue',
    description: 'Customers past their predicted visit date (overdue by 7+ days)',
    category: 'predictive',
    color: '#eab308',
    icon: 'clock',
    conditions: [
      {
        conditions: [
          { metric: 'days_until_predicted_visit', operator: 'eq', value: 0 },
          { metric: 'days_since_last_visit', operator: 'gte', value: 14 },
          { metric: 'total_visits', operator: 'gte', value: 2 },
        ],
      },
    ],
    autoRemove: true,
    evaluationMode: 'scheduled',
    triggerEvents: [],
    keywords: ['overdue', 'missing', 'expected visit', 'no show', 'lapsed', 'haven\'t returned'],
    suggestedActions: [
      { trigger: 'on_apply', actionType: 'send_notification', description: 'Send we-miss-you message' },
      { trigger: 'on_apply', actionType: 'log_activity', description: 'Log overdue visit' },
    ],
    priority: 35,
    reEvaluationIntervalHours: 24,
  },

  // ── New Potential ──────────────────────────────────────────────────
  {
    key: 'new-potential',
    name: 'New High-Potential',
    description: 'New customers (< 90 days) with above-average initial spend',
    category: 'behavioral',
    color: '#14b8a6',
    icon: 'sparkles',
    conditions: [
      {
        conditions: [
          { metric: 'days_since_created', operator: 'lte', value: 90 },
          { metric: 'total_visits', operator: 'gte', value: 2 },
          { metric: 'avg_order_value_cents', operator: 'gte', value: 5000 },
        ],
      },
    ],
    autoRemove: true,
    evaluationMode: 'hybrid',
    triggerEvents: ['order.placed.v1'],
    keywords: ['new', 'potential', 'promising', 'high initial', 'onboarding', 'nurture'],
    suggestedActions: [
      { trigger: 'on_apply', actionType: 'log_activity', description: 'Log high-potential new customer' },
      { trigger: 'on_apply', actionType: 'set_service_flag', description: 'Flag for nurture program' },
    ],
    priority: 30,
    reEvaluationIntervalHours: 24,
  },

  // ── Needs Attention ────────────────────────────────────────────────
  {
    key: 'needs-attention',
    name: 'Needs Attention',
    description: 'Customers with moderate churn risk and declining engagement patterns',
    category: 'predictive',
    color: '#f59e0b',
    icon: 'eye',
    conditions: [
      {
        conditions: [
          { metric: 'rfm_segment', operator: 'in', value: ['needs_attention', 'about_to_sleep'] },
        ],
      },
      {
        conditions: [
          { metric: 'churn_risk', operator: 'between', value: [0.4, 0.7] },
          { metric: 'spend_velocity', operator: 'lt', value: 0 },
        ],
      },
    ],
    autoRemove: true,
    evaluationMode: 'hybrid',
    triggerEvents: ['order.placed.v1', 'tender.recorded.v1'],
    keywords: ['attention', 'monitor', 'watch', 'fading', 'disengaging', 'slipping'],
    suggestedActions: [
      { trigger: 'on_apply', actionType: 'log_activity', description: 'Log attention needed' },
      { trigger: 'on_apply', actionType: 'create_alert', description: 'Alert about declining engagement' },
    ],
    priority: 25,
    reEvaluationIntervalHours: 24,
  },

  // ── Hibernating ────────────────────────────────────────────────────
  {
    key: 'hibernating',
    name: 'Hibernating',
    description: 'Previously active customers who have gone silent (low recency, moderate history)',
    category: 'predictive',
    color: '#94a3b8',
    icon: 'moon',
    conditions: [
      {
        conditions: [
          { metric: 'rfm_segment', operator: 'in', value: ['hibernating', 'lost'] },
        ],
      },
      {
        conditions: [
          { metric: 'rfm_recency', operator: 'lte', value: 2 },
          { metric: 'total_visits', operator: 'gte', value: 5 },
          { metric: 'days_since_last_visit', operator: 'gte', value: 90 },
        ],
      },
    ],
    autoRemove: true,
    evaluationMode: 'scheduled',
    triggerEvents: [],
    keywords: ['hibernating', 'dormant', 'sleeping', 'inactive', 'cold', 'lost'],
    suggestedActions: [
      { trigger: 'on_apply', actionType: 'send_notification', description: 'Send reactivation campaign' },
      { trigger: 'on_apply', actionType: 'log_activity', description: 'Log hibernation detection' },
    ],
    priority: 45,
    reEvaluationIntervalHours: 48,
  },

  // ── Birthday Month ─────────────────────────────────────────────────
  {
    key: 'birthday-month',
    name: 'Birthday This Month',
    description: 'Customers with a birthday in the current month',
    category: 'lifecycle',
    color: '#ec4899',
    icon: 'cake',
    conditions: [
      {
        conditions: [
          { metric: 'birth_month', operator: 'eq', value: new Date().getMonth() + 1 },
        ],
      },
    ],
    autoRemove: true,
    evaluationMode: 'scheduled',
    triggerEvents: [],
    keywords: ['birthday', 'birth month', 'celebration', 'anniversary'],
    suggestedActions: [
      { trigger: 'on_apply', actionType: 'send_notification', description: 'Send birthday greeting' },
      { trigger: 'on_apply', actionType: 'adjust_wallet', description: 'Add birthday bonus points' },
    ],
    priority: 60,
    reEvaluationIntervalHours: 24,
  },
];

// ── Template Lookup Helpers ──────────────────────────────────────────────────

/**
 * Get a template by key.
 */
export function getTemplate(key: string): SmartTagTemplate | undefined {
  return SMART_TAG_TEMPLATES.find((t) => t.key === key);
}

/**
 * Get all templates in a category.
 */
export function getTemplatesByCategory(category: SmartTagTemplate['category']): SmartTagTemplate[] {
  return SMART_TAG_TEMPLATES.filter((t) => t.category === category);
}

/**
 * Search templates by keyword (case-insensitive, partial match).
 * Returns templates sorted by relevance (keyword match count).
 */
export function searchTemplates(query: string): SmartTagTemplate[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...SMART_TAG_TEMPLATES];

  const scored = SMART_TAG_TEMPLATES.map((template) => {
    const searchText = [
      template.name,
      template.description,
      ...template.keywords,
    ].join(' ').toLowerCase();

    let score = 0;
    for (const term of terms) {
      if (searchText.includes(term)) score++;
      // Exact keyword match gets bonus
      if (template.keywords.some((kw) => kw.toLowerCase() === term)) score += 2;
    }

    return { template, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.template);
}

/**
 * Match templates based on a customer's predictive scores.
 * Returns templates whose conditions the customer would currently satisfy.
 */
export function matchTemplatesForScores(scores: {
  rfmSegment?: string;
  rfmScore?: number;
  rfmRecency?: number;
  rfmFrequency?: number;
  rfmMonetary?: number;
  churnRisk?: number;
  predictedClv?: number;
  spendVelocity?: number;
  daysUntilPredictedVisit?: number;
}): SmartTagTemplate[] {
  const metricValues = new Map<string, unknown>();

  if (scores.rfmSegment != null) metricValues.set('rfm_segment', scores.rfmSegment);
  if (scores.rfmScore != null) metricValues.set('rfm_score', scores.rfmScore);
  if (scores.rfmRecency != null) metricValues.set('rfm_recency', scores.rfmRecency);
  if (scores.rfmFrequency != null) metricValues.set('rfm_frequency', scores.rfmFrequency);
  if (scores.rfmMonetary != null) metricValues.set('rfm_monetary', scores.rfmMonetary);
  if (scores.churnRisk != null) metricValues.set('churn_risk', scores.churnRisk);
  if (scores.predictedClv != null) metricValues.set('predicted_clv', scores.predictedClv);
  if (scores.spendVelocity != null) metricValues.set('spend_velocity', scores.spendVelocity);
  if (scores.daysUntilPredictedVisit != null) metricValues.set('days_until_predicted_visit', scores.daysUntilPredictedVisit);

  // We need evaluateAllGroups from the evaluator — import is internal
  // Use a simplified inline check since this is a pure function
  return SMART_TAG_TEMPLATES.filter((template) => {
    // Check if ALL conditions in any group use only predictive metrics
    // and are satisfiable with the provided scores
    return template.conditions.some((group) => {
      return group.conditions.every((cond) => {
        const actualValue = metricValues.get(cond.metric);
        if (actualValue == null) return false;
        return evaluateConditionInline(actualValue, cond.operator, cond.value);
      });
    });
  });
}

/**
 * Inline condition evaluator for template matching (no DB dependency).
 * Mirrors the logic in smart-tag-evaluator.ts evaluateCondition.
 */
export function evaluateConditionInline(
  actualValue: unknown,
  operator: string,
  threshold: unknown,
): boolean {
  if (operator === 'is_null') return actualValue == null;
  if (operator === 'is_not_null') return actualValue != null;
  if (actualValue == null) return false;

  const num = typeof actualValue === 'number' ? actualValue : Number(actualValue);
  const threshNum = typeof threshold === 'number' ? threshold : Number(threshold);

  switch (operator) {
    case 'gt': return num > threshNum;
    case 'gte': return num >= threshNum;
    case 'lt': return num < threshNum;
    case 'lte': return num <= threshNum;
    case 'eq':
      return typeof actualValue === 'string'
        ? actualValue === threshold
        : num === threshNum;
    case 'neq':
      return typeof actualValue === 'string'
        ? actualValue !== threshold
        : num !== threshNum;
    case 'between': {
      const range = threshold as [number, number];
      return num >= range[0] && num <= range[1];
    }
    case 'in': {
      const list = threshold as string[];
      return list.includes(String(actualValue));
    }
    case 'not_in': {
      const list = threshold as string[];
      return !list.includes(String(actualValue));
    }
    case 'contains':
      return String(actualValue).toLowerCase().includes(String(threshold).toLowerCase());
    default:
      return false;
  }
}
