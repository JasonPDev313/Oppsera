/**
 * RFM Scoring Engine — Recency, Frequency, Monetary Analysis
 *
 * Computes RFM scores for all customers in a tenant using quintile bucketing.
 * Each dimension (R, F, M) is scored 1-5 based on the customer's position
 * relative to the tenant's entire customer base.
 *
 * Results are stored in the customer_scores table with ON CONFLICT upsert.
 */

import { sql } from 'drizzle-orm';
import { withTenant, customerScores } from '@oppsera/db';
import { generateUlid, SCORE_TYPES, getRfmSegment } from '@oppsera/shared';
import type { RfmSegment } from '@oppsera/shared';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RfmScoreResult {
  customerId: string;
  recency: number; // 1-5
  frequency: number; // 1-5
  monetary: number; // 1-5
  composite: number; // R * F * M = 1-125
  segment: RfmSegment;
}

export interface ComputeRfmResult {
  customersScored: number;
  segmentDistribution: Record<string, number>;
  durationMs: number;
}

interface CustomerRawMetrics {
  id: string;
  daysSinceLastVisit: number;
  orderCount: number;
  totalSpendCents: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const TRAILING_MONTHS = 12;
const MODEL_VERSION = 'rfm-v1';

// ── Core Engine ──────────────────────────────────────────────────────────────

/**
 * Compute RFM scores for all active customers in a tenant.
 *
 * Steps:
 * 1. Fetch raw metrics for all customers (trailing 12 months)
 * 2. Assign quintile scores (1-5) for each dimension
 * 3. Map to RFM segment
 * 4. Upsert into customer_scores table
 */
export async function computeRfmScores(tenantId: string): Promise<ComputeRfmResult> {
  const startTime = Date.now();

  return withTenant(tenantId, async (tx) => {
    // 1. Fetch raw metrics
    const rawMetrics = await fetchCustomerMetrics(tx, tenantId);

    if (rawMetrics.length === 0) {
      return { customersScored: 0, segmentDistribution: {}, durationMs: Date.now() - startTime };
    }

    // 2. Compute quintile scores
    const scored = assignQuintileScores(rawMetrics);

    // 3. Upsert scores into DB
    const now = new Date();
    const segmentDistribution: Record<string, number> = {};

    for (const result of scored) {
      segmentDistribution[result.segment] = (segmentDistribution[result.segment] ?? 0) + 1;

      // Upsert all 4 score types (recency, frequency, monetary, composite)
      const scoreRows = [
        {
          scoreType: SCORE_TYPES.RFM_RECENCY,
          score: String(result.recency),
          metadata: { daysSinceLastVisit: rawMetrics.find((r) => r.id === result.customerId)?.daysSinceLastVisit ?? 0 },
        },
        {
          scoreType: SCORE_TYPES.RFM_FREQUENCY,
          score: String(result.frequency),
          metadata: { orderCount: rawMetrics.find((r) => r.id === result.customerId)?.orderCount ?? 0 },
        },
        {
          scoreType: SCORE_TYPES.RFM_MONETARY,
          score: String(result.monetary),
          metadata: { totalSpendCents: rawMetrics.find((r) => r.id === result.customerId)?.totalSpendCents ?? 0 },
        },
        {
          scoreType: SCORE_TYPES.RFM,
          score: String(result.composite),
          metadata: {
            recency: result.recency,
            frequency: result.frequency,
            monetary: result.monetary,
            segment: result.segment,
          },
        },
      ];

      for (const row of scoreRows) {
        await (tx as any)
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

    return {
      customersScored: scored.length,
      segmentDistribution,
      durationMs: Date.now() - startTime,
    };
  });
}

/**
 * Compute RFM score for a single customer (event-driven update).
 * Re-fetches tenant-wide percentiles to ensure accurate quintile placement.
 */
export async function computeRfmScoreForCustomer(
  tenantId: string,
  customerId: string,
): Promise<RfmScoreResult | null> {
  return withTenant(tenantId, async (tx) => {
    const rawMetrics = await fetchCustomerMetrics(tx, tenantId);
    const scored = assignQuintileScores(rawMetrics);
    const result = scored.find((s) => s.customerId === customerId);
    if (!result) return null;

    const customerRaw = rawMetrics.find((r) => r.id === customerId);
    const now = new Date();

    const scoreRows = [
      { scoreType: SCORE_TYPES.RFM_RECENCY, score: String(result.recency), metadata: { daysSinceLastVisit: customerRaw?.daysSinceLastVisit ?? 0 } },
      { scoreType: SCORE_TYPES.RFM_FREQUENCY, score: String(result.frequency), metadata: { orderCount: customerRaw?.orderCount ?? 0 } },
      { scoreType: SCORE_TYPES.RFM_MONETARY, score: String(result.monetary), metadata: { totalSpendCents: customerRaw?.totalSpendCents ?? 0 } },
      { scoreType: SCORE_TYPES.RFM, score: String(result.composite), metadata: { recency: result.recency, frequency: result.frequency, monetary: result.monetary, segment: result.segment } },
    ];

    for (const row of scoreRows) {
      await (tx as any)
        .insert(customerScores)
        .values({
          id: generateUlid(),
          tenantId,
          customerId,
          scoreType: row.scoreType,
          score: row.score,
          computedAt: now,
          modelVersion: MODEL_VERSION,
          metadata: row.metadata,
        })
        .onConflictDoUpdate({
          target: [customerScores.tenantId, customerScores.customerId, customerScores.scoreType],
          set: { score: row.score, computedAt: now, modelVersion: MODEL_VERSION, metadata: row.metadata },
        });
    }

    return result;
  });
}

// ── Data Fetching ────────────────────────────────────────────────────────────

async function fetchCustomerMetrics(tx: any, tenantId: string): Promise<CustomerRawMetrics[]> {
  const trailingDate = new Date();
  trailingDate.setMonth(trailingDate.getMonth() - TRAILING_MONTHS);
  const trailingDateStr = trailingDate.toISOString().slice(0, 10); // YYYY-MM-DD

  // Use customer_metrics_daily for trailing-window aggregates, fall back to customers table
  const rows = await tx.execute(sql`
    SELECT
      c.id,
      COALESCE(
        EXTRACT(EPOCH FROM (NOW() - c.last_visit_at)) / 86400,
        9999
      )::integer AS days_since_last_visit,
      COALESCE(m.order_count, c.total_visits, 0)::integer AS order_count,
      COALESCE(m.total_spend_cents, c.total_spend, 0)::bigint AS total_spend_cents
    FROM customers c
    LEFT JOIN (
      SELECT
        customer_id,
        SUM(orders)::integer AS order_count,
        SUM(spend_cents)::bigint AS total_spend_cents
      FROM customer_metrics_daily
      WHERE tenant_id = ${tenantId}
        AND date >= ${trailingDateStr}
      GROUP BY customer_id
    ) m ON m.customer_id = c.id
    WHERE c.tenant_id = ${tenantId}
      AND c.status = 'active'
      AND c.display_name NOT LIKE '[MERGED]%'
    ORDER BY c.id
  `);

  return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    daysSinceLastVisit: Number(row.days_since_last_visit),
    orderCount: Number(row.order_count),
    totalSpendCents: Number(row.total_spend_cents),
  }));
}

