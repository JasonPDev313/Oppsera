// ── Scheduled Digest Generation Service ──────────────────────────
// Generates periodic insight digests (daily, weekly, monthly) by
// computing KPIs from rm_daily_sales and running them through the
// narrative engine for an executive-summary style output.

import { db } from '@oppsera/db';
import { semanticInsightDigests, rmDailySales } from '@oppsera/db';
import { sql, eq, and, gte, lte } from 'drizzle-orm';
import type { NarrativeSection } from '../llm/types';
import { generateNarrative } from '../llm/narrative';

// ── Types ────────────────────────────────────────────────────────

export type DigestType = 'daily' | 'weekly' | 'monthly';

export interface DigestConfig {
  id: string;
  tenantId: string;
  digestType: DigestType;
  scheduleDay: number | null;
  scheduleHour: number;
  targetRole: string | null;
  targetUserId: string | null;
  metricSlugs: string[] | null;
  locationId: string | null;
  deliveryChannels: string[];
  isActive: boolean;
}

export interface DigestKpis {
  netSales: number;
  grossSales: number;
  orderCount: number;
  avgOrderValue: number;
  discountTotal: number;
  taxTotal: number;
  voidCount: number;
  voidTotal: number;
  tenderCash: number;
  tenderCard: number;
  /** Number of days with data in the period. */
  daysWithData: number;
  /** Previous period comparison values for delta computation. */
  priorNetSales: number | null;
  priorOrderCount: number | null;
  priorAvgOrderValue: number | null;
}

export interface DigestResult {
  narrative: string;
  sections: NarrativeSection[];
  kpis: DigestKpis;
}

// ── Period Helpers ───────────────────────────────────────────────

interface DateRange {
  start: string;
  end: string;
}

/**
 * Computes the data period based on digest type relative to a current date.
 * - daily: yesterday
 * - weekly: last 7 calendar days (ending yesterday)
 * - monthly: last 30 calendar days (ending yesterday)
 */
function computePeriod(digestType: DigestType, currentDate: string): DateRange {
  const today = new Date(currentDate);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const end = yesterday.toISOString().split('T')[0]!;

  if (digestType === 'daily') {
    return { start: end, end };
  }

  const daysBack = digestType === 'weekly' ? 7 : 30;
  const start = new Date(yesterday);
  start.setDate(start.getDate() - daysBack + 1);
  return { start: start.toISOString().split('T')[0]!, end };
}

/**
 * Computes the prior period for comparison (same-length period immediately
 * before the current period).
 */
function computePriorPeriod(digestType: DigestType, currentDate: string): DateRange {
  const currentPeriod = computePeriod(digestType, currentDate);
  const periodDays = digestType === 'daily' ? 1 : digestType === 'weekly' ? 7 : 30;

  const priorEnd = new Date(currentPeriod.start);
  priorEnd.setDate(priorEnd.getDate() - 1);
  const priorStart = new Date(priorEnd);
  priorStart.setDate(priorStart.getDate() - periodDays + 1);

  return {
    start: priorStart.toISOString().split('T')[0]!,
    end: priorEnd.toISOString().split('T')[0]!,
  };
}

// ── KPI Aggregation ─────────────────────────────────────────────

async function aggregateKpis(
  tenantId: string,
  dateRange: DateRange,
  locationId: string | null,
): Promise<Omit<DigestKpis, 'priorNetSales' | 'priorOrderCount' | 'priorAvgOrderValue'>> {
  const locationFilter = locationId
    ? sql`AND location_id = ${locationId}`
    : sql``;

  const result = await db.execute(sql`
    SELECT
      COALESCE(SUM(CAST(net_sales AS DOUBLE PRECISION)), 0) AS net_sales,
      COALESCE(SUM(CAST(gross_sales AS DOUBLE PRECISION)), 0) AS gross_sales,
      COALESCE(SUM(order_count), 0) AS order_count,
      COALESCE(SUM(CAST(discount_total AS DOUBLE PRECISION)), 0) AS discount_total,
      COALESCE(SUM(CAST(tax_total AS DOUBLE PRECISION)), 0) AS tax_total,
      COALESCE(SUM(void_count), 0) AS void_count,
      COALESCE(SUM(CAST(void_total AS DOUBLE PRECISION)), 0) AS void_total,
      COALESCE(SUM(CAST(tender_cash AS DOUBLE PRECISION)), 0) AS tender_cash,
      COALESCE(SUM(CAST(tender_card AS DOUBLE PRECISION)), 0) AS tender_card,
      COUNT(DISTINCT business_date) AS days_with_data
    FROM rm_daily_sales
    WHERE tenant_id = ${tenantId}
      AND business_date >= ${dateRange.start}
      AND business_date <= ${dateRange.end}
      ${locationFilter}
  `);

  const rows = Array.from(result as Iterable<Record<string, unknown>>);
  const row = rows[0] ?? {};

  const netSales = Number(row.net_sales ?? 0);
  const orderCount = Number(row.order_count ?? 0);

  return {
    netSales,
    grossSales: Number(row.gross_sales ?? 0),
    orderCount,
    avgOrderValue: orderCount > 0 ? Math.round((netSales / orderCount) * 100) / 100 : 0,
    discountTotal: Number(row.discount_total ?? 0),
    taxTotal: Number(row.tax_total ?? 0),
    voidCount: Number(row.void_count ?? 0),
    voidTotal: Number(row.void_total ?? 0),
    tenderCash: Number(row.tender_cash ?? 0),
    tenderCard: Number(row.tender_card ?? 0),
    daysWithData: Number(row.days_with_data ?? 0),
  };
}

// ── Digest Generation ───────────────────────────────────────────

