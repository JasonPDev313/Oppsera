import type { IntentContext, ResolvedIntent, PipelineMode } from './types';
import type { RegistryCatalog } from '../registry/types';

// ── Deterministic Fast Path (SEM-03) ─────────────────────────────
// Matches common, unambiguous queries via regex/keyword patterns and
// returns a pre-built ResolvedIntent without calling the LLM.
// This saves ~500ms+ latency and ~$0.003 per call for simple queries.
//
// Design principles:
// 1. Only match queries with HIGH confidence (no ambiguity).
// 2. Always verify that the resolved metrics/dimensions exist in the catalog.
// 3. Return null (fall through to LLM) when uncertain.

interface FastPathPattern {
  /** Regex to match the user's message (case-insensitive) */
  pattern: RegExp;
  /** Build the resolved intent from the match */
  build: (match: RegExpMatchArray, context: IntentContext, catalog: RegistryCatalog) => ResolvedIntent | null;
}

// ── Date range helpers ───────────────────────────────────────────

function parseDateFromContext(context: IntentContext): Date {
  return new Date(context.currentDate + 'T00:00:00');
}

function todayRange(context: IntentContext): { start: string; end: string } {
  return { start: context.currentDate, end: context.currentDate };
}

function yesterdayRange(context: IntentContext): { start: string; end: string } {
  const d = parseDateFromContext(context);
  d.setDate(d.getDate() - 1);
  const iso = d.toISOString().slice(0, 10);
  return { start: iso, end: iso };
}

function last7DaysRange(context: IntentContext): { start: string; end: string } {
  const d = parseDateFromContext(context);
  d.setDate(d.getDate() - 6);
  return { start: d.toISOString().slice(0, 10), end: context.currentDate };
}

function last30DaysRange(context: IntentContext): { start: string; end: string } {
  const d = parseDateFromContext(context);
  d.setDate(d.getDate() - 29);
  return { start: d.toISOString().slice(0, 10), end: context.currentDate };
}

function thisMonthRange(context: IntentContext): { start: string; end: string } {
  const d = parseDateFromContext(context);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  return { start: start.toISOString().slice(0, 10), end: context.currentDate };
}

