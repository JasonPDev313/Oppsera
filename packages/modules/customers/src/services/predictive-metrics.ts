/**
 * Predictive Metrics Service — CLV, Churn Risk, Next Visit, Spend Velocity
 *
 * Pure formula-based computation — no ML models.
 * Uses existing customer_metrics_daily and customer_metrics_lifetime tables.
 *
 * All results stored in customer_scores table via ON CONFLICT upsert.
 */

import { sql } from 'drizzle-orm';
import { withTenant, customerScores } from '@oppsera/db';
import { generateUlid, SCORE_TYPES } from '@oppsera/shared';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PredictiveMetricsResult {
  customerId: string;
  churnRisk: number; // 0.0-1.0
  predictedClv: number; // dollars
  spendVelocity: number; // growth rate (e.g., 0.15 = 15% growth)
  daysUntilPredictedVisit: number; // integer, 0 = today
}

export interface ComputePredictiveResult {
  customersProcessed: number;
  durationMs: number;
}

interface CustomerPredictiveData {
  customerId: string;
  totalVisits: number;
  totalSpendCents: number;
  avgSpendCents: number;
  lastVisitAt: Date | null;
  firstVisitAt: Date | null;
  // Trailing-window data
  recentOrders3mo: number;
  recentSpend3mo: number;
  recentOrders12mo: number;
  recentSpend12mo: number;
  // Visit pattern
  visitDates: string[]; // ISO date strings, sorted ascending
}

// ── Constants ────────────────────────────────────────────────────────────────

const MODEL_VERSION = 'predictive-v1';
const MS_PER_DAY = 86400000;

// ── Core Service ─────────────────────────────────────────────────────────────

/**
 * Compute predictive metrics for all customers in a tenant.
 * Batch operation for cron/scheduled use.
 */
export async function computePredictiveMetrics(tenantId: string): Promise<ComputePredictiveResult> {
  const startTime = Date.now();

  return withTenant(tenantId, async (tx) => {
    const customerData = await fetchPredictiveData(tx, tenantId);
    const now = new Date();

    for (const data of customerData) {
      const result = computeMetricsForCustomer(data, now);
      await upsertPredictiveScores(tx, tenantId, result, now);
    }

    return {
      customersProcessed: customerData.length,
      durationMs: Date.now() - startTime,
    };
  });
}

/**
 * Compute predictive metrics for a single customer.
 * Used for event-driven updates after order.placed, visit.recorded, etc.
 */
export async function computePredictiveMetricsForCustomer(
  tenantId: string,
  customerId: string,
): Promise<PredictiveMetricsResult | null> {
  return withTenant(tenantId, async (tx) => {
    const allData = await fetchPredictiveData(tx, tenantId, customerId);
    if (allData.length === 0) return null;

    const data = allData[0]!;
    const now = new Date();
    const result = computeMetricsForCustomer(data, now);
    await upsertPredictiveScores(tx, tenantId, result, now);
    return result;
  });
}

// ── Metric Formulas (Pure Functions) ─────────────────────────────────────────

/**
 * Compute all predictive metrics for one customer.
 * Pure function — no DB access.
 */
export function computeMetricsForCustomer(
  data: CustomerPredictiveData,
  now: Date,
): PredictiveMetricsResult {
  return {
    customerId: data.customerId,
    churnRisk: computeChurnRisk(data, now),
    predictedClv: computePredictedClv(data, now),
    spendVelocity: computeSpendVelocity(data),
    daysUntilPredictedVisit: computeDaysUntilNextVisit(data, now),
  };
}

/**
 * Churn Risk: 0.0-1.0 score based on:
 * - Days since last visit vs. average interval (50% weight)
 * - Trend in visit frequency: accelerating vs decelerating (30% weight)
 * - Trend in spend: growing vs shrinking (20% weight)
 */
export function computeChurnRisk(data: CustomerPredictiveData, now: Date): number {
  // No visits at all → moderate risk (they might be new)
  if (!data.lastVisitAt || data.totalVisits === 0) return 0.5;

  const daysSinceLastVisit = Math.max(0, (now.getTime() - data.lastVisitAt.getTime()) / MS_PER_DAY);

  // Average interval between visits
  const avgInterval = computeAverageVisitInterval(data, now);

  // Recency factor: how overdue is the customer? (50% weight)
  // If daysSince > 2x avgInterval, risk approaches 1.0
  let recencyFactor: number;
  if (avgInterval <= 0) {
    recencyFactor = daysSinceLastVisit > 90 ? 0.8 : 0.3;
  } else {
    const overdueRatio = daysSinceLastVisit / avgInterval;
    recencyFactor = Math.min(1.0, overdueRatio / 2.0);
  }

  // Frequency trend factor: comparing recent 3mo vs 12mo rate (30% weight)
  let frequencyFactor: number;
  const monthlyRate12mo = data.recentOrders12mo / 12;
  const monthlyRate3mo = data.recentOrders3mo / 3;

  if (monthlyRate12mo <= 0) {
    frequencyFactor = 0.7; // No 12mo data → moderate risk
  } else {
    const freqRatio = monthlyRate3mo / monthlyRate12mo;
    // < 1.0 = decelerating, > 1.0 = accelerating
    frequencyFactor = Math.min(1.0, Math.max(0.0, 1.0 - freqRatio));
  }

  // Spend trend factor (20% weight)
  let spendFactor: number;
  const monthlySpend12mo = data.recentSpend12mo / 12;
  const monthlySpend3mo = data.recentSpend3mo / 3;

  if (monthlySpend12mo <= 0) {
    spendFactor = 0.5;
  } else {
    const spendRatio = monthlySpend3mo / monthlySpend12mo;
    spendFactor = Math.min(1.0, Math.max(0.0, 1.0 - spendRatio));
  }

  const raw = recencyFactor * 0.5 + frequencyFactor * 0.3 + spendFactor * 0.2;
  return Math.round(raw * 100) / 100; // 2 decimal places
}

