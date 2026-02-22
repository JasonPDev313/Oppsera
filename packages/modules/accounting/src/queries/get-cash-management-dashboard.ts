import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface CashManagementDashboard {
  activeSessions: ActiveDrawerSession[];
  cashSummary: {
    totalOpeningCents: number;
    totalCashInCents: number;
    totalCashOutCents: number;
    totalCashDropsCents: number;
    expectedCashOnHandCents: number;
  };
  pendingDeposits: number;
  outstandingTipsCents: number;
  overShortCents: number;
}

export interface ActiveDrawerSession {
  id: string;
  terminalId: string;
  employeeId: string;
  employeeName: string | null;
  openedAt: string;
  openingBalanceCents: number;
  cashInCents: number;
  cashOutCents: number;
  dropsCents: number;
}

/**
 * Cash management overview for a location within a date range.
 * Shows active sessions, cash in/out, pending deposits, outstanding tips.
 */
export async function getCashManagementDashboard(input: {
  tenantId: string;
  locationId: string;
  startDate: string;
  endDate: string;
}): Promise<CashManagementDashboard> {
  return withTenant(input.tenantId, async (tx) => {
    // Active (open) drawer sessions
    const sessionRows = await tx.execute(sql`
      SELECT
        ds.id,
        ds.terminal_id,
        ds.employee_id,
        u.display_name AS employee_name,
        ds.opened_at::text,
        ds.opening_balance_cents,
        COALESCE((
          SELECT SUM(dse.amount_cents)
          FROM drawer_session_events dse
          WHERE dse.drawer_session_id = ds.id AND dse.event_type = 'paid_in'
        ), 0)::integer AS cash_in_cents,
        COALESCE((
          SELECT SUM(dse.amount_cents)
          FROM drawer_session_events dse
          WHERE dse.drawer_session_id = ds.id AND dse.event_type = 'paid_out'
        ), 0)::integer AS cash_out_cents,
        COALESCE((
          SELECT SUM(dse.amount_cents)
          FROM drawer_session_events dse
          WHERE dse.drawer_session_id = ds.id AND dse.event_type = 'cash_drop'
        ), 0)::integer AS drops_cents
      FROM drawer_sessions ds
      LEFT JOIN users u ON u.id = ds.employee_id
      WHERE ds.tenant_id = ${input.tenantId}
        AND ds.location_id = ${input.locationId}
        AND ds.status = 'open'
        AND ds.business_date >= ${input.startDate}
        AND ds.business_date <= ${input.endDate}
      ORDER BY ds.opened_at DESC
    `);
    const sessionArr = Array.from(sessionRows as Iterable<Record<string, unknown>>);
    const activeSessions: ActiveDrawerSession[] = sessionArr.map((r) => ({
      id: String(r.id),
      terminalId: String(r.terminal_id),
      employeeId: String(r.employee_id),
      employeeName: r.employee_name ? String(r.employee_name) : null,
      openedAt: String(r.opened_at),
      openingBalanceCents: Number(r.opening_balance_cents),
      cashInCents: Number(r.cash_in_cents),
      cashOutCents: Number(r.cash_out_cents),
      dropsCents: Number(r.drops_cents),
    }));

    // Cash summary for the period (all sessions, open or closed)
    const summaryRows = await tx.execute(sql`
      SELECT
        COALESCE(SUM(ds.opening_balance_cents), 0)::integer AS total_opening,
        COALESCE(SUM(COALESCE((
          SELECT SUM(dse.amount_cents) FROM drawer_session_events dse
          WHERE dse.drawer_session_id = ds.id AND dse.event_type = 'paid_in'
        ), 0)), 0)::integer AS total_cash_in,
        COALESCE(SUM(COALESCE((
          SELECT SUM(dse.amount_cents) FROM drawer_session_events dse
          WHERE dse.drawer_session_id = ds.id AND dse.event_type = 'paid_out'
        ), 0)), 0)::integer AS total_cash_out,
        COALESCE(SUM(COALESCE((
          SELECT SUM(dse.amount_cents) FROM drawer_session_events dse
          WHERE dse.drawer_session_id = ds.id AND dse.event_type = 'cash_drop'
        ), 0)), 0)::integer AS total_drops
      FROM drawer_sessions ds
      WHERE ds.tenant_id = ${input.tenantId}
        AND ds.location_id = ${input.locationId}
        AND ds.business_date >= ${input.startDate}
        AND ds.business_date <= ${input.endDate}
    `);
    const sumArr = Array.from(summaryRows as Iterable<Record<string, unknown>>);
    const totalOpening = sumArr.length > 0 ? Number(sumArr[0]!.total_opening) : 0;
    const totalCashIn = sumArr.length > 0 ? Number(sumArr[0]!.total_cash_in) : 0;
    const totalCashOut = sumArr.length > 0 ? Number(sumArr[0]!.total_cash_out) : 0;
    const totalDrops = sumArr.length > 0 ? Number(sumArr[0]!.total_drops) : 0;

    // Cash from sales (cash tenders)
    const cashSalesRows = await tx.execute(sql`
      SELECT COALESCE(SUM(t.amount), 0)::integer AS cash_sales
      FROM tenders t
      WHERE t.tenant_id = ${input.tenantId}
        AND t.location_id = ${input.locationId}
        AND t.tender_type = 'cash'
        AND t.status = 'captured'
        AND t.business_date >= ${input.startDate}
        AND t.business_date <= ${input.endDate}
    `);
    const cashSalesArr = Array.from(cashSalesRows as Iterable<Record<string, unknown>>);
    const cashSales = cashSalesArr.length > 0 ? Number(cashSalesArr[0]!.cash_sales) : 0;

    const expectedCashOnHand = totalOpening + cashSales + totalCashIn - totalCashOut - totalDrops;

    // Over/short from closed retail batches
    const overShortRows = await tx.execute(sql`
      SELECT COALESCE(SUM(cash_over_short_cents), 0)::integer AS over_short
      FROM retail_close_batches
      WHERE tenant_id = ${input.tenantId}
        AND location_id = ${input.locationId}
        AND business_date >= ${input.startDate}
        AND business_date <= ${input.endDate}
        AND status IN ('reconciled', 'posted', 'locked')
    `);
    const overShortArr = Array.from(overShortRows as Iterable<Record<string, unknown>>);
    const overShortCents = overShortArr.length > 0 ? Number(overShortArr[0]!.over_short) : 0;

    // Pending deposits count
    const depositRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM deposit_slips
      WHERE tenant_id = ${input.tenantId}
        AND location_id = ${input.locationId}
        AND status = 'pending'
        AND business_date >= ${input.startDate}
        AND business_date <= ${input.endDate}
    `);
    const depositArr = Array.from(depositRows as Iterable<Record<string, unknown>>);
    const pendingDeposits = depositArr.length > 0 ? Number(depositArr[0]!.count) : 0;

    // Outstanding tips
    const tipRows = await tx.execute(sql`
      SELECT COALESCE(
        (SELECT SUM(t.tip_amount) FROM tenders t
         WHERE t.tenant_id = ${input.tenantId}
           AND t.location_id = ${input.locationId}
           AND t.status = 'captured'
           AND t.tip_amount > 0
           AND t.business_date >= ${input.startDate}
           AND t.business_date <= ${input.endDate})
        -
        (SELECT COALESCE(SUM(tp.amount_cents), 0) FROM tip_payouts tp
         WHERE tp.tenant_id = ${input.tenantId}
           AND tp.location_id = ${input.locationId}
           AND tp.status != 'voided'
           AND tp.business_date >= ${input.startDate}
           AND tp.business_date <= ${input.endDate})
      , 0)::integer AS outstanding
    `);
    const tipArr = Array.from(tipRows as Iterable<Record<string, unknown>>);
    const outstandingTipsCents = tipArr.length > 0 ? Number(tipArr[0]!.outstanding) : 0;

    return {
      activeSessions,
      cashSummary: {
        totalOpeningCents: totalOpening,
        totalCashInCents: totalCashIn,
        totalCashOutCents: totalCashOut,
        totalCashDropsCents: totalDrops,
        expectedCashOnHandCents: expectedCashOnHand,
      },
      pendingDeposits,
      outstandingTipsCents: Math.max(0, outstandingTipsCents),
      overShortCents,
    };
  });
}
