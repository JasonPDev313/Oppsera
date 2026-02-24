import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// ── Types ──────────────────────────────────────────────────────────

export interface SettlementReportFilters {
  startDate: string;
  endDate: string;
  locationId?: string;
  processorName?: string;
}

export interface SettlementReportSummary {
  totalSettlements: number;
  matchedCount: number;
  pendingCount: number;
  postedCount: number;
  disputedCount: number;
  totalGrossDollars: number;
  totalFeeDollars: number;
  totalNetDollars: number;
  totalChargebackDollars: number;
  totalVarianceCents: number;
  unmatchedTransactionCount: number;
  missingFromSettlementCount: number;
}

export interface SettlementReportByLocation {
  locationId: string | null;
  locationName: string | null;
  settlementCount: number;
  grossDollars: number;
  feeDollars: number;
  netDollars: number;
  unmatchedCount: number;
}

export interface SettlementReconciliationRow {
  settlementId: string;
  settlementDate: string;
  processorName: string;
  processorBatchId: string | null;
  status: string;
  grossDollars: number;
  feeDollars: number;
  netDollars: number;
  chargebackDollars: number;
  totalLines: number;
  matchedLines: number;
  unmatchedLines: number;
  varianceCents: number;
  glJournalEntryId: string | null;
  bankAccountName: string | null;
}

/**
 * Get a summary overview of settlements for a date range.
 * Used by the settlement reconciliation dashboard.
 */
export async function getSettlementReportSummary(
  tenantId: string,
  filters: SettlementReportFilters,
): Promise<SettlementReportSummary> {
  return withTenant(tenantId, async (tx) => {
    const locationFilter = filters.locationId
      ? sql`AND s.location_id = ${filters.locationId}`
      : sql``;
    const processorFilter = filters.processorName
      ? sql`AND s.processor_name = ${filters.processorName}`
      : sql``;

    // Settlement summary
    const summaryRows = await tx.execute(sql`
      SELECT
        COUNT(*)::int AS total_settlements,
        COUNT(*) FILTER (WHERE s.status = 'matched')::int AS matched_count,
        COUNT(*) FILTER (WHERE s.status = 'pending')::int AS pending_count,
        COUNT(*) FILTER (WHERE s.status = 'posted')::int AS posted_count,
        COUNT(*) FILTER (WHERE s.status = 'disputed')::int AS disputed_count,
        COALESCE(SUM(s.gross_amount::numeric), 0)::float8 AS total_gross,
        COALESCE(SUM(s.fee_amount::numeric), 0)::float8 AS total_fees,
        COALESCE(SUM(s.net_amount::numeric), 0)::float8 AS total_net,
        COALESCE(SUM(s.chargeback_amount::numeric), 0)::float8 AS total_chargebacks
      FROM payment_settlements s
      WHERE s.tenant_id = ${tenantId}
        AND s.settlement_date >= ${filters.startDate}
        AND s.settlement_date <= ${filters.endDate}
        ${locationFilter}
        ${processorFilter}
    `);

    const summaryArr = Array.from(summaryRows as Iterable<Record<string, unknown>>);
    const summary = summaryArr[0]!;

    // Variance: sum(our amount - settled amount) for matched lines
    const varianceRows = await tx.execute(sql`
      SELECT
        COALESCE(SUM(psl.original_amount_cents - psl.settled_amount_cents), 0)::integer AS total_variance,
        COUNT(*) FILTER (WHERE psl.status = 'unmatched')::int AS unmatched_count
      FROM payment_settlement_lines psl
      JOIN payment_settlements s ON s.id = psl.settlement_id
      WHERE psl.tenant_id = ${tenantId}
        AND s.settlement_date >= ${filters.startDate}
        AND s.settlement_date <= ${filters.endDate}
        ${locationFilter}
        ${processorFilter}
    `);
    const varianceArr = Array.from(varianceRows as Iterable<Record<string, unknown>>);
    const variance = varianceArr[0]!;

    // Missing from settlement: captured intents without settlement match
    const missingRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM payment_intents pi
      WHERE pi.tenant_id = ${tenantId}
        AND pi.status = 'captured'
        AND pi.created_at >= ${filters.startDate}::date
        AND pi.created_at < (${filters.endDate}::date + INTERVAL '1 day')
        AND pi.tender_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM payment_settlement_lines psl
          WHERE psl.tender_id = pi.tender_id
            AND psl.tenant_id = ${tenantId}
        )
    `);
    const missingArr = Array.from(missingRows as Iterable<Record<string, unknown>>);

    return {
      totalSettlements: Number(summary.total_settlements),
      matchedCount: Number(summary.matched_count),
      pendingCount: Number(summary.pending_count),
      postedCount: Number(summary.posted_count),
      disputedCount: Number(summary.disputed_count),
      totalGrossDollars: Number(summary.total_gross),
      totalFeeDollars: Number(summary.total_fees),
      totalNetDollars: Number(summary.total_net),
      totalChargebackDollars: Number(summary.total_chargebacks),
      totalVarianceCents: Number(variance.total_variance),
      unmatchedTransactionCount: Number(variance.unmatched_count),
      missingFromSettlementCount: Number(missingArr[0]!.count),
    };
  });
}

/**
 * Get settlement data grouped by location.
 * Used for multi-location settlement reconciliation.
 */
export async function getSettlementReportByLocation(
  tenantId: string,
  filters: SettlementReportFilters,
): Promise<SettlementReportByLocation[]> {
  return withTenant(tenantId, async (tx) => {
    const processorFilter = filters.processorName
      ? sql`AND s.processor_name = ${filters.processorName}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT
        s.location_id,
        l.name AS location_name,
        COUNT(DISTINCT s.id)::int AS settlement_count,
        COALESCE(SUM(s.gross_amount::numeric), 0)::float8 AS gross_dollars,
        COALESCE(SUM(s.fee_amount::numeric), 0)::float8 AS fee_dollars,
        COALESCE(SUM(s.net_amount::numeric), 0)::float8 AS net_dollars,
        COALESCE(
          (SELECT COUNT(*) FROM payment_settlement_lines psl
           WHERE psl.settlement_id = ANY(ARRAY_AGG(s.id))
             AND psl.tenant_id = ${tenantId}
             AND psl.status = 'unmatched'),
          0
        )::int AS unmatched_count
      FROM payment_settlements s
      LEFT JOIN locations l ON l.id = s.location_id
      WHERE s.tenant_id = ${tenantId}
        AND s.settlement_date >= ${filters.startDate}
        AND s.settlement_date <= ${filters.endDate}
        ${processorFilter}
      GROUP BY s.location_id, l.name
      ORDER BY net_dollars DESC
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    return arr.map((r) => ({
      locationId: r.location_id ? String(r.location_id) : null,
      locationName: r.location_name ? String(r.location_name) : null,
      settlementCount: Number(r.settlement_count),
      grossDollars: Number(r.gross_dollars),
      feeDollars: Number(r.fee_dollars),
      netDollars: Number(r.net_dollars),
      unmatchedCount: Number(r.unmatched_count),
    }));
  });
}