/**
 * Predicted CLV: (AOV × predicted orders next 12mo) + historical spend
 * Uses exponential decay on order frequency to predict future orders.
 */
export function computePredictedClv(data: CustomerPredictiveData, _now: Date): number {
  if (data.totalVisits === 0) return 0;

  const aov = data.avgSpendCents > 0 ? data.avgSpendCents / 100 : 0;

  // Compute decay-adjusted predicted monthly orders
  const monthlyRate12mo = data.recentOrders12mo / 12;
  const monthlyRate3mo = data.recentOrders3mo / 3;

  // Use the more recent rate with decay toward the longer-term rate
  const decayWeight = 0.7; // Weight toward recent trend
  const predictedMonthlyOrders =
    monthlyRate3mo * decayWeight + monthlyRate12mo * (1 - decayWeight);

  const predictedOrders12mo = Math.max(0, predictedMonthlyOrders * 12);
  const futureValue = aov * predictedOrders12mo;
  const historicalValue = data.totalSpendCents / 100;

  return Math.round((futureValue + historicalValue) * 100) / 100;
}

/**
 * Spend Velocity: trailing 3-month growth rate vs trailing 12-month baseline.
 * Returns a percentage: positive = growing, negative = declining.
 */
export function computeSpendVelocity(data: CustomerPredictiveData): number {
  const monthlySpend12mo = data.recentSpend12mo / 12;
  const monthlySpend3mo = data.recentSpend3mo / 3;

  if (monthlySpend12mo <= 0) {
    // No baseline spend → velocity is based on recent alone
    return monthlySpend3mo > 0 ? 1.0 : 0.0;
  }

  const velocity = (monthlySpend3mo - monthlySpend12mo) / monthlySpend12mo;
  return Math.round(velocity * 100) / 100;
}

/**
 * Predicted next visit: average inter-visit interval + day-of-week pattern.
 * Returns days until predicted visit (0 = today/overdue).
 */
export function computeDaysUntilNextVisit(data: CustomerPredictiveData, now: Date): number {
  if (!data.lastVisitAt || data.totalVisits <= 1) {
    return data.totalVisits === 0 ? 30 : 14; // Default: 30 days for new, 14 for single-visit
  }

  const avgInterval = computeAverageVisitInterval(data, now);
  if (avgInterval <= 0) return 7; // Fallback

  const daysSinceLastVisit = (now.getTime() - data.lastVisitAt.getTime()) / MS_PER_DAY;
  const daysUntil = Math.max(0, Math.round(avgInterval - daysSinceLastVisit));

  return daysUntil;
}

// ── Helper: Average Visit Interval ───────────────────────────────────────────

function computeAverageVisitInterval(data: CustomerPredictiveData, _now: Date): number {
  if (data.visitDates.length < 2) {
    // Use first→last visit span if we have them
    if (data.firstVisitAt && data.lastVisitAt && data.totalVisits >= 2) {
      const span = (data.lastVisitAt.getTime() - data.firstVisitAt.getTime()) / MS_PER_DAY;
      return span / (data.totalVisits - 1);
    }
    return 0;
  }

  // Compute average interval from visit dates
  let totalInterval = 0;
  for (let i = 1; i < data.visitDates.length; i++) {
    const prev = new Date(data.visitDates[i - 1]!).getTime();
    const curr = new Date(data.visitDates[i]!).getTime();
    totalInterval += (curr - prev) / MS_PER_DAY;
  }

  return totalInterval / (data.visitDates.length - 1);
}

// ── Data Fetching ────────────────────────────────────────────────────────────

