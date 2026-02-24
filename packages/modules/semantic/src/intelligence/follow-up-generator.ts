// ── Follow-Up Suggestion Generator ─────────────────────────────────
// Generates 2-4 contextual follow-up question suggestions based on the
// current query plan, narrative sections, and user's message context.
// Uses heuristic rules (no LLM call needed) for fast, deterministic output.

import type { QueryPlan } from '../compiler/types';
import type { NarrativeSection, IntentContext } from '../llm/types';

// ── Types ──────────────────────────────────────────────────────────

export interface FollowUpContext {
  message: string;
  plan: QueryPlan;
  sections: NarrativeSection[];
  context: IntentContext;
}

// ── Heuristic rules ────────────────────────────────────────────────

interface FollowUpRule {
  /** Human label for debugging */
  name: string;
  /** Returns true when the rule applies */
  matches: (ctx: FollowUpContext) => boolean;
  /** Returns 1+ candidate follow-up questions */
  generate: (ctx: FollowUpContext) => string[];
}

const RULES: FollowUpRule[] = [
  // ── Time-based follow-ups ──────────────────────────────────────
  {
    name: 'has_date_dimension',
    matches: (ctx) =>
      ctx.plan.dimensions.includes('date') ||
      ctx.plan.dateRange != null,
    generate: (ctx) => {
      const suggestions: string[] = [];
      suggestions.push('How does this compare to the previous period?');
      if (ctx.plan.timeGranularity === 'day' || ctx.plan.timeGranularity === 'week') {
        suggestions.push('Show me the monthly trend instead');
      }
      if (ctx.plan.timeGranularity === 'month') {
        suggestions.push('Break this down by week');
      }
      return suggestions;
    },
  },

  // ── Location dimension follow-ups ──────────────────────────────
  {
    name: 'single_location',
    matches: (ctx) =>
      ctx.context.locationId != null &&
      !ctx.plan.dimensions.includes('location'),
    generate: () => [
      'How does this compare across all locations?',
    ],
  },
  {
    name: 'multi_location',
    matches: (ctx) => ctx.plan.dimensions.includes('location'),
    generate: () => [
      'Which location is improving the fastest?',
      'Show me just the top-performing location',
    ],
  },

  // ── Item-level query follow-ups ────────────────────────────────
  {
    name: 'item_level_query',
    matches: (ctx) =>
      ctx.plan.dimensions.includes('item') ||
      ctx.plan.metrics.some((m) => m.includes('item') || m === 'quantity_sold'),
    generate: (ctx) => {
      const suggestions: string[] = [];
      if (!ctx.plan.dimensions.includes('category')) {
        suggestions.push('What about at the category level?');
      }
      if (!ctx.plan.sort?.length) {
        suggestions.push('Show me the top 10 items by revenue');
      }
      if (!ctx.plan.metrics.includes('gross_margin')) {
        suggestions.push('Which items have the best margin?');
      }
      return suggestions;
    },
  },

  // ── Category-level follow-ups ──────────────────────────────────
  {
    name: 'category_level_query',
    matches: (ctx) =>
      ctx.plan.dimensions.includes('category') &&
      !ctx.plan.dimensions.includes('item'),
    generate: () => [
      'Drill down into the top category — show me the individual items',
      'What percentage of total sales does each category represent?',
    ],
  },

  // ── Sales → Inventory cross-domain ─────────────────────────────
  {
    name: 'sales_to_inventory',
    matches: (ctx) =>
      ctx.plan.metrics.some((m) =>
        ['net_sales', 'gross_sales', 'order_count', 'quantity_sold'].includes(m),
      ),
    generate: () => [
      'Do we have any low stock items I should reorder?',
      'What is our current inventory position?',
    ],
  },

  // ── Sales → Customer cross-domain ──────────────────────────────
  {
    name: 'sales_to_customer',
    matches: (ctx) =>
      ctx.plan.metrics.some((m) =>
        ['net_sales', 'avg_order_value', 'order_count'].includes(m),
      ) &&
      !ctx.plan.metrics.some((m) => m.includes('customer')),
    generate: () => [
      'Who are our top customers by spend?',
      'What does repeat customer activity look like?',
    ],
  },

  // ── Revenue and financial follow-ups ───────────────────────────
  {
    name: 'revenue_query',
    matches: (ctx) =>
      ctx.plan.metrics.some((m) =>
        ['net_sales', 'gross_sales', 'avg_order_value'].includes(m),
      ),
    generate: (ctx) => {
      const suggestions: string[] = [];
      if (!ctx.plan.metrics.includes('discount_total')) {
        suggestions.push('How much are we giving away in discounts?');
      }
      if (!ctx.plan.metrics.includes('void_count')) {
        suggestions.push('What is our void rate?');
      }
      return suggestions;
    },
  },

  // ── Inventory-specific follow-ups ──────────────────────────────
  {
    name: 'inventory_query',
    matches: (ctx) =>
      ctx.plan.metrics.some((m) => m.includes('on_hand') || m.includes('inventory')),
    generate: () => [
      'Which items are below their reorder point?',
      'What is our inventory turnover rate?',
    ],
  },

  // ── Golf-specific follow-ups ───────────────────────────────────
  {
    name: 'golf_metrics',
    matches: (ctx) =>
      ctx.plan.metrics.some((m) =>
        ['rounds_played', 'revenue_per_round', 'utilization_rate', 'pace_of_play'].includes(m),
      ) || ctx.context.lensSlug?.startsWith('golf') === true,
    generate: () => [
      'How does our tee sheet utilization compare weekday vs weekend?',
      'What is our revenue yield per available tee time?',
    ],
  },

  // ── Narrative-driven follow-ups ────────────────────────────────
  {
    name: 'has_recommendation',
    matches: (ctx) =>
      ctx.sections.some((s) => s.type === 'recommendation'),
    generate: () => [
      'Tell me more about that recommendation',
      'What would the ROI look like if we implemented that?',
    ],
  },

  // ── Fallback: "why" question ───────────────────────────────────
  {
    name: 'why_question_fallback',
    matches: () => true, // always applies
    generate: (ctx) => {
      const primaryMetric = ctx.plan.metrics[0];
      if (primaryMetric) {
        const metricLabel = primaryMetric.replace(/_/g, ' ');
        return [`Why did ${metricLabel} change?`];
      }
      return ['What should I focus on improving?'];
    },
  },

  // ── Fallback: time comparison ──────────────────────────────────
  {
    name: 'time_comparison_fallback',
    matches: () => true, // always applies
    generate: () => [
      'How does this compare to last week?',
    ],
  },
];

