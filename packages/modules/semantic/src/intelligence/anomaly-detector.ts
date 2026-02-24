// ── Anomaly Detection Service ─────────────────────────────────────
// Scans rm_daily_sales for statistical anomalies against a rolling
// 30-day baseline using z-score significance testing. Matches detected
// anomalies against configured alert rules and creates notifications.

import { db } from '@oppsera/db';
import {
  rmDailySales,
  semanticAlertRules,
  semanticAlertNotifications,
} from '@oppsera/db';
import { sql, eq, and, gte, lte, desc } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';

// ── Types ────────────────────────────────────────────────────────

export type AnomalySensitivity = 'low' | 'medium' | 'high';

export type AnomalySignificance = 'low' | 'medium' | 'high' | 'critical';

export interface AnomalyResult {
  metricSlug: string;
  observedValue: number;
  baselineValue: number;
  stdDev: number;
  zScore: number;
  deviationPct: number;
  significance: AnomalySignificance;
  locationId: string | null;
  businessDate: string;
}

/** Maps sensitivity level to the z-score threshold for anomaly detection. */
const SENSITIVITY_THRESHOLDS: Record<AnomalySensitivity, number> = {
  high: 1.5,
  medium: 2.0,
  low: 2.5,
};

/**
 * The metric columns we scan for anomalies in rm_daily_sales.
 * Each entry maps a slug to the actual column name in the table.
 */
const SCANNABLE_METRICS: Record<string, string> = {
  net_sales: 'net_sales',
  gross_sales: 'gross_sales',
  order_count: 'order_count',
  avg_order_value: 'avg_order_value',
  discount_total: 'discount_total',
  tax_total: 'tax_total',
  void_count: 'void_count',
  void_total: 'void_total',
  tender_cash: 'tender_cash',
  tender_card: 'tender_card',
};

// ── Helpers ──────────────────────────────────────────────────────

function classifySignificance(absZScore: number): AnomalySignificance {
  if (absZScore >= 4.0) return 'critical';
  if (absZScore >= 3.0) return 'high';
  if (absZScore >= 2.0) return 'medium';
  return 'low';
}

function computeDeviationPct(observed: number, baseline: number): number {
  if (baseline === 0) return observed === 0 ? 0 : 100;
  return ((observed - baseline) / Math.abs(baseline)) * 100;
}

// ── Core Detection ───────────────────────────────────────────────

/**
 * Runs anomaly detection for a given tenant on a specific business date.
 * Compares each scannable metric against its rolling 30-day baseline
 * (mean and standard deviation). Returns anomalies that exceed the
 * configured sensitivity threshold.
 *
 * The query groups by location_id, so multi-location tenants get
 * per-location anomaly detection.
 */
export async function runAnomalyDetection(
  tenantId: string,
  businessDate: string,
  sensitivity: AnomalySensitivity = 'medium',
): Promise<AnomalyResult[]> {
  const threshold = SENSITIVITY_THRESHOLDS[sensitivity];

  // Compute the 30-day baseline window (excluding the target date itself)
  const baselineEnd = new Date(businessDate);
  baselineEnd.setDate(baselineEnd.getDate() - 1);
  const baselineStart = new Date(businessDate);
  baselineStart.setDate(baselineStart.getDate() - 31);

  const baselineStartStr = baselineStart.toISOString().split('T')[0]!;
  const baselineEndStr = baselineEnd.toISOString().split('T')[0]!;

  // Build dynamic SELECT expressions for baseline aggregation
  const metricAggregations = Object.entries(SCANNABLE_METRICS)
    .map(([slug, col]) => {
      return sql.raw(`
        AVG(CAST(${col} AS DOUBLE PRECISION)) AS "${slug}_mean",
        STDDEV_SAMP(CAST(${col} AS DOUBLE PRECISION)) AS "${slug}_stddev"
      `);
    });

  // Step 1: Get baseline statistics per location for the 30-day window
  const baselineQuery = sql`
    SELECT
      location_id,
      ${sql.join(metricAggregations, sql.raw(','))}
    FROM rm_daily_sales
    WHERE tenant_id = ${tenantId}
      AND business_date >= ${baselineStartStr}
      AND business_date <= ${baselineEndStr}
    GROUP BY location_id
  `;

  const baselineRows = await db.execute(baselineQuery);
  const baselineData = Array.from(baselineRows as Iterable<Record<string, unknown>>);

  if (baselineData.length === 0) {
    // No historical data to compare against
    return [];
  }

  // Step 2: Get today's values per location
  const todayRows = await db
    .select()
    .from(rmDailySales)
    .where(
      and(
        eq(rmDailySales.tenantId, tenantId),
        eq(rmDailySales.businessDate, businessDate),
      ),
    );

  if (todayRows.length === 0) {
    return [];
  }

  // Step 3: Compare each metric at each location
  const anomalies: AnomalyResult[] = [];

  for (const todayRow of todayRows) {
    const locationId = todayRow.locationId;

    // Find the baseline for this location
    const baseline = baselineData.find(
      (b) => b.location_id === locationId,
    );
    if (!baseline) continue;

    for (const [slug, col] of Object.entries(SCANNABLE_METRICS)) {
      const mean = Number(baseline[`${slug}_mean`] ?? 0);
      const stddev = Number(baseline[`${slug}_stddev`] ?? 0);

      // Need a meaningful standard deviation to detect anomalies
      if (stddev === 0 || isNaN(stddev)) continue;

      // Get the observed value from the today row
      const observed = Number(
        (todayRow as unknown as Record<string, unknown>)[col] ?? 0,
      );
      if (isNaN(observed)) continue;

      const zScore = (observed - mean) / stddev;
      const absZScore = Math.abs(zScore);

      if (absZScore >= threshold) {
        anomalies.push({
          metricSlug: slug,
          observedValue: observed,
          baselineValue: Math.round(mean * 100) / 100,
          stdDev: Math.round(stddev * 100) / 100,
          zScore: Math.round(zScore * 100) / 100,
          deviationPct: Math.round(computeDeviationPct(observed, mean) * 100) / 100,
          significance: classifySignificance(absZScore),
          locationId,
          businessDate,
        });
      }
    }
  }

  // Sort by absolute z-score descending (most significant first)
  anomalies.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));

  return anomalies;
}

