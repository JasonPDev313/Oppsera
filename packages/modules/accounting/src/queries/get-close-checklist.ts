import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { getReconciliationReadApi } from '@oppsera/core/helpers/reconciliation-read-api';

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
  const api = getReconciliationReadApi();

  // Parallel: API calls for cross-module status + local queries for accounting-owned data
  const [apiResults, localResults] = await Promise.all([
    // Cross-module status checks via ReconciliationReadApi
    Promise.all([
      api.getDrawerSessionStatus(input.tenantId, input.postingPeriod),
      api.getRetailCloseStatus(input.tenantId, input.postingPeriod),
      api.getFnbCloseStatus(input.tenantId, input.postingPeriod),
      api.getPendingTipCount(input.tenantId, input.postingPeriod),
      api.getDepositStatus(input.tenantId, input.postingPeriod),
      api.getSettlementStatusCounts(input.tenantId, input.postingPeriod),
    ]),
    // Local queries (accounting-owned tables)
    withTenant(input.tenantId, async (tx) => {
      // 1. Period status
      const periodRows = await tx.execute(sql`
        SELECT status FROM accounting_close_periods
        WHERE tenant_id = ${input.tenantId}
          AND posting_period = ${input.postingPeriod}
        LIMIT 1
      `);
      const periodArr = Array.from(periodRows as Iterable<Record<string, unknown>>);
      const periodStatus = periodArr.length > 0 ? String(periodArr[0]!.status) : 'open';

      // 2. Open draft journal entries
      const draftRows = await tx.execute(sql`
        SELECT COUNT(*)::int AS count FROM gl_journal_entries
        WHERE tenant_id = ${input.tenantId}
          AND posting_period = ${input.postingPeriod}
          AND status = 'draft'
      `);
      const draftArr = Array.from(draftRows as Iterable<Record<string, unknown>>);
      const draftCount = draftArr.length > 0 ? Number(draftArr[0]!.count) : 0;

      // 3. Unresolved unmapped events
      const unmappedRows = await tx.execute(sql`
        SELECT COUNT(*)::int AS count FROM gl_unmapped_events
        WHERE tenant_id = ${input.tenantId}
          AND resolved_at IS NULL
      `);
      const unmappedArr = Array.from(unmappedRows as Iterable<Record<string, unknown>>);
      const unmappedCount = unmappedArr.length > 0 ? Number(unmappedArr[0]!.count) : 0;

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

      let apReconciliation: { glBalance: number; subledgerBalance: number } | null = null;
      if (apControlAccountId) {
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

        apReconciliation = { glBalance: apGlBalance, subledgerBalance: apBillTotal - apPayTotal };
      }

      // 6. Settings for legacy GL, tips, service charge
      const settingsRows = await tx.execute(sql`
        SELECT
          enable_legacy_gl_posting,
          default_tips_payable_account_id,
          default_service_charge_revenue_account_id,
          cogs_posting_mode
        FROM accounting_settings
        WHERE tenant_id = ${input.tenantId}
        LIMIT 1
      `);
      const settingsArr = Array.from(settingsRows as Iterable<Record<string, unknown>>);
      const legacyEnabled = settingsArr.length > 0 ? Boolean(settingsArr[0]!.enable_legacy_gl_posting) : true;
      const tipsAccountId = settingsArr.length > 0 && settingsArr[0]!.default_tips_payable_account_id
        ? String(settingsArr[0]!.default_tips_payable_account_id) : null;
      const svcAccountId = settingsArr.length > 0 && settingsArr[0]!.default_service_charge_revenue_account_id
        ? String(settingsArr[0]!.default_service_charge_revenue_account_id) : null;
      const cogsMode = settingsArr.length > 0 ? String(settingsArr[0]!.cogs_posting_mode) : 'disabled';

      // 9. Sub-department discount mapping completeness
      const discountMappingRows = await tx.execute(sql`
        SELECT
          COUNT(*)::int AS total_mapped,
          COUNT(*) FILTER (WHERE discount_account_id IS NULL)::int AS missing_discount
        FROM sub_department_gl_defaults
        WHERE tenant_id = ${input.tenantId}
      `);
      const discountArr = Array.from(discountMappingRows as Iterable<Record<string, unknown>>);
      const totalMapped = discountArr.length > 0 ? Number(discountArr[0]!.total_mapped) : 0;
      const missingDiscount = discountArr.length > 0 ? Number(discountArr[0]!.missing_discount) : 0;

      // 10. POS legacy vs proper GL reconciliation
      let legacyReconciliation: { legacyTotal: number; properTotal: number } | null = null;
      if (legacyEnabled) {
        const legacyGlRows = await tx.execute(sql`
          SELECT COALESCE(SUM(
            (SELECT COALESCE(SUM((entry->>'debit')::numeric), 0)
             FROM jsonb_array_elements(pje.entries) AS entry)
          ), 0) AS legacy_total
          FROM payment_journal_entries pje
          WHERE pje.tenant_id = ${input.tenantId}
            AND pje.business_date >= (${input.postingPeriod} || '-01')::date
            AND pje.business_date < ((${input.postingPeriod} || '-01')::date + INTERVAL '1 month')
            AND pje.posting_status = 'posted'
        `);
        const legacyGlArr = Array.from(legacyGlRows as Iterable<Record<string, unknown>>);
        const legacyTotal = legacyGlArr.length > 0 ? Number(legacyGlArr[0]!.legacy_total) : 0;

        const properGlRows = await tx.execute(sql`
          SELECT COALESCE(SUM(jl.debit_amount), 0) AS proper_total
          FROM gl_journal_lines jl
          JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
          WHERE je.tenant_id = ${input.tenantId}
            AND je.source_module = 'pos'
            AND je.posting_period = ${input.postingPeriod}
            AND je.status = 'posted'
        `);
        const properGlArr = Array.from(properGlRows as Iterable<Record<string, unknown>>);
        const properTotal = properGlArr.length > 0 ? Number(properGlArr[0]!.proper_total) : 0;

        legacyReconciliation = { legacyTotal, properTotal };
      }

      // 16. Dead letter events
      const deadLetterRows = await tx.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM event_dead_letters
        WHERE status = 'failed'
      `);
      const deadLetterArr = Array.from(deadLetterRows as Iterable<Record<string, unknown>>);
      const deadLetterCount = deadLetterArr.length > 0 ? Number(deadLetterArr[0]!.count) : 0;

      // 18. Periodic COGS (if mode=periodic)
      let cogsCounts: { total: number; posted: number } | null = null;
      if (cogsMode === 'periodic') {
        const cogsRows = await tx.execute(sql`
          SELECT COUNT(*)::int AS total,
                 COUNT(*) FILTER (WHERE status = 'posted')::int AS posted
          FROM periodic_cogs_calculations
          WHERE tenant_id = ${input.tenantId}
            AND period_start >= (${input.postingPeriod} || '-01')::date
            AND period_end < ((${input.postingPeriod} || '-01')::date + INTERVAL '1 month')
        `);
        const cogsArr = Array.from(cogsRows as Iterable<Record<string, unknown>>);
        cogsCounts = {
          total: cogsArr.length > 0 ? Number(cogsArr[0]!.total) : 0,
          posted: cogsArr.length > 0 ? Number(cogsArr[0]!.posted) : 0,
        };
      }

      // 19. Recurring entries current
      const recurringRows = await tx.execute(sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE next_due_date <= CURRENT_DATE)::int AS overdue
        FROM gl_recurring_templates
        WHERE tenant_id = ${input.tenantId}
          AND is_active = true
      `);
      const recurringArr = Array.from(recurringRows as Iterable<Record<string, unknown>>);
      const recurringTotal = recurringArr.length > 0 ? Number(recurringArr[0]!.total) : 0;
      const recurringOverdue = recurringArr.length > 0 ? Number(recurringArr[0]!.overdue) : 0;

      // 20. Bank accounts reconciled
      const bankRecRows = await tx.execute(sql`
        SELECT
          COUNT(*)::int AS total_bank_accounts,
          COUNT(*) FILTER (WHERE ba.last_reconciled_date IS NULL OR ba.last_reconciled_date < (${input.postingPeriod || new Date().toISOString().slice(0, 7)} || '-01')::date)::int AS unreconciled
        FROM bank_accounts ba
        WHERE ba.tenant_id = ${input.tenantId}
          AND ba.is_active = true
      `);
      const bankRecArr = Array.from(bankRecRows as Iterable<Record<string, unknown>>);
      const totalBankAccounts = bankRecArr.length > 0 ? Number(bankRecArr[0]!.total_bank_accounts) : 0;
      const unreconciledBanks = bankRecArr.length > 0 ? Number(bankRecArr[0]!.unreconciled) : 0;

      return {
        periodStatus,
        draftCount, unmappedCount, totalDebits, totalCredits,
        apReconciliation,
        legacyEnabled, tipsAccountId, svcAccountId, cogsMode,
        totalMapped, missingDiscount,
        legacyReconciliation,
        deadLetterCount,
        cogsCounts,
        recurringTotal, recurringOverdue,
        totalBankAccounts, unreconciledBanks,
      };
    }),
  ]);

  const [drawerStatus, retailCloseStatus, fnbCloseStatus, pendingTipCount, depositStatus, settlementCounts] = apiResults;
  const l = localResults;
  const items: CloseChecklistItem[] = [];

  // ── Items 1-10: Local (accounting-owned tables) ───────────────

  // 2. Draft journal entries
  items.push({
    label: 'Open draft journal entries',
    status: l.draftCount === 0 ? 'pass' : 'fail',
    detail: l.draftCount > 0 ? `${l.draftCount} draft entries need to be posted or voided` : 'No open drafts',
  });

  // 3. Unmapped events
  items.push({
    label: 'Unresolved unmapped events',
    status: l.unmappedCount === 0 ? 'pass' : 'warning',
    detail: l.unmappedCount > 0 ? `${l.unmappedCount} events with missing GL mappings` : 'All events mapped',
  });

  // 4. Trial balance
  const trialDiff = Math.abs(l.totalDebits - l.totalCredits);
  items.push({
    label: 'Trial balance in balance',
    status: trialDiff < 0.01 ? 'pass' : 'fail',
    detail: trialDiff >= 0.01
      ? `Out of balance by $${trialDiff.toFixed(2)} (debits: $${l.totalDebits.toFixed(2)}, credits: $${l.totalCredits.toFixed(2)})`
      : `Balanced (debits: $${l.totalDebits.toFixed(2)}, credits: $${l.totalCredits.toFixed(2)})`,
  });

  // 5. AP subledger reconciliation
  if (l.apReconciliation) {
    const apDiff = Math.abs(l.apReconciliation.glBalance - l.apReconciliation.subledgerBalance);
    items.push({
      label: 'AP subledger reconciled to GL',
      status: apDiff < 0.01 ? 'pass' : 'fail',
      detail: apDiff >= 0.01
        ? `AP GL: $${l.apReconciliation.glBalance.toFixed(2)}, Subledger: $${l.apReconciliation.subledgerBalance.toFixed(2)}, Diff: $${apDiff.toFixed(2)}`
        : 'AP balanced',
    });
  }

  // 6. Legacy GL posting
  items.push({
    label: 'Legacy GL posting disabled',
    status: l.legacyEnabled ? 'warning' : 'pass',
    detail: l.legacyEnabled
      ? 'Legacy GL posting is still enabled — both old (payment_journal_entries) and new (gl_journal_entries) systems are writing simultaneously. Disable after confirming proper GL is working correctly.'
      : 'Only proper GL posting is active',
  });

  // 7. Tips payable account
  items.push({
    label: 'Tips payable account configured',
    status: l.tipsAccountId ? 'pass' : 'warning',
    detail: l.tipsAccountId
      ? 'Tips payable account is set'
      : 'No tips payable account configured — tips on POS tenders will not be posted to GL',
  });

  // 8. Service charge revenue account
  items.push({
    label: 'Service charge revenue account configured',
    status: l.svcAccountId ? 'pass' : 'warning',
    detail: l.svcAccountId
      ? 'Service charge revenue account is set'
      : 'No service charge revenue account configured — service charges will not be posted to GL',
  });

  // 9. Sub-department discount mappings
  if (l.totalMapped > 0) {
    items.push({
      label: 'Sub-department discount account mappings',
      status: l.missingDiscount === 0 ? 'pass' : 'warning',
      detail: l.missingDiscount > 0
        ? `${l.missingDiscount} of ${l.totalMapped} sub-departments missing discount account mapping — discounts for those departments will not post to GL`
        : `All ${l.totalMapped} sub-departments have discount account mappings`,
    });
  }

  // 10. POS legacy vs proper GL reconciliation
  if (l.legacyReconciliation) {
    const posGlDiff = Math.abs(l.legacyReconciliation.legacyTotal - l.legacyReconciliation.properTotal);
    items.push({
      label: 'POS legacy vs proper GL reconciliation',
      status: posGlDiff < 0.01 ? 'pass' : 'warning',
      detail: posGlDiff >= 0.01
        ? `Legacy total: $${l.legacyReconciliation.legacyTotal.toFixed(2)}, Proper GL total: $${l.legacyReconciliation.properTotal.toFixed(2)}, Diff: $${posGlDiff.toFixed(2)} — review before disabling legacy posting`
        : `Legacy and proper GL totals match ($${l.legacyReconciliation.legacyTotal.toFixed(2)})`,
    });
  }

  // ── Items 11-18: Cross-module via ReconciliationReadApi ────────

  // 11. Drawer sessions closed
  if (drawerStatus.total > 0) {
    items.push({
      label: 'All drawer sessions closed',
      status: drawerStatus.openCount === 0 ? 'pass' : 'fail',
      detail: drawerStatus.openCount > 0
        ? `${drawerStatus.openCount} drawer session${drawerStatus.openCount !== 1 ? 's' : ''} still open`
        : `All ${drawerStatus.total} drawer sessions closed`,
    });
  }

  // 12. Retail close batches posted
  if (retailCloseStatus.total > 0) {
    items.push({
      label: 'All retail close batches posted',
      status: retailCloseStatus.unposted === 0 ? 'pass' : 'fail',
      detail: retailCloseStatus.unposted > 0
        ? `${retailCloseStatus.unposted} of ${retailCloseStatus.total} retail close batch${retailCloseStatus.total !== 1 ? 'es' : ''} not yet posted`
        : `All ${retailCloseStatus.total} retail close batches posted`,
    });
  }

  // 13. F&B close batches posted
  if (fnbCloseStatus.total > 0) {
    items.push({
      label: 'F&B close batches posted',
      status: fnbCloseStatus.unposted === 0 ? 'pass' : 'fail',
      detail: fnbCloseStatus.unposted > 0
        ? `${fnbCloseStatus.unposted} of ${fnbCloseStatus.total} F&B close batch${fnbCloseStatus.total !== 1 ? 'es' : ''} not yet posted`
        : `All ${fnbCloseStatus.total} F&B close batches posted`,
    });
  }

  // 14. Outstanding tip balances
  items.push({
    label: 'Outstanding tip balances',
    status: pendingTipCount === 0 ? 'pass' : 'warning',
    detail: pendingTipCount > 0
      ? `${pendingTipCount} pending tip payout${pendingTipCount !== 1 ? 's' : ''}`
      : 'All tip payouts completed',
  });

  // 15. Deposit slips reconciled
  if (depositStatus.total > 0) {
    items.push({
      label: 'Deposit slips reconciled',
      status: depositStatus.unreconciled === 0 ? 'pass' : 'warning',
      detail: depositStatus.unreconciled > 0
        ? `${depositStatus.unreconciled} of ${depositStatus.total} deposit slip${depositStatus.total !== 1 ? 's' : ''} not yet reconciled`
        : `All ${depositStatus.total} deposit slips reconciled`,
    });
  }

  // 16. Dead letter events (local — event infrastructure)
  if (l.deadLetterCount > 0) {
    items.push({
      label: 'Unresolved dead letter events',
      status: 'warning',
      detail: `${l.deadLetterCount} failed event${l.deadLetterCount !== 1 ? 's' : ''} in dead letter queue`,
    });
  }

  // 17. Card settlements posted
  if (settlementCounts.total > 0) {
    items.push({
      label: 'Card settlements matched and posted',
      status: settlementCounts.unposted === 0 ? 'pass' : 'warning',
      detail: settlementCounts.unposted > 0
        ? `${settlementCounts.unposted} of ${settlementCounts.total} settlement${settlementCounts.total !== 1 ? 's' : ''} not yet posted`
        : `All ${settlementCounts.total} settlements posted`,
    });
  }

  // 18. Periodic COGS posted (local — accounting-owned table)
  if (l.cogsCounts) {
    items.push({
      label: 'Periodic COGS posted',
      status: l.cogsCounts.total > 0 && l.cogsCounts.posted === l.cogsCounts.total ? 'pass' : l.cogsCounts.total === 0 ? 'warning' : 'fail',
      detail: l.cogsCounts.total === 0
        ? 'No periodic COGS calculation found for this period'
        : l.cogsCounts.posted < l.cogsCounts.total
          ? `${l.cogsCounts.posted} of ${l.cogsCounts.total} COGS calculation${l.cogsCounts.total !== 1 ? 's' : ''} posted`
          : 'Periodic COGS posted for this period',
    });
  }

  // ── Items 19-20: Local (accounting-owned) ─────────────────────

  // 19. Recurring entries current
  if (l.recurringTotal > 0) {
    items.push({
      label: 'Recurring entries current',
      status: l.recurringOverdue === 0 ? 'pass' : 'warning',
      detail: l.recurringOverdue > 0
        ? `${l.recurringOverdue} recurring template${l.recurringOverdue !== 1 ? 's' : ''} overdue — run from General Ledger > Recurring Templates`
        : `All ${l.recurringTotal} active recurring templates are current`,
    });
  }

  // 20. Bank accounts reconciled
  if (l.totalBankAccounts > 0) {
    items.push({
      label: 'Bank accounts reconciled',
      status: l.unreconciledBanks === 0 ? 'pass' : 'warning',
      detail: l.unreconciledBanks > 0
        ? `${l.unreconciledBanks} of ${l.totalBankAccounts} bank account${l.totalBankAccounts !== 1 ? 's' : ''} not reconciled for this period`
        : `All ${l.totalBankAccounts} bank accounts reconciled`,
    });
  }

  return {
    period: input.postingPeriod,
    status: l.periodStatus as 'open' | 'in_review' | 'closed',
    items,
  };
}
