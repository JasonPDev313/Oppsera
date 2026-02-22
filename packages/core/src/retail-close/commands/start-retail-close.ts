import { eq, and, sql } from 'drizzle-orm';
import { AppError, generateUlid } from '@oppsera/shared';
import { retailCloseBatches } from '@oppsera/db';
import { publishWithOutbox } from '../../events/publish-with-outbox';
import { buildEventFromContext } from '../../events/build-event';
import { auditLog } from '../../audit/helpers';
import type { RequestContext } from '../../auth/context';
import type { StartRetailCloseInput } from '../validation';
import type { RetailCloseBatch, TenderBreakdownEntry, DepartmentSalesEntry, TaxGroupEntry } from '../types';

function mapRow(row: typeof retailCloseBatches.$inferSelect): RetailCloseBatch {
  return {
    id: row.id,
    tenantId: row.tenantId,
    locationId: row.locationId,
    terminalId: row.terminalId,
    businessDate: row.businessDate,
    drawerSessionId: row.drawerSessionId,
    status: row.status as RetailCloseBatch['status'],
    grossSalesCents: row.grossSalesCents,
    netSalesCents: row.netSalesCents,
    taxCollectedCents: row.taxCollectedCents,
    discountTotalCents: row.discountTotalCents,
    voidTotalCents: row.voidTotalCents,
    voidCount: row.voidCount,
    serviceChargeCents: row.serviceChargeCents,
    tipsCreditCents: row.tipsCreditCents,
    tipsCashCents: row.tipsCashCents,
    orderCount: row.orderCount,
    refundTotalCents: row.refundTotalCents,
    refundCount: row.refundCount,
    tenderBreakdown: (row.tenderBreakdown ?? []) as TenderBreakdownEntry[],
    salesByDepartment: row.salesByDepartment as DepartmentSalesEntry[] | null,
    taxByGroup: row.taxByGroup as TaxGroupEntry[] | null,
    cashExpectedCents: row.cashExpectedCents,
    cashCountedCents: row.cashCountedCents,
    cashOverShortCents: row.cashOverShortCents,
    startedAt: row.startedAt?.toISOString() ?? null,
    startedBy: row.startedBy,
    reconciledAt: row.reconciledAt?.toISOString() ?? null,
    reconciledBy: row.reconciledBy,
    postedAt: row.postedAt?.toISOString() ?? null,
    postedBy: row.postedBy,
    lockedAt: row.lockedAt?.toISOString() ?? null,
    lockedBy: row.lockedBy,
    glJournalEntryId: row.glJournalEntryId,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Start a retail close batch.
 * Aggregates all orders and tenders for the terminal's business date.
 */
export async function startRetailClose(
  ctx: RequestContext,
  input: StartRetailCloseInput,
): Promise<RetailCloseBatch> {
  const businessDate = input.businessDate ?? new Date().toISOString().slice(0, 10);
  const { terminalId, locationId } = input;

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Check for existing batch
    const existing = await tx
      .select()
      .from(retailCloseBatches)
      .where(
        and(
          eq(retailCloseBatches.tenantId, ctx.tenantId),
          eq(retailCloseBatches.terminalId, terminalId),
          eq(retailCloseBatches.businessDate, businessDate),
        ),
      );

    if (existing.length > 0) {
      const batch = existing[0]!;
      if (batch.status !== 'open') {
        throw new AppError('BATCH_ALREADY_EXISTS', `A close batch already exists for this terminal on ${businessDate}`, 409);
      }
      // Return existing open batch
      return { result: mapRow(batch), events: [] };
    }

    // Aggregate orders for this terminal + business date
    const orderAgg = await tx.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE o.status != 'voided') AS order_count,
        COALESCE(SUM(o.subtotal) FILTER (WHERE o.status != 'voided'), 0) AS gross_sales,
        COALESCE(SUM(o.total) FILTER (WHERE o.status != 'voided'), 0) AS net_sales_with_tax,
        COALESCE(SUM(o.tax_total) FILTER (WHERE o.status != 'voided'), 0) AS tax_collected,
        COALESCE(SUM(o.discount_total) FILTER (WHERE o.status != 'voided'), 0) AS discount_total,
        COALESCE(SUM(o.service_charge_total) FILTER (WHERE o.status != 'voided'), 0) AS service_charge_total,
        COUNT(*) FILTER (WHERE o.status = 'voided') AS void_count,
        COALESCE(SUM(o.total) FILTER (WHERE o.status = 'voided'), 0) AS void_total
      FROM orders o
      WHERE o.tenant_id = ${ctx.tenantId}
        AND o.terminal_id = ${terminalId}
        AND o.business_date = ${businessDate}
    `);

    const oa = Array.from(orderAgg as Iterable<Record<string, unknown>>)[0] ?? {};
    const grossSalesCents = Number(oa.gross_sales ?? 0);
    const taxCollectedCents = Number(oa.tax_collected ?? 0);
    const discountTotalCents = Number(oa.discount_total ?? 0);
    const serviceChargeCents = Number(oa.service_charge_total ?? 0);
    const voidCount = Number(oa.void_count ?? 0);
    const voidTotalCents = Number(oa.void_total ?? 0);
    const orderCount = Number(oa.order_count ?? 0);
    const netSalesCents = grossSalesCents - discountTotalCents;

    // Aggregate tenders by type
    const tenderAgg = await tx.execute(sql`
      SELECT
        t.tender_type,
        COUNT(*) AS cnt,
        COALESCE(SUM(t.amount), 0) AS total_amount,
        COALESCE(SUM(t.tip_amount), 0) AS total_tips
      FROM tenders t
      JOIN orders o ON o.id = t.order_id AND o.tenant_id = t.tenant_id
      WHERE t.tenant_id = ${ctx.tenantId}
        AND o.terminal_id = ${terminalId}
        AND o.business_date = ${businessDate}
        AND t.status = 'completed'
        AND NOT EXISTS (
          SELECT 1 FROM tender_reversals tr
          WHERE tr.tender_id = t.id AND tr.tenant_id = t.tenant_id
        )
      GROUP BY t.tender_type
    `);

    const tenderRows = Array.from(tenderAgg as Iterable<Record<string, unknown>>);
    const tenderBreakdown: TenderBreakdownEntry[] = tenderRows.map((r) => ({
      tenderType: String(r.tender_type ?? 'unknown'),
      count: Number(r.cnt ?? 0),
      totalCents: Number(r.total_amount ?? 0),
    }));

    let tipsCreditCents = 0;
    let tipsCashCents = 0;
    for (const r of tenderRows) {
      const tips = Number(r.total_tips ?? 0);
      if (String(r.tender_type) === 'cash') {
        tipsCashCents += tips;
      } else {
        tipsCreditCents += tips;
      }
    }

    // Sales by department
    const deptAgg = await tx.execute(sql`
      SELECT
        COALESCE(c.name, 'Uncategorized') AS dept_name,
        COUNT(DISTINCT ol.id) AS line_count,
        COALESCE(SUM(ol.extended_price), 0) AS total_cents
      FROM order_lines ol
      JOIN orders o ON o.id = ol.order_id AND o.tenant_id = ol.tenant_id
      LEFT JOIN catalog_categories c ON c.id = ol.sub_department_id AND c.tenant_id = ol.tenant_id
      WHERE ol.tenant_id = ${ctx.tenantId}
        AND o.terminal_id = ${terminalId}
        AND o.business_date = ${businessDate}
        AND o.status != 'voided'
      GROUP BY c.name
      ORDER BY total_cents DESC
    `);

    const salesByDepartment: DepartmentSalesEntry[] = Array.from(
      deptAgg as Iterable<Record<string, unknown>>,
    ).map((r) => ({
      departmentName: String(r.dept_name ?? 'Uncategorized'),
      count: Number(r.line_count ?? 0),
      totalCents: Number(r.total_cents ?? 0),
    }));

    // Cash expected (from drawer session if available)
    let cashExpectedCents = 0;
    const cashEntry = tenderBreakdown.find((t) => t.tenderType === 'cash');
    if (cashEntry) {
      cashExpectedCents = cashEntry.totalCents;
    }

    // If we have a drawer session, add opening balance and subtract cash events
    if (input.drawerSessionId) {
      const sessionAgg = await tx.execute(sql`
        SELECT
          ds.opening_balance_cents,
          COALESCE(SUM(CASE WHEN dse.event_type = 'paid_in' THEN dse.amount_cents ELSE 0 END), 0) AS paid_in,
          COALESCE(SUM(CASE WHEN dse.event_type = 'paid_out' THEN dse.amount_cents ELSE 0 END), 0) AS paid_out,
          COALESCE(SUM(CASE WHEN dse.event_type = 'cash_drop' THEN dse.amount_cents ELSE 0 END), 0) AS cash_drops
        FROM drawer_sessions ds
        LEFT JOIN drawer_session_events dse ON dse.drawer_session_id = ds.id AND dse.tenant_id = ds.tenant_id
        WHERE ds.id = ${input.drawerSessionId}
          AND ds.tenant_id = ${ctx.tenantId}
        GROUP BY ds.opening_balance_cents
      `);
      const sa = Array.from(sessionAgg as Iterable<Record<string, unknown>>)[0];
      if (sa) {
        const opening = Number(sa.opening_balance_cents ?? 0);
        const paidIn = Number(sa.paid_in ?? 0);
        const paidOut = Number(sa.paid_out ?? 0);
        const cashDrops = Number(sa.cash_drops ?? 0);
        // Change given is embedded in tenders
        const changeGiven = await tx.execute(sql`
          SELECT COALESCE(SUM(t.change_given), 0) AS total_change
          FROM tenders t
          JOIN orders o ON o.id = t.order_id AND o.tenant_id = t.tenant_id
          WHERE t.tenant_id = ${ctx.tenantId}
            AND o.terminal_id = ${terminalId}
            AND o.business_date = ${businessDate}
            AND t.tender_type = 'cash'
            AND t.status = 'completed'
            AND NOT EXISTS (
              SELECT 1 FROM tender_reversals tr
              WHERE tr.tender_id = t.id AND tr.tenant_id = t.tenant_id
            )
        `);
        const changeTotal = Number(
          (Array.from(changeGiven as Iterable<Record<string, unknown>>)[0] as Record<string, unknown>)?.total_change ?? 0,
        );

        cashExpectedCents = opening + (cashEntry?.totalCents ?? 0) + paidIn - paidOut - cashDrops - changeTotal;
      }
    }

    const id = generateUlid();
    const now = new Date();

    const [created] = await tx
      .insert(retailCloseBatches)
      .values({
        id,
        tenantId: ctx.tenantId,
        locationId,
        terminalId,
        businessDate,
        drawerSessionId: input.drawerSessionId ?? null,
        status: 'in_progress',
        grossSalesCents,
        netSalesCents,
        taxCollectedCents,
        discountTotalCents,
        voidTotalCents,
        voidCount,
        serviceChargeCents,
        tipsCreditCents,
        tipsCashCents,
        orderCount,
        refundTotalCents: 0,
        refundCount: 0,
        tenderBreakdown: JSON.stringify(tenderBreakdown),
        salesByDepartment: JSON.stringify(salesByDepartment),
        cashExpectedCents,
        startedAt: now,
        startedBy: ctx.user.id,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'retail.close.started.v1', {
      batchId: id,
      terminalId,
      locationId,
      businessDate,
      orderCount,
      netSalesCents,
    });

    return { result: mapRow(created!), events: [event] };
  });

  await auditLog(ctx, 'retail.close.started', 'retail_close_batch', result.id);
  return result;
}