// ── Alert Rule Matching ──────────────────────────────────────────

/**
 * Checks detected anomalies against configured alert rules for the
 * tenant. Creates notification records for each matched rule. Respects
 * cooldown periods to avoid alert fatigue.
 */
export async function checkAlertRules(
  tenantId: string,
  anomalies: AnomalyResult[],
): Promise<void> {
  if (anomalies.length === 0) return;

  // Fetch active alert rules for this tenant
  const rules = await db
    .select()
    .from(semanticAlertRules)
    .where(
      and(
        eq(semanticAlertRules.tenantId, tenantId),
        eq(semanticAlertRules.isActive, true),
      ),
    );

  if (rules.length === 0) return;

  const now = new Date();
  const notificationsToCreate: Array<typeof semanticAlertNotifications.$inferInsert> = [];

  for (const rule of rules) {
    // Check cooldown — skip if triggered too recently
    if (rule.lastTriggeredAt) {
      const cooldownMs = (rule.cooldownMinutes ?? 60) * 60 * 1000;
      const elapsed = now.getTime() - rule.lastTriggeredAt.getTime();
      if (elapsed < cooldownMs) continue;
    }

    // Find anomalies matching this rule
    const matchingAnomalies = anomalies.filter((a) => {
      // If rule specifies a metric, only match that metric
      if (rule.metricSlug && a.metricSlug !== rule.metricSlug) return false;

      // If rule specifies a location, only match that location
      if (rule.locationId && a.locationId !== rule.locationId) return false;

      // For threshold rules, check if the value crosses the threshold
      if (rule.ruleType === 'threshold' && rule.thresholdOperator && rule.thresholdValue) {
        const thresholdVal = Number(rule.thresholdValue);
        switch (rule.thresholdOperator) {
          case 'gt': return a.observedValue > thresholdVal;
          case 'gte': return a.observedValue >= thresholdVal;
          case 'lt': return a.observedValue < thresholdVal;
          case 'lte': return a.observedValue <= thresholdVal;
          case 'deviation_gt': return Math.abs(a.deviationPct) > thresholdVal;
          case 'deviation_lt': return Math.abs(a.deviationPct) < thresholdVal;
          default: return true;
        }
      }

      // For anomaly-type rules, just check that an anomaly exists for the metric
      if (rule.ruleType === 'anomaly') return true;

      return true;
    });

    if (matchingAnomalies.length === 0) continue;

    // Use the most significant anomaly for the notification
    const topAnomaly = matchingAnomalies[0]!;

    const direction = topAnomaly.zScore > 0 ? 'above' : 'below';
    const absDeviationPct = Math.abs(topAnomaly.deviationPct);
    const title = `${rule.name}: ${topAnomaly.metricSlug} is ${absDeviationPct.toFixed(1)}% ${direction} baseline`;
    const body = [
      `${topAnomaly.metricSlug} observed value: ${topAnomaly.observedValue.toLocaleString()}`,
      `30-day baseline: ${topAnomaly.baselineValue.toLocaleString()} (stddev: ${topAnomaly.stdDev.toLocaleString()})`,
      `Z-score: ${topAnomaly.zScore} (${topAnomaly.significance} significance)`,
      topAnomaly.locationId ? `Location: ${topAnomaly.locationId}` : null,
    ].filter(Boolean).join('\n');

    const severity = topAnomaly.significance === 'critical' ? 'critical'
      : topAnomaly.significance === 'high' ? 'warning'
      : 'info';

    notificationsToCreate.push({
      id: generateUlid(),
      tenantId,
      alertRuleId: rule.id,
      title,
      body,
      severity,
      metricSlug: topAnomaly.metricSlug,
      metricValue: topAnomaly.observedValue.toString(),
      baselineValue: topAnomaly.baselineValue.toString(),
      deviationPct: topAnomaly.deviationPct.toString(),
      businessDate: topAnomaly.businessDate,
      locationId: topAnomaly.locationId,
      channelsSent: rule.deliveryChannels ?? ['in_app'],
    });

    // Update the rule's last triggered timestamp and trigger count
    await db
      .update(semanticAlertRules)
      .set({
        lastTriggeredAt: now,
        triggerCount: sql`${semanticAlertRules.triggerCount} + 1`,
        updatedAt: now,
      })
      .where(eq(semanticAlertRules.id, rule.id));
  }

  // Batch-insert all notifications
  if (notificationsToCreate.length > 0) {
    await db.insert(semanticAlertNotifications).values(notificationsToCreate);
  }
}
