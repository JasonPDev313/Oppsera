import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type {
  TendersSummaryData,
  TenderAuditTrailData,
  TenderAuditTrailStep,
  UnmatchedTenderRow,
  SettlementFilters,
  SettlementListResult,
  SettlementListItem,
  SettlementDetailData,
  SettlementLineDetail,
  TipBalanceRow,
  TipPayoutFilters,
  TipPayoutListResult,
  TipPayoutItem,
  TerminalCloseStatus,
  LocationCloseStatusData,
  TenderForGlRepostData,
  TenderForGlRepostLineData,
} from '@oppsera/core/helpers/reconciliation-read-api';

// ── 1. getTendersSummary ─────────────────────────────────────

export async function getTendersSummary(
  tenantId: string,
  startDate: string,
  endDate: string,
  locationId?: string,
): Promise<TendersSummaryData> {
  return withTenant(tenantId, async (tx) => {
    const locationFilter = locationId
      ? sql`AND t.location_id = ${locationId}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN t.tender_type = 'cash' THEN t.amount ELSE 0 END), 0)::integer AS cash,
        COALESCE(SUM(CASE WHEN t.tender_type IN ('credit_card', 'debit_card') THEN t.amount ELSE 0 END), 0)::integer AS card,
        COALESCE(SUM(CASE WHEN t.tender_type NOT IN ('cash', 'credit_card', 'debit_card') THEN t.amount ELSE 0 END), 0)::integer AS other,
        COALESCE(SUM(t.amount), 0)::integer AS total,
        COUNT(*)::int AS tender_count,
        COALESCE(SUM(t.tip_amount), 0)::integer AS tips
      FROM tenders t
      WHERE t.tenant_id = ${tenantId}
        AND t.business_date >= ${startDate}
        AND t.business_date <= ${endDate}
        AND t.status = 'captured'
        ${locationFilter}
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    const row = arr[0]!;

    return {
      cashCents: Number(row.cash),
      cardCents: Number(row.card),
      otherCents: Number(row.other),
      totalCents: Number(row.total),
      tenderCount: Number(row.tender_count),
      tipsCents: Number(row.tips),
    };
  });
}

// ── 2. getTenderAuditTrail ───────────────────────────────────

export async function getTenderAuditTrail(
  tenantId: string,
  tenderId: string,
): Promise<TenderAuditTrailData | null> {
  return withTenant(tenantId, async (tx) => {
    // Get the tender
    const tenderRows = await tx.execute(sql`
      SELECT
        t.id, t.tender_type, t.amount, t.tip_amount, t.order_id,
        t.business_date::text, t.location_id, t.employee_id, t.status,
        t.created_at::text
      FROM tenders t
      WHERE t.id = ${tenderId}
        AND t.tenant_id = ${tenantId}
      LIMIT 1
    `);
    const tenderArr = Array.from(tenderRows as Iterable<Record<string, unknown>>);
    if (tenderArr.length === 0) return null;

    const tender = tenderArr[0]!;
    const steps: TenderAuditTrailStep[] = [];

    // Step 1: Tender recorded
    steps.push({
      stage: 'tender',
      label: 'Tender Recorded',
      status: 'complete',
      timestamp: String(tender.created_at),
      referenceId: String(tender.id),
      detail: `${String(tender.tender_type)} — $${(Number(tender.amount) / 100).toFixed(2)}`,
    });

    // Step 2: Order info
    const orderRows = await tx.execute(sql`
      SELECT o.order_number, o.status, o.placed_at::text, o.paid_at::text
      FROM orders o
      WHERE o.id = ${String(tender.order_id)}
        AND o.tenant_id = ${tenantId}
      LIMIT 1
    `);
    const orderArr = Array.from(orderRows as Iterable<Record<string, unknown>>);
    const order = orderArr.length > 0 ? orderArr[0]! : null;

    steps.push({
      stage: 'order',
      label: 'Order Paid',
      status: order && order.paid_at ? 'complete' : 'pending',
      timestamp: order?.paid_at ? String(order.paid_at) : null,
      referenceId: String(tender.order_id),
      detail: order ? `Order #${String(order.order_number)} — ${String(order.status)}` : undefined,
    });

    // Step 3: GL posting
    const glRows = await tx.execute(sql`
      SELECT je.id, je.status, je.posted_at::text, je.journal_number, je.memo
      FROM gl_journal_entries je
      WHERE je.tenant_id = ${tenantId}
        AND je.source_module = 'pos'
        AND je.source_reference_id = ${tenderId}
      LIMIT 1
    `);
    const glArr = Array.from(glRows as Iterable<Record<string, unknown>>);
    const glEntry = glArr.length > 0 ? glArr[0]! : null;

    steps.push({
      stage: 'gl_posting',
      label: 'GL Posted',
      status: glEntry && glEntry.status === 'posted' ? 'complete' : glEntry ? 'pending' : 'missing',
      timestamp: glEntry?.posted_at ? String(glEntry.posted_at) : null,
      referenceId: glEntry ? String(glEntry.id) : null,
      detail: glEntry ? `JE #${String(glEntry.journal_number)}` : 'No GL entry found',
    });

    // Step 4: Settlement match (for card tenders)
    if (String(tender.tender_type) !== 'cash') {
      const settlementRows = await tx.execute(sql`
        SELECT
          psl.id AS line_id,
          ps.id AS settlement_id,
          ps.processor_name,
          ps.settlement_date::text,
          ps.status AS settlement_status,
          psl.status AS line_status,
          psl.matched_at::text,
          psl.fee_cents
        FROM payment_settlement_lines psl
        JOIN payment_settlements ps ON ps.id = psl.settlement_id
        WHERE psl.tender_id = ${tenderId}
          AND psl.tenant_id = ${tenantId}
        LIMIT 1
      `);
      const settlementArr = Array.from(settlementRows as Iterable<Record<string, unknown>>);
      const settlement = settlementArr.length > 0 ? settlementArr[0]! : null;

      steps.push({
        stage: 'settlement',
        label: 'Card Settlement',
        status: settlement && settlement.line_status === 'matched' ? 'complete' : settlement ? 'pending' : 'missing',
        timestamp: settlement?.matched_at ? String(settlement.matched_at) : null,
        referenceId: settlement ? String(settlement.settlement_id) : null,
        detail: settlement
          ? `${String(settlement.processor_name)} — ${String(settlement.settlement_date)}${Number(settlement.fee_cents) > 0 ? ` (fee: $${(Number(settlement.fee_cents) / 100).toFixed(2)})` : ''}`
          : 'Not yet matched to a settlement',
      });
    }

    // Step 5: Deposit
    const depositRows = await tx.execute(sql`
      SELECT
        ds.id,
        ds.status,
        ds.deposited_at::text,
        ds.reconciled_at::text,
        ds.total_amount_cents
      FROM deposit_slips ds
      JOIN retail_close_batches rcb ON rcb.id = ANY(ds.retail_close_batch_ids)
      JOIN drawer_sessions drs ON drs.id = rcb.drawer_session_id
      JOIN tenders t ON t.terminal_id = drs.terminal_id
        AND t.business_date = drs.business_date
        AND t.tenant_id = drs.tenant_id
      WHERE t.id = ${tenderId}
        AND ds.tenant_id = ${tenantId}
      LIMIT 1
    `);
    const depositArr = Array.from(depositRows as Iterable<Record<string, unknown>>);
    const deposit = depositArr.length > 0 ? depositArr[0]! : null;

    steps.push({
      stage: 'deposit',
      label: 'Deposit',
      status: deposit && deposit.status === 'reconciled' ? 'complete' : deposit ? 'pending' : 'missing',
      timestamp: deposit?.reconciled_at ? String(deposit.reconciled_at) : deposit?.deposited_at ? String(deposit.deposited_at) : null,
      referenceId: deposit ? String(deposit.id) : null,
      detail: deposit ? `Status: ${String(deposit.status)}` : 'Not yet included in a deposit',
    });

    return {
      tenderId: String(tender.id),
      tenderType: String(tender.tender_type),
      amountCents: Number(tender.amount),
      tipAmountCents: Number(tender.tip_amount) || 0,
      orderId: String(tender.order_id),
      orderNumber: order ? String(order.order_number) : null,
      businessDate: String(tender.business_date),
      locationId: String(tender.location_id),
      employeeId: tender.employee_id ? String(tender.employee_id) : null,
      steps,
    };
  });
}

