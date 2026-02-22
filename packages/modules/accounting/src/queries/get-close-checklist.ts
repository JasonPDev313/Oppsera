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

    // 6. Legacy GL posting warning
    const settingsRows = await tx.execute(sql`
      SELECT
        enable_legacy_gl_posting,
        default_tips_payable_account_id,
        default_service_charge_revenue_account_id
      FROM accounting_settings
      WHERE tenant_id = ${input.tenantId}
      LIMIT 1
    `);
    const settingsArr = Array.from(settingsRows as Iterable<Record<string, unknown>>);
    const legacyEnabled = settingsArr.length > 0 ? Boolean(settingsArr[0]!.enable_legacy_gl_posting) : true;
    const tipsAccountId = settingsArr.length > 0 && settingsArr[0]!.default_tips_payable_account_id
      ? String(settingsArr[0]!.default_tips_payable_account_id)
      : null;
    const svcAccountId = settingsArr.length > 0 && settingsArr[0]!.default_service_charge_revenue_account_id
      ? String(settingsArr[0]!.default_service_charge_revenue_account_id)
      : null;

    items.push({
      label: 'Legacy GL posting disabled',
      status: legacyEnabled ? 'warning' : 'pass',
      detail: legacyEnabled
        ? 'Legacy GL posting is still enabled — both old (payment_journal_entries) and new (gl_journal_entries) systems are writing simultaneously. Disable after confirming proper GL is working correctly.'
        : 'Only proper GL posting is active',
    });

    // 7. Tips payable account configured
    items.push({
      label: 'Tips payable account configured',
      status: tipsAccountId ? 'pass' : 'warning',
      detail: tipsAccountId
        ? 'Tips payable account is set'
        : 'No tips payable account configured — tips on POS tenders will not be posted to GL',
    });

    // 8. Service charge revenue account configured
    items.push({
      label: 'Service charge revenue account configured',
      status: svcAccountId ? 'pass' : 'warning',
      detail: svcAccountId
        ? 'Service charge revenue account is set'
        : 'No service charge revenue account configured — service charges will not be posted to GL',
    });

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

    if (totalMapped > 0) {
      items.push({
        label: 'Sub-department discount account mappings',
        status: missingDiscount === 0 ? 'pass' : 'warning',
        detail: missingDiscount > 0
          ? `${missingDiscount} of ${totalMapped} sub-departments missing discount account mapping — discounts for those departments will not post to GL`
          : `All ${totalMapped} sub-departments have discount account mappings`,
      });
    }

    // 10. POS legacy vs proper GL reconciliation (only when legacy is still active)
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

      const posGlDiff = Math.abs(legacyTotal - properTotal);

      items.push({
        label: 'POS legacy vs proper GL reconciliation',
        status: posGlDiff < 0.01 ? 'pass' : 'warning',
        detail: posGlDiff >= 0.01
          ? `Legacy total: $${legacyTotal.toFixed(2)}, Proper GL total: $${properTotal.toFixed(2)}, Diff: $${posGlDiff.toFixed(2)} — review before disabling legacy posting`
          : `Legacy and proper GL totals match ($${legacyTotal.toFixed(2)})`,
      });
    }

    // ── UXOPS-12 New Checklist Items ──────────────────────────────────

    // 11. All drawer sessions closed
    const drawerRows = await tx.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'open')::int AS open_count
      FROM drawer_sessions
      WHERE tenant_id = ${input.tenantId}
        AND business_date >= (${input.postingPeriod} || '-01')::date
        AND business_date < ((${input.postingPeriod} || '-01')::date + INTERVAL '1 month')
    `);
    const drawerArr = Array.from(drawerRows as Iterable<Record<string, unknown>>);
    const drawerTotal = drawerArr.length > 0 ? Number(drawerArr[0]!.total) : 0;
    const drawerOpen = drawerArr.length > 0 ? Number(drawerArr[0]!.open_count) : 0;

    if (drawerTotal > 0) {
      items.push({
        label: 'All drawer sessions closed',
        status: drawerOpen === 0 ? 'pass' : 'fail',
        detail: drawerOpen > 0
          ? `${drawerOpen} drawer session${drawerOpen !== 1 ? 's' : ''} still open`
          : `All ${drawerTotal} drawer sessions closed`,
      });
    }

    // 12. All retail close batches posted
    const retailCloseRows = await tx.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status NOT IN ('posted', 'locked'))::int AS unposted
      FROM retail_close_batches
      WHERE tenant_id = ${input.tenantId}
        AND business_date >= (${input.postingPeriod} || '-01')::date
        AND business_date < ((${input.postingPeriod} || '-01')::date + INTERVAL '1 month')
    `);
    const retailCloseArr = Array.from(retailCloseRows as Iterable<Record<string, unknown>>);
    const retailCloseTotal = retailCloseArr.length > 0 ? Number(retailCloseArr[0]!.total) : 0;
    const retailCloseUnposted = retailCloseArr.length > 0 ? Number(retailCloseArr[0]!.unposted) : 0;

    if (retailCloseTotal > 0) {
      items.push({
        label: 'All retail close batches posted',
        status: retailCloseUnposted === 0 ? 'pass' : 'fail',
        detail: retailCloseUnposted > 0
          ? `${retailCloseUnposted} of ${retailCloseTotal} retail close batch${retailCloseTotal !== 1 ? 'es' : ''} not yet posted`
          : `All ${retailCloseTotal} retail close batches posted`,
      });
    }

    // 13. F&B close batches posted
    const fnbCloseRows = await tx.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status NOT IN ('posted', 'locked'))::int AS unposted
      FROM fnb_close_batches
      WHERE tenant_id = ${input.tenantId}
        AND business_date >= (${input.postingPeriod} || '-01')::date
        AND business_date < ((${input.postingPeriod} || '-01')::date + INTERVAL '1 month')
    `);
    const fnbCloseArr = Array.from(fnbCloseRows as Iterable<Record<string, unknown>>);
    const fnbCloseTotal = fnbCloseArr.length > 0 ? Number(fnbCloseArr[0]!.total) : 0;
    const fnbCloseUnposted = fnbCloseArr.length > 0 ? Number(fnbCloseArr[0]!.unposted) : 0;

    if (fnbCloseTotal > 0) {
      items.push({
        label: 'F&B close batches posted',
        status: fnbCloseUnposted === 0 ? 'pass' : 'fail',
        detail: fnbCloseUnposted > 0
          ? `${fnbCloseUnposted} of ${fnbCloseTotal} F&B close batch${fnbCloseTotal !== 1 ? 'es' : ''} not yet posted`
          : `All ${fnbCloseTotal} F&B close batches posted`,
      });
    }

    // 14. Outstanding tip balances
    const tipRows = await tx.execute(sql`
      SELECT COALESCE(SUM(
        CASE
          WHEN tp.payout_type IS NOT NULL AND tp.status = 'completed' THEN -tp.amount_cents
          ELSE 0
        END
      ), 0) AS paid_out
      FROM tip_payouts tp
      WHERE tp.tenant_id = ${input.tenantId}
        AND tp.business_date >= (${input.postingPeriod} || '-01')::date
        AND tp.business_date < ((${input.postingPeriod} || '-01')::date + INTERVAL '1 month')
    `);
    const tipArr = Array.from(tipRows as Iterable<Record<string, unknown>>);

    // Check for pending tip payouts
    const pendingTipRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM tip_payouts
      WHERE tenant_id = ${input.tenantId}
        AND status = 'pending'
        AND business_date >= (${input.postingPeriod} || '-01')::date
        AND business_date < ((${input.postingPeriod} || '-01')::date + INTERVAL '1 month')
    `);
    const pendingTipArr = Array.from(pendingTipRows as Iterable<Record<string, unknown>>);
    const pendingTipCount = pendingTipArr.length > 0 ? Number(pendingTipArr[0]!.count) : 0;

    items.push({
      label: 'Outstanding tip balances',
      status: pendingTipCount === 0 ? 'pass' : 'warning',
      detail: pendingTipCount > 0
        ? `${pendingTipCount} pending tip payout${pendingTipCount !== 1 ? 's' : ''}`
        : 'All tip payouts completed',
    });

    // 15. Deposit slips reconciled
    const depositRows = await tx.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status NOT IN ('reconciled'))::int AS unreconciled
      FROM deposit_slips
      WHERE tenant_id = ${input.tenantId}
        AND business_date >= (${input.postingPeriod} || '-01')::date
        AND business_date < ((${input.postingPeriod} || '-01')::date + INTERVAL '1 month')
    `);
    const depositArr = Array.from(depositRows as Iterable<Record<string, unknown>>);
    const depositTotal = depositArr.length > 0 ? Number(depositArr[0]!.total) : 0;
    const depositUnreconciled = depositArr.length > 0 ? Number(depositArr[0]!.unreconciled) : 0;

    if (depositTotal > 0) {
      items.push({
        label: 'Deposit slips reconciled',
        status: depositUnreconciled === 0 ? 'pass' : 'warning',
        detail: depositUnreconciled > 0
          ? `${depositUnreconciled} of ${depositTotal} deposit slip${depositTotal !== 1 ? 's' : ''} not yet reconciled`
          : `All ${depositTotal} deposit slips reconciled`,
      });
    }

    // 16. Unresolved dead letter events
    const deadLetterRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM event_dead_letters
      WHERE status = 'failed'
    `);
    const deadLetterArr = Array.from(deadLetterRows as Iterable<Record<string, unknown>>);
    const deadLetterCount = deadLetterArr.length > 0 ? Number(deadLetterArr[0]!.count) : 0;

    if (deadLetterCount > 0) {
      items.push({
        label: 'Unresolved dead letter events',
        status: 'warning',
        detail: `${deadLetterCount} failed event${deadLetterCount !== 1 ? 's' : ''} in dead letter queue`,
      });
    }

    // 17. Card settlements matched
    const settlementRows = await tx.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status NOT IN ('posted'))::int AS unposted
      FROM payment_settlements
      WHERE tenant_id = ${input.tenantId}
        AND settlement_date >= (${input.postingPeriod} || '-01')::date
        AND settlement_date < ((${input.postingPeriod} || '-01')::date + INTERVAL '1 month')
    `);
    const settlementArr = Array.from(settlementRows as Iterable<Record<string, unknown>>);
    const settlementTotal = settlementArr.length > 0 ? Number(settlementArr[0]!.total) : 0;
    const settlementUnposted = settlementArr.length > 0 ? Number(settlementArr[0]!.unposted) : 0;

    if (settlementTotal > 0) {
      items.push({
        label: 'Card settlements matched and posted',
        status: settlementUnposted === 0 ? 'pass' : 'warning',
        detail: settlementUnposted > 0
          ? `${settlementUnposted} of ${settlementTotal} settlement${settlementTotal !== 1 ? 's' : ''} not yet posted`
          : `All ${settlementTotal} settlements posted`,
      });
    }

    // 18. Periodic COGS posted (if mode=periodic)
    const cogsSettingsRows = await tx.execute(sql`
      SELECT cogs_posting_mode FROM accounting_settings
      WHERE tenant_id = ${input.tenantId}
      LIMIT 1
    `);
    const cogsSettingsArr = Array.from(cogsSettingsRows as Iterable<Record<string, unknown>>);
    const cogsMode = cogsSettingsArr.length > 0 ? String(cogsSettingsArr[0]!.cogs_posting_mode) : 'disabled';

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
      const cogsTotal = cogsArr.length > 0 ? Number(cogsArr[0]!.total) : 0;
      const cogsPosted = cogsArr.length > 0 ? Number(cogsArr[0]!.posted) : 0;

      items.push({
        label: 'Periodic COGS posted',
        status: cogsTotal > 0 && cogsPosted === cogsTotal ? 'pass' : cogsTotal === 0 ? 'warning' : 'fail',
        detail: cogsTotal === 0
          ? 'No periodic COGS calculation found for this period'
          : cogsPosted < cogsTotal
            ? `${cogsPosted} of ${cogsTotal} COGS calculation${cogsTotal !== 1 ? 's' : ''} posted`
            : 'Periodic COGS posted for this period',
      });
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

    if (recurringTotal > 0) {
      items.push({
        label: 'Recurring entries current',
        status: recurringOverdue === 0 ? 'pass' : 'warning',
        detail: recurringOverdue > 0
          ? `${recurringOverdue} recurring template${recurringOverdue !== 1 ? 's' : ''} overdue — run from General Ledger > Recurring Templates`
          : `All ${recurringTotal} active recurring templates are current`,
      });
    }

    // 20. Bank accounts reconciled
    const bankRecRows = await tx.execute(sql`
      SELECT
        COUNT(*)::int AS total_bank_accounts,
        COUNT(*) FILTER (WHERE ba.last_reconciled_date IS NULL OR ba.last_reconciled_date < ${input.postingPeriod || new Date().toISOString().slice(0, 7)}::text || '-01')::int AS unreconciled
      FROM bank_accounts ba
      WHERE ba.tenant_id = ${input.tenantId}
        AND ba.is_active = true
    `);
    const bankRecArr = Array.from(bankRecRows as Iterable<Record<string, unknown>>);
    const totalBankAccounts = bankRecArr.length > 0 ? Number(bankRecArr[0]!.total_bank_accounts) : 0;
    const unreconciledBanks = bankRecArr.length > 0 ? Number(bankRecArr[0]!.unreconciled) : 0;

    if (totalBankAccounts > 0) {
      items.push({
        label: 'Bank accounts reconciled',
        status: unreconciledBanks === 0 ? 'pass' : 'warning',
        detail: unreconciledBanks > 0
          ? `${unreconciledBanks} of ${totalBankAccounts} bank account${totalBankAccounts !== 1 ? 's' : ''} not reconciled for this period`
          : `All ${totalBankAccounts} bank accounts reconciled`,
      });
    }

    return {
      period: input.postingPeriod,
      status: periodStatus as 'open' | 'in_review' | 'closed',
      items,
    };
  });
}
