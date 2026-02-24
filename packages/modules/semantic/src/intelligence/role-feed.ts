// ── Role-Based Insight Feed ────────────────────────────────────────
// Generates personalized insight feeds for each role. KPIs, suggested
// questions, recent findings, and optional digest summaries are
// tailored to the user's role and their data patterns.

import { withTenant } from '@oppsera/db';
import {
  rmDailySales,
  semanticAnalysisFindings,
  semanticUserPreferences,
} from '@oppsera/db';
import { sql, eq, and, gte, lte, desc } from 'drizzle-orm';
import type { AnalysisFinding } from './background-analyst';

// ── Types ──────────────────────────────────────────────────────────

export interface KpiCard {
  /** KPI label displayed to the user */
  label: string;
  /** Raw numeric value */
  value: number;
  /** Formatted value for display (e.g., "$12,345.67") */
  formattedValue: string;
  /** Trend direction: 'up' | 'down' | 'flat' */
  trend: 'up' | 'down' | 'flat';
  /** Percentage change from previous period */
  trendPct: number;
  /** Whether the trend direction is positive (green) or negative (red) */
  isPositive: boolean;
}

export interface DigestSummary {
  /** Period covered by the digest */
  period: string;
  /** Key headline for the period */
  headline: string;
  /** 2-3 sentence summary */
  body: string;
}

export interface RoleFeedResult {
  /** Personalized greeting */
  greeting: string;
  /** 3-4 role-specific KPI cards */
  kpis: KpiCard[];
  /** 3-5 suggested follow-up questions */
  suggestions: string[];
  /** Recent unread analysis findings (max 5) */
  recentFindings: AnalysisFinding[];
  /** Optional digest summary (populated if a digest was generated) */
  digest: DigestSummary | null;
}

// ── Role KPI configuration ─────────────────────────────────────────

interface KpiConfig {
  /** Metric slug for lookup */
  metricSlug: string;
  /** Column in rm_daily_sales */
  column: string;
  /** Display label */
  label: string;
  /** 'currency' | 'integer' | 'currency_avg' */
  format: 'currency' | 'integer' | 'currency_avg';
  /** Whether higher is better (affects isPositive calculation) */
  higherIsBetter: boolean;
}

const ROLE_KPIS: Record<string, KpiConfig[]> = {
  owner: [
    { metricSlug: 'net_sales', column: 'net_sales', label: 'Net Sales', format: 'currency', higherIsBetter: true },
    { metricSlug: 'order_count', column: 'order_count', label: 'Orders', format: 'integer', higherIsBetter: true },
    { metricSlug: 'avg_order_value', column: 'avg_order_value', label: 'Avg Order', format: 'currency_avg', higherIsBetter: true },
    { metricSlug: 'discount_total', column: 'discount_total', label: 'Discounts Given', format: 'currency', higherIsBetter: false },
  ],
  manager: [
    { metricSlug: 'net_sales', column: 'net_sales', label: 'Net Sales', format: 'currency', higherIsBetter: true },
    { metricSlug: 'order_count', column: 'order_count', label: 'Orders', format: 'integer', higherIsBetter: true },
    { metricSlug: 'avg_order_value', column: 'avg_order_value', label: 'Avg Order', format: 'currency_avg', higherIsBetter: true },
    { metricSlug: 'void_count', column: 'void_count', label: 'Voids', format: 'integer', higherIsBetter: false },
  ],
  supervisor: [
    { metricSlug: 'net_sales', column: 'net_sales', label: 'Net Sales', format: 'currency', higherIsBetter: true },
    { metricSlug: 'order_count', column: 'order_count', label: 'Orders', format: 'integer', higherIsBetter: true },
    { metricSlug: 'void_count', column: 'void_count', label: 'Voids', format: 'integer', higherIsBetter: false },
    { metricSlug: 'discount_total', column: 'discount_total', label: 'Discounts', format: 'currency', higherIsBetter: false },
  ],
  cashier: [
    { metricSlug: 'order_count', column: 'order_count', label: 'Orders', format: 'integer', higherIsBetter: true },
    { metricSlug: 'tender_cash', column: 'tender_cash', label: 'Cash Collected', format: 'currency', higherIsBetter: true },
    { metricSlug: 'tender_card', column: 'tender_card', label: 'Card Collected', format: 'currency', higherIsBetter: true },
  ],
  server: [
    { metricSlug: 'order_count', column: 'order_count', label: 'Covers', format: 'integer', higherIsBetter: true },
    { metricSlug: 'net_sales', column: 'net_sales', label: 'Sales', format: 'currency', higherIsBetter: true },
    { metricSlug: 'avg_order_value', column: 'avg_order_value', label: 'Avg Check', format: 'currency_avg', higherIsBetter: true },
  ],
  staff: [
    { metricSlug: 'order_count', column: 'order_count', label: 'Orders', format: 'integer', higherIsBetter: true },
    { metricSlug: 'net_sales', column: 'net_sales', label: 'Sales', format: 'currency', higherIsBetter: true },
  ],
};