/**
 * Get detailed settlement reconciliation rows.
 * Each row is a single settlement with match statistics and variance.
 */
export async function getSettlementReconciliationReport(
  tenantId: string,
  filters: SettlementReportFilters,
): Promise<SettlementReconciliationRow[]> {
  return withTenant(tenantId, async (tx) => {
    const locationFilter = filters.locationId
      ? sql`AND s.location_id = ${filters.locationId}`
      : sql``;
    const processorFilter = filters.processorName
      ? sql`AND s.processor_name = ${filters.processorName}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT
        s.id AS settlement_id,
        s.settlement_date::text,
        s.processor_name,
        s.processor_batch_id,
        s.status,
        s.gross_amount::float8 AS gross_dollars,
        s.fee_amount::float8 AS fee_dollars,
        s.net_amount::float8 AS net_dollars,
        s.chargeback_amount::float8 AS chargeback_dollars,
        s.gl_journal_entry_id,
        ba.name AS bank_account_name,
        COALESCE(lc.total_lines, 0)::int AS total_lines,
        COALESCE(lc.matched_lines, 0)::int AS matched_lines,
        COALESCE(lc.unmatched_lines, 0)::int AS unmatched_lines,
        COALESCE(lc.variance_cents, 0)::integer AS variance_cents
      FROM payment_settlements s
      LEFT JOIN bank_accounts ba ON ba.id = s.bank_account_id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS total_lines,
          COUNT(*) FILTER (WHERE psl.status = 'matched') AS matched_lines,
          COUNT(*) FILTER (WHERE psl.status = 'unmatched') AS unmatched_lines,
          SUM(CASE WHEN psl.status = 'matched'
            THEN psl.original_amount_cents - psl.settled_amount_cents
            ELSE 0 END) AS variance_cents
        FROM payment_settlement_lines psl
        WHERE psl.settlement_id = s.id AND psl.tenant_id = ${tenantId}
      ) lc ON true
      WHERE s.tenant_id = ${tenantId}
        AND s.settlement_date >= ${filters.startDate}
        AND s.settlement_date <= ${filters.endDate}
        ${locationFilter}
        ${processorFilter}
      ORDER BY s.settlement_date DESC, s.id DESC
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    return arr.map((r) => ({
      settlementId: String(r.settlement_id),
      settlementDate: String(r.settlement_date),
      processorName: String(r.processor_name),
      processorBatchId: r.processor_batch_id ? String(r.processor_batch_id) : null,
      status: String(r.status),
      grossDollars: Number(r.gross_dollars),
      feeDollars: Number(r.fee_dollars),
      netDollars: Number(r.net_dollars),
      chargebackDollars: Number(r.chargeback_dollars),
      totalLines: Number(r.total_lines),
      matchedLines: Number(r.matched_lines),
      unmatchedLines: Number(r.unmatched_lines),
      varianceCents: Number(r.variance_cents),
      glJournalEntryId: r.gl_journal_entry_id ? String(r.gl_journal_entry_id) : null,
      bankAccountName: r.bank_account_name ? String(r.bank_account_name) : null,
    }));
  });
}