// ── 3. getUnmatchedTenders ───────────────────────────────────

export async function getUnmatchedTenders(
  tenantId: string,
  startDate: string,
  endDate: string,
): Promise<UnmatchedTenderRow[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT t.id, t.order_id, t.tender_type, t.amount, t.tip_amount,
        t.business_date, t.card_last4, t.card_brand, t.provider_ref, t.created_at
      FROM tenders t
      WHERE t.tenant_id = ${tenantId}
        AND t.tender_type IN ('card', 'gift_card')
        AND t.status = 'captured'
        AND NOT EXISTS (
          SELECT 1 FROM payment_settlement_lines psl
          WHERE psl.tender_id = t.id AND psl.tenant_id = t.tenant_id
        )
        AND t.business_date >= ${startDate}
        AND t.business_date <= ${endDate}
      ORDER BY t.business_date DESC, t.id DESC
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    return arr.map((r) => ({
      id: String(r.id),
      orderId: String(r.order_id),
      tenderType: String(r.tender_type),
      amount: Number(r.amount),
      tipAmount: Number(r.tip_amount),
      businessDate: String(r.business_date),
      cardLast4: r.card_last4 ? String(r.card_last4) : null,
      cardBrand: r.card_brand ? String(r.card_brand) : null,
      providerRef: r.provider_ref ? String(r.provider_ref) : null,
      createdAt: String(r.created_at),
    }));
  });
}