// ── Role-specific suggestions ──────────────────────────────────────

const ROLE_SUGGESTIONS: Record<string, string[]> = {
  owner: [
    "Review this week's P&L summary",
    'Check inventory turnover rates',
    'Show me top performing items this month',
    'What are the key trends I should know about?',
    'How does this location compare to others?',
  ],
  manager: [
    "How's today's labor coverage looking?",
    'Show me low stock alerts',
    'Compare location performance this week',
    "What's our void rate trending at?",
    'Which staff members have the most sales today?',
  ],
  supervisor: [
    'Show me today\'s order volume by hour',
    'Any voids or comps I should review?',
    'What are today\'s top selling items?',
    'How does today compare to last week?',
  ],
  cashier: [
    'How many orders have I processed today?',
    "What's our busiest hour today?",
    'Show me top items sold today',
  ],
  server: [
    'How are my sales today compared to yesterday?',
    "What's the average check size today?",
    'Show me my top items this shift',
  ],
  staff: [
    'How many orders today?',
    "What's selling well today?",
    'Show me a sales summary for this week',
  ],
};

// ── Greeting generator ─────────────────────────────────────────────

function generateGreeting(role: string, currentDate: string): string {
  const date = new Date(currentDate);
  const hour = date.getHours();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[date.getDay()] ?? 'today';

  let timeGreeting: string;
  if (hour < 12) {
    timeGreeting = 'Good morning';
  } else if (hour < 17) {
    timeGreeting = 'Good afternoon';
  } else {
    timeGreeting = 'Good evening';
  }

  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  const greetings = [
    `${timeGreeting}! Here's your ${dayName} snapshot.`,
    `${timeGreeting}! Ready to make ${dayName} a great day.`,
    `${timeGreeting}, ${roleLabel}. Here's what's happening.`,
  ];

  // Deterministic selection based on date to avoid flickering
  const idx = date.getDate() % greetings.length;
  return greetings[idx]!;
}

// ── KPI formatter ──────────────────────────────────────────────────

function formatKpiValue(value: number, format: KpiConfig['format']): string {
  switch (format) {
    case 'currency':
      return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'currency_avg':
      return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'integer':
      return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
    default:
      return String(value);
  }
}

// ── KPI fetcher ────────────────────────────────────────────────────