function lastMonthRange(context: IntentContext): { start: string; end: string } {
  const d = parseDateFromContext(context);
  const start = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const end = new Date(d.getFullYear(), d.getMonth(), 0); // last day of previous month
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

// ── Catalog helpers ──────────────────────────────────────────────

function hasMetric(catalog: RegistryCatalog, slug: string): boolean {
  return catalog.metrics.some((m) => m.slug === slug);
}

function hasDimension(catalog: RegistryCatalog, slug: string): boolean {
  return catalog.dimensions.some((d) => d.slug === slug);
}

// ── Intent builder ───────────────────────────────────────────────

function buildFastIntent(
  mode: PipelineMode,
  metrics: string[],
  dimensions: string[],
  dateRange: { start: string; end: string } | undefined,
  intent: string,
  timeGranularity?: 'day' | 'week' | 'month',
): ResolvedIntent {
  return {
    mode,
    plan: {
      metrics,
      dimensions,
      filters: [],
      dateRange,
      timeGranularity,
      intent,
      rationale: 'Fast path — deterministic pattern match',
    },
    confidence: 0.95,
    isClarification: false,
    rawResponse: '{"fastPath":true}',
    tokensInput: 0,
    tokensOutput: 0,
    latencyMs: 0,
    provider: 'fast-path',
    model: 'deterministic',
  };
}

// ── Pattern definitions ──────────────────────────────────────────

const PATTERNS: FastPathPattern[] = [
  // ── "sales today" / "today's sales" / "revenue today" ──
  {
    pattern: /^(?:(?:total|net|gross)\s+)?(?:sales|revenue)\s+today\??$/i,
    build: (_m, ctx, cat) => {
      if (!hasMetric(cat, 'net_sales') || !hasDimension(cat, 'date')) return null;
      return buildFastIntent('metrics', ['net_sales'], ['date'], todayRange(ctx), 'Total sales for today');
    },
  },
  {
    pattern: /^today'?s?\s+(?:(?:total|net|gross)\s+)?(?:sales|revenue)\??$/i,
    build: (_m, ctx, cat) => {
      if (!hasMetric(cat, 'net_sales') || !hasDimension(cat, 'date')) return null;
      return buildFastIntent('metrics', ['net_sales'], ['date'], todayRange(ctx), 'Total sales for today');
    },
  },

  // ── "sales yesterday" ──
  {
    pattern: /^(?:(?:total|net|gross)\s+)?(?:sales|revenue)\s+yesterday\??$/i,
    build: (_m, ctx, cat) => {
      if (!hasMetric(cat, 'net_sales') || !hasDimension(cat, 'date')) return null;
      return buildFastIntent('metrics', ['net_sales'], ['date'], yesterdayRange(ctx), 'Total sales for yesterday');
    },
  },

  // ── "sales this week" / "this week's sales" ──
  {
    pattern: /^(?:(?:total|net|gross)\s+)?(?:sales|revenue)\s+(?:this\s+week|last\s+7\s+days)\??$/i,
    build: (_m, ctx, cat) => {
      if (!hasMetric(cat, 'net_sales') || !hasDimension(cat, 'date')) return null;
      return buildFastIntent('metrics', ['net_sales'], ['date'], last7DaysRange(ctx), 'Sales for last 7 days', 'day');
    },
  },
  {
    pattern: /^(?:this\s+week'?s?\s+)?(?:sales|revenue)(?:\s+this\s+week)?\??$/i,
    build: (_m, ctx, cat) => {
      // Only match if "this week" appears somewhere
      if (!/this\s+week/i.test(_m[0])) return null;
      if (!hasMetric(cat, 'net_sales') || !hasDimension(cat, 'date')) return null;
      return buildFastIntent('metrics', ['net_sales'], ['date'], last7DaysRange(ctx), 'Sales for this week', 'day');
    },
  },

  // ── "sales this month" / "this month's sales" ──
  {
    pattern: /^(?:(?:total|net|gross)\s+)?(?:sales|revenue)\s+this\s+month\??$/i,
    build: (_m, ctx, cat) => {
      if (!hasMetric(cat, 'net_sales') || !hasDimension(cat, 'date')) return null;
      return buildFastIntent('metrics', ['net_sales'], ['date'], thisMonthRange(ctx), 'Sales for this month', 'day');
    },
  },

  // ── "sales last month" ──
  {
    pattern: /^(?:(?:total|net|gross)\s+)?(?:sales|revenue)\s+last\s+month\??$/i,
    build: (_m, ctx, cat) => {
      if (!hasMetric(cat, 'net_sales') || !hasDimension(cat, 'date')) return null;
      return buildFastIntent('metrics', ['net_sales'], ['date'], lastMonthRange(ctx), 'Sales for last month', 'day');
    },
  },

  // ── "how many orders today" / "order count today" ──
  {
    pattern: /^(?:how\s+many\s+orders?\s+today|order\s+count\s+today|today'?s?\s+order\s+count)\??$/i,
    build: (_m, ctx, cat) => {
      if (!hasMetric(cat, 'order_count') || !hasDimension(cat, 'date')) return null;
      return buildFastIntent('metrics', ['order_count'], ['date'], todayRange(ctx), 'Order count for today');
    },
  },

  // ── "how many orders this week" ──
  {
    pattern: /^(?:how\s+many\s+orders?\s+(?:this\s+week|last\s+7\s+days)|orders?\s+(?:this\s+week|last\s+7\s+days))\??$/i,
    build: (_m, ctx, cat) => {
      if (!hasMetric(cat, 'order_count') || !hasDimension(cat, 'date')) return null;
      return buildFastIntent('metrics', ['order_count'], ['date'], last7DaysRange(ctx), 'Order count for last 7 days', 'day');
    },
  },

  // ── "average order value today" / "AOV today" ──
  {
    pattern: /^(?:average\s+order\s+value|aov|avg\s+order)\s+today\??$/i,
    build: (_m, ctx, cat) => {
      if (!hasMetric(cat, 'avg_order_value') || !hasDimension(cat, 'date')) return null;
      return buildFastIntent('metrics', ['avg_order_value'], ['date'], todayRange(ctx), 'Average order value for today');
    },
  },

  // ── "top items today" / "top selling items today" ──
  {
    pattern: /^(?:top\s+(?:selling\s+)?items?\s+today|today'?s?\s+top\s+(?:selling\s+)?items?)\??$/i,
    build: (_m, ctx, cat) => {
      if (!hasMetric(cat, 'item_qty_sold') || !hasDimension(cat, 'item_name')) return null;
      return buildFastIntent(
        'metrics',
        ['item_qty_sold', 'item_revenue'],
        ['item_name', 'date'],
        todayRange(ctx),
        'Top selling items today',
      );
    },
  },

  // ── "sales by category this week" / "category sales this week" ──
  {
    pattern: /^(?:sales?\s+by\s+(?:category|department)|(?:category|department)\s+sales?)\s+(?:this\s+week|last\s+7\s+days)\??$/i,
    build: (_m, ctx, cat) => {
      const hasCat = hasDimension(cat, 'category') || hasDimension(cat, 'sub_department');
      if (!hasMetric(cat, 'net_sales') || !hasCat) return null;
      const dim = hasDimension(cat, 'category') ? 'category' : 'sub_department';
      return buildFastIntent('metrics', ['net_sales'], [dim, 'date'], last7DaysRange(ctx), 'Sales by category this week', 'day');
    },
  },

  // ── "sales last 30 days" ──
  {
    pattern: /^(?:(?:total|net|gross)\s+)?(?:sales|revenue)\s+(?:last|past)\s+30\s+days?\??$/i,
    build: (_m, ctx, cat) => {
      if (!hasMetric(cat, 'net_sales') || !hasDimension(cat, 'date')) return null;
      return buildFastIntent('metrics', ['net_sales'], ['date'], last30DaysRange(ctx), 'Sales for last 30 days', 'day');
    },
  },

  // ── "void rate today" / "voids today" ──
  {
    pattern: /^(?:void\s+(?:rate|count|total)|voids?)\s+today\??$/i,
    build: (_m, ctx, cat) => {
      if (!hasMetric(cat, 'void_count') || !hasDimension(cat, 'date')) return null;
      return buildFastIntent('metrics', ['void_count', 'void_total'], ['date'], todayRange(ctx), 'Void metrics for today');
    },
  },

  // ── "how many customers" (SQL mode — no date) ──
  {
    pattern: /^how\s+many\s+customers?\s*(?:do\s+(?:i|we)\s+have)?\??$/i,
    build: (_m, _ctx, _cat) => {
      return buildFastIntent('sql', [], [], undefined, 'Count of customers');
    },
  },

  // ── "how many users" / "how many staff" (SQL mode) ──
  {
    pattern: /^how\s+many\s+(?:users?|staff|employees?|team\s+members?)\s*(?:do\s+(?:i|we)\s+have)?\??$/i,
    build: (_m, _ctx, _cat) => {
      return buildFastIntent('sql', [], [], undefined, 'Count of staff/users');
    },
  },
];

// ── Public API ───────────────────────────────────────────────────

/**
 * Attempt to resolve intent deterministically without calling the LLM.
 * Returns null if the message doesn't match any known pattern.
 *
 * Only matches simple, unambiguous queries. Anything complex
 * (multi-turn context, comparisons, custom filters) falls through.
 */
export function tryFastPath(
  message: string,
  context: IntentContext,
  catalog: RegistryCatalog,
): ResolvedIntent | null {
  // Skip fast path when there's conversation history — multi-turn
  // context changes meaning (e.g. "and for last month?" references prior query)
  if (context.history && context.history.length > 0) return null;

  const trimmed = message.trim();

  // Skip messages that are too long or too complex for pattern matching
  if (trimmed.length > 100) return null;

  for (const { pattern, build } of PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const result = build(match, context, catalog);
      if (result) {
        console.log(`[semantic] Fast path matched: "${trimmed}" → ${result.plan.intent}`);
        return result;
      }
    }
  }

  return null;
}