// ── 4. getTenderAuditCount ───────────────────────────────────

export async function getTenderAuditCount(
  tenantId: string,
  startDate: string,
  endDate: string,
): Promise<number> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM tenders
      WHERE tenant_id = ${tenantId}
        AND created_at >= ${startDate}::timestamptz
        AND created_at < (${endDate}::date + interval '1 day')::timestamptz
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    return Number(arr[0]!.count);
  });
}

// ── 5. listSettlements ───────────────────────────────────────

export async function listSettlements(
  tenantId: string,
  filters: SettlementFilters,
): Promise<SettlementListResult> {
  const limit = filters.limit ?? 50;

  return withTenant(tenantId, async (tx) => {
    const statusFilter = filters.status
      ? sql`AND s.status = ${filters.status}`
      : sql``;
    const processorFilter = filters.processorName
      ? sql`AND s.processor_name = ${filters.processorName}`
      : sql``;
    const startDateFilter = filters.startDate
      ? sql`AND s.settlement_date >= ${filters.startDate}`
      : sql``;
    const endDateFilter = filters.endDate
      ? sql`AND s.settlement_date <= ${filters.endDate}`
      : sql``;
    const cursorFilter = filters.cursor
      ? sql`AND s.id < ${filters.cursor}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT
        s.id, s.location_id, s.settlement_date, s.processor_name,
        s.processor_batch_id, s.gross_amount, s.fee_amount, s.net_amount,
        s.chargeback_amount, s.status, s.bank_account_id,
        ba.name AS bank_account_name, s.gl_journal_entry_id,
        s.import_source, s.business_date_from, s.business_date_to,
        s.notes, s.created_at,
        COALESCE(lc.total_lines, 0) AS total_lines,
        COALESCE(lc.matched_lines, 0) AS matched_lines,
        COALESCE(lc.unmatched_lines, 0) AS unmatched_lines
      FROM payment_settlements s
      LEFT JOIN bank_accounts ba ON ba.id = s.bank_account_id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS total_lines,
          COUNT(*) FILTER (WHERE psl.status = 'matched') AS matched_lines,
          COUNT(*) FILTER (WHERE psl.status = 'unmatched') AS unmatched_lines
        FROM payment_settlement_lines psl
        WHERE psl.settlement_id = s.id
      ) lc ON true
      WHERE s.tenant_id = ${tenantId}
        ${statusFilter}
        ${processorFilter}
        ${startDateFilter}
        ${endDateFilter}
        ${cursorFilter}
      ORDER BY s.settlement_date DESC, s.id DESC
      LIMIT ${limit + 1}
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = allRows.length > limit;
    const items: SettlementListItem[] = (hasMore ? allRows.slice(0, limit) : allRows).map((row) => ({
      id: String(row.id),
      locationId: row.location_id ? String(row.location_id) : null,
      settlementDate: String(row.settlement_date),
      processorName: String(row.processor_name),
      processorBatchId: row.processor_batch_id ? String(row.processor_batch_id) : null,
      grossAmount: Number(row.gross_amount),
      feeAmount: Number(row.fee_amount),
      netAmount: Number(row.net_amount),
      chargebackAmount: Number(row.chargeback_amount),
      status: String(row.status),
      bankAccountId: row.bank_account_id ? String(row.bank_account_id) : null,
      bankAccountName: row.bank_account_name ? String(row.bank_account_name) : null,
      glJournalEntryId: row.gl_journal_entry_id ? String(row.gl_journal_entry_id) : null,
      importSource: String(row.import_source),
      businessDateFrom: row.business_date_from ? String(row.business_date_from) : null,
      businessDateTo: row.business_date_to ? String(row.business_date_to) : null,
      notes: row.notes ? String(row.notes) : null,
      totalLines: Number(row.total_lines),
      matchedLines: Number(row.matched_lines),
      unmatchedLines: Number(row.unmatched_lines),
      createdAt: String(row.created_at),
    }));

    return {
      items,
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}

// ── 6. getSettlementDetail ───────────────────────────────────

export async function getSettlementDetail(
  tenantId: string,
  settlementId: string,
): Promise<SettlementDetailData | null> {
  return withTenant(tenantId, async (tx) => {
    // Fetch settlement header
    const headerRows = await tx.execute(sql`
      SELECT
        s.id,
        s.location_id,
        s.settlement_date,
        s.processor_name,
        s.processor_batch_id,
        s.gross_amount,
        s.fee_amount,
        s.net_amount,
        s.chargeback_amount,
        s.status,
        s.bank_account_id,
        ba.name AS bank_account_name,
        s.gl_journal_entry_id,
        s.import_source,
        s.business_date_from,
        s.business_date_to,
        s.notes,
        s.created_at,
        s.updated_at
      FROM payment_settlements s
      LEFT JOIN bank_accounts ba ON ba.id = s.bank_account_id
      WHERE s.tenant_id = ${tenantId}
        AND s.id = ${settlementId}
      LIMIT 1
    `);

    const headers = Array.from(headerRows as Iterable<Record<string, unknown>>);
    if (headers.length === 0) return null;

    const h = headers[0]!;

    // Fetch lines with tender enrichment
    const lineRows = await tx.execute(sql`
      SELECT
        psl.id,
        psl.tender_id,
        psl.original_amount_cents,
        psl.settled_amount_cents,
        psl.fee_cents,
        psl.net_cents,
        psl.status,
        psl.matched_at,
        t.tender_type,
        t.business_date AS tender_business_date,
        t.order_id,
        t.card_last4,
        t.card_brand
      FROM payment_settlement_lines psl
      LEFT JOIN tenders t ON t.id = psl.tender_id
      WHERE psl.tenant_id = ${tenantId}
        AND psl.settlement_id = ${settlementId}
      ORDER BY psl.created_at
    `);

    const lines: SettlementLineDetail[] = Array.from(lineRows as Iterable<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      tenderId: row.tender_id ? String(row.tender_id) : null,
      originalAmountCents: Number(row.original_amount_cents),
      settledAmountCents: Number(row.settled_amount_cents),
      feeCents: Number(row.fee_cents),
      netCents: Number(row.net_cents),
      status: String(row.status),
      matchedAt: row.matched_at ? String(row.matched_at) : null,
      tenderType: row.tender_type ? String(row.tender_type) : null,
      tenderBusinessDate: row.tender_business_date ? String(row.tender_business_date) : null,
      orderId: row.order_id ? String(row.order_id) : null,
      cardLast4: row.card_last4 ? String(row.card_last4) : null,
      cardBrand: row.card_brand ? String(row.card_brand) : null,
    }));

    return {
      id: String(h.id),
      locationId: h.location_id ? String(h.location_id) : null,
      settlementDate: String(h.settlement_date),
      processorName: String(h.processor_name),
      processorBatchId: h.processor_batch_id ? String(h.processor_batch_id) : null,
      grossAmount: Number(h.gross_amount),
      feeAmount: Number(h.fee_amount),
      netAmount: Number(h.net_amount),
      chargebackAmount: Number(h.chargeback_amount),
      status: String(h.status),
      bankAccountId: h.bank_account_id ? String(h.bank_account_id) : null,
      bankAccountName: h.bank_account_name ? String(h.bank_account_name) : null,
      glJournalEntryId: h.gl_journal_entry_id ? String(h.gl_journal_entry_id) : null,
      importSource: String(h.import_source),
      businessDateFrom: h.business_date_from ? String(h.business_date_from) : null,
      businessDateTo: h.business_date_to ? String(h.business_date_to) : null,
      notes: h.notes ? String(h.notes) : null,
      createdAt: String(h.created_at),
      updatedAt: String(h.updated_at),
      lines,
    };
  });
}

// ── 7. getSettlementStatusCounts ─────────────────────────────

export async function getSettlementStatusCounts(
  tenantId: string,
  period: string,
): Promise<{ total: number; unposted: number }> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status NOT IN ('posted'))::int AS unposted
      FROM payment_settlements
      WHERE tenant_id = ${tenantId}
        AND settlement_date >= (${period} || '-01')::date
        AND settlement_date < ((${period} || '-01')::date + INTERVAL '1 month')
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    const row = arr[0]!;

    return {
      total: Number(row.total),
      unposted: Number(row.unposted),
    };
  });
}

// ── 8. getDrawerSessionStatus ────────────────────────────────

export async function getDrawerSessionStatus(
  tenantId: string,
  period: string,
): Promise<{ total: number; openCount: number }> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'open')::int AS open_count
      FROM drawer_sessions
      WHERE tenant_id = ${tenantId}
        AND business_date >= (${period} || '-01')::date
        AND business_date < ((${period} || '-01')::date + INTERVAL '1 month')
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    const row = arr[0]!;

    return {
      total: Number(row.total),
      openCount: Number(row.open_count),
    };
  });
}

// ── 9. getRetailCloseStatus ──────────────────────────────────

export async function getRetailCloseStatus(
  tenantId: string,
  period: string,
): Promise<{ total: number; unposted: number }> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status NOT IN ('posted', 'locked'))::int AS unposted
      FROM retail_close_batches
      WHERE tenant_id = ${tenantId}
        AND business_date >= (${period} || '-01')::date
        AND business_date < ((${period} || '-01')::date + INTERVAL '1 month')
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    const row = arr[0]!;

    return {
      total: Number(row.total),
      unposted: Number(row.unposted),
    };
  });
}

// ── 10. getCashOnHand ────────────────────────────────────────

export async function getCashOnHand(
  tenantId: string,
  startDate: string,
  endDate: string,
  locationId?: string,
): Promise<number> {
  return withTenant(tenantId, async (tx) => {
    const locationFilterDs = locationId
      ? sql`AND ds.location_id = ${locationId}`
      : sql``;
    const locationFilterT = locationId
      ? sql`AND t.location_id = ${locationId}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT
        COALESCE(SUM(ds.opening_balance_cents), 0)::integer +
        COALESCE((
          SELECT SUM(t.amount)
          FROM tenders t
          WHERE t.tenant_id = ${tenantId}
            AND t.tender_type = 'cash'
            AND t.status = 'captured'
            AND t.business_date >= ${startDate}
            AND t.business_date <= ${endDate}
            ${locationFilterT}
        ), 0)::integer AS cash_on_hand
      FROM drawer_sessions ds
      WHERE ds.tenant_id = ${tenantId}
        AND ds.status = 'open'
        AND ds.business_date >= ${startDate}
        AND ds.business_date <= ${endDate}
        ${locationFilterDs}
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    return Number(arr[0]!.cash_on_hand);
  });
}