/**
 * Generates a digest for a specific tenant and digest configuration.
 * Computes KPIs for the period, generates a narrative summary via the
 * LLM, and saves the result back to the digest row.
 */
export async function generateDigest(
  tenantId: string,
  digestConfig: DigestConfig,
  currentDate: string,
): Promise<DigestResult> {
  const period = computePeriod(digestConfig.digestType, currentDate);
  const priorPeriod = computePriorPeriod(digestConfig.digestType, currentDate);

  // Compute current and prior period KPIs
  const [currentKpis, priorKpis] = await Promise.all([
    aggregateKpis(tenantId, period, digestConfig.locationId),
    aggregateKpis(tenantId, priorPeriod, digestConfig.locationId),
  ]);

  const kpis: DigestKpis = {
    ...currentKpis,
    priorNetSales: priorKpis.netSales,
    priorOrderCount: priorKpis.orderCount,
    priorAvgOrderValue: priorKpis.avgOrderValue,
  };

  // Build a synthetic intent for the narrative generator
  const periodLabel = digestConfig.digestType === 'daily'
    ? `yesterday (${period.start})`
    : `${period.start} to ${period.end}`;

  const netSalesDelta = kpis.priorNetSales != null && kpis.priorNetSales > 0
    ? ((kpis.netSales - kpis.priorNetSales) / kpis.priorNetSales * 100).toFixed(1)
    : null;

  const orderCountDelta = kpis.priorOrderCount != null && kpis.priorOrderCount > 0
    ? ((kpis.orderCount - kpis.priorOrderCount) / kpis.priorOrderCount * 100).toFixed(1)
    : null;

  const syntheticMessage = `Generate a ${digestConfig.digestType} business digest for ${periodLabel}`;
  const syntheticData = {
    rows: [{
      period: periodLabel,
      net_sales: kpis.netSales,
      gross_sales: kpis.grossSales,
      order_count: kpis.orderCount,
      avg_order_value: kpis.avgOrderValue,
      discount_total: kpis.discountTotal,
      void_count: kpis.voidCount,
      void_total: kpis.voidTotal,
      tender_cash: kpis.tenderCash,
      tender_card: kpis.tenderCard,
      days_with_data: kpis.daysWithData,
      prior_net_sales: kpis.priorNetSales,
      net_sales_change_pct: netSalesDelta,
      prior_order_count: kpis.priorOrderCount,
      order_count_change_pct: orderCountDelta,
    }],
    rowCount: 1,
    executionTimeMs: 0,
    truncated: false,
  };

  const intent = {
    mode: 'metrics' as const,
    plan: {
      metrics: ['net_sales', 'order_count', 'avg_order_value'],
      dimensions: ['business_date'],
      filters: [],
      dateRange: period,
      intent: syntheticMessage,
    },
    confidence: 1.0,
    isClarification: false,
    rawResponse: '',
    tokensInput: 0,
    tokensOutput: 0,
    latencyMs: 0,
    provider: 'system',
    model: 'digest-generator',
  };

  const context = {
    tenantId,
    userId: digestConfig.targetUserId ?? 'system',
    userRole: digestConfig.targetRole ?? 'Manager',
    sessionId: `digest-${digestConfig.id}`,
    currentDate,
  };

  // Generate the narrative through the LLM
  const narrativeResult = await generateNarrative(
    syntheticData,
    intent,
    syntheticMessage,
    context,
  );

  const digestResult: DigestResult = {
    narrative: narrativeResult.text,
    sections: narrativeResult.sections,
    kpis,
  };

  // Save the generated content back to the digest row
  await db
    .update(semanticInsightDigests)
    .set({
      lastGeneratedAt: new Date(),
      lastNarrative: digestResult.narrative,
      lastSections: digestResult.sections as unknown as Record<string, unknown>,
      lastKpis: kpis as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(eq(semanticInsightDigests.id, digestConfig.id));

  return digestResult;
}

// ── Scheduling ──────────────────────────────────────────────────

/**
 * Finds all digest configurations that are due for generation at the
 * specified hour (0-23). Used by a background job to trigger generation.
 *
 * For daily digests: due at scheduleHour every day.
 * For weekly digests: due at scheduleHour on scheduleDay (0=Sun, 1=Mon, ..., 6=Sat).
 * For monthly digests: due at scheduleHour on scheduleDay (1-28 day of month).
 */
export async function getDigestsDueNow(currentHour: number): Promise<DigestConfig[]> {
  const rows = await db
    .select()
    .from(semanticInsightDigests)
    .where(
      and(
        eq(semanticInsightDigests.isActive, true),
        eq(semanticInsightDigests.scheduleHour, currentHour),
      ),
    );

  const now = new Date();
  const currentDayOfWeek = now.getUTCDay();  // 0=Sun
  const currentDayOfMonth = now.getUTCDate();

  return rows
    .filter((row) => {
      // Daily digests are always due at the scheduled hour
      if (row.digestType === 'daily') return true;

      // Weekly digests are due on the scheduled day of the week
      if (row.digestType === 'weekly') {
        return row.scheduleDay === currentDayOfWeek;
      }

      // Monthly digests are due on the scheduled day of the month
      if (row.digestType === 'monthly') {
        return row.scheduleDay === currentDayOfMonth;
      }

      return false;
    })
    .map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      digestType: row.digestType as DigestType,
      scheduleDay: row.scheduleDay,
      scheduleHour: row.scheduleHour,
      targetRole: row.targetRole,
      targetUserId: row.targetUserId,
      metricSlugs: row.metricSlugs,
      locationId: row.locationId,
      deliveryChannels: row.deliveryChannels ?? ['in_app'],
      isActive: row.isActive,
    }));
}
