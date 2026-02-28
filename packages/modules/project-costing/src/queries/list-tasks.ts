import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { z } from 'zod';
import type { listTasksSchema } from '../validation';

type ListTasksInput = z.input<typeof listTasksSchema>;

export async function listTasks(input: ListTasksInput) {
  const { tenantId, projectId, status, cursor, limit = 50 } = input;

  return withTenant(tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`t.tenant_id = ${tenantId}`,
      sql`t.project_id = ${projectId}`,
    ];

    if (status) {
      conditions.push(sql`t.status = ${status}`);
    }

    if (cursor) {
      conditions.push(sql`t.id < ${cursor}`);
    }

    const whereClause = conditions.reduce((a, b) => sql`${a} AND ${b}`);

    const rows = await tx.execute<{
      id: string;
      task_number: string;
      name: string;
      description: string | null;
      status: string;
      budget_amount: string | null;
      budget_hours: string | null;
      gl_expense_account_id: string | null;
      gl_account_name: string | null;
      sort_order: number;
      created_at: string;
      updated_at: string;
      actual_cost: string | null;
      actual_hours: string | null;
    }>(sql`
      SELECT
        t.id,
        t.task_number,
        t.name,
        t.description,
        t.status,
        t.budget_amount,
        t.budget_hours,
        t.gl_expense_account_id,
        ga.name AS gl_account_name,
        t.sort_order,
        t.created_at,
        t.updated_at,
        (
          SELECT SUM(jl.debit_amount - jl.credit_amount)::text
          FROM gl_journal_lines jl
          INNER JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
          WHERE jl.project_task_id = t.id AND je.status = 'posted'
        ) AS actual_cost,
        NULL AS actual_hours
      FROM project_tasks t
      LEFT JOIN gl_accounts ga ON ga.id = t.gl_expense_account_id
      WHERE ${whereClause}
      ORDER BY t.sort_order ASC, t.task_number ASC
      LIMIT ${limit + 1}
    `);

    const items = Array.from(rows as Iterable<typeof rows[number]>);
    const hasMore = items.length > limit;
    const result = hasMore ? items.slice(0, limit) : items;

    return {
      items: result.map((r) => ({
        id: r.id,
        taskNumber: r.task_number,
        name: r.name,
        description: r.description ?? null,
        status: r.status,
        budgetAmount: r.budget_amount ?? null,
        budgetHours: r.budget_hours ?? null,
        glExpenseAccountId: r.gl_expense_account_id ?? null,
        glAccountName: r.gl_account_name ?? null,
        sortOrder: Number(r.sort_order),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        actualCost: r.actual_cost ? Number(r.actual_cost) : null,
      })),
      cursor: hasMore ? result[result.length - 1]!.id : null,
      hasMore,
    };
  });
}