// ── 11. getOverShortTotal ────────────────────────────────────

export async function getOverShortTotal(
  tenantId: string,
  startDate: string,
  endDate: string,
  locationId?: string,
): Promise<number> {
  return withTenant(tenantId, async (tx) => {
    const locationFilter = locationId
      ? sql`AND location_id = ${locationId}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT COALESCE(SUM(cash_over_short_cents), 0)::integer AS over_short
      FROM retail_close_batches
      WHERE tenant_id = ${tenantId}
        AND business_date >= ${startDate}
        AND business_date <= ${endDate}
        AND status IN ('reconciled', 'posted', 'locked')
        ${locationFilter}
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    return Number(arr[0]!.over_short);
  });
}

// ── 12. getTipBalances ───────────────────────────────────────

export async function getTipBalances(
  tenantId: string,
  asOfDate: string,
  locationId?: string,
): Promise<TipBalanceRow[]> {
  return withTenant(tenantId, async (tx) => {
    const locationFilter = locationId
      ? sql`AND t.location_id = ${locationId}`
      : sql``;

    const rows = await tx.execute(sql`
      WITH tip_totals AS (
        SELECT
          t.employee_id,
          COALESCE(SUM(t.tip_amount), 0)::integer AS total_tips_cents,
          MAX(t.business_date)::text AS last_tip_date
        FROM tenders t
        WHERE t.tenant_id = ${tenantId}
          AND t.status = 'captured'
          AND t.tip_amount > 0
          AND t.business_date <= ${asOfDate}
          ${locationFilter}
        GROUP BY t.employee_id
      ),
      payout_totals AS (
        SELECT
          tp.employee_id,
          COALESCE(SUM(tp.amount_cents), 0)::integer AS total_paid_cents,
          MAX(tp.business_date)::text AS last_payout_date
        FROM tip_payouts tp
        WHERE tp.tenant_id = ${tenantId}
          AND tp.status != 'voided'
          AND tp.business_date <= ${asOfDate}
        GROUP BY tp.employee_id
      )
      SELECT
        tt.employee_id,
        u.display_name AS employee_name,
        tt.total_tips_cents,
        COALESCE(pt.total_paid_cents, 0)::integer AS total_paid_cents,
        (tt.total_tips_cents - COALESCE(pt.total_paid_cents, 0))::integer AS balance_cents,
        tt.last_tip_date,
        pt.last_payout_date
      FROM tip_totals tt
      LEFT JOIN payout_totals pt ON pt.employee_id = tt.employee_id
      LEFT JOIN users u ON u.id = tt.employee_id
      WHERE (tt.total_tips_cents - COALESCE(pt.total_paid_cents, 0)) > 0
      ORDER BY (tt.total_tips_cents - COALESCE(pt.total_paid_cents, 0)) DESC
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    return arr.map((r) => ({
      employeeId: String(r.employee_id),
      employeeName: r.employee_name ? String(r.employee_name) : null,
      totalTipsCents: Number(r.total_tips_cents),
      totalPaidCents: Number(r.total_paid_cents),
      balanceCents: Number(r.balance_cents),
      lastTipDate: r.last_tip_date ? String(r.last_tip_date) : null,
      lastPayoutDate: r.last_payout_date ? String(r.last_payout_date) : null,
    }));
  });
}

