import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { z } from 'zod';
import type { projectCostDetailSchema } from '../validation';

type ProjectCostDetailInput = z.input<typeof projectCostDetailSchema>;

export async function getProjectCostDetail(input: ProjectCostDetailInput) {
  const { tenantId, projectId, taskId, accountType, fromDate, toDate, cursor, limit = 100 } = input;

  return withTenant(tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`jl.project_id = ${projectId}`,
      sql`je.tenant_id = ${tenantId}`,
      sql`je.status = 'posted'`,
    ];

    if (taskId) {
      conditions.push(sql`jl.project_task_id = ${taskId}`);
    }

    if (accountType) {
      conditions.push(sql`ga.account_type = ${accountType}`);
    }

    if (fromDate) {
      conditions.push(sql`je.entry_date >= ${fromDate}`);
    }

    if (toDate) {
      conditions.push(sql`je.entry_date <= ${toDate}`);
    }

    if (cursor) {
      conditions.push(sql`jl.id < ${cursor}`);
    }

    const whereClause = conditions.reduce((a, b) => sql`${a} AND ${b}`);

    const rows = await tx.execute<{
      line_id: string;
      journal_entry_id: string;
      entry_date: string;
      journal_number: string;
      account_id: string;
      account_number: string;
      account_name: string;
      account_type: string;
      debit_amount: string;
      credit_amount: string;
      memo: string | null;
      project_task_id: string | null;
      task_name: string | null;
      task_number: string | null;
      source_module: string | null;
      source_reference_id: string | null;
    }>(sql`
      SELECT
        jl.id AS line_id,
        je.id AS journal_entry_id,
        je.entry_date,
        je.journal_number,
        jl.account_id,
        ga.account_number,
        ga.name AS account_name,
        ga.account_type,
        jl.debit_amount,
        jl.credit_amount,
        jl.memo,
        jl.project_task_id,
        pt.name AS task_name,
        pt.task_number
      FROM gl_journal_lines jl
      INNER JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
      INNER JOIN gl_accounts ga ON ga.id = jl.account_id
      LEFT JOIN project_tasks pt ON pt.id = jl.project_task_id
      WHERE ${whereClause}
      ORDER BY je.entry_date DESC, jl.id DESC
      LIMIT ${limit + 1}
    `);

    const items = Array.from(rows as Iterable<typeof rows[number]>);
    const hasMore = items.length > limit;
    const result = hasMore ? items.slice(0, limit) : items;

    // Compute totals
    let totalDebits = 0;
    let totalCredits = 0;
    for (const r of result) {
      totalDebits += Number(r.debit_amount);
      totalCredits += Number(r.credit_amount);
    }

    return {
      items: result.map((r) => ({
        lineId: r.line_id,
        journalEntryId: r.journal_entry_id,
        entryDate: r.entry_date,
        journalNumber: r.journal_number,
        accountId: r.account_id,
        accountNumber: r.account_number,
        accountName: r.account_name,
        accountType: r.account_type,
        debitAmount: Number(r.debit_amount),
        creditAmount: Number(r.credit_amount),
        netAmount: Number(r.debit_amount) - Number(r.credit_amount),
        memo: r.memo ?? null,
        projectTaskId: r.project_task_id ?? null,
        taskName: r.task_name ?? null,
        taskNumber: r.task_number ?? null,
      })),
      totals: {
        totalDebits,
        totalCredits,
        netAmount: totalDebits - totalCredits,
      },
      cursor: hasMore ? result[result.length - 1]!.line_id : null,
      hasMore,
    };
  });
}
