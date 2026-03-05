import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GlAccountListItem } from './list-gl-accounts';

/**
 * Fetch a single GL account by ID within a tenant.
 * Returns null if not found.
 */
export async function getGlAccount(
  tenantId: string,
  accountId: string,
): Promise<GlAccountListItem | null> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        a.id,
        a.account_number,
        a.name,
        a.account_type,
        a.normal_balance,
        a.classification_id,
        c.name AS classification_name,
        a.parent_account_id,
        a.is_active,
        a.is_control_account,
        a.control_account_type,
        a.is_contra_account,
        a.allow_manual_posting,
        a.description,
        COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.debit_amount ELSE 0 END), 0) AS debit_total,
        COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.credit_amount ELSE 0 END), 0) AS credit_total,
        CASE WHEN a.normal_balance = 'debit'
          THEN COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.debit_amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.credit_amount ELSE 0 END), 0)
          ELSE COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.credit_amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.debit_amount ELSE 0 END), 0)
        END AS balance
      FROM gl_accounts a
      LEFT JOIN gl_classifications c ON c.id = a.classification_id
      LEFT JOIN gl_journal_lines jl ON jl.account_id = a.id AND jl.tenant_id = ${tenantId}
      LEFT JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
        AND je.status = 'posted'
        AND je.tenant_id = ${tenantId}
      WHERE a.tenant_id = ${tenantId}
        AND a.id = ${accountId}
      GROUP BY a.id, a.account_number, a.name, a.account_type, a.normal_balance,
               a.classification_id, c.name, a.parent_account_id, a.is_active,
               a.is_control_account, a.control_account_type, a.is_contra_account,
               a.allow_manual_posting, a.description
    `);

    const items = Array.from(rows as Iterable<Record<string, unknown>>);
    if (items.length === 0) return null;

    const row = items[0]!;
    return {
      id: String(row.id),
      accountNumber: String(row.account_number),
      name: String(row.name),
      accountType: String(row.account_type),
      normalBalance: String(row.normal_balance),
      classificationId: row.classification_id ? String(row.classification_id) : null,
      classificationName: row.classification_name ? String(row.classification_name) : null,
      parentAccountId: row.parent_account_id ? String(row.parent_account_id) : null,
      isActive: Boolean(row.is_active),
      isControlAccount: Boolean(row.is_control_account),
      controlAccountType: row.control_account_type ? String(row.control_account_type) : null,
      isContraAccount: Boolean(row.is_contra_account),
      allowManualPosting: Boolean(row.allow_manual_posting),
      description: row.description ? String(row.description) : null,
      debitTotal: Number(row.debit_total),
      creditTotal: Number(row.credit_total),
      balance: Number(row.balance),
    };
  });
}
