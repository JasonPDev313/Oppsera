import { sql } from 'drizzle-orm';
import type { Database } from '@oppsera/db';
import { glUnmappedEvents } from '@oppsera/db/schema/accounting';
import { ensureAccountingSettings } from '../helpers/ensure-accounting-settings';
import { handleTenderForAccounting } from '../adapters/pos-posting-adapter';

export interface BackfillGlOptions {
  /** Max tenders to process per call (default: 500 — safe for Vercel 30s limit) */
  limit?: number;
  /** Cursor: only process tenders with id > afterTenderId (for multi-batch resume) */
  afterTenderId?: string;
}

export interface BackfillTenderError {
  tenderId: string;
  orderId: string;
  message: string;
}

export interface BackfillGlResult {
  posted: number;
  skipped: number;
  errors: number;
  /** Total unposted tenders remaining (before this batch) for progress tracking */
  totalUnposted: number;
  /** ID of the last tender processed in this batch (use as cursor for next call) */
  lastProcessedTenderId: string | null;
  /** Whether more unposted tenders remain after this batch */
  hasMore: boolean;
  /** Details of tenders that failed GL posting */
  failedTenders: BackfillTenderError[];
}

/**
 * Backfill GL journal entries for tenders that have no corresponding GL posting.
 *
 * Extracted from `tools/scripts/backfill-gl-from-tenders.ts` for use via API.
 * This is the core loop that:
 *   1. Ensures accounting_settings exist (auto-creates + wires fallback accounts)
 *   2. Queries unposted tenders (status=captured, no GL entry)
 *   3. Loads order lines for enrichment (subDepartmentId, taxGroupId, etc.)
 *   4. Reconstructs synthetic `tender.recorded.v1` events
 *   5. Calls `handleTenderForAccounting()` per tender (idempotent via unique index)
 *
 * Idempotent: safe to call repeatedly. The unique index on
 * (tenant_id, source_module, source_reference_id) prevents double posting.
 *
 * NOTE: Requires AccountingPostingApi singleton to be initialized (done in
 * instrumentation.ts for the web app — no manual init needed here).
 */
