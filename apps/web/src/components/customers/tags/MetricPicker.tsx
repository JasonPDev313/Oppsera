'use client';

export interface MetricInfo {
  label: string;
  category: string;
  valueType: 'number' | 'boolean' | 'string';
  unit?: string;
}

export const METRIC_INFO: Record<string, MetricInfo> = {
  // Visits
  total_visits: { label: 'Total Visits', category: 'Visits', valueType: 'number' },
  visits_last_30d: { label: 'Visits (Last 30 Days)', category: 'Visits', valueType: 'number' },
  visits_last_90d: { label: 'Visits (Last 90 Days)', category: 'Visits', valueType: 'number' },
  days_since_last_visit: { label: 'Days Since Last Visit', category: 'Visits', valueType: 'number', unit: 'days' },
  weekend_visit_pct: { label: 'Weekend Visit %', category: 'Visits', valueType: 'number', unit: '%' },
  // Spending
  total_spend: { label: 'Total Spend', category: 'Spending', valueType: 'number', unit: '$' },
  avg_order_value: { label: 'Avg Order Value', category: 'Spending', valueType: 'number', unit: '$' },
  spend_last_30d: { label: 'Spend (Last 30 Days)', category: 'Spending', valueType: 'number', unit: '$' },
  spend_last_90d: { label: 'Spend (Last 90 Days)', category: 'Spending', valueType: 'number', unit: '$' },
  // Lifecycle
  days_since_created: { label: 'Days Since Created', category: 'Lifecycle', valueType: 'number', unit: 'days' },
  has_active_membership: { label: 'Has Active Membership', category: 'Lifecycle', valueType: 'boolean' },
  membership_status: { label: 'Membership Status', category: 'Lifecycle', valueType: 'string' },
  loyalty_tier: { label: 'Loyalty Tier', category: 'Lifecycle', valueType: 'string' },
  // Demographic
  marketing_consent: { label: 'Marketing Consent', category: 'Demographic', valueType: 'boolean' },
  has_email: { label: 'Has Email', category: 'Demographic', valueType: 'boolean' },
  birth_month: { label: 'Birth Month', category: 'Demographic', valueType: 'number' },
  tax_exempt: { label: 'Tax Exempt', category: 'Demographic', valueType: 'boolean' },
  // Financial
  has_overdue_balance: { label: 'Has Overdue Balance', category: 'Financial', valueType: 'boolean' },
  open_incident_count: { label: 'Open Incident Count', category: 'Financial', valueType: 'number' },
  // Predictive Intelligence
  rfm_segment: { label: 'RFM Segment', category: 'Predictive', valueType: 'string' },
  rfm_score: { label: 'RFM Composite Score', category: 'Predictive', valueType: 'number' },
  rfm_recency: { label: 'RFM Recency Score', category: 'Predictive', valueType: 'number' },
  rfm_frequency: { label: 'RFM Frequency Score', category: 'Predictive', valueType: 'number' },
  rfm_monetary: { label: 'RFM Monetary Score', category: 'Predictive', valueType: 'number' },
  churn_risk: { label: 'Churn Risk', category: 'Predictive', valueType: 'number' },
  predicted_clv: { label: 'Predicted CLV', category: 'Predictive', valueType: 'number', unit: '$' },
  spend_velocity: { label: 'Spend Velocity', category: 'Predictive', valueType: 'number' },
  days_until_predicted_visit: { label: 'Days Until Predicted Visit', category: 'Predictive', valueType: 'number', unit: 'days' },
  // Golf
  handicap_index: { label: 'Handicap Index', category: 'Golf', valueType: 'number' },
  projected_rounds: { label: 'Projected Rounds', category: 'Golf', valueType: 'number' },
} as const;

const CATEGORY_ORDER = ['Visits', 'Spending', 'Lifecycle', 'Demographic', 'Financial', 'Predictive', 'Golf'];

function getGroupedMetrics(): { category: string; metrics: { key: string; label: string }[] }[] {
  const groups: Record<string, { key: string; label: string }[]> = {};
  for (const [key, info] of Object.entries(METRIC_INFO)) {
    if (!groups[info.category]) groups[info.category] = [];
    groups[info.category]!.push({ key, label: info.label });
  }
  return CATEGORY_ORDER
    .filter((cat) => groups[cat]?.length)
    .map((cat) => ({ category: cat, metrics: groups[cat]! }));
}

interface MetricPickerProps {
  value: string;
  onChange: (metric: string) => void;
}

export function MetricPicker({ value, onChange }: MetricPickerProps) {
  const grouped = getGroupedMetrics();

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
    >
      <option value="">Select metric...</option>
      {grouped.map((group) => (
        <optgroup key={group.category} label={group.category}>
          {group.metrics.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