// ── 13. listTipPayouts ───────────────────────────────────────

export async function listTipPayouts(
  tenantId: string,
  filters: TipPayoutFilters,
): Promise<TipPayoutListResult> {
  const limit = filters.limit ?? 50;

  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        tp.id,
        tp.location_id,
        tp.employee_id,
        u.display_name AS employee_name,
        tp.payout_type,
        tp.amount_cents,
        tp.business_date::text AS business_date,
        tp.drawer_session_id,
        tp.payroll_period,
        tp.status,
        tp.approved_by,
        tp.gl_journal_entry_id,
        tp.notes,
        tp.created_at
      FROM tip_payouts tp
      LEFT JOIN users u ON u.id = tp.employee_id
      WHERE tp.tenant_id = ${tenantId}
        ${filters.locationId ? sql`AND tp.location_id = ${filters.locationId}` : sql``}
        ${filters.employeeId ? sql`AND tp.employee_id = ${filters.employeeId}` : sql``}
        ${filters.status ? sql`AND tp.status = ${filters.status}` : sql``}
        ${filters.businessDateFrom ? sql`AND tp.business_date >= ${filters.businessDateFrom}` : sql``}
        ${filters.businessDateTo ? sql`AND tp.business_date <= ${filters.businessDateTo}` : sql``}
        ${filters.cursor ? sql`AND tp.id < ${filters.cursor}` : sql``}
      ORDER BY tp.created_at DESC, tp.id DESC
      LIMIT ${limit + 1}
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = arr.length > limit;
    const items: TipPayoutItem[] = (hasMore ? arr.slice(0, limit) : arr).map((r) => ({
      id: String(r.id),
      locationId: String(r.location_id),
      employeeId: String(r.employee_id),
      employeeName: r.employee_name ? String(r.employee_name) : null,
      payoutType: String(r.payout_type),
      amountCents: Number(r.amount_cents),
      businessDate: String(r.business_date),
      drawerSessionId: r.drawer_session_id ? String(r.drawer_session_id) : null,
      payrollPeriod: r.payroll_period ? String(r.payroll_period) : null,
      status: String(r.status),
      approvedBy: r.approved_by ? String(r.approved_by) : null,
      glJournalEntryId: r.gl_journal_entry_id ? String(r.gl_journal_entry_id) : null,
      notes: r.notes ? String(r.notes) : null,
      createdAt: String(r.created_at),
    }));

    return {
      items,
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}

// ── 14. getPendingTipCount ───────────────────────────────────

export async function getPendingTipCount(
  tenantId: string,
  period: string,
): Promise<number> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM tip_payouts
      WHERE tenant_id = ${tenantId}
        AND status = 'pending'
        AND business_date >= (${period} || '-01')::date
        AND business_date < ((${period} || '-01')::date + INTERVAL '1 month')
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    return Number(arr[0]!.count);
  });
}

