// ── Golf Golden Examples ──────────────────────────────────────────
// Pre-built question → plan pairs for few-shot prompting.
// These are seeded into semantic_eval_examples for use in the intent resolver.
// currentDate: '2026-02-20' (test reference date)

import type { EvalExample } from '../evaluation/types';

// Lightweight type for seeding (no DB-assigned fields)
export interface GolfExampleSeed {
  question: string;
  plan: Record<string, unknown>;
  rationale: Record<string, unknown>;
  category: EvalExample['category'];
  difficulty: EvalExample['difficulty'];
}

export const GOLF_EXAMPLES: GolfExampleSeed[] = [
  // ── Simple: single metric, date dimension ────────────────────
  {
    question: 'How many rounds were played yesterday?',
    plan: {
      metrics: ['rounds_played'],
      dimensions: ['date'],
      filters: [],
      dateRange: { start: '2026-02-19', end: '2026-02-19' },
      timeGranularity: 'day',
      intent: 'Count rounds played on Feb 19, 2026',
      rationale: 'Single day query using rounds_played with date dimension',
    },
    rationale: {
      date_resolution: '"Yesterday" resolved to 2026-02-19',
      metrics_chosen: 'rounds_played is the volume metric for golf rounds',
    },
    category: 'golf',
    difficulty: 'simple',
  },

  // ── Simple: revenue metric ────────────────────────────────────
  {
    question: 'What was our green fee revenue this week?',
    plan: {
      metrics: ['green_fee_revenue'],
      dimensions: ['date'],
      filters: [],
      dateRange: { start: '2026-02-16', end: '2026-02-20' },
      timeGranularity: 'day',
      intent: 'Daily green fee revenue for the current week',
      rationale: '"This week" resolved to Mon Feb 16 – Fri Feb 20 2026',
    },
    rationale: {
      date_resolution: '"This week" = Monday 2026-02-16 to today 2026-02-20',
      metrics_chosen: 'green_fee_revenue for pure green fee analysis',
    },
    category: 'golf',
    difficulty: 'simple',
  },

  // ── Medium: breakdown by channel ─────────────────────────────
  {
    question: 'Show me rounds by booking channel this month',
    plan: {
      metrics: ['rounds_played'],
      dimensions: ['booking_channel'],
      filters: [],
      dateRange: { start: '2026-02-01', end: '2026-02-20' },
      timeGranularity: null,
      intent: 'Rounds breakdown by booking channel for February 2026',
      rationale: 'Booking channel dimension shows how rounds were booked',
    },
    rationale: {
      date_resolution: '"This month" = 2026-02-01 to 2026-02-20',
      dimensions_chosen: 'booking_channel groups by how rounds were booked (online, walk-in, etc.)',
    },
    category: 'golf',
    difficulty: 'medium',
  },

  // ── Medium: utilization with required date ────────────────────
  {
    question: 'What was our utilization rate last week by course?',
    plan: {
      metrics: ['utilization_rate'],
      dimensions: ['date', 'golf_course'],
      filters: [],
      dateRange: { start: '2026-02-09', end: '2026-02-15' },
      timeGranularity: 'day',
      intent: 'Daily utilization rate per course for week of Feb 9–15',
      rationale: 'utilization_rate requires date dimension; golf_course added for breakdown',
    },
    rationale: {
      date_resolution: '"Last week" = 2026-02-09 to 2026-02-15',
      metrics_chosen: 'utilization_rate = rounds/available_slots, requires date dimension',
      dimensions_chosen: 'date (required) + golf_course (requested by user)',
    },
    category: 'golf',
    difficulty: 'medium',
  },

  // ── Medium: filter by player type ────────────────────────────
  {
    question: 'How many member rounds did we have in January?',
    plan: {
      metrics: ['rounds_played'],
      dimensions: ['date'],
      filters: [{ dimensionSlug: 'player_type', operator: 'eq', value: 'member' }],
      dateRange: { start: '2026-01-01', end: '2026-01-31' },
      timeGranularity: 'day',
      intent: 'Daily member rounds for January 2026',
      rationale: 'Filter to member player_type, daily trend for January',
    },
    rationale: {
      date_resolution: '"January" = 2026-01-01 to 2026-01-31',
      filter_applied: 'player_type = member',
    },
    category: 'golf',
    difficulty: 'medium',
  },

  // ── Complex: multi-metric revenue analysis ────────────────────
  {
    question: 'Compare green fee revenue and cart revenue by day this month',
    plan: {
      metrics: ['green_fee_revenue', 'cart_revenue'],
      dimensions: ['date'],
      filters: [],
      dateRange: { start: '2026-02-01', end: '2026-02-20' },
      timeGranularity: 'day',
      sort: [{ metricSlug: 'green_fee_revenue', direction: 'asc' }],
      intent: 'Daily green fee and cart revenue comparison for February 2026',
      rationale: 'Multi-metric comparison of green fee vs cart revenue day by day',
    },
    rationale: {
      date_resolution: '"This month" = 2026-02-01 to 2026-02-20',
      metrics_chosen: 'green_fee_revenue and cart_revenue for side-by-side comparison',
      sort: 'date ascending for trend analysis',
    },
    category: 'golf',
    difficulty: 'complex',
  },

  // ── Complex: pace + rounds by daypart ────────────────────────
  {
    question: 'What is the average pace of play by time of day this week?',
    plan: {
      metrics: ['avg_pace_of_play', 'rounds_played'],
      dimensions: ['daypart'],
      filters: [],
      dateRange: { start: '2026-02-16', end: '2026-02-20' },
      timeGranularity: null,
      sort: [{ metricSlug: 'avg_pace_of_play', direction: 'desc' }],
      intent: 'Pace of play and rounds by daypart for this week',
      rationale: 'Daypart breakdown of pace with round count context',
    },
    rationale: {
      date_resolution: '"This week" = 2026-02-16 to 2026-02-20',
      metrics_chosen: 'avg_pace_of_play primary, rounds_played for context',
      dimensions_chosen: 'daypart (morning/afternoon/twilight)',
    },
    category: 'golf',
    difficulty: 'complex',
  },

  // ── Complex: day-of-week pattern analysis ────────────────────
  {
    question: 'Which day of the week has the highest rounds? Last 30 days.',
    plan: {
      metrics: ['rounds_played'],
      dimensions: ['day_of_week'],
      filters: [],
      dateRange: { start: '2026-01-21', end: '2026-02-20' },
      timeGranularity: null,
      sort: [{ metricSlug: 'rounds_played', direction: 'desc' }],
      limit: 7,
      intent: 'Rounds by day of week over the past 30 days',
      rationale: 'Day-of-week analysis to find peak days for golf rounds',
    },
    rationale: {
      date_resolution: '"Last 30 days" = 2026-01-21 to 2026-02-20',
      dimensions_chosen: 'day_of_week for pattern analysis',
      sort: 'rounds_played DESC to rank days',
    },
    category: 'golf',
    difficulty: 'complex',
  },
];

// ── Sync helper ───────────────────────────────────────────────────
// Converts seed objects to the format expected by semantic_eval_examples insert.

export function toEvalExampleInserts(examples: GolfExampleSeed[]) {
  return examples.map((ex) => ({
    question: ex.question,
    plan: ex.plan,
    rationale: ex.rationale,
    category: ex.category,
    difficulty: ex.difficulty,
    tenantId: null,            // system-level examples (not tenant-specific)
    sourceEvalTurnId: null,
    qualityScore: '1.00',      // hand-crafted = perfect quality
    isActive: true,
    addedBy: null,
  }));
}
