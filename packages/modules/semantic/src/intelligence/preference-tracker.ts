// ── User Preference Tracker (Cross-Session Memory) ──────────────
// Tracks user interaction patterns to build a preference profile
// that persists across chat sessions. Powers personalized
// suggestions and context enrichment in the LLM pipeline.

import { db } from '@oppsera/db';
import { semanticUserPreferences } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import type { QueryPlan } from '../compiler/types';

// ── Types ────────────────────────────────────────────────────────

export interface FrequentQuestion {
  question: string;
  count: number;
  lastAsked: string;
}

export interface UserPreferences {
  id: string;
  tenantId: string;
  userId: string;
  preferredMetrics: Record<string, number>;
  preferredDimensions: Record<string, number>;
  preferredGranularity: string | null;
  preferredLocationId: string | null;
  defaultDateRange: string | null;
  frequentQuestions: FrequentQuestion[];
  topicInterests: Record<string, number>;
  lastSessionContext: Record<string, unknown> | null;
  preferredChartType: string | null;
  showDebugPanel: boolean;
  autoExpandTables: boolean;
  insightFeedRole: string | null;
}

// ── Topic Extraction ────────────────────────────────────────────

/**
 * Extracts topic tags from a user message using simple keyword matching.
 * Returns a list of topic slugs for incrementing in topicInterests.
 */
function extractTopics(message: string): string[] {
  const lower = message.toLowerCase();
  const topics: string[] = [];

  const TOPIC_KEYWORDS: Record<string, string[]> = {
    sales: ['sales', 'revenue', 'income', 'earnings', 'sold'],
    inventory: ['inventory', 'stock', 'reorder', 'out of stock', 'on hand'],
    customers: ['customer', 'guest', 'member', 'loyalty', 'visit'],
    orders: ['order', 'transaction', 'ticket', 'check'],
    pricing: ['price', 'pricing', 'discount', 'margin', 'markup'],
    labor: ['labor', 'staff', 'employee', 'scheduling', 'hours'],
    marketing: ['marketing', 'promotion', 'campaign', 'coupon'],
    trends: ['trend', 'forecast', 'projection', 'compare', 'comparison'],
    operations: ['operations', 'efficiency', 'performance', 'kpi'],
    golf: ['golf', 'tee time', 'round', 'green fee', 'pace of play'],
    food_beverage: ['food', 'beverage', 'menu', 'kitchen', 'bar'],
    accounting: ['accounting', 'gl', 'journal', 'p&l', 'balance sheet'],
  };

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      topics.push(topic);
    }
  }

  return topics;
}

// ── Preference Tracking ─────────────────────────────────────────

/**
 * Tracks a user interaction (chat message + resolved plan) by updating
 * their preference profile. Increments metric/dimension/topic counters
 * and records the question in the frequent questions list.
 */