// ── 15. getOutstandingTipsCents ──────────────────────────────

export async function getOutstandingTipsCents(
  tenantId: string,
  startDate: string,
  endDate: string,
  locationId?: string,
): Promise<number> {
  return withTenant(tenantId, async (tx) => {
    const locationFilterT = locationId
      ? sql`AND t.location_id = ${locationId}`
      : sql``;
    const locationFilterTp = locationId
      ? sql`AND tp.location_id = ${locationId}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT
        COALESCE((
          SELECT SUM(t.tip_amount) FROM tenders t
          WHERE t.tenant_id = ${tenantId}
            AND t.status = 'captured' AND t.tip_amount > 0
            AND t.business_date >= ${startDate}
            AND t.business_date <= ${endDate}
            ${locationFilterT}
        ), 0)::integer -
        COALESCE((
          SELECT SUM(tp.amount_cents) FROM tip_payouts tp
          WHERE tp.tenant_id = ${tenantId}
            AND tp.status != 'voided'
            AND tp.business_date >= ${startDate}
            AND tp.business_date <= ${endDate}
            ${locationFilterTp}
        ), 0)::integer AS outstanding
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    return Math.max(0, Number(arr[0]!.outstanding));
  });
}

// ── 16. getDepositStatus ─────────────────────────────────────

export async function getDepositStatus(
  tenantId: string,
  period: string,
): Promise<{ total: number; unreconciled: number }> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status NOT IN ('reconciled'))::int AS unreconciled
      FROM deposit_slips
      WHERE tenant_id = ${tenantId}
        AND business_date >= (${period} || '-01')::date
        AND business_date < ((${period} || '-01')::date + INTERVAL '1 month')
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    const row = arr[0]!;

    return {
      total: Number(row.total),
      unreconciled: Number(row.unreconciled),
    };
  });
}

// ── 17. getLocationCloseStatus ───────────────────────────────

export async function getLocationCloseStatus(
  tenantId: string,
  locationId: string,
  businessDate: string,
): Promise<LocationCloseStatusData> {
  return withTenant(tenantId, async (tx) => {
    // Get retail terminal statuses
    const terminalRows = await tx.execute(sql`
      SELECT
        t.id AS terminal_id,
        t.terminal_number AS terminal_name,
        ds.status AS drawer_session_status,
        rcb.status AS close_batch_status,
        rcb.id AS close_batch_id
      FROM terminals t
      JOIN terminal_locations tl ON tl.id = t.terminal_location_id
      LEFT JOIN drawer_sessions ds ON ds.terminal_id = t.id
        AND ds.tenant_id = ${tenantId}
        AND ds.business_date = ${businessDate}
      LEFT JOIN retail_close_batches rcb ON rcb.terminal_id = t.id
        AND rcb.tenant_id = ${tenantId}
        AND rcb.business_date = ${businessDate}
      WHERE tl.location_id = ${locationId}
        AND tl.tenant_id = ${tenantId}
        AND t.is_active = true
    `);
    const terminals = Array.from(terminalRows as Iterable<Record<string, unknown>>);

    const retailTerminals: TerminalCloseStatus[] = terminals.map((t) => ({
      terminalId: String(t.terminal_id),
      terminalName: t.terminal_name ? String(t.terminal_name) : null,
      drawerSessionStatus: t.drawer_session_status ? String(t.drawer_session_status) : null,
      closeBatchStatus: t.close_batch_status ? String(t.close_batch_status) : null,
      closeBatchId: t.close_batch_id ? String(t.close_batch_id) : null,
    }));

    // Get F&B close batch status
    const fnbRows = await tx.execute(sql`
      SELECT id, status
      FROM fnb_close_batches
      WHERE tenant_id = ${tenantId}
        AND location_id = ${locationId}
        AND business_date = ${businessDate}
      LIMIT 1
    `);
    const fnbArr = Array.from(fnbRows as Iterable<Record<string, unknown>>);
    const fnbBatch = fnbArr[0] ?? null;

    // Get deposit slip status
    const depositRows = await tx.execute(sql`
      SELECT id, status
      FROM deposit_slips
      WHERE tenant_id = ${tenantId}
        AND location_id = ${locationId}
        AND business_date = ${businessDate}
      LIMIT 1
    `);
    const depositArr = Array.from(depositRows as Iterable<Record<string, unknown>>);
    const deposit = depositArr[0] ?? null;

    const allTerminalsClosed = retailTerminals.length === 0 ||
      retailTerminals.every((t) =>
        t.closeBatchStatus && ['posted', 'locked'].includes(t.closeBatchStatus),
      );

    const fnbClosed = !fnbBatch || ['posted', 'locked'].includes(String((fnbBatch as Record<string, unknown>).status));

    return {
      locationId,
      businessDate,
      retailTerminals,
      fnbBatchStatus: fnbBatch ? String((fnbBatch as Record<string, unknown>).status) : null,
      fnbBatchId: fnbBatch ? String((fnbBatch as Record<string, unknown>).id) : null,
      depositSlipId: deposit ? String((deposit as Record<string, unknown>).id) : null,
      depositSlipStatus: deposit ? String((deposit as Record<string, unknown>).status) : null,
      allTerminalsClosed,
      fnbClosed,
      depositReady: allTerminalsClosed && fnbClosed,
    };
  });
}

// ── 18. getTenderForGlRepost ────────────────────────────────

export async function getTenderForGlRepost(
  tenantId: string,
  tenderId: string,
): Promise<TenderForGlRepostData | null> {
  return withTenant(tenantId, async (tx) => {
    // 1. Load tender
    const tenderRows = await tx.execute(sql`
      SELECT t.id, t.order_id, t.tender_type, t.amount, t.tip_amount,
             t.business_date::text AS business_date, t.location_id, t.terminal_id,
             t.tender_sequence, t.status
      FROM tenders t
      WHERE t.id = ${tenderId} AND t.tenant_id = ${tenantId}
      LIMIT 1
    `);
    const tenderArr = Array.from(tenderRows as Iterable<Record<string, unknown>>);
    if (tenderArr.length === 0) return null;
    const t = tenderArr[0]!;

    if (String(t.status) !== 'captured') return null;

    const orderId = String(t.order_id);

    // 2. Load order
    const orderRows = await tx.execute(sql`
      SELECT o.total, o.subtotal, o.tax_total, o.discount_total,
             o.service_charge_total, o.customer_id
      FROM orders o
      WHERE o.id = ${orderId} AND o.tenant_id = ${tenantId}
      LIMIT 1
    `);
    const orderArr = Array.from(orderRows as Iterable<Record<string, unknown>>);
    if (orderArr.length === 0) return null;
    const o = orderArr[0]!;

    // 3. Determine isFullyPaid
    const sumRows = await tx.execute(sql`
      SELECT COALESCE(SUM(amount), 0)::integer AS total_tendered
      FROM tenders
      WHERE tenant_id = ${tenantId} AND order_id = ${orderId} AND status = 'captured'
    `);
    const sumArr = Array.from(sumRows as Iterable<Record<string, unknown>>);
    const totalTendered = Number(sumArr[0]?.total_tendered ?? 0);
    const orderTotal = Number(o.total ?? 0);
    const isFullyPaid = totalTendered >= orderTotal;

    // 4. Load order lines
    const lineRows = await tx.execute(sql`
      SELECT catalog_item_id, catalog_item_name, sub_department_id,
             qty, line_subtotal, tax_group_id, line_tax,
             cost_price, package_components
      FROM order_lines
      WHERE tenant_id = ${tenantId} AND order_id = ${orderId}
    `);
    const lineArr = Array.from(lineRows as Iterable<Record<string, unknown>>);

    const lines: TenderForGlRepostLineData[] = lineArr.map((l) => ({
      catalogItemId: String(l.catalog_item_id ?? ''),
      catalogItemName: String(l.catalog_item_name ?? ''),
      subDepartmentId: l.sub_department_id ? String(l.sub_department_id) : null,
      qty: Number(l.qty ?? 1),
      extendedPriceCents: Number(l.line_subtotal ?? 0),
      taxGroupId: l.tax_group_id ? String(l.tax_group_id) : null,
      taxAmountCents: Number(l.line_tax ?? 0),
      costCents: l.cost_price != null ? Number(l.cost_price) : null,
      packageComponents: (l.package_components as TenderForGlRepostLineData['packageComponents']) ?? null,
    }));

    return {
      tenderId: String(t.id),
      orderId,
      tenantId,
      locationId: String(t.location_id ?? ''),
      tenderType: String(t.tender_type ?? 'cash'),
      paymentMethod: String(t.tender_type ?? 'cash'),
      amount: Number(t.amount),
      tipAmount: Number(t.tip_amount ?? 0),
      customerId: o.customer_id ? String(o.customer_id) : null,
      terminalId: t.terminal_id ? String(t.terminal_id) : null,
      tenderSequence: Number(t.tender_sequence ?? 1),
      isFullyPaid,
      orderTotal,
      subtotal: Number(o.subtotal ?? 0),
      taxTotal: Number(o.tax_total ?? 0),
      discountTotal: Number(o.discount_total ?? 0),
      serviceChargeTotal: Number(o.service_charge_total ?? 0),
      totalTendered,
      businessDate: String(t.business_date),
      lines,
    };
  });
}
