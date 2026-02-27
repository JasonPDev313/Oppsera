/**
 * Smart Tag Condition Types
 *
 * Defines the metric types, operators, and condition structures
 * used by the Smart Tag Rules Engine.
 */

export type ConditionOperator =
  | 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq'
  | 'between' | 'in' | 'not_in' | 'contains'
  | 'is_null' | 'is_not_null';

export type ConditionMetric =
  // Visit metrics
  | 'total_visits'
  | 'visits_last_30d'
  | 'visits_last_90d'
  | 'visits_last_365d'
  | 'days_since_last_visit'
  // Spend metrics (values in cents)
  | 'total_spend_cents'
  | 'spend_last_30d_cents'
  | 'spend_last_90d_cents'
  | 'spend_last_365d_cents'
  | 'avg_order_value_cents'
  // Lifecycle
  | 'days_since_created'
  | 'customer_status'
  | 'customer_type'
  // Membership
  | 'membership_status'
  | 'membership_plan_id'
  | 'has_active_membership'
  // Financial
  | 'has_overdue_balance'
  | 'loyalty_points_balance'
  | 'wallet_balance_cents'
  // Demographic
  | 'has_email'
  | 'has_phone'
  | 'marketing_consent'
  | 'birth_month'
  // Activity / Operational
  | 'open_incident_count'
  | 'tax_exempt'
  // Predictive Intelligence (Session 5)
  | 'rfm_segment'
  | 'rfm_score'
  | 'rfm_recency'
  | 'rfm_frequency'
  | 'rfm_monetary'
  | 'churn_risk'
  | 'predicted_clv'
  | 'spend_velocity'
  | 'days_until_predicted_visit';

export interface SmartTagCondition {
  metric: ConditionMetric;
  operator: ConditionOperator;
  value: number | string | boolean | string[] | [number, number];
  unit?: string;
}

/** Conditions within a group are AND'd; groups are OR'd */
export interface SmartTagConditionGroup {
  conditions: SmartTagCondition[];
}

/** Evidence of why a smart tag was applied/removed */
export interface SmartTagEvidence {
  ruleId: string;
  ruleName: string;
  evaluatedAt: string;
  conditions: Array<{
    metric: string;
    operator: string;
    threshold: unknown;
    actualValue: unknown;
    passed: boolean;
  }>;
}

/** Metric metadata for the frontend rule builder */
export interface MetricDefinition {
  key: ConditionMetric;
  label: string;
  category: 'visits' | 'spending' | 'lifecycle' | 'membership' | 'financial' | 'demographic' | 'operational' | 'predictive';
  valueType: 'number' | 'string' | 'boolean' | 'string_array';
  unit?: string;
  description?: string;
}

/** All available metrics for the rule builder */
export const METRIC_DEFINITIONS: MetricDefinition[] = [
  // Visits
  { key: 'total_visits', label: 'Total Visits', category: 'visits', valueType: 'number', description: 'Lifetime visit count' },
  { key: 'visits_last_30d', label: 'Visits (Last 30 Days)', category: 'visits', valueType: 'number' },
  { key: 'visits_last_90d', label: 'Visits (Last 90 Days)', category: 'visits', valueType: 'number' },
  { key: 'visits_last_365d', label: 'Visits (Last Year)', category: 'visits', valueType: 'number' },
  { key: 'days_since_last_visit', label: 'Days Since Last Visit', category: 'visits', valueType: 'number', unit: 'days' },
  // Spending
  { key: 'total_spend_cents', label: 'Total Spend', category: 'spending', valueType: 'number', unit: 'cents', description: 'Lifetime spend in cents' },
  { key: 'spend_last_30d_cents', label: 'Spend (Last 30 Days)', category: 'spending', valueType: 'number', unit: 'cents' },
  { key: 'spend_last_90d_cents', label: 'Spend (Last 90 Days)', category: 'spending', valueType: 'number', unit: 'cents' },
  { key: 'spend_last_365d_cents', label: 'Spend (Last Year)', category: 'spending', valueType: 'number', unit: 'cents' },
  { key: 'avg_order_value_cents', label: 'Avg Order Value', category: 'spending', valueType: 'number', unit: 'cents' },
  // Lifecycle
  { key: 'days_since_created', label: 'Days Since Created', category: 'lifecycle', valueType: 'number', unit: 'days' },
  { key: 'customer_status', label: 'Customer Status', category: 'lifecycle', valueType: 'string' },
  { key: 'customer_type', label: 'Customer Type', category: 'lifecycle', valueType: 'string' },
  // Membership
  { key: 'membership_status', label: 'Membership Status', category: 'membership', valueType: 'string' },
  { key: 'membership_plan_id', label: 'Membership Plan', category: 'membership', valueType: 'string' },
  { key: 'has_active_membership', label: 'Has Active Membership', category: 'membership', valueType: 'boolean' },
  // Financial
  { key: 'has_overdue_balance', label: 'Has Overdue Balance', category: 'financial', valueType: 'boolean' },
  { key: 'loyalty_points_balance', label: 'Loyalty Points Balance', category: 'financial', valueType: 'number' },
  { key: 'wallet_balance_cents', label: 'Wallet Balance', category: 'financial', valueType: 'number', unit: 'cents' },
  // Demographic
  { key: 'has_email', label: 'Has Email', category: 'demographic', valueType: 'boolean' },
  { key: 'has_phone', label: 'Has Phone', category: 'demographic', valueType: 'boolean' },
  { key: 'marketing_consent', label: 'Marketing Consent', category: 'demographic', valueType: 'boolean' },
  { key: 'birth_month', label: 'Birth Month', category: 'demographic', valueType: 'number', description: 'Month number (1-12)' },
  // Operational
  { key: 'open_incident_count', label: 'Open Incidents', category: 'operational', valueType: 'number' },
  { key: 'tax_exempt', label: 'Tax Exempt', category: 'operational', valueType: 'boolean' },
  // Predictive Intelligence
  { key: 'rfm_segment', label: 'RFM Segment', category: 'predictive', valueType: 'string', description: 'RFM segment (champions, loyal_customers, etc.)' },
  { key: 'rfm_score', label: 'RFM Composite Score', category: 'predictive', valueType: 'number', description: 'RFM composite score (1-125)' },
  { key: 'rfm_recency', label: 'RFM Recency Score', category: 'predictive', valueType: 'number', description: 'Recency quintile (1-5)' },
  { key: 'rfm_frequency', label: 'RFM Frequency Score', category: 'predictive', valueType: 'number', description: 'Frequency quintile (1-5)' },
  { key: 'rfm_monetary', label: 'RFM Monetary Score', category: 'predictive', valueType: 'number', description: 'Monetary quintile (1-5)' },
  { key: 'churn_risk', label: 'Churn Risk', category: 'predictive', valueType: 'number', description: 'Churn risk score (0.0-1.0)' },
  { key: 'predicted_clv', label: 'Predicted CLV', category: 'predictive', valueType: 'number', unit: 'dollars', description: 'Predicted customer lifetime value in dollars' },
  { key: 'spend_velocity', label: 'Spend Velocity', category: 'predictive', valueType: 'number', description: 'Growth rate (-1.0 to 1.0+, positive = growing)' },
  { key: 'days_until_predicted_visit', label: 'Days Until Predicted Visit', category: 'predictive', valueType: 'number', unit: 'days', description: 'Days until next predicted visit (0 = today/overdue)' },
];
