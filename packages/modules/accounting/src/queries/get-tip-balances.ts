import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface TipBalanceItem {
  employeeId: string;
  employeeName: string | null;
  totalTipsCents: number;
  totalPaidCents: number;
  balanceCents: number;
  lastTipDate: string | null;
  lastPayoutDate: string | null;
}

/**
 * Get outstanding tip balances for all employees at a location.
 * Balance = SUM(tenders.tipAmount) - SUM(completed tip payouts).
 */
export async function getTipBalances(input: {
  tenantId: string;
  locationId?: string;
  asOfDate?: string;
}): Promise<TipBalanceItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const asOf = input.asOfDate ?? new Date().toISOString().slice(0, 10);
    const locationFilter = input.locationId
      ? sql` AND t.location_id = ${input.locationId}`
      : sql``;

    // Get tip totals per employee from tenders
    const rows = await tx.execute(sql`
      WITH tip_totals AS (
        SELECT
          t.employee_id,
          COALESCE(SUM(t.tip_amount), 0)::integer AS total_tips_cents,
          MAX(t.business_date)::text AS last_tip_date
        FROM tenders t
        WHERE t.tenant_id = ${input.tenantId}
          AND t.status = 'captured'
          AND t.tip_amount > 0
          AND t.business_date <= ${asOf}
          ${locationFilter}
        GROUP BY t.employee_id
      ),
      payout_totals AS (
        SELECT
          tp.employee_id,
          COALESCE(SUM(tp.amount_cents), 0)::integer AS total_paid_cents,
          MAX(tp.business_date)::text AS last_payout_date
        FROM tip_payouts tp
        WHERE tp.tenant_id = ${input.tenantId}
          AND tp.status != 'voided'
          AND tp.business_date <= ${asOf}
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