async function fetchPredictiveData(
  tx: any,
  tenantId: string,
  customerId?: string,
): Promise<CustomerPredictiveData[]> {
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const threeMonthStr = threeMonthsAgo.toISOString().slice(0, 10);

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const twelveMonthStr = twelveMonthsAgo.toISOString().slice(0, 10);

  const customerFilter = customerId
    ? sql`AND c.id = ${customerId}`
    : sql``;

  const rows = await tx.execute(sql`
    SELECT
      c.id AS customer_id,
      COALESCE(lt.total_visits, c.total_visits, 0)::integer AS total_visits,
      COALESCE(lt.total_spend_cents, c.total_spend, 0)::bigint AS total_spend_cents,
      COALESCE(lt.avg_spend_cents, 0)::integer AS avg_spend_cents,
      lt.last_visit_at,
      lt.first_visit_at,
      COALESCE(m3.order_count, 0)::integer AS recent_orders_3mo,
      COALESCE(m3.spend_cents, 0)::bigint AS recent_spend_3mo,
      COALESCE(m12.order_count, 0)::integer AS recent_orders_12mo,
      COALESCE(m12.spend_cents, 0)::bigint AS recent_spend_12mo
    FROM customers c
    LEFT JOIN customer_metrics_lifetime lt
      ON lt.tenant_id = c.tenant_id AND lt.customer_id = c.id
    LEFT JOIN (
      SELECT customer_id,
        SUM(orders)::integer AS order_count,
        SUM(spend_cents)::bigint AS spend_cents
      FROM customer_metrics_daily
      WHERE tenant_id = ${tenantId} AND date >= ${threeMonthStr}
      GROUP BY customer_id
    ) m3 ON m3.customer_id = c.id
    LEFT JOIN (
      SELECT customer_id,
        SUM(orders)::integer AS order_count,
        SUM(spend_cents)::bigint AS spend_cents
      FROM customer_metrics_daily
      WHERE tenant_id = ${tenantId} AND date >= ${twelveMonthStr}
      GROUP BY customer_id
    ) m12 ON m12.customer_id = c.id
    WHERE c.tenant_id = ${tenantId}
      AND c.status = 'active'
      AND c.display_name NOT LIKE '[MERGED]%'
      ${customerFilter}
    ORDER BY c.id
  `);

  const customerIds = Array.from(rows as Iterable<Record<string, unknown>>).map((r) => String(r.customer_id));

  // Fetch visit dates for interval computation (last 12 months, up to 100 per customer)
  const visitDateMap = new Map<string, string[]>();
  if (customerIds.length > 0) {
    const visitRows = await tx.execute(sql`
      SELECT customer_id, date
      FROM customer_metrics_daily
      WHERE tenant_id = ${tenantId}
        AND date >= ${twelveMonthStr}
        AND visits > 0
      ORDER BY customer_id, date ASC
    `);

    for (const vr of Array.from(visitRows as Iterable<Record<string, unknown>>)) {
      const cid = String(vr.customer_id);
      if (!visitDateMap.has(cid)) visitDateMap.set(cid, []);
      visitDateMap.get(cid)!.push(String(vr.date));
    }
  }

  return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
    customerId: String(row.customer_id),
    totalVisits: Number(row.total_visits),
    totalSpendCents: Number(row.total_spend_cents),
    avgSpendCents: Number(row.avg_spend_cents),
    lastVisitAt: row.last_visit_at ? new Date(row.last_visit_at as string) : null,
    firstVisitAt: row.first_visit_at ? new Date(row.first_visit_at as string) : null,
    recentOrders3mo: Number(row.recent_orders_3mo),
    recentSpend3mo: Number(row.recent_spend_3mo),
    recentOrders12mo: Number(row.recent_orders_12mo),
    recentSpend12mo: Number(row.recent_spend_12mo),
    visitDates: visitDateMap.get(String(row.customer_id)) ?? [],
  }));
}

// ── Score Persistence ────────────────────────────────────────────────────────

async function upsertPredictiveScores(
  tx: any,
  tenantId: string,
  result: PredictiveMetricsResult,
  now: Date,
): Promise<void> {
  const scores = [
    {
      scoreType: SCORE_TYPES.CHURN_RISK,
      score: String(result.churnRisk),
      metadata: null,
    },
    {
      scoreType: SCORE_TYPES.PREDICTED_CLV,
      score: String(result.predictedClv),
      metadata: null,
    },
    {
      scoreType: SCORE_TYPES.SPEND_VELOCITY,
      score: String(result.spendVelocity),
      metadata: null,
    },
    {
      scoreType: SCORE_TYPES.DAYS_UNTIL_PREDICTED_VISIT,
      score: String(result.daysUntilPredictedVisit),
      metadata: null,
    },
  ];

  for (const row of scores) {
    await tx
      .insert(customerScores)
      .values({
        id: generateUlid(),
        tenantId,
        customerId: result.customerId,
        scoreType: row.scoreType,
        score: row.score,
        computedAt: now,
        modelVersion: MODEL_VERSION,
        metadata: row.metadata,
      })
      .onConflictDoUpdate({
        target: [customerScores.tenantId, customerScores.customerId, customerScores.scoreType],
        set: {
          score: row.score,
          computedAt: now,
          modelVersion: MODEL_VERSION,
          metadata: row.metadata,
        },
      });
  }
}
