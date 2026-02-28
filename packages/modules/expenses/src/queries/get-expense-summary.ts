import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { z } from 'zod';
import type { expenseSummarySchema } from '../validation';

type ExpenseSummaryInput = z.input<typeof expenseSummarySchema>;

export async function getExpenseSummary(input: ExpenseSummaryInput) {
  const { tenantId, locationId, fromPeriod, toPeriod } = input;

  return withTenant(tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`s.tenant_id = ${tenantId}`,
    ];

    if (locationId) {
      conditions.push(sql`s.location_id = ${locationId}`);
    }

    if (fromPeriod) {
      conditions.push(sql`s.fiscal_period >= ${fromPeriod}`);
    }

    if (toPeriod) {
      conditions.push(sql`s.fiscal_period <= ${toPeriod}`);
    }

    const whereClause = conditions.reduce((a, b) => sql`${a} AND ${b}`);

    // Per-category summary from read model
    const rows = await tx.execute<{
      category: string;
      fiscal_period: string;
      expense_count: number;
      total_amount: string;
      reimbursed_count: number;
      reimbursed_amount: string;
      pending_count: number;
      pending_amount: string;
    }>(sql`
      SELECT
        s.category,
        s.fiscal_period,
        s.expense_count,
        s.total_amount,
        s.reimbursed_count,
        s.reimbursed_amount,
        s.pending_count,
        s.pending_amount
      FROM rm_expense_summary s
      WHERE ${whereClause}
      ORDER BY s.fiscal_period DESC, s.category ASC
    `);

    const items = Array.from(rows as Iterable<typeof rows[number]>);

    // Aggregate totals
    const totals = items.reduce(
      (acc, r) => ({
        totalExpenseCount: acc.totalExpenseCount + Number(r.expense_count),
        totalAmount: acc.totalAmount + Number(r.total_amount),
        totalReimbursedCount: acc.totalReimbursedCount + Number(r.reimbursed_count),
        totalReimbursedAmount: acc.totalReimbursedAmount + Number(r.reimbursed_amount),
        totalPendingCount: acc.totalPendingCount + Number(r.pending_count),
        totalPendingAmount: acc.totalPendingAmount + Number(r.pending_amount),
      }),
      {
        totalExpenseCount: 0,
        totalAmount: 0,
        totalReimbursedCount: 0,
        totalReimbursedAmount: 0,
        totalPendingCount: 0,
        totalPendingAmount: 0,
      },
    );

    return {
      items: items.map((r) => ({
        category: r.category,
        fiscalPeriod: r.fiscal_period,
        expenseCount: Number(r.expense_count),
        totalAmount: Number(r.total_amount),
        reimbursedCount: Number(r.reimbursed_count),
        reimbursedAmount: Number(r.reimbursed_amount),
        pendingCount: Number(r.pending_count),
        pendingAmount: Number(r.pending_amount),
      })),
      totals,
    };
  });
}