async function fetchKpis(
  tenantId: string,
  kpiConfigs: KpiConfig[],
  currentDate: string,
): Promise<KpiCard[]> {
  return withTenant(tenantId, async (tx) => {
    const cards: KpiCard[] = [];

    for (const config of kpiConfigs) {
      // Current period: today (or last 7 days for avg)
      const isAvgMetric = config.format === 'currency_avg';

      const currentRows = await tx
        .select({
          value: isAvgMetric
            ? sql<string>`COALESCE(AVG(${sql.raw(config.column)}), 0)`
            : sql<string>`COALESCE(SUM(${sql.raw(config.column)}), 0)`,
        })
        .from(rmDailySales)
        .where(and(
          eq(rmDailySales.tenantId, tenantId),
          gte(rmDailySales.businessDate, sql`(${currentDate}::date - INTERVAL '7 days')::date`),
          lte(rmDailySales.businessDate, sql`${currentDate}::date`),
        ));

      // Previous period: 8-14 days ago
      const previousRows = await tx
        .select({
          value: isAvgMetric
            ? sql<string>`COALESCE(AVG(${sql.raw(config.column)}), 0)`
            : sql<string>`COALESCE(SUM(${sql.raw(config.column)}), 0)`,
        })
        .from(rmDailySales)
        .where(and(
          eq(rmDailySales.tenantId, tenantId),
          gte(rmDailySales.businessDate, sql`(${currentDate}::date - INTERVAL '14 days')::date`),
          lte(rmDailySales.businessDate, sql`(${currentDate}::date - INTERVAL '8 days')::date`),
        ));

      const currentValue = Number(currentRows[0]?.value ?? 0);
      const previousValue = Number(previousRows[0]?.value ?? 0);

      const trendPct = previousValue !== 0
        ? Math.round(((currentValue - previousValue) / previousValue) * 1000) / 10
        : 0;

      const trend: KpiCard['trend'] =
        Math.abs(trendPct) < 1 ? 'flat' :
        trendPct > 0 ? 'up' : 'down';

      // isPositive depends on direction AND whether higher is better
      const isPositive = config.higherIsBetter
        ? trend === 'up' || trend === 'flat'
        : trend === 'down' || trend === 'flat';

      cards.push({
        label: config.label,
        value: Math.round(currentValue * 100) / 100,
        formattedValue: formatKpiValue(currentValue, config.format),
        trend,
        trendPct,
        isPositive,
      });
    }

    return cards;
  });
}

// ── Findings fetcher ───────────────────────────────────────────────

function rowToFinding(row: typeof semanticAnalysisFindings.$inferSelect): AnalysisFinding {
  return {
    id: row.id,
    tenantId: row.tenantId,
    findingType: row.findingType as AnalysisFinding['findingType'],
    title: row.title,
    summary: row.summary,
    confidence: Number(row.confidence ?? 0),
    priority: row.priority as AnalysisFinding['priority'],
    suggestedActions: (row.suggestedActions as string[] | null) ?? [],
    chartData: (row.chartData as AnalysisFinding['chartData']) ?? null,
    metricSlugs: (row.metricSlugs as string[] | null) ?? [],
    baselineValue: row.baselineValue != null ? Number(row.baselineValue) : null,
    observedValue: row.observedValue != null ? Number(row.observedValue) : null,
    changePct: row.changePct != null ? Number(row.changePct) : null,
    businessDateStart: row.businessDateStart ?? null,
    businessDateEnd: row.businessDateEnd ?? null,
    isRead: row.isRead,
    isDismissed: row.isDismissed,
    createdAt: row.createdAt.toISOString(),
  };
}

async function fetchRecentFindings(
  tenantId: string,
  limit: number = 5,
): Promise<AnalysisFinding[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(semanticAnalysisFindings)
      .where(and(
        eq(semanticAnalysisFindings.tenantId, tenantId),
        eq(semanticAnalysisFindings.isDismissed, false),
      ))
      .orderBy(desc(semanticAnalysisFindings.createdAt))
      .limit(limit);

    return rows.map(rowToFinding);
  });
}

// ── Preference-based suggestions ───────────────────────────────────

