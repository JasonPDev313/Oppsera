import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { getReconciliationReadApi } from '@oppsera/core/helpers/reconciliation-read-api';

/**
 * All GL source_module values used by posting adapters.
 * Shared between gap detection and close checklist to ensure consistency.
 */
export const GL_SOURCE_MODULES = [
  'pos',
  'pos_return',
  'fnb',
  'payments',
  'voucher',
  'membership',
  'chargeback',
  'stored_value',
  'ach',
  'ach_return',
  'drawer_session',
  'customers',
  'pms',
] as const;

export interface GlPostingGap {
  /** Total tenders recorded in the period */
  totalTenders: number;
  /** Tenders that have a corresponding GL journal entry */
  tendersWithGl: number;
  /** Tenders missing a GL journal entry */
  tendersWithoutGl: number;
  /** Whether all tenders are covered */
  isFullyCovered: boolean;
  /** Tender IDs that are missing GL entries (up to 100 for debugging) */
  missingTenderIds: string[];
}

interface GetGlPostingGapsInput {
  tenantId: string;
  /** Start date inclusive (YYYY-MM-DD) */
  startDate: string;
  /** End date inclusive (YYYY-MM-DD) */
  endDate: string;
  locationId?: string;
}

/**
 * Detects POS tenders that have no corresponding GL journal entry.
 *
 * Uses ReconciliationReadApi for tender data (cross-module boundary)
 * and local query on gl_journal_entries for GL coverage.
 *
 * Scoped to POS module only (source_module = 'pos') because POS posts
 * one GL entry per tender (1:1 mapping). F&B posts one GL entry per
 * close batch (1:many with tenders) — F&B coverage is validated
 * separately by the close checklist's "F&B close batches posted" item.
 * Including F&B here would undercount coverage because closeBatchId ≠ tenderId.
 */
export async function getGlPostingGaps(
  input: GetGlPostingGapsInput,
): Promise<GlPostingGap> {
  const api = getReconciliationReadApi();

  // Sequential: each call uses withTenant (1 DB connection). Running in parallel
  // required 2 connections simultaneously, which with Vercel pool max:2 leaves
  // zero headroom and causes timeouts under any concurrent load.
  const tenderSummary = await api.getTendersSummary(
    input.tenantId,
    input.startDate,
    input.endDate,
    input.locationId,
  );

  const glCoverage = await withTenant(input.tenantId, async (tx) => {
    // Count DISTINCT source_reference_id from posted GL entries for POS
    // only. POS posts one journal per tender (source_reference_id = tenderId),
    // giving a 1:1 comparison against ReconciliationReadApi's tender count.
    // F&B uses closeBatchId as source_reference_id (1 batch = many tenders),
    // so including it here would undercount coverage. F&B coverage is
    // validated by the close checklist's "F&B close batches posted" item.
    const rows = await tx.execute(sql`
      SELECT COUNT(DISTINCT source_reference_id)::int AS gl_tender_count
      FROM gl_journal_entries
      WHERE tenant_id = ${input.tenantId}
        AND source_module = 'pos'
        AND status IN ('posted', 'voided')
        AND business_date >= ${input.startDate}::date
        AND business_date <= ${input.endDate}::date
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    return {
      glTenderCount: arr.length > 0 ? Number(arr[0]!.gl_tender_count) : 0,
    };
  });

  const totalTenders = tenderSummary.tenderCount;
  const tendersWithGl = glCoverage.glTenderCount;
  const tendersWithoutGl = Math.max(0, totalTenders - tendersWithGl);

  // If there's a gap, fetch the actual missing tender IDs (up to 100)
  let missingTenderIds: string[] = [];

  if (tendersWithoutGl > 0) {
    missingTenderIds = await fetchMissingTenderIds(
      input.tenantId,
      input.startDate,
      input.endDate,
      input.locationId,
    );
  }

  return {
    totalTenders,
    tendersWithGl,
    tendersWithoutGl,
    isFullyCovered: tendersWithoutGl === 0,
    missingTenderIds,
  };
}

/**
 * Fetches tender IDs that exist in the tenders table but have no
 * corresponding GL journal entry. Uses ReconciliationReadApi.
 */
async function fetchMissingTenderIds(
  tenantId: string,
  startDate: string,
  endDate: string,
  _locationId?: string,
): Promise<string[]> {
  // Use the reconciliation API to get tender IDs, then check against GL
  // Since we can't query tenders directly from accounting module (gotcha #283),
  // we use a two-step approach:
  // 1. Get GL-covered tender IDs from our own tables
  // 2. The ReconciliationReadApi summary gives us the count but not IDs
  //    So we query gl_unmapped_events for logged gaps instead
  const result = await withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT source_reference_id AS tender_id, reason
      FROM gl_unmapped_events
      WHERE tenant_id = ${tenantId}
        AND source_module IN (${sql.join(GL_SOURCE_MODULES.map((m) => sql`${m}`), sql`, `)})
        AND entity_type IN ('gl_posting_gap', 'accounting_settings', 'zero_dollar_order', 'backfill_error')
        AND resolved_at IS NULL
        AND created_at >= ${startDate}::date
        AND created_at <= (${endDate}::date + INTERVAL '1 day')
      ORDER BY created_at DESC
      LIMIT 100
    `);
    return Array.from(rows as Iterable<Record<string, unknown>>).map(
      (r) => String(r.tender_id),
    );
  });

  return result;
}
