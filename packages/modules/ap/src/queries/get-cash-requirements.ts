import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface GetCashRequirementsInput {
  tenantId: string;
  asOfDate?: string;
  weeksAhead?: number;
}

export interface CashRequirementPeriod {
  periodStart: string;
  periodEnd: string;
  label: string;
  billCount: number;
  amountDue: number;
  cumulativeTotal: number;
}

export interface CashRequirementsReport {
  asOfDate: string;
  periods: CashRequirementPeriod[];
  totalOutstanding: number;
  overdueAmount: number;
}

export async function getCashRequirements(input: GetCashRequirementsInput): Promise<CashRequirementsReport> {
  const asOfDate = input.asOfDate ?? new Date().toISOString().split('T')[0]!;
  const weeksAhead = input.weeksAhead ?? 8;

  return withTenant(input.tenantId, async (tx) => {
    const overdueRows = await tx.execute(sql`
      SELECT COALESCE(SUM(balance_due::numeric), 0) AS overdue
      FROM ap_bills
      WHERE tenant_id = ${input.tenantId}
        AND status IN ('posted', 'partial')
        AND balance_due::numeric > 0
        AND due_date < ${asOfDate}
    `);
    const overdueAmount = Number(Array.from(overdueRows as Iterable<Record<string, unknown>>)[0]?.overdue ?? 0);

    const rows = await tx.execute(sql`
      SELECT
        date_trunc('week', due_date::date)::date AS week_start,
        (date_trunc('week', due_date::date) + interval '6 days')::date AS week_end,
        COUNT(*)::int AS bill_count,
        SUM(balance_due::numeric) AS amount_due
      FROM ap_bills
      WHERE tenant_id = ${input.tenantId}
        AND status IN ('posted', 'partial')
        AND balance_due::numeric > 0
        AND due_date >= ${asOfDate}
        AND due_date::date < (${asOfDate}::date + (${weeksAhead} * 7))
      GROUP BY week_start, week_end
      ORDER BY week_start
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);
    let cumulative = overdueAmount;

    const periods: CashRequirementPeriod[] = allRows.map((row, i) => {
      const amount = Number(row.amount_due);
      cumulative += amount;
      return {
        periodStart: String(row.week_start),
        periodEnd: String(row.week_end),
        label: `Week ${i + 1}`,
        billCount: Number(row.bill_count),
        amountDue: amount,
        cumulativeTotal: cumulative,
      };
    });

    return {
      asOfDate,
      periods,
      totalOutstanding: cumulative,
      overdueAmount,
    };
  });
}
