import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface ReconciliationDetail {
  message: string;
}

export interface ReconciliationResult {
  subledgerType: 'ap' | 'ar' | 'pos_legacy';
  controlAccountId: string | null;
  controlAccountName: string | null;
  glBalance: number;
  subledgerBalance: number;
  difference: number;
  isReconciled: boolean;
  asOfDate: string | null;
  details: ReconciliationDetail[];
}

interface ReconcileSubledgerInput {
  tenantId: string;
  subledgerType: 'ap' | 'ar' | 'pos_legacy';
  asOfDate?: string;
  postingPeriod?: string; // 'YYYY-MM' — used for pos_legacy reconciliation
}

export async function reconcileSubledger(
  input: ReconcileSubledgerInput,
): Promise<ReconciliationResult> {
  return withTenant(input.tenantId, async (tx) => {
    // POS legacy reconciliation — compare payment_journal_entries vs gl_journal_entries
    if (input.subledgerType === 'pos_legacy') {
      const periodFilter = input.postingPeriod
        ? sql`AND pje.business_date >= (${input.postingPeriod} || '-01')::date
              AND pje.business_date < ((${input.postingPeriod} || '-01')::date + INTERVAL '1 month')`
        : input.asOfDate
          ? sql`AND pje.business_date <= ${input.asOfDate}`
          : sql``;

      const legacyRows = await tx.execute(sql`
        SELECT COALESCE(SUM(
          (SELECT COALESCE(SUM((entry->>'debit')::numeric), 0)
           FROM jsonb_array_elements(pje.entries) AS entry)
        ), 0) AS legacy_total
        FROM payment_journal_entries pje
        WHERE pje.tenant_id = ${input.tenantId}
          AND pje.posting_status = 'posted'
          ${periodFilter}
      `);
      const legacyArr = Array.from(legacyRows as Iterable<Record<string, unknown>>);
      const legacyTotal = legacyArr.length > 0 ? Number(legacyArr[0]!.legacy_total) : 0;

      const glPeriodFilter = input.postingPeriod
        ? sql`AND je.posting_period = ${input.postingPeriod}`
        : input.asOfDate
          ? sql`AND je.business_date <= ${input.asOfDate}`
          : sql``;

      const properRows = await tx.execute(sql`
        SELECT COALESCE(SUM(jl.debit_amount), 0) AS proper_total
        FROM gl_journal_lines jl
        JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
        WHERE je.tenant_id = ${input.tenantId}
          AND je.source_module = 'pos'
          AND je.status = 'posted'
          ${glPeriodFilter}
      `);
      const properArr = Array.from(properRows as Iterable<Record<string, unknown>>);
      const properTotal = properArr.length > 0 ? Number(properArr[0]!.proper_total) : 0;

      const difference = Math.round((legacyTotal - properTotal) * 100) / 100;

      return {
        subledgerType: 'pos_legacy' as const,
        controlAccountId: null,
        controlAccountName: null,
        glBalance: Math.round(properTotal * 100) / 100,
        subledgerBalance: Math.round(legacyTotal * 100) / 100,
        difference,
        isReconciled: Math.abs(difference) < 0.01,
        asOfDate: input.asOfDate ?? null,
        details: [
          { message: `Legacy GL (payment_journal_entries) debit total: $${legacyTotal.toFixed(2)}` },
          { message: `Proper GL (gl_journal_entries) debit total: $${properTotal.toFixed(2)}` },
        ],
      };
    }

    // 1. Look up the control account from accounting_settings
    const controlAccountField = input.subledgerType === 'ap'
      ? 'default_ap_control_account_id'
      : 'default_ar_control_account_id';

    const settingsRows = await tx.execute(sql`
      SELECT ${sql.raw(controlAccountField)} AS control_account_id
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
        subledgerType: input.subledgerType,
        controlAccountId: null,
        controlAccountName: null,
        glBalance: 0,
        subledgerBalance: 0,
        difference: 0,
        isReconciled: false,
        asOfDate: input.asOfDate ?? null,
        details: [
          {
            message: `No ${input.subledgerType.toUpperCase()} control account configured in accounting settings`,
          },
        ],
      };
    }

    // 2. Get GL balance for the control account
    const dateFilter = input.asOfDate
      ? sql`AND je.business_date <= ${input.asOfDate}`
      : sql``;

    const balanceRows = await tx.execute(sql`
      SELECT
        a.name AS account_name,
        a.normal_balance,
        COALESCE(SUM(jl.debit_amount), 0) AS debit_total,
        COALESCE(SUM(jl.credit_amount), 0) AS credit_total,
        CASE WHEN a.normal_balance = 'debit'
          THEN COALESCE(SUM(jl.debit_amount), 0) - COALESCE(SUM(jl.credit_amount), 0)
          ELSE COALESCE(SUM(jl.credit_amount), 0) - COALESCE(SUM(jl.debit_amount), 0)
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
    const controlAccountName = balanceArr.length > 0
      ? String(balanceArr[0]!.account_name)
      : null;

    // 3. Subledger balance
    let subledgerBalance = 0;
    const details: ReconciliationDetail[] = [];

    if (input.subledgerType === 'ap') {
      // AP subledger: total bills - total payments
      const dateFilterSql = input.asOfDate ? sql`AND bill_date <= ${input.asOfDate}` : sql``;
      const billRows = await tx.execute(sql`
        SELECT COALESCE(SUM(total_amount::numeric), 0) AS total
        FROM ap_bills
        WHERE tenant_id = ${input.tenantId}
          AND status IN ('posted', 'partial')
          ${dateFilterSql}
      `);
      const billArr = Array.from(billRows as Iterable<Record<string, unknown>>);
      const billTotal = billArr.length > 0 ? Number(billArr[0]!.total) : 0;

      const payDateFilterSql = input.asOfDate ? sql`AND payment_date <= ${input.asOfDate}` : sql``;
      const payRows = await tx.execute(sql`
        SELECT COALESCE(SUM(amount::numeric), 0) AS total
        FROM ap_payments
        WHERE tenant_id = ${input.tenantId}
          AND status = 'posted'
          ${payDateFilterSql}
      `);
      const payArr = Array.from(payRows as Iterable<Record<string, unknown>>);
      const paymentTotal = payArr.length > 0 ? Number(payArr[0]!.total) : 0;

      subledgerBalance = Math.round((billTotal - paymentTotal) * 100) / 100;
      details.push({ message: `AP bills total: $${billTotal.toFixed(2)}, payments total: $${paymentTotal.toFixed(2)}` });
    } else {
      // AR subledger: total invoices - total receipts
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

      subledgerBalance = Math.round((invTotal - rcpTotal) * 100) / 100;
      details.push({ message: `AR invoices total: $${invTotal.toFixed(2)}, receipts total: $${rcpTotal.toFixed(2)}` });
    }

    const difference = Math.round((glBalance - subledgerBalance) * 100) / 100;

    return {
      subledgerType: input.subledgerType,
      controlAccountId,
      controlAccountName,
      glBalance: Math.round(glBalance * 100) / 100,
      subledgerBalance,
      difference,
      isReconciled: Math.abs(difference) < 0.01,
      asOfDate: input.asOfDate ?? null,
      details,
    };
  });
}
