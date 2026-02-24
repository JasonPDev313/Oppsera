export interface SmartTagSeedTemplate {
  name: string;
  slug: string;
  color: string;
  icon: string;
  category: 'behavior' | 'lifecycle' | 'demographic' | 'operational';
  description: string;
  conditions: { conditions: { metric: string; operator: string; value: unknown; unit?: string }[] }[];
  evaluationMode: 'scheduled' | 'event_driven' | 'hybrid';
  autoRemove: boolean;
  cooldownHours?: number;
}

export const SMART_TAG_SEED_TEMPLATES: SmartTagSeedTemplate[] = [
  // ── Behavior ──────────────────────────────────────────────────────────

  {
    name: 'VIP Spender',
    slug: 'vip-spender',
    color: '#F59E0B',
    icon: 'Crown',
    category: 'behavior',
    description: 'Customers whose lifetime spend exceeds $5,000.',
    conditions: [
      { conditions: [{ metric: 'total_spend', operator: 'gte', value: 5000 }] },
    ],
    evaluationMode: 'event_driven',
    autoRemove: false,
  },

  {
    name: 'High Frequency',
    slug: 'high-frequency',
    color: '#10B981',
    icon: 'TrendingUp',
    category: 'behavior',
    description: 'Customers who visited 12 or more times in the last 90 days.',
    conditions: [
      { conditions: [{ metric: 'visits_last_90d', operator: 'gte', value: 12 }] },
    ],
    evaluationMode: 'hybrid',
    autoRemove: true,
  },

  {
    name: 'Big Monthly Spender',
    slug: 'big-monthly-spender',
    color: '#8B5CF6',
    icon: 'DollarSign',
    category: 'behavior',
    description: 'Customers who spent $1,000 or more in the last 30 days.',
    conditions: [
      { conditions: [{ metric: 'spend_last_30d', operator: 'gte', value: 1000 }] },
    ],
    evaluationMode: 'hybrid',
    autoRemove: true,
  },

  {
    name: 'Low Spender',
    slug: 'low-spender',
    color: '#6B7280',
    icon: 'ArrowDownCircle',
    category: 'behavior',
    description: 'Repeat customers (5+ visits) whose average order value is under $20.',
    conditions: [
      {
        conditions: [
          { metric: 'total_visits', operator: 'gte', value: 5 },
          { metric: 'avg_order_value', operator: 'lt', value: 20 },
        ],
      },
    ],
    evaluationMode: 'scheduled',
    autoRemove: true,
  },

  {
    name: 'Golf Regular',
    slug: 'golf-regular',
    color: '#10B981',
    icon: 'Flag',
    category: 'behavior',
    description: 'Golfers projected to play 24 or more rounds per year.',
    conditions: [
      { conditions: [{ metric: 'projected_rounds', operator: 'gte', value: 24 }] },
    ],
    evaluationMode: 'scheduled',
    autoRemove: true,
  },

  {
    name: 'Low Handicap',
    slug: 'low-handicap',
    color: '#3B82F6',
    icon: 'Award',
    category: 'behavior',
    description: 'Golfers with a handicap index of 10 or lower.',
    conditions: [
      { conditions: [{ metric: 'handicap_index', operator: 'lte', value: 10 }] },
    ],
    evaluationMode: 'scheduled',
    autoRemove: false,
  },

  {
    name: 'Loyalty Gold+',
    slug: 'loyalty-gold-plus',
    color: '#F59E0B',
    icon: 'Star',
    category: 'behavior',
    description: 'Members in the Gold, Platinum, or Diamond loyalty tier.',
    conditions: [
      {
        conditions: [
          { metric: 'loyalty_tier', operator: 'in', value: ['gold', 'platinum', 'diamond'] },
        ],
      },
    ],
    evaluationMode: 'event_driven',
    autoRemove: true,
  },

  {
    name: 'F&B Regular',
    slug: 'fnb-regular',
    color: '#F97316',
    icon: 'UtensilsCrossed',
    category: 'behavior',
    description: 'Customers who dined 4 or more times in the last 30 days.',
    conditions: [
      { conditions: [{ metric: 'visits_last_30d', operator: 'gte', value: 4 }] },
    ],
    evaluationMode: 'hybrid',
    autoRemove: true,
  },

  {
    name: 'Weekend Warrior',
    slug: 'weekend-warrior',
    color: '#06B6D4',
    icon: 'Calendar',
    category: 'behavior',
    description: 'Customers whose weekend visits account for more than 60% of total visits.',
    conditions: [
      { conditions: [{ metric: 'weekend_visit_pct', operator: 'gt', value: 60 }] },
    ],
    evaluationMode: 'scheduled',
    autoRemove: true,
  },

  {
    name: 'Top 10% Spender',
    slug: 'top-10-spender',
    color: '#F59E0B',
    icon: 'Trophy',
    category: 'behavior',
    description:
      'Customers in the top 10% of lifetime spend. Threshold is computed at batch evaluation time; the static value is a placeholder.',
    conditions: [
      { conditions: [{ metric: 'total_spend', operator: 'gte', value: 10000 }] },
    ],
    evaluationMode: 'scheduled',
    autoRemove: true,
  },

  // ── Lifecycle ─────────────────────────────────────────────────────────

  {
    name: 'At Risk (Lapsed)',
    slug: 'at-risk-lapsed',
    color: '#F97316',
    icon: 'AlertTriangle',
    category: 'lifecycle',
    description:
      'Returning customers (3+ visits) who have not visited in 60-180 days.',
    conditions: [
      {
        conditions: [
          { metric: 'days_since_last_visit', operator: 'gte', value: 60 },
          { metric: 'days_since_last_visit', operator: 'lt', value: 180 },
          { metric: 'total_visits', operator: 'gte', value: 3 },
        ],
      },
    ],
    evaluationMode: 'scheduled',
    autoRemove: true,
  },

  {
    name: 'Churned',
    slug: 'churned',
    color: '#EF4444',
    icon: 'UserMinus',
    category: 'lifecycle',
    description:
      'Returning customers (3+ visits) who have not visited in 180 or more days.',
    conditions: [
      {
        conditions: [
          { metric: 'days_since_last_visit', operator: 'gte', value: 180 },
          { metric: 'total_visits', operator: 'gte', value: 3 },
        ],
      },
    ],
    evaluationMode: 'scheduled',
    autoRemove: true,
  },

  {
    name: 'New Customer',
    slug: 'new-customer',
    color: '#3B82F6',
    icon: 'UserPlus',
    category: 'lifecycle',
    description: 'Customers created within the last 30 days.',
    conditions: [
      {
        conditions: [
          { metric: 'days_since_created', operator: 'lte', value: 30, unit: 'days' },
        ],
      },
    ],
    evaluationMode: 'event_driven',
    autoRemove: true,
  },

  {
    name: 'Active Member',
    slug: 'active-member',
    color: '#10B981',
    icon: 'BadgeCheck',
    category: 'lifecycle',
    description: 'Customers who hold an active membership.',
    conditions: [
      { conditions: [{ metric: 'has_active_membership', operator: 'eq', value: true }] },
    ],
    evaluationMode: 'event_driven',
    autoRemove: true,
  },

  {
    name: 'Lapsed Member',
    slug: 'lapsed-member',
    color: '#F59E0B',
    icon: 'Clock',
    category: 'lifecycle',
    description:
      'Customers with a canceled membership who visited within the last 90 days.',
    conditions: [
      {
        conditions: [
          { metric: 'membership_status', operator: 'eq', value: 'canceled' },
          { metric: 'days_since_last_visit', operator: 'lt', value: 90 },
        ],
      },
    ],
    evaluationMode: 'scheduled',
    autoRemove: true,
  },

  {
    name: 'High Value Prospect',
    slug: 'high-value-prospect',
    color: '#8B5CF6',
    icon: 'Target',
    category: 'lifecycle',
    description:
      'New customers (1-3 visits) with a high average order value ($50+).',
    conditions: [
      {
        conditions: [
          { metric: 'total_visits', operator: 'gte', value: 1 },
          { metric: 'total_visits', operator: 'lte', value: 3 },
          { metric: 'avg_order_value', operator: 'gte', value: 50 },
        ],
      },
    ],
    evaluationMode: 'hybrid',
    autoRemove: true,
  },

  {
    name: 'Dormant Prospect',
    slug: 'dormant-prospect',
    color: '#6B7280',
    icon: 'UserX',
    category: 'lifecycle',
    description:
      'Customers who were created 90+ days ago but have never visited.',
    conditions: [
      {
        conditions: [
          { metric: 'total_visits', operator: 'eq', value: 0 },
          { metric: 'days_since_created', operator: 'gte', value: 90, unit: 'days' },
        ],
      },
    ],
    evaluationMode: 'scheduled',
    autoRemove: true,
  },

  // ── Demographic ───────────────────────────────────────────────────────

  {
    name: 'Birthday This Month',
    slug: 'birthday-this-month',
    color: '#EC4899',
    icon: 'Cake',
    category: 'demographic',
    description:
      'Customers whose birthday falls in the current calendar month. The value -1 is a placeholder resolved to the current month at evaluation time.',
    conditions: [
      { conditions: [{ metric: 'birth_month', operator: 'eq', value: -1 }] },
    ],
    evaluationMode: 'scheduled',
    autoRemove: true,
    cooldownHours: 720,
  },

  {
    name: 'Marketing Opted In',
    slug: 'marketing-opted-in',
    color: '#06B6D4',
    icon: 'Mail',
    category: 'demographic',
    description:
      'Customers who have opted in to marketing communications and have an email on file.',
    conditions: [
      {
        conditions: [
          { metric: 'marketing_consent', operator: 'eq', value: true },
          { metric: 'has_email', operator: 'eq', value: true },
        ],
      },
    ],
    evaluationMode: 'event_driven',
    autoRemove: true,
  },

  {
    name: 'Anniversary Coming',
    slug: 'anniversary-coming',
    color: '#EC4899',
    icon: 'Heart',
    category: 'demographic',
    description:
      'Customers approaching their membership or signup anniversary (within 30 days). Uses modular arithmetic at evaluation time; the range 335-395 is a placeholder for the modular distance check.',
    conditions: [
      {
        conditions: [
          { metric: 'days_since_created', operator: 'gte', value: 335, unit: 'days' },
          { metric: 'days_since_created', operator: 'lte', value: 395, unit: 'days' },
        ],
      },
    ],
    evaluationMode: 'scheduled',
    autoRemove: true,
    cooldownHours: 720,
  },

  // ── Operational ───────────────────────────────────────────────────────

  {
    name: 'Overdue Balance',
    slug: 'overdue-balance',
    color: '#EF4444',
    icon: 'AlertCircle',
    category: 'operational',
    description: 'Customers who have an overdue balance on their billing account.',
    conditions: [
      { conditions: [{ metric: 'has_overdue_balance', operator: 'eq', value: true }] },
    ],
    evaluationMode: 'event_driven',
    autoRemove: true,
  },

  {
    name: 'Open Incident',
    slug: 'open-incident',
    color: '#EF4444',
    icon: 'AlertOctagon',
    category: 'operational',
    description: 'Customers with one or more unresolved service incidents.',
    conditions: [
      { conditions: [{ metric: 'open_incident_count', operator: 'gte', value: 1 }] },
    ],
    evaluationMode: 'event_driven',
    autoRemove: true,
  },

  {
    name: 'Tax Exempt',
    slug: 'tax-exempt',
    color: '#3B82F6',
    icon: 'FileText',
    category: 'operational',
    description: 'Customers flagged as tax-exempt for POS tax calculation.',
    conditions: [
      { conditions: [{ metric: 'tax_exempt', operator: 'eq', value: true }] },
    ],
    evaluationMode: 'event_driven',
    autoRemove: true,
  },
];