// ── Public API ─────────────────────────────────────────────────────

/**
 * Generates 2-4 contextual follow-up question suggestions.
 *
 * Uses heuristic rules based on the query plan, narrative sections,
 * and user context. No LLM call is made — this is purely deterministic.
 *
 * @returns Array of 2-4 follow-up question strings
 */
export function generateFollowUps(
  message: string,
  plan: QueryPlan,
  sections: NarrativeSection[],
  context: IntentContext,
): string[] {
  const ctx: FollowUpContext = { message, plan, sections, context };

  // Collect all candidate suggestions from matching rules
  const candidates: string[] = [];
  const seen = new Set<string>();

  for (const rule of RULES) {
    if (!rule.matches(ctx)) continue;

    const suggestions = rule.generate(ctx);
    for (const s of suggestions) {
      // De-duplicate
      const key = s.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(s);
    }
  }

  // Ensure we have a diversity of suggestion types:
  // - At least one time-comparison if available
  // - At least one cross-domain if available
  // - At least one "why" question

  // Cap at 4 and ensure minimum of 2
  const MAX_FOLLOW_UPS = 4;
  const MIN_FOLLOW_UPS = 2;

  const result = candidates.slice(0, MAX_FOLLOW_UPS);

  // Pad with generic suggestions if we don't have enough
  if (result.length < MIN_FOLLOW_UPS) {
    const fallbacks = [
      'What should I focus on improving?',
      'Show me a summary for this week',
      'What are the key trends I should know about?',
    ];
    for (const fb of fallbacks) {
      if (result.length >= MIN_FOLLOW_UPS) break;
      if (!seen.has(fb.toLowerCase().trim())) {
        result.push(fb);
        seen.add(fb.toLowerCase().trim());
      }
    }
  }

  return result;
}
