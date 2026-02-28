import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { z } from 'zod';
import type { employeeExpenseTotalsSchema } from '../validation';

type EmployeeExpenseTotalsInput = z.input<typeof employeeExpenseTotalsSchema>;

export async function getEmployeeExpenseTotals(input: EmployeeExpenseTotalsInput) {
  const { tenantId, userId, fromDate, toDate } = input;

  return withTenant(tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`e.tenant_id = ${tenantId}`,
      sql`e.employee_user_id = ${userId}`,
    ];

    if (fromDate) {
      conditions.push(sql`e.expense_date >= ${fromDate}`);
    }

    if (toDate) {
      conditions.push(sql`e.expense_date <= ${toDate}`);
    }

    const whereClause = conditions.reduce((a, b) => sql`${a} AND ${b}`);

    // Per-status totals
    const statusRows = await tx.execute<{
      status: string;
      count: string;
      total: string;
    }>(sql`
      SELECT
        e.status,
        COUNT(*)::text AS count,
        COALESCE(SUM(e.amount), 0)::text AS total
      FROM expenses e
      WHERE ${whereClause}
      GROUP BY e.status
      ORDER BY e.status
    `);

    // Per-category totals
    const categoryRows = await tx.execute<{
      category: string;
      count: string;
      total: string;
    }>(sql`
      SELECT
        e.category,
        COUNT(*)::text AS count,
        COALESCE(SUM(e.amount), 0)::text AS total
      FROM expenses e
      WHERE ${whereClause}
      GROUP BY e.category
      ORDER BY total DESC
    `);

    // Reimbursement totals
    const [reimbursement] = await tx.execute<{
      reimbursed_count: string;
      reimbursed_amount: string;
      pending_reimbursement_count: string;
      pending_reimbursement_amount: string;
    }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE e.reimbursed_at IS NOT NULL)::text AS reimbursed_count,
        COALESCE(SUM(e.amount) FILTER (WHERE e.reimbursed_at IS NOT NULL), 0)::text AS reimbursed_amount,
        COUNT(*) FILTER (WHERE e.status = 'posted' AND e.is_reimbursable = true AND e.reimbursed_at IS NULL)::text AS pending_reimbursement_count,
        COALESCE(SUM(e.amount) FILTER (WHERE e.status = 'posted' AND e.is_reimbursable = true AND e.reimbursed_at IS NULL), 0)::text AS pending_reimbursement_amount
      FROM expenses e
      WHERE ${whereClause}
    `);

    const byStatus = Array.from(statusRows as Iterable<typeof statusRows[number]>).map((r) => ({
      status: r.status,
      count: Number(r.count),
      total: Number(r.total),
    }));

    const byCategory = Array.from(categoryRows as Iterable<typeof categoryRows[number]>).map((r) => ({
      category: r.category,
      count: Number(r.count),
      total: Number(r.total),
    }));

    const grandTotal = byStatus.reduce((sum, s) => sum + s.total, 0);
    const grandCount = byStatus.reduce((sum, s) => sum + s.count, 0);

    return {
      employeeUserId: userId,
      grandTotal,
      grandCount,
      byStatus,
      byCategory,
      reimbursement: {
        reimbursedCount: Number(reimbursement?.reimbursed_count ?? 0),
        reimbursedAmount: Number(reimbursement?.reimbursed_amount ?? 0),
        pendingCount: Number(reimbursement?.pending_reimbursement_count ?? 0),
        pendingAmount: Number(reimbursement?.pending_reimbursement_amount ?? 0),
      },
    };
  });
}