export async function backfillGlFromTenders(
  db: Database,
  tenantId: string,
  options?: BackfillGlOptions,
): Promise<BackfillGlResult> {
  const limit = options?.limit ?? 500;
  const afterTenderId = options?.afterTenderId;

  // 1. Ensure accounting_settings row exists (auto-creates + auto-wires fallback accounts)
  try {
    await ensureAccountingSettings(db, tenantId);
  } catch (err) {
    console.warn(
      `[gl-backfill] Warning: could not ensure accounting_settings for tenant=${tenantId}: ${
        err instanceof Error ? err.message : err
      }`,
    );
  }

  // 2a. Count total unposted tenders (for progress tracking)
  const countResult = await db.execute(sql`
    SELECT COUNT(*)::int AS total_unposted
    FROM tenders t
    WHERE t.tenant_id = ${tenantId}
      AND t.status = 'captured'
      AND NOT EXISTS (
        SELECT 1 FROM gl_journal_entries gje
        WHERE gje.tenant_id = ${tenantId}
          AND gje.source_module = 'pos'
          AND gje.source_reference_id = t.id
      )
  `);
  const countArr = Array.from(countResult as Iterable<Record<string, unknown>>);
  const totalUnposted = countArr.length > 0 ? Number(countArr[0]!.total_unposted) : 0;

  if (totalUnposted === 0) {
    return { posted: 0, skipped: 0, errors: 0, totalUnposted: 0, lastProcessedTenderId: null, hasMore: false, failedTenders: [] };
  }

  // 2b. Find tenders with no corresponding GL journal entry (with optional cursor)
  const cursorCondition = afterTenderId
    ? sql` AND t.id > ${afterTenderId}`
    : sql``;

  const unpostedResult = await db.execute(sql`
    SELECT t.id AS tender_id,
           t.order_id,
           t.tender_type,
           t.amount,
           t.tip_amount,
           t.business_date,
           t.location_id,
           t.terminal_id,
           t.tender_sequence,
           o.total AS order_total,
           o.subtotal,
           o.tax_total,
           o.discount_total,
           o.service_charge_total,
           o.customer_id
    FROM tenders t
    JOIN orders o ON o.id = t.order_id AND o.tenant_id = t.tenant_id
    WHERE t.tenant_id = ${tenantId}
      AND t.status = 'captured'
      AND NOT EXISTS (
        SELECT 1 FROM gl_journal_entries gje
        WHERE gje.tenant_id = ${tenantId}
          AND gje.source_module = 'pos'
          AND gje.source_reference_id = t.id
      )
      ${cursorCondition}
    ORDER BY t.id ASC
    LIMIT ${limit}
  `);
  const unposted = Array.from(unpostedResult as Iterable<Record<string, unknown>>);

  if (unposted.length === 0) {
    return { posted: 0, skipped: 0, errors: 0, totalUnposted, lastProcessedTenderId: afterTenderId ?? null, hasMore: false, failedTenders: [] };
  }

  // 3. Pre-compute order tender totals (needed for isFullyPaid detection)
  const orderIds = [...new Set(unposted.map((t) => String(t.order_id)))];
  const orderTenderMap = new Map<string, { orderTotal: number; totalTendered: number }>();

  // Batch query for all relevant orders
  if (orderIds.length > 0) {
    const tenderTotalsResult = await db.execute(sql`
      SELECT order_id, SUM(amount)::bigint AS total_tendered
      FROM tenders
      WHERE tenant_id = ${tenantId}
        AND order_id IN ${sql`(${sql.join(orderIds.map((id) => sql`${id}`), sql`, `)})`}
        AND status = 'captured'
      GROUP BY order_id
    `);
    const tenderTotals = Array.from(tenderTotalsResult as Iterable<Record<string, unknown>>);
    for (const row of tenderTotals) {
      const orderId = String(row.order_id);
      orderTenderMap.set(orderId, {
        orderTotal: 0, // filled from unposted rows below
        totalTendered: Number(row.total_tendered ?? 0),
      });
    }
  }

  // Fill orderTotal from unposted rows
  for (const t of unposted) {
    const orderId = String(t.order_id);
    const entry = orderTenderMap.get(orderId);
    if (entry && entry.orderTotal === 0) {
      entry.orderTotal = Number(t.order_total);
    }
  }

  // 4. Batch-load order lines for all orders
  const orderLinesMap = new Map<string, Array<Record<string, unknown>>>();
  if (orderIds.length > 0) {
    const linesResult = await db.execute(sql`
      SELECT order_id,
             catalog_item_id,
             catalog_item_name,
             sub_department_id,
             qty,
             line_subtotal,
             tax_group_id,
             line_tax,
             cost_price,
             package_components
      FROM order_lines
      WHERE tenant_id = ${tenantId}
        AND order_id IN ${sql`(${sql.join(orderIds.map((id) => sql`${id}`), sql`, `)})`}
    `);
    const allLines = Array.from(linesResult as Iterable<Record<string, unknown>>);
    for (const line of allLines) {
      const orderId = String(line.order_id);
      if (!orderLinesMap.has(orderId)) orderLinesMap.set(orderId, []);
      orderLinesMap.get(orderId)!.push(line);
    }
  }

  // 5. Process each unposted tender
  let posted = 0;
  let skipped = 0;
  let errors = 0;
  const failedTenders: BackfillTenderError[] = [];
  let lastProcessedTenderId: string | null = null;

  for (const t of unposted) {
    const tenderId = String(t.tender_id);
    const orderId = String(t.order_id);
    const tenderAmount = Number(t.amount);
    const orderTotal = Number(t.order_total);
    lastProcessedTenderId = tenderId;

    const orderInfo = orderTenderMap.get(orderId);
    const isFullyPaid = orderInfo ? orderInfo.totalTendered >= orderInfo.orderTotal : true;

    const lines = orderLinesMap.get(orderId) ?? [];
    const enrichedLines = lines.map((l) => ({
      catalogItemId: String(l.catalog_item_id ?? ''),
      catalogItemName: String(l.catalog_item_name ?? ''),
      subDepartmentId: l.sub_department_id ? String(l.sub_department_id) : null,
      qty: Number(l.qty ?? 1),
      extendedPriceCents: Number(l.line_subtotal ?? 0),
      taxGroupId: l.tax_group_id ? String(l.tax_group_id) : null,
      taxAmountCents: Number(l.line_tax ?? 0),
      costCents: l.cost_price != null ? Number(l.cost_price) : null,
      packageComponents: l.package_components ?? null,
    }));

    try {
      const syntheticEvent = {
        eventId: `backfill-${tenderId}`,
        eventType: 'tender.recorded.v1',
        tenantId,
        idempotencyKey: `gl-backfill-${tenderId}`,
        data: {
          tenderId,
          orderId,
          tenantId,
          locationId: String(t.location_id ?? ''),
          tenderType: String(t.tender_type ?? 'cash'),
          paymentMethod: String(t.tender_type ?? 'cash'),
          amount: tenderAmount,
          tipAmount: Number(t.tip_amount ?? 0),
          orderTotal,
          subtotal: Number(t.subtotal ?? 0),
          taxTotal: Number(t.tax_total ?? 0),
          discountTotal: Number(t.discount_total ?? 0),
          serviceChargeTotal: Number(t.service_charge_total ?? 0),
          totalTendered: orderInfo?.totalTendered ?? tenderAmount,
          isFullyPaid,
          customerId: t.customer_id ? String(t.customer_id) : null,
          terminalId: t.terminal_id ? String(t.terminal_id) : null,
          tenderSequence: Number(t.tender_sequence ?? 1),
          businessDate: String(t.business_date),
          lines: enrichedLines,
        } as Record<string, unknown>,
        occurredAt: new Date().toISOString(),
      };

      await handleTenderForAccounting(syntheticEvent);
      posted++;
    } catch (err) {
      errors++;
      const message = err instanceof Error ? err.message : String(err);
      failedTenders.push({ tenderId, orderId, message });
      console.error(`[gl-backfill] Error posting tender ${tenderId}:`, message);

      // Log to gl_unmapped_events so failures are visible in the unmapped events dashboard
      try {
        await db.insert(glUnmappedEvents).values({
          tenantId,
          eventType: 'backfill_error',
          sourceModule: 'pos',
          sourceReferenceId: tenderId,
          entityType: 'backfill_error',
          entityId: tenderId,
          reason: `GL backfill failed: ${message}`,
        }).onConflictDoNothing();
      } catch {
        // Best-effort logging — never fail the backfill loop
      }
    }
  }

  skipped = unposted.length - posted - errors;
  const hasMore = unposted.length >= limit;

  console.info(
    `[gl-backfill] tenant=${tenantId}: posted=${posted}, skipped=${skipped}, errors=${errors}, totalUnposted=${totalUnposted}, hasMore=${hasMore}`,
  );

  return { posted, skipped, errors, totalUnposted, lastProcessedTenderId, hasMore, failedTenders };
}
