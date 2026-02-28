import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { AppError } from '@oppsera/shared';

export async function getExpensePolicy(tenantId: string, policyId: string) {
  return withTenant(tenantId, async (tx) => {
    const [policy] = await tx.execute<{
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
    }>(sql`
      SELECT
        id, tenant_id, name, description,
        auto_approve_threshold, requires_receipt_above,
        max_amount_per_expense, allowed_categories,
        approver_role, is_default, is_active,
        created_at, updated_at
      FROM expense_policies
      WHERE tenant_id = ${tenantId} AND id = ${policyId}
    `);

    if (!policy) {
      throw new AppError('NOT_FOUND', 'Expense policy not found', 404);
    }

    // Get usage stats
    const [stats] = await tx.execute<{
      total_expenses: string;
      active_expenses: string;
      total_amount: string;
    }>(sql`
      SELECT
        COUNT(*)::text AS total_expenses,
        COUNT(*) FILTER (WHERE status NOT IN ('voided'))::text AS active_expenses,
        COALESCE(SUM(amount) FILTER (WHERE status NOT IN ('voided')), 0)::text AS total_amount
      FROM expenses
      WHERE expense_policy_id = ${policyId}
    `);

    return {
      id: policy.id,
      tenantId: policy.tenant_id,
      name: policy.name,
      description: policy.description ?? null,
      autoApproveThreshold: policy.auto_approve_threshold ? Number(policy.auto_approve_threshold) : null,
      requiresReceiptAbove: policy.requires_receipt_above ? Number(policy.requires_receipt_above) : null,
      maxAmountPerExpense: policy.max_amount_per_expense ? Number(policy.max_amount_per_expense) : null,
      allowedCategories: policy.allowed_categories ?? null,
      approverRole: policy.approver_role ?? null,
      isDefault: policy.is_default,
      isActive: policy.is_active,
      createdAt: policy.created_at,
      updatedAt: policy.updated_at,
      stats: {
        totalExpenses: Number(stats?.total_expenses ?? 0),
        activeExpenses: Number(stats?.active_expenses ?? 0),
        totalAmount: Number(stats?.total_amount ?? 0),
      },
    };
  });
}
