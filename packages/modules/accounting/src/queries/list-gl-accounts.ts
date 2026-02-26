import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface GlAccountListItem {
  id: string;
  accountNumber: string;
  name: string;
  accountType: string;
  normalBalance: string;
  classificationId: string | null;
  classificationName: string | null;
  parentAccountId: string | null;
  isActive: boolean;
  isControlAccount: boolean;
  controlAccountType: string | null;
  isContraAccount: boolean;
  allowManualPosting: boolean;
  description: string | null;
  debitTotal: number | null;
  creditTotal: number | null;
  balance: number | null;
}

interface ListGlAccountsInput {
  tenantId: string;
  accountType?: string;
  classificationId?: string;
  isActive?: boolean;
  isControlAccount?: boolean;
  includeBalance?: boolean;
  asOfDate?: string;
}

export async function listGlAccounts(
  input: ListGlAccountsInput,
): Promise<{ items: GlAccountListItem[] }> {
  return withTenant(input.tenantId, async (tx) => {
    const accountTypeFilter = input.accountType
      ? sql`AND a.account_type = ${input.accountType}`
      : sql``;

    const classificationFilter = input.classificationId
      ? sql`AND a.classification_id = ${input.classificationId}`
      : sql``;

    const isActiveFilter = input.isActive !== undefined
      ? sql`AND a.is_active = ${input.isActive}`
      : sql``;

    const isControlFilter = input.isControlAccount !== undefined
      ? sql`AND a.is_control_account = ${input.isControlAccount}`
      : sql``;

    if (input.includeBalance) {
      const dateFilter = input.asOfDate
        ? sql`AND je.business_date <= ${input.asOfDate}`
        : sql``;

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
          COALESCE(SUM(jl.debit_amount), 0) AS debit_total,
          COALESCE(SUM(jl.credit_amount), 0) AS credit_total,
          CASE WHEN a.normal_balance = 'debit'
            THEN COALESCE(SUM(jl.debit_amount), 0) - COALESCE(SUM(jl.credit_amount), 0)
            ELSE COALESCE(SUM(jl.credit_amount), 0) - COALESCE(SUM(jl.debit_amount), 0)
          END AS balance
        FROM gl_accounts a
        LEFT JOIN gl_classifications c ON c.id = a.classification_id
        LEFT JOIN gl_journal_lines jl ON jl.account_id = a.id
        LEFT JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
          AND je.status = 'posted'
          AND je.tenant_id = ${input.tenantId}
          ${dateFilter}
        WHERE a.tenant_id = ${input.tenantId}
          ${accountTypeFilter}
          ${classificationFilter}
          ${isActiveFilter}
          ${isControlFilter}
        GROUP BY a.id, a.account_number, a.name, a.account_type, a.normal_balance,
                 a.classification_id, c.name, a.parent_account_id, a.is_active,
                 a.is_control_account, a.control_account_type, a.is_contra_account,
                 a.allow_manual_posting, a.description
        ORDER BY a.account_number
        LIMIT 2000
      `);

      const items = Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
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
      }));

      return { items };
    }

    // Without balance — simpler query
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
        a.description
      FROM gl_accounts a
      LEFT JOIN gl_classifications c ON c.id = a.classification_id
      WHERE a.tenant_id = ${input.tenantId}
        ${accountTypeFilter}
        ${classificationFilter}
        ${isActiveFilter}
        ${isControlFilter}
      ORDER BY a.account_number
      LIMIT 2000
    `);

    const items = Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
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
      debitTotal: null,
      creditTotal: null,
      balance: null,
    }));

    return { items };
  });
}