async function getPersonalizedSuggestions(
  tenantId: string,
  userId: string,
  baseSuggestions: string[],
): Promise<string[]> {
  try {
    const rows = await withTenant(tenantId, async (tx) => {
      return tx
        .select()
        .from(semanticUserPreferences)
        .where(and(
          eq(semanticUserPreferences.tenantId, tenantId),
          eq(semanticUserPreferences.userId, userId),
        ))
        .limit(1);
    });

    const prefs = rows[0];
    if (!prefs) return baseSuggestions;

    const personalSuggestions: string[] = [];

    // Add suggestions based on frequent questions
    const frequentQuestions = prefs.frequentQuestions;
    if (frequentQuestions && frequentQuestions.length > 0) {
      // Sort by count descending, take top 2
      const topQuestions = [...frequentQuestions]
        .sort((a, b) => b.count - a.count)
        .slice(0, 2);

      for (const q of topQuestions) {
        personalSuggestions.push(q.question);
      }
    }

    // Add suggestions based on topic interests
    const topicInterests = prefs.topicInterests;
    if (topicInterests) {
      const topTopics = Object.entries(topicInterests)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 2);

      for (const [topic] of topTopics) {
        const topicLabel = topic.replace(/_/g, ' ');
        personalSuggestions.push(`What's the latest on ${topicLabel}?`);
      }
    }

    // Merge personal + base, remove duplicates, cap at 5
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const s of [...personalSuggestions, ...baseSuggestions]) {
      const key = s.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(s);
      if (merged.length >= 5) break;
    }

    return merged;
  } catch {
    // Preferences lookup failure is non-blocking
    return baseSuggestions;
  }
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Generates a personalized insight feed for a specific role.
 *
 * Includes:
 * - KPI cards tailored to the role (e.g., Owner sees P&L metrics, Cashier sees transaction counts)
 * - Suggested questions relevant to the role
 * - Recent analysis findings (from background analyst)
 * - Optional personalization from user preference tracker
 *
 * @param tenantId - The tenant to generate the feed for
 * @param role - The user's role (owner, manager, cashier, server, staff)
 * @param currentDate - ISO date string for the current business date
 * @param userId - Optional user ID for personalized suggestions
 */
export async function getRoleInsightFeed(
  tenantId: string,
  role: string,
  currentDate: string,
  userId?: string,
): Promise<RoleFeedResult> {
  // Normalize role to lowercase for lookup
  const normalizedRole = role.toLowerCase();

  // Get role-specific KPI config, fall back to 'staff' if unknown
  const kpiConfigs = ROLE_KPIS[normalizedRole] ?? ROLE_KPIS['staff']!;
  const baseSuggestions = ROLE_SUGGESTIONS[normalizedRole] ?? ROLE_SUGGESTIONS['staff']!;

  // Fetch KPIs, findings, and suggestions in parallel
  const [kpis, recentFindings, suggestions] = await Promise.all([
    fetchKpis(tenantId, kpiConfigs, currentDate),
    fetchRecentFindings(tenantId, 5),
    userId
      ? getPersonalizedSuggestions(tenantId, userId, baseSuggestions)
      : Promise.resolve(baseSuggestions),
  ]);

  // Generate greeting
  const greeting = generateGreeting(normalizedRole, currentDate);

  // Build digest if we have findings
  let digest: DigestSummary | null = null;
  if (recentFindings.length > 0) {
    const criticalCount = recentFindings.filter((f) => f.priority === 'critical').length;
    const highCount = recentFindings.filter((f) => f.priority === 'high').length;

    let headline: string;
    if (criticalCount > 0) {
      headline = `${criticalCount} critical finding${criticalCount > 1 ? 's' : ''} need attention`;
    } else if (highCount > 0) {
      headline = `${highCount} important insight${highCount > 1 ? 's' : ''} from recent analysis`;
    } else {
      headline = 'Business is running smoothly — a few items to review';
    }

    const topFinding = recentFindings[0];
    const body = topFinding
      ? `${topFinding.title}. ${topFinding.summary}`
      : 'No significant changes detected.';

    digest = {
      period: 'Last 7 days',
      headline,
      body,
    };
  }

  return {
    greeting,
    kpis,
    suggestions,
    recentFindings,
    digest,
  };
}