export async function trackUserInteraction(
  tenantId: string,
  userId: string,
  message: string,
  plan: QueryPlan,
): Promise<void> {
  // Get existing preferences or create defaults
  const [existing] = await db
    .select()
    .from(semanticUserPreferences)
    .where(
      and(
        eq(semanticUserPreferences.tenantId, tenantId),
        eq(semanticUserPreferences.userId, userId),
      ),
    );

  const now = new Date().toISOString();

  // Increment metric counters
  const preferredMetrics: Record<string, number> = existing?.preferredMetrics
    ? { ...(existing.preferredMetrics as Record<string, number>) }
    : {};
  for (const slug of plan.metrics) {
    preferredMetrics[slug] = (preferredMetrics[slug] ?? 0) + 1;
  }

  // Increment dimension counters
  const preferredDimensions: Record<string, number> = existing?.preferredDimensions
    ? { ...(existing.preferredDimensions as Record<string, number>) }
    : {};
  for (const slug of plan.dimensions) {
    preferredDimensions[slug] = (preferredDimensions[slug] ?? 0) + 1;
  }

  // Update topic interests
  const topicInterests: Record<string, number> = existing?.topicInterests
    ? { ...(existing.topicInterests as Record<string, number>) }
    : {};
  const topics = extractTopics(message);
  for (const topic of topics) {
    topicInterests[topic] = (topicInterests[topic] ?? 0) + 1;
  }

  // Update frequent questions (keep top 20)
  const frequentQuestions: FrequentQuestion[] = existing?.frequentQuestions
    ? [...(existing.frequentQuestions as FrequentQuestion[])]
    : [];

  // Normalize the message for deduplication
  const normalizedMsg = message.trim().toLowerCase().replace(/[?!.]+$/, '');
  const existingQuestion = frequentQuestions.find(
    (q) => q.question.toLowerCase().replace(/[?!.]+$/, '') === normalizedMsg,
  );

  if (existingQuestion) {
    existingQuestion.count += 1;
    existingQuestion.lastAsked = now;
  } else {
    frequentQuestions.push({ question: message.trim(), count: 1, lastAsked: now });
  }

  // Sort by count descending, keep top 20
  frequentQuestions.sort((a, b) => b.count - a.count);
  const trimmedQuestions = frequentQuestions.slice(0, 20);

  // Infer preferred granularity from the plan
  const preferredGranularity = plan.timeGranularity ?? existing?.preferredGranularity ?? null;

  // Build last session context snapshot
  const lastSessionContext: Record<string, unknown> = {
    lastMessage: message,
    lastMetrics: plan.metrics,
    lastDimensions: plan.dimensions,
    lastDateRange: plan.dateRange ?? null,
    timestamp: now,
  };

  if (existing) {
    // Update existing preferences
    await db
      .update(semanticUserPreferences)
      .set({
        preferredMetrics,
        preferredDimensions,
        preferredGranularity,
        topicInterests,
        frequentQuestions: trimmedQuestions,
        lastSessionContext,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(semanticUserPreferences.tenantId, tenantId),
          eq(semanticUserPreferences.userId, userId),
        ),
      );
  } else {
    // Create new preferences record
    await db.insert(semanticUserPreferences).values({
      id: generateUlid(),
      tenantId,
      userId,
      preferredMetrics,
      preferredDimensions,
      preferredGranularity,
      topicInterests,
      frequentQuestions: trimmedQuestions,
      lastSessionContext,
    });
  }
}

// ── Preference Retrieval ────────────────────────────────────────

/**
 * Retrieves the preference profile for a user, or null if no
 * interactions have been tracked yet.
 */
export async function getUserPreferences(
  tenantId: string,
  userId: string,
): Promise<UserPreferences | null> {
  const [row] = await db
    .select()
    .from(semanticUserPreferences)
    .where(
      and(
        eq(semanticUserPreferences.tenantId, tenantId),
        eq(semanticUserPreferences.userId, userId),
      ),
    );

  if (!row) return null;

  return {
    id: row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    preferredMetrics: (row.preferredMetrics as Record<string, number>) ?? {},
    preferredDimensions: (row.preferredDimensions as Record<string, number>) ?? {},
    preferredGranularity: row.preferredGranularity,
    preferredLocationId: row.preferredLocationId,
    defaultDateRange: row.defaultDateRange,
    frequentQuestions: (row.frequentQuestions as FrequentQuestion[]) ?? [],
    topicInterests: (row.topicInterests as Record<string, number>) ?? {},
    lastSessionContext: (row.lastSessionContext as Record<string, unknown>) ?? null,
    preferredChartType: row.preferredChartType,
    showDebugPanel: row.showDebugPanel ?? false,
    autoExpandTables: row.autoExpandTables ?? true,
    insightFeedRole: row.insightFeedRole,
  };
}

// ── Personalized Suggestions ────────────────────────────────────

/**
 * Generates 3-5 personalized question suggestions based on the user's
 * interaction history and role. Falls back to role-based defaults
 * when no history exists.
 */
