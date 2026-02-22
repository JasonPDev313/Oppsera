import { withTenant, sql } from '@oppsera/db';
import { drawerSessions, drawerSessionEvents } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { NotFoundError } from '@oppsera/shared';
import type { DrawerSessionSummary, DrawerSessionEvent } from '../types';

function mapEventRow(row: typeof drawerSessionEvents.$inferSelect): DrawerSessionEvent {
  return {
    id: row.id,
    tenantId: row.tenantId,
    drawerSessionId: row.drawerSessionId,
    eventType: row.eventType as DrawerSessionEvent['eventType'],
    amountCents: row.amountCents,
    reason: row.reason,
    employeeId: row.employeeId,
    approvedBy: row.approvedBy,
    bagId: row.bagId,
    sealNumber: row.sealNumber,
    verifiedBy: row.verifiedBy,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    depositSlipId: row.depositSlipId,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface GetDrawerSessionSummaryInput {
  tenantId: string;
  drawerSessionId: string;
}

export async function getDrawerSessionSummary(
  input: GetDrawerSessionSummaryInput,
): Promise<DrawerSessionSummary> {
  return withTenant(input.tenantId, async (tx) => {
    // Fetch session
    const [session] = await tx
      .select()
      .from(drawerSessions)
      .where(
        and(
          eq(drawerSessions.tenantId, input.tenantId),
          eq(drawerSessions.id, input.drawerSessionId),
        ),
      )
      .limit(1);

    if (!session) {
      throw new NotFoundError('DrawerSession', input.drawerSessionId);
    }

    // Fetch all events
    const events = await tx
      .select()
      .from(drawerSessionEvents)
      .where(
        and(
          eq(drawerSessionEvents.tenantId, input.tenantId),
          eq(drawerSessionEvents.drawerSessionId, input.drawerSessionId),
        ),
      );

    // Aggregate events
    let paidInTotal = 0;
    let paidOutTotal = 0;
    let cashDropTotal = 0;
    let drawerOpenCount = 0;
    let noSaleCount = 0;

    for (const evt of events) {
      switch (evt.eventType) {
        case 'paid_in':
          paidInTotal += evt.amountCents;
          break;
        case 'paid_out':
          paidOutTotal += evt.amountCents;
          break;
        case 'cash_drop':
          cashDropTotal += evt.amountCents;
          break;
        case 'drawer_open':
          drawerOpenCount++;
          break;
        case 'no_sale':
          noSaleCount++;
          break;
      }
    }

    // Aggregate from tenders + orders for this terminal's business date
    const tenderResult = await tx.execute(
      sql`SELECT
            COALESCE(SUM(CASE WHEN t.tender_type = 'cash' THEN t.amount ELSE 0 END), 0) as cash_received,
            COALESCE(SUM(CASE WHEN t.tender_type != 'cash' THEN t.amount ELSE 0 END), 0) as card_received,
            COALESCE(SUM(t.change_given), 0) as change_given,
            COALESCE(SUM(t.tip_amount), 0) as tips_collected,
            COUNT(DISTINCT t.order_id) as sales_count,
            COALESCE(SUM(t.amount), 0) as sales_total
          FROM tenders t
          WHERE t.tenant_id = ${input.tenantId}
            AND t.terminal_id = ${session.terminalId}
            AND t.business_date = ${session.businessDate}
            AND t.status = 'captured'`,
    );

    const tenderAgg = Array.from(tenderResult as Iterable<Record<string, unknown>>)[0] ?? {};
    const cashReceived = Number(tenderAgg.cash_received ?? 0);
    const cardReceived = Number(tenderAgg.card_received ?? 0);
    const changeGiven = Number(tenderAgg.change_given ?? 0);
    const tipsCollected = Number(tenderAgg.tips_collected ?? 0);
    const salesCount = Number(tenderAgg.sales_count ?? 0);
    const salesTotal = Number(tenderAgg.sales_total ?? 0);

    // Aggregate void/discount/tax/service charge from orders
    const orderResult = await tx.execute(
      sql`SELECT
            COUNT(*) FILTER (WHERE o.status = 'voided') as void_count,
            COALESCE(SUM(CASE WHEN o.status = 'voided' THEN o.total ELSE 0 END), 0) as void_total,
            COALESCE(SUM(o.discount_total), 0) as discount_total,
            COALESCE(SUM(o.tax_total), 0) as tax_collected,
            COALESCE(SUM(o.service_charge_total), 0) as service_charge_total
          FROM orders o
          WHERE o.tenant_id = ${input.tenantId}
            AND o.terminal_id = ${session.terminalId}
            AND o.business_date = ${session.businessDate}`,
    );

    const orderAgg = Array.from(orderResult as Iterable<Record<string, unknown>>)[0] ?? {};
    const voidCount = Number(orderAgg.void_count ?? 0);
    const voidTotal = Number(orderAgg.void_total ?? 0);
    const discountTotal = Number(orderAgg.discount_total ?? 0);
    const taxCollected = Number(orderAgg.tax_collected ?? 0);
    const serviceChargeTotal = Number(orderAgg.service_charge_total ?? 0);

    // Sales by department (from order_lines joined to catalog_categories)
    const deptResult = await tx.execute(
      sql`SELECT
            COALESCE(cc.name, 'Uncategorized') as department_name,
            COALESCE(SUM(ol.line_total), 0) as total,
            COUNT(*) as count
          FROM order_lines ol
          JOIN orders o ON o.id = ol.order_id AND o.tenant_id = ol.tenant_id
          LEFT JOIN catalog_categories cc ON cc.id = ol.sub_department_id
          WHERE ol.tenant_id = ${input.tenantId}
            AND o.terminal_id = ${session.terminalId}
            AND o.business_date = ${session.businessDate}
            AND o.status != 'voided'
          GROUP BY cc.name
          ORDER BY total DESC`,
    );

    const salesByDepartment = Array.from(deptResult as Iterable<Record<string, unknown>>).map(
      (row) => ({
        departmentName: String(row.department_name ?? 'Uncategorized'),
        total: Number(row.total ?? 0),
        count: Number(row.count ?? 0),
      }),
    );

    // Compute expected cash (includes change fund)
    const expectedCashCents =
      session.openingBalanceCents + session.changeFundCents + cashReceived + paidInTotal - paidOutTotal - cashDropTotal - changeGiven;

    return {
      sessionId: session.id,
      employeeId: session.employeeId,
      terminalId: session.terminalId,
      locationId: session.locationId,
      businessDate: session.businessDate,
      openedAt: session.openedAt.toISOString(),
      closedAt: session.closedAt?.toISOString() ?? null,
      openingBalanceCents: session.openingBalanceCents,
      changeFundCents: session.changeFundCents,
      closingCountCents: session.closingCountCents,
      expectedCashCents,
      varianceCents: session.varianceCents,
      salesCount,
      salesTotal,
      voidCount,
      voidTotal,
      discountTotal,
      taxCollected,
      serviceChargeTotal,
      cashReceived,
      cardReceived,
      changeGiven,
      tipsCollected,
      paidInTotal,
      paidOutTotal,
      cashDropTotal,
      drawerOpenCount,
      noSaleCount,
      events: events.map(mapEventRow),
      salesByDepartment,
    };
  });
}
