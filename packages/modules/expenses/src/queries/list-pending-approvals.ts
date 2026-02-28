import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { z } from 'zod';
import type { pendingApprovalsSchema } from '../validation';

type PendingApprovalsInput = z.input<typeof pendingApprovalsSchema>;

export async function listPendingApprovals(input: PendingApprovalsInput) {
  const { tenantId, locationId, cursor, limit = 50 } = input;

  return withTenant(tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`e.tenant_id = ${tenantId}`,
      sql`e.status = 'submitted'`,
    ];

    if (locationId) {
      conditions.push(sql`e.location_id = ${locationId}`);
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
      expense_date: string;
      vendor_name: string | null;
      category: string;
      description: string | null;
      amount: string;
      currency: string;
      payment_method: string | null;
      is_reimbursable: boolean;
      receipt_url: string | null;
      gl_account_id: string | null;
      project_id: string | null;
      submitted_at: string | null;
      submitted_by: string | null;
      created_at: string;
      policy_name: string | null;
    }>(sql`
      SELECT
        e.id, e.tenant_id, e.location_id, e.expense_number,
        e.employee_user_id, e.expense_policy_id,
        e.expense_date, e.vendor_name, e.category, e.description,
        e.amount, e.currency, e.payment_method, e.is_reimbursable,
        e.receipt_url, e.gl_account_id, e.project_id,
        e.submitted_at, e.submitted_by, e.created_at,
        p.name AS policy_name
      FROM expenses e
      LEFT JOIN expense_policies p ON p.id = e.expense_policy_id
      WHERE ${whereClause}
      ORDER BY e.submitted_at ASC, e.id DESC
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
        expenseDate: r.expense_date,
        vendorName: r.vendor_name ?? null,
        category: r.category,
        description: r.description ?? null,
        amount: Number(r.amount),
        currency: r.currency,
        paymentMethod: r.payment_method ?? null,
        isReimbursable: r.is_reimbursable,
        hasReceipt: !!r.receipt_url,
        glAccountId: r.gl_account_id ?? null,
        projectId: r.project_id ?? null,
        submittedAt: r.submitted_at ?? null,
        submittedBy: r.submitted_by ?? null,
        createdAt: r.created_at,
        policyName: r.policy_name ?? null,
      })),
      cursor: hasMore ? result[result.length - 1]!.id : null,
      hasMore,
    };
  });
}