// ── Quintile Scoring ─────────────────────────────────────────────────────────

/**
 * Assign quintile scores (1-5) for each RFM dimension.
 *
 * Quintile bucketing: customers sorted by metric value, then divided
 * into 5 roughly equal groups. Ties are placed in the same bucket.
 *
 * Recency is INVERTED: fewer days since last visit = higher score (5).
 * Frequency and Monetary are direct: higher value = higher score (5).
 */
export function assignQuintileScores(metrics: CustomerRawMetrics[]): RfmScoreResult[] {
  if (metrics.length === 0) return [];

  // Sort by each dimension independently
  const byRecency = [...metrics].sort((a, b) => a.daysSinceLastVisit - b.daysSinceLastVisit);
  const byFrequency = [...metrics].sort((a, b) => a.orderCount - b.orderCount);
  const byMonetary = [...metrics].sort((a, b) => a.totalSpendCents - b.totalSpendCents);

  const recencyScores = computeQuintiles(byRecency, (m) => m.daysSinceLastVisit, true);
  const frequencyScores = computeQuintiles(byFrequency, (m) => m.orderCount, false);
  const monetaryScores = computeQuintiles(byMonetary, (m) => m.totalSpendCents, false);

  return metrics.map((m) => {
    const r = recencyScores.get(m.id) ?? 1;
    const f = frequencyScores.get(m.id) ?? 1;
    const mon = monetaryScores.get(m.id) ?? 1;
    const composite = r * f * mon;
    const segment = getRfmSegment(r, f, mon);

    return { customerId: m.id, recency: r, frequency: f, monetary: mon, composite, segment };
  });
}

/**
 * Compute quintile assignments for a sorted array of customers.
 *
 * @param sorted - Customers sorted by the metric value (ascending)
 * @param getValue - Extractor for the metric value
 * @param invert - If true, lowest values get score 5 (for recency: fewer days = better)
 * @returns Map of customerId → quintile score (1-5)
 */
export function computeQuintiles(
  sorted: CustomerRawMetrics[],
  getValue: (m: CustomerRawMetrics) => number,
  invert: boolean,
): Map<string, number> {
  const result = new Map<string, number>();
  const n = sorted.length;

  if (n === 0) return result;

  // Single customer → score 3 (middle)
  if (n === 1) {
    result.set(sorted[0]!.id, 3);
    return result;
  }

  const bucketSize = n / 5;

  for (let i = 0; i < n; i++) {
    const customer = sorted[i]!;
    // Bucket 0-4 based on position
    const bucket = Math.min(Math.floor(i / bucketSize), 4);
    // Convert to 1-5 score
    let score = bucket + 1;
    // Invert for recency (low days = high score)
    if (invert) {
      score = 6 - score;
    }
    result.set(customer.id, score);
  }

  return result;
}
