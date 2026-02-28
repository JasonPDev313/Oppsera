import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { z } from 'zod';
import type { listExpensesSchema } from '../validation';

type ListExpensesInput = z.input<typeof listExpensesSchema>;

export async function listExpenses(input: ListExpensesInput) {
  const { tenantId, status, employeeUserId, category, locationId, fromDate, toDate, search, cursor, limit = 50 } = input;

  return withTenant(tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`e.tenant_id = ${tenantId}`,
    ];

    if (status) {
      conditions.push(sql`e.status = ${status}`);
    }

    if (employeeUserId) {
      conditions.push(sql`e.employee_user_id = ${employeeUserId}`);
    }

    if (category) {
      conditions.push(sql`e.category = ${category}`);
    }

    if (locationId) {
      conditions.push(sql`e.location_id = ${locationId}`);
    }

    if (fromDate) {
      conditions.push(sql`e.expense_date >= ${fromDate}`);
    }

    if (toDate) {
      conditions.push(sql`e.expense_date <= ${toDate}`);
    }

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(sql`(
        e.expense_number ILIKE ${pattern} OR
        e.vendor_name ILIKE ${pattern} OR
        e.description ILIKE ${pattern}
      )`);
    }

    if (cursor) {
      conditions.push(sql`e.id < ${cursor}`);
    }

    const whereClause = conditions.reduce((a, b) => sql`${a} AND ${b}`);

    const rows = await tx.execute<{
      id: string;
      tenant_id: string;
      location_id: string | null;
      expense_number: string;
      employee_user_id: string;
      expense_policy_id: string | null;
      status: string;
      expense_date: string;
      vendor_name: string | null;
      category: string;
      description: string | null;
      amount: string;
      currency: string;
      payment_method: string | null;
      is_reimbursable: boolean;
      gl_account_id: string | null;
      project_id: string | null;
      gl_journal_entry_id: string | null;
      submitted_at: string | null;
      approved_at: string | null;
      rejected_at: string | null;
      posted_at: string | null;
      voided_at: string | null;
      reimbursed_at: string | null;
      reimbursement_method: string | null;
      version: number;
      created_at: string;
      updated_at: string;
    }>(sql`
      SELECT
        e.id, e.tenant_id, e.location_id, e.expense_number,
        e.employee_user_id, e.expense_policy_id, e.status,
        e.expense_date, e.vendor_name, e.category, e.description,
        e.amount, e.currency, e.payment_method, e.is_reimbursable,
        e.gl_account_id, e.project_id, e.gl_journal_entry_id,
        e.submitted_at, e.approved_at, e.rejected_at,
        e.posted_at, e.voided_at, e.reimbursed_at,
        e.reimbursement_method, e.version,
        e.created_at, e.updated_at
      FROM expenses e
      WHERE ${whereClause}
      ORDER BY e.id DESC
      LIMIT ${limit + 1}
    `);

    const items = Array.from(rows as Iterable<typeof rows[number]>);
    const hasMore = items.length > limit;
    const result = hasMore ? items.slice(0, limit) : items;

    return {
      items: result.map((r) => ({
        id: r.id,
        tenantId: r.tenant_id,
        locationId: r.location_id ?? null,
        expenseNumber: r.expense_number,
        employeeUserId: r.employee_user_id,
        expensePolicyId: r.expense_policy_id ?? null,
        status: r.status,
        expenseDate: r.expense_date,
        vendorName: r.vendor_name ?? null,
        category: r.category,
        description: r.description ?? null,
        amount: Number(r.amount),
        currency: r.currency,
        paymentMethod: r.payment_method ?? null,
        isReimbursable: r.is_reimbursable,
        glAccountId: r.gl_account_id ?? null,
        projectId: r.project_id ?? null,
        glJournalEntryId: r.gl_journal_entry_id ?? null,
        submittedAt: r.submitted_at ?? null,
        approvedAt: r.approved_at ?? null,
        rejectedAt: r.rejected_at ?? null,
        postedAt: r.posted_at ?? null,
        voidedAt: r.voided_at ?? null,
        reimbursedAt: r.reimbursed_at ?? null,
        reimbursementMethod: r.reimbursement_method ?? null,
        version: Number(r.version),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      cursor: hasMore ? result[result.length - 1]!.id : null,
      hasMore,
    };
  });
}