export async function getPersonalizedSuggestions(
  tenantId: string,
  userId: string,
  role: string,
): Promise<string[]> {
  const prefs = await getUserPreferences(tenantId, userId);

  // If no history, return role-based defaults
  if (!prefs || Object.keys(prefs.preferredMetrics).length === 0) {
    return getRoleBasedDefaults(role);
  }

  const suggestions: string[] = [];

  // 1. Build suggestions from top metrics the user asks about most
  const topMetrics = Object.entries(prefs.preferredMetrics)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([slug]) => slug);

  if (topMetrics.length > 0) {
    const metricName = topMetrics[0]!.replace(/_/g, ' ');
    suggestions.push(`How did ${metricName} perform this week vs last week?`);
  }
  if (topMetrics.length > 1) {
    const metricName = topMetrics[1]!.replace(/_/g, ' ');
    suggestions.push(`Show me ${metricName} trends for the last 30 days`);
  }

  // 2. Build suggestions from top topics
  const topTopics = Object.entries(prefs.topicInterests)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2)
    .map(([topic]) => topic);

  const TOPIC_QUESTIONS: Record<string, string> = {
    sales: 'What are our top-selling items this week?',
    inventory: 'Which items are below reorder point?',
    customers: 'How is customer visit frequency trending?',
    orders: 'What is our average order value trend?',
    pricing: 'Where do we have the best profit margins?',
    labor: 'How is labor cost tracking against revenue?',
    marketing: 'Which promotions drove the most revenue?',
    trends: 'What are the biggest changes vs last month?',
    operations: 'What are our key performance indicators today?',
    golf: 'How is tee time utilization this week?',
    food_beverage: 'What are our top-selling menu items?',
    accounting: 'Give me a P&L summary for this month',
  };

  for (const topic of topTopics) {
    const question = TOPIC_QUESTIONS[topic];
    if (question && !suggestions.includes(question)) {
      suggestions.push(question);
    }
  }

  // 3. Add a recent question variation if we have history
  if (prefs.frequentQuestions.length > 0) {
    const recentQ = prefs.frequentQuestions[0]!;
    if (!suggestions.some((s) => s.toLowerCase() === recentQ.question.toLowerCase())) {
      suggestions.push(recentQ.question);
    }
  }

  // 4. Fill up to 5 with role-based defaults that aren't already included
  const defaults = getRoleBasedDefaults(role);
  for (const d of defaults) {
    if (suggestions.length >= 5) break;
    if (!suggestions.some((s) => s.toLowerCase() === d.toLowerCase())) {
      suggestions.push(d);
    }
  }

  return suggestions.slice(0, 5);
}

// ── Role-Based Defaults ─────────────────────────────────────────

function getRoleBasedDefaults(role: string): string[] {
  const lowerRole = role.toLowerCase();

  if (lowerRole === 'owner' || lowerRole === 'admin') {
    return [
      'How is the business performing this week?',
      'What are our top revenue drivers?',
      'Show me sales trends for the last 30 days',
      'Where should we focus to increase revenue?',
      'What are our KPIs today?',
    ];
  }

  if (lowerRole === 'manager') {
    return [
      "How did we do yesterday compared to last week's average?",
      'Which items are selling the most this week?',
      'Are there any items below reorder point?',
      'What is our average order value trend?',
      'Show me today\'s sales summary',
    ];
  }

  if (lowerRole === 'supervisor') {
    return [
      "What were today's sales?",
      'How many orders did we process today?',
      'Which items need restocking?',
      'Show me void activity this week',
    ];
  }

  if (lowerRole === 'cashier' || lowerRole === 'server' || lowerRole === 'staff') {
    return [
      "What were today's sales?",
      'How many orders did we process today?',
      'What are the most popular items?',
    ];
  }

  // Generic fallback
  return [
    'How is the business performing?',
    'Show me sales for this week',
    'What are the top-selling items?',
    'Give me a performance summary',
  ];
}
