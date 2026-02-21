import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface ArReconciliationResult {
  controlAccountId: string | null;
  controlAccountName: string | null;
  glBalance: number;
  subledgerBalance: number;
  difference: number;
  isReconciled: boolean;
  asOfDate: string | null;
  details: Array<{ message: string }>;
}

interface GetReconciliationArInput {
  tenantId: string;
  asOfDate?: string;
}

export async function getReconciliationAr(input: GetReconciliationArInput): Promise<ArReconciliationResult> {
  return withTenant(input.tenantId, async (tx) => {
    // 1. Get AR control account from settings
    const settingsRows = await tx.execute(sql`
      SELECT default_ar_control_account_id AS control_account_id
      FROM accounting_settings
      WHERE tenant_id = ${input.tenantId}
      LIMIT 1
    `);
    const settingsArr = Array.from(settingsRows as Iterable<Record<string, unknown>>);
    const controlAccountId = settingsArr.length > 0 && settingsArr[0]!.control_account_id
      ? String(settingsArr[0]!.control_account_id)
      : null;

    if (!controlAccountId) {
      return {
        controlAccountId: null,
        controlAccountName: null,
        glBalance: 0,
        subledgerBalance: 0,
        difference: 0,
        isReconciled: false,
        asOfDate: input.asOfDate ?? null,
        details: [{ message: 'No AR control account configured in accounting settings' }],
      };
    }

    // 2. GL balance for the AR control account
    const dateFilter = input.asOfDate
      ? sql`AND je.business_date <= ${input.asOfDate}`
      : sql``;

    const balanceRows = await tx.execute(sql`
      SELECT
        a.name AS account_name,
        a.normal_balance,
        CASE WHEN a.normal_balance = 'debit'
          THEN COALESCE(SUM(jl.debit_amount::numeric), 0) - COALESCE(SUM(jl.credit_amount::numeric), 0)
          ELSE COALESCE(SUM(jl.credit_amount::numeric), 0) - COALESCE(SUM(jl.debit_amount::numeric), 0)
        END AS balance
      FROM gl_accounts a
      LEFT JOIN gl_journal_lines jl ON jl.account_id = a.id
      LEFT JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
        AND je.status = 'posted'
        AND je.tenant_id = ${input.tenantId}
        ${dateFilter}
      WHERE a.id = ${controlAccountId}
        AND a.tenant_id = ${input.tenantId}
      GROUP BY a.id, a.name, a.normal_balance
    `);

    const balanceArr = Array.from(balanceRows as Iterable<Record<string, unknown>>);
    const glBalance = balanceArr.length > 0 ? Number(balanceArr[0]!.balance) : 0;
    const controlAccountName = balanceArr.length > 0 ? String(balanceArr[0]!.account_name) : null;

    // 3. AR subledger balance: invoices - receipts
    const invDateFilter = input.asOfDate ? sql`AND invoice_date <= ${input.asOfDate}` : sql``;
    const invRows = await tx.execute(sql`
      SELECT COALESCE(SUM(total_amount::numeric), 0) AS total
      FROM ar_invoices
      WHERE tenant_id = ${input.tenantId}
        AND status IN ('posted', 'partial', 'paid')
        ${invDateFilter}
    `);
    const invArr = Array.from(invRows as Iterable<Record<string, unknown>>);
    const invTotal = invArr.length > 0 ? Number(invArr[0]!.total) : 0;

    const rcpDateFilter = input.asOfDate ? sql`AND receipt_date <= ${input.asOfDate}` : sql``;
    const rcpRows = await tx.execute(sql`
      SELECT COALESCE(SUM(amount::numeric), 0) AS total
      FROM ar_receipts
      WHERE tenant_id = ${input.tenantId}
        AND status = 'posted'
        ${rcpDateFilter}
    `);
    const rcpArr = Array.from(rcpRows as Iterable<Record<string, unknown>>);
    const rcpTotal = rcpArr.length > 0 ? Number(rcpArr[0]!.total) : 0;

    const subledgerBalance = Math.round((invTotal - rcpTotal) * 100) / 100;
    const difference = Math.round((glBalance - subledgerBalance) * 100) / 100;

    return {
      controlAccountId,
      controlAccountName,
      glBalance: Math.round(glBalance * 100) / 100,
      subledgerBalance,
      difference,
      isReconciled: Math.abs(difference) < 0.01,
      asOfDate: input.asOfDate ?? null,
      details: [
        { message: `AR invoices total: $${invTotal.toFixed(2)}, receipts total: $${rcpTotal.toFixed(2)}` },
      ],
    };
  });
}
