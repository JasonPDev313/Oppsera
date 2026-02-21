import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface CloseChecklistItem {
  label: string;
  status: 'pass' | 'fail' | 'warning';
  detail?: string;
}

export interface CloseChecklist {
  period: string;
  status: 'open' | 'in_review' | 'closed';
  items: CloseChecklistItem[];
}

interface GetCloseChecklistInput {
  tenantId: string;
  postingPeriod: string; // 'YYYY-MM'
}

export async function getCloseChecklist(
  input: GetCloseChecklistInput,
): Promise<CloseChecklist> {
  return withTenant(input.tenantId, async (tx) => {
    const items: CloseChecklistItem[] = [];

    // 1. Check period status
    const periodRows = await tx.execute(sql`
      SELECT status FROM accounting_close_periods
      WHERE tenant_id = ${input.tenantId}
        AND posting_period = ${input.postingPeriod}
      LIMIT 1
    `);
    const periodArr = Array.from(periodRows as Iterable<Record<string, unknown>>);
    const periodStatus = periodArr.length > 0 ? String(periodArr[0]!.status) : 'open';

    // 2. Open draft journal entries for this period
    const draftRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS count FROM gl_journal_entries
      WHERE tenant_id = ${input.tenantId}
        AND posting_period = ${input.postingPeriod}
        AND status = 'draft'
    `);
    const draftArr = Array.from(draftRows as Iterable<Record<string, unknown>>);
    const draftCount = draftArr.length > 0 ? Number(draftArr[0]!.count) : 0;

    items.push({
      label: 'Open draft journal entries',
      status: draftCount === 0 ? 'pass' : 'fail',
      detail: draftCount > 0 ? `${draftCount} draft entries need to be posted or voided` : 'No open drafts',
    });

    // 3. Unresolved unmapped events
    const unmappedRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS count FROM gl_unmapped_events
      WHERE tenant_id = ${input.tenantId}
        AND resolved_at IS NULL
    `);
    const unmappedArr = Array.from(unmappedRows as Iterable<Record<string, unknown>>);
    const unmappedCount = unmappedArr.length > 0 ? Number(unmappedArr[0]!.count) : 0;

    items.push({
      label: 'Unresolved unmapped events',
      status: unmappedCount === 0 ? 'pass' : 'warning',
      detail: unmappedCount > 0 ? `${unmappedCount} events with missing GL mappings` : 'All events mapped',
    });

    // 4. Trial balance
    const trialRows = await tx.execute(sql`
      SELECT
        COALESCE(SUM(jl.debit_amount), 0) AS total_debits,
        COALESCE(SUM(jl.credit_amount), 0) AS total_credits
      FROM gl_journal_lines jl
      JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
      WHERE je.tenant_id = ${input.tenantId}
        AND je.posting_period = ${input.postingPeriod}
        AND je.status = 'posted'
    `);
    const trialArr = Array.from(trialRows as Iterable<Record<string, unknown>>);
    const totalDebits = trialArr.length > 0 ? Number(trialArr[0]!.total_debits) : 0;
    const totalCredits = trialArr.length > 0 ? Number(trialArr[0]!.total_credits) : 0;
    const trialDiff = Math.abs(totalDebits - totalCredits);

    items.push({
      label: 'Trial balance in balance',
      status: trialDiff < 0.01 ? 'pass' : 'fail',
      detail: trialDiff >= 0.01
        ? `Out of balance by $${trialDiff.toFixed(2)} (debits: $${totalDebits.toFixed(2)}, credits: $${totalCredits.toFixed(2)})`
        : `Balanced (debits: $${totalDebits.toFixed(2)}, credits: $${totalCredits.toFixed(2)})`,
    });

    // 5. AP subledger reconciliation
    const apSettingsRows = await tx.execute(sql`
      SELECT default_ap_control_account_id FROM accounting_settings
      WHERE tenant_id = ${input.tenantId}
      LIMIT 1
    `);
    const apSettingsArr = Array.from(apSettingsRows as Iterable<Record<string, unknown>>);
    const apControlAccountId = apSettingsArr.length > 0 && apSettingsArr[0]!.default_ap_control_account_id
      ? String(apSettingsArr[0]!.default_ap_control_account_id)
      : null;

    if (apControlAccountId) {
      // GL balance for AP control
      const apGlRows = await tx.execute(sql`
        SELECT
          COALESCE(SUM(jl.credit_amount), 0) - COALESCE(SUM(jl.debit_amount), 0) AS balance
        FROM gl_journal_lines jl
        JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
        WHERE jl.account_id = ${apControlAccountId}
          AND je.tenant_id = ${input.tenantId}
          AND je.status = 'posted'
      `);
      const apGlArr = Array.from(apGlRows as Iterable<Record<string, unknown>>);
      const apGlBalance = apGlArr.length > 0 ? Number(apGlArr[0]!.balance) : 0;

      // AP subledger balance
      const apBillRows = await tx.execute(sql`
        SELECT COALESCE(SUM(total_amount::numeric), 0) AS total
        FROM ap_bills WHERE tenant_id = ${input.tenantId} AND status IN ('posted', 'partial')
      `);
      const apBillArr = Array.from(apBillRows as Iterable<Record<string, unknown>>);
      const apBillTotal = apBillArr.length > 0 ? Number(apBillArr[0]!.total) : 0;

      const apPayRows = await tx.execute(sql`
        SELECT COALESCE(SUM(amount::numeric), 0) AS total
        FROM ap_payments WHERE tenant_id = ${input.tenantId} AND status = 'posted'
      `);
      const apPayArr = Array.from(apPayRows as Iterable<Record<string, unknown>>);
      const apPayTotal = apPayArr.length > 0 ? Number(apPayArr[0]!.total) : 0;

      const apSubledgerBalance = apBillTotal - apPayTotal;
      const apDiff = Math.abs(apGlBalance - apSubledgerBalance);

      items.push({
        label: 'AP subledger reconciled to GL',
        status: apDiff < 0.01 ? 'pass' : 'fail',
        detail: apDiff >= 0.01
          ? `AP GL: $${apGlBalance.toFixed(2)}, Subledger: $${apSubledgerBalance.toFixed(2)}, Diff: $${apDiff.toFixed(2)}`
          : 'AP balanced',
      });
    }

    return {
      period: input.postingPeriod,
      status: periodStatus as 'open' | 'in_review' | 'closed',
      items,
    };
  });
}
