import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export async function listExpensePolicies(tenantId: string) {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute<{
      id: string;
      tenant_id: string;
      name: string;
      description: string | null;
      auto_approve_threshold: string | null;
      requires_receipt_above: string | null;
      max_amount_per_expense: string | null;
      allowed_categories: string[] | null;
      approver_role: string | null;
      is_default: boolean;
      is_active: boolean;
      created_at: string;
      updated_at: string;
      expense_count: string;
    }>(sql`
      SELECT
        p.id, p.tenant_id, p.name, p.description,
        p.auto_approve_threshold, p.requires_receipt_above,
        p.max_amount_per_expense, p.allowed_categories,
        p.approver_role, p.is_default, p.is_active,
        p.created_at, p.updated_at,
        (SELECT COUNT(*)::text FROM expenses e WHERE e.expense_policy_id = p.id) AS expense_count
      FROM expense_policies p
      WHERE p.tenant_id = ${tenantId}
      ORDER BY p.is_default DESC, p.name ASC
    `);

    const items = Array.from(rows as Iterable<typeof rows[number]>);

    return {
      items: items.map((r) => ({
        id: r.id,
        tenantId: r.tenant_id,
        name: r.name,
        description: r.description ?? null,
        autoApproveThreshold: r.auto_approve_threshold ? Number(r.auto_approve_threshold) : null,
        requiresReceiptAbove: r.requires_receipt_above ? Number(r.requires_receipt_above) : null,
        maxAmountPerExpense: r.max_amount_per_expense ? Number(r.max_amount_per_expense) : null,
        allowedCategories: r.allowed_categories ?? null,
        approverRole: r.approver_role ?? null,
        isDefault: r.is_default,
        isActive: r.is_active,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        expenseCount: Number(r.expense_count),
      })),
    };
  });
}
