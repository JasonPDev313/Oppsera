# Accounting Structural Gaps — Full Implementation Plan

## Context
A PWC-style audit of the accounting system identified 15 structural gaps across 3 tiers that would fail external audit, result in qualified opinions, or cause operational weakness. This plan implements ALL 15 features end-to-end: schema, backend commands/queries, API routes, frontend pages/hooks/components, navigation, and tests — resulting in a fully wired and usable system.

**Last migration idx:** 185 | **Next available:** 186

---

## Session Plan Overview

| Session | Features | Migration | New Files | Est. Lines |
|---------|----------|-----------|-----------|------------|
| S1 | GL Approval + Reconciliation Tracking + Combination Rules + Prior Period Adj | 0186 | ~55 | ~5,500 |
| S2 | Fixed Assets + Breakage Automation | 0187 | ~45 | ~4,800 |
| S3 | Budget vs. Actual + Payroll GL | 0188 | ~50 | ~5,400 |
| S4 | Revenue Recognition (ASC 606) + Lease Accounting (ASC 842) | 0189 | ~50 | ~5,600 |
| S5 | Intercompany/Consolidation + Multi-Currency | 0190 | ~40 | ~4,200 |
| S6 | Segment P&L + Outstanding Checks + Accounting Policies | 0191 | ~35 | ~3,200 |
| S7 | Drizzle Schema + Tests + Bootstrap + Close Checklist + Nav Wiring | 0192 | ~35 | ~4,500 |
| **TOTAL** | **15 features** | **7 migrations** | **~310 files** | **~33,200 lines** |

---

## SESSION 1: Audit Controls Foundation

**Features:** #3 GL Entry Approval Workflow, #4 GL Account Reconciliation Tracking, #14 GL Combination Validation, #10 Prior Period Adjustments

**Why grouped:** All four modify the core GL posting pipeline (`post-journal-entry.ts`, `validate-journal.ts`). Building them together avoids repeated refactoring of the same critical files.

### Migration 0186 (`0186_gl_audit_controls.sql`)

**New tables (5):**

- **gl_approval_rules** — (id, tenant_id, rule_type TEXT [amount_threshold|account_type|source_module|all_manual], threshold_amount NUMERIC(12,2), account_types TEXT[], source_modules TEXT[], required_approver_role TEXT, is_active BOOLEAN DEFAULT true, created_at, updated_at)
- **gl_approval_requests** — (id, tenant_id, journal_entry_id FK→gl_journal_entries, rule_id FK→gl_approval_rules, requested_by, requested_at, status TEXT [pending|approved|rejected|expired], reviewed_by, reviewed_at, review_notes, expires_at, created_at)
- **gl_reconciliations** — (id, tenant_id, account_id FK→gl_accounts, period_end DATE, gl_balance NUMERIC(12,2), subledger_balance NUMERIC(12,2), variance NUMERIC(12,2), status TEXT [not_started|in_progress|completed|approved], reconciled_by, reconciled_at, approved_by, approved_at, notes, attachment_count INT DEFAULT 0, created_at, updated_at) — UNIQUE(tenant_id, account_id, period_end)
- **gl_reconciliation_items** — (id, tenant_id, reconciliation_id FK→gl_reconciliations, description, amount NUMERIC(12,2), item_type TEXT [timing|error|adjustment|other], resolved BOOLEAN DEFAULT false, journal_entry_id FK nullable, created_at)
- **gl_combination_rules** — (id, tenant_id, rule_type TEXT [required_pair|forbidden_pair|required_account_type], debit_account_type, credit_account_type, debit_classification_id, credit_classification_id, error_message, is_active BOOLEAN DEFAULT true, created_at, updated_at)

**ALTER TABLE:**

- `gl_journal_entries` ADD: `is_prior_period_adjustment BOOLEAN DEFAULT false`, `original_period_date DATE`, `adjustment_reason TEXT`, `adjustment_approved_by TEXT`

### Backend (`packages/modules/accounting/src/`)

**Commands (12):**

- `commands/create-approval-rule.ts` — createApprovalRule(ctx, input) → inserts rule
- `commands/update-approval-rule.ts` — updateApprovalRule(ctx, input) → updates rule
- `commands/approve-journal-entry.ts` — approveJournalEntry(ctx, {entryId, reviewNotes}) → validates SOD (reviewedBy != createdBy), flips status to 'posted', creates GL event
- `commands/reject-journal-entry.ts` — rejectJournalEntry(ctx, {entryId, reviewNotes}) → flips status to 'rejected'
- `commands/start-reconciliation.ts` — startReconciliation(ctx, {accountId, periodEnd}) → computes GL balance from gl_journal_lines, sets status='in_progress'
- `commands/complete-reconciliation.ts` — completeReconciliation(ctx, {reconciliationId, notes}) → validates all items resolved, computes final variance, sets status='completed'
- `commands/approve-reconciliation.ts` — approveReconciliation(ctx, {reconciliationId}) → SOD: approvedBy != reconciledBy, sets status='approved'
- `commands/add-reconciliation-item.ts` — addReconciliationItem(ctx, input) → inserts timing/error/adjustment item
- `commands/resolve-reconciliation-item.ts` — resolveReconciliationItem(ctx, {itemId, journalEntryId?}) → marks resolved, optionally links to adjustment JE
- `commands/create-combination-rule.ts` — createCombinationRule(ctx, input)
- `commands/update-combination-rule.ts` — updateCombinationRule(ctx, input)
- `commands/post-prior-period-adjustment.ts` — postPriorPeriodAdjustment(ctx, input) → validates target period is locked, posts entry with is_prior_period_adjustment=true, routes through approval if rules exist

**Queries (11):**

- `queries/list-pending-approvals.ts` — cursor-paginated pending approval requests
- `queries/get-approval-history.ts` — all approvals for an entry
- `queries/list-approval-rules.ts` — tenant's active rules
- `queries/list-reconciliations.ts` — with status/period/account filters
- `queries/get-reconciliation.ts` — single rec with items
- `queries/get-reconciliation-dashboard.ts` — all accounts with red/yellow/green status indicators
- `queries/list-combination-rules.ts` — tenant's active combination rules
- `queries/validate-combination.ts` — dry-run validation against rules
- `queries/list-prior-period-adjustments.ts` — prior period entries with original_period_date
- `queries/get-prior-period-impact.ts` — shows how P&L/BS changed for affected period
- `queries/get-approval-stats.ts` — pending count, avg approval time, rejection rate

**Helpers (2):**

- `helpers/check-approval-rules.ts` — checkApprovalRules(tx, tenantId, entry) → returns matching rule or null
- `helpers/validate-combinations.ts` — validateCombinations(tx, tenantId, lines) → throws CombinationRuleViolation

**Modified files:**

- `commands/post-journal-entry.ts` — after validateJournal, call checkApprovalRules. If rule matches and entry is manual (not forcePost), create entry with status='pending_approval' + insert gl_approval_requests row. Add pending_approval to allowed statuses.
- `helpers/validate-journal.ts` — after balance check, call validateCombinations(tx, tenantId, lines)
- `validation.ts` — add ~20 Zod schemas for all new inputs
- `index.ts` — add all new exports
- `errors.ts` — add ApprovalRequiredError, CombinationRuleViolation, ReconciliationNotCompleteError

### API Routes (`apps/web/src/app/api/v1/accounting/`)

- `approval-rules/route.ts` — GET (list), POST (create)
- `approval-rules/[id]/route.ts` — PATCH (update), DELETE (deactivate)
- `approvals/route.ts` — GET (list pending)
- `approvals/[id]/approve/route.ts` — POST
- `approvals/[id]/reject/route.ts` — POST
- `reconciliations/route.ts` — GET (list), POST (start)
- `reconciliations/[id]/route.ts` — GET (detail), PATCH (complete)
- `reconciliations/[id]/approve/route.ts` — POST
- `reconciliations/[id]/items/route.ts` — GET (list items), POST (add item)
- `reconciliations/[id]/items/[itemId]/resolve/route.ts` — POST
- `reconciliations/dashboard/route.ts` — GET (dashboard)
- `combination-rules/route.ts` — GET (list), POST (create)
- `combination-rules/[id]/route.ts` — PATCH (update)
- `prior-period-adjustments/route.ts` — GET (list), POST (create)
- `prior-period-adjustments/impact/route.ts` — GET (impact report)
- `approval-stats/route.ts` — GET

**Total: ~16 API route files**

### Frontend

**Hooks (`apps/web/src/hooks/`):**

- `use-approvals.ts` — useApprovalRules(), usePendingApprovals(), useApprovalStats(), useApprovalMutations() {createRule, approve, reject}
- `use-gl-reconciliations.ts` — useReconciliations(filters), useReconciliation(id), useReconciliationDashboard(), useReconciliationMutations() {start, complete, approve, addItem, resolveItem}
- `use-combination-rules.ts` — useCombinationRules(), useCombinationMutations() {create, update, toggle}
- `use-prior-period.ts` — usePriorPeriodAdjustments(filters), usePriorPeriodImpact(params), usePriorPeriodMutations() {post}

**Pages (`apps/web/src/app/(dashboard)/accounting/`):**

- `approvals/page.tsx` — thin wrapper
- `approvals/approvals-content.tsx` — pending approvals list with approve/reject actions, approval rules management tab, history tab
- `reconciliations/page.tsx` — thin wrapper
- `reconciliations/reconciliations-content.tsx` — dashboard view (all accounts red/yellow/green), click into account → reconciliation workspace with items list, add item form, complete/approve buttons
- `reconciliations/[id]/page.tsx` — thin wrapper
- `reconciliations/[id]/reconciliation-detail-content.tsx` — single reconciliation workspace

**Components (`apps/web/src/components/accounting/`):**

- `approval-badge.tsx` — status badge (pending=yellow, approved=green, rejected=red)
- `approval-action-buttons.tsx` — approve/reject with notes modal
- `approval-rules-manager.tsx` — CRUD table for rules with inline editing
- `reconciliation-status-card.tsx` — account card with balance, variance, status indicator
- `reconciliation-dashboard-grid.tsx` — grid of status cards grouped by account type
- `reconciliation-item-row.tsx` — single item with resolve toggle
- `reconciliation-workspace.tsx` — main rec editing area: GL balance, subledger balance, variance, items list, action buttons
- `combination-rules-table.tsx` — rules CRUD with toggle
- `prior-period-dialog.tsx` — portal-based dialog for posting prior period adjustment (date picker, reason, AccountPicker for accounts)

**Navigation updates (`apps/web/src/lib/`):**

- `navigation.ts` — add "Approvals" child under Accounting (icon: CheckSquare), add "Reconciliations" child (icon: ClipboardCheck)
- `accounting-navigation.ts` — add "Approvals" tab under GL section, add "Reconciliation" tab under Period Close section, add "Combination Rules" tab under GL section

---

## SESSION 2: Fixed Assets + Breakage Automation

**Features:** #1 Fixed Asset Module, #12 Breakage Income Posting Automation

### Migration 0187 (`0187_fixed_assets_and_breakage.sql`)

**New tables (4):**

- **fixed_asset_classes** — (id, tenant_id, name, default_useful_life_months INT, default_depreciation_method TEXT [straight_line|declining_balance|sum_of_years|units_of_production], default_gl_account_id FK, default_acc_dep_account_id FK, default_expense_account_id FK, created_at, updated_at) — UNIQUE(tenant_id, name)
- **fixed_assets** — (id, tenant_id, asset_name, asset_number, asset_class_id FK, acquisition_date DATE, acquisition_cost NUMERIC(12,2), salvage_value NUMERIC(12,2) DEFAULT 0, useful_life_months INT, depreciation_method TEXT, gl_account_id FK, accumulated_depreciation_account_id FK, expense_account_id FK, status TEXT [active|disposed|fully_depreciated], disposal_date, disposal_amount NUMERIC(12,2), disposal_gain_loss_account_id FK, location_id, serial_number, description, metadata JSONB, created_at, updated_at) — UNIQUE(tenant_id, asset_number)
- **fixed_asset_depreciation_schedule** — (id, tenant_id, fixed_asset_id FK, period_date DATE, depreciation_amount NUMERIC(12,2), accumulated_depreciation NUMERIC(12,2), book_value NUMERIC(12,2), journal_entry_id FK nullable, status TEXT [scheduled|posted|skipped], created_at)
- **breakage_income_postings** — (id, tenant_id, voucher_id, expiration_date DATE, original_amount NUMERIC(12,2), breakage_amount NUMERIC(12,2), journal_entry_id FK nullable, posted_at, created_at) — UNIQUE(tenant_id, voucher_id)

### Backend

**Commands (9):**

- `commands/create-asset-class.ts` — createAssetClass(ctx, input)
- `commands/update-asset-class.ts` — updateAssetClass(ctx, input)
- `commands/create-fixed-asset.ts` — createFixedAsset(ctx, input) → validates GL accounts, inserts asset, optionally posts acquisition JE (Dr Asset Cr Cash/AP)
- `commands/update-fixed-asset.ts` — updateFixedAsset(ctx, input) → non-financial fields only (name, serial, location, class)
- `commands/calculate-depreciation.ts` — calculateDepreciation(ctx, {assetId}) → generates full schedule from acquisition to end-of-life, inserts schedule rows with status='scheduled'
- `commands/post-depreciation.ts` — postDepreciation(ctx, {periodDate, assetIds?}) → batch post: for each scheduled row at periodDate, posts GL (Dr Depreciation Expense Cr Accumulated Depreciation), marks row as 'posted'. Idempotent via sourceReferenceId = depreciation-{assetId}-{periodDate}
- `commands/dispose-fixed-asset.ts` — disposeFixedAsset(ctx, {assetId, disposalDate, disposalAmount}) → computes gain/loss = disposalAmount - bookValue, posts GL (Dr Cash + Dr Accumulated Dep Cr Asset + Cr/Dr Gain/Loss), marks asset as 'disposed'
- `commands/post-breakage-income.ts` — postBreakageIncome(ctx, {voucherId, breakageAmount}) → posts GL (Dr Deferred Revenue Cr Breakage Income), inserts breakage_income_postings row. Idempotent via UNIQUE(tenant_id, voucher_id)
- `commands/run-breakage-recognition.ts` — runBreakageRecognition(ctx, {asOfDate}) → batch: finds vouchers past expiry threshold, calls postBreakageIncome for each

**Queries (8):**

- `queries/list-fixed-assets.ts` — cursor pagination, filters: status, classId, locationId
- `queries/get-fixed-asset.ts` — single asset with schedule summary (total depreciated, book value, next scheduled)
- `queries/get-asset-register.ts` — full register: all assets with acquisition cost, accumulated dep, book value, status
- `queries/get-depreciation-schedule.ts` — schedule for one asset
- `queries/get-depreciation-forecast.ts` — upcoming depreciation across all assets for N months
- `queries/get-asset-summary-by-class.ts` — totals grouped by asset class
- `queries/list-breakage-postings.ts` — cursor pagination
- `queries/get-breakage-summary.ts` — total breakage recognized, pending, by period

**Helper (1):**

- `helpers/depreciation-calculator.ts` — pure math functions: calculateStraightLine(), calculateDecliningBalance(), calculateSumOfYears(), calculateUnitsOfProduction(). Each returns monthly amount given cost, salvage, useful life, current period.

### API Routes (~14 files)

- `fixed-assets/route.ts` — GET (list), POST (create)
- `fixed-assets/[id]/route.ts` — GET (detail), PATCH (update)
- `fixed-assets/[id]/dispose/route.ts` — POST
- `fixed-assets/[id]/schedule/route.ts` — GET (schedule), POST (calculate)
- `fixed-assets/depreciation/post/route.ts` — POST (batch post for period)
- `fixed-assets/register/route.ts` — GET (asset register)
- `fixed-assets/forecast/route.ts` — GET (depreciation forecast)
- `fixed-assets/summary/route.ts` — GET (by class)
- `asset-classes/route.ts` — GET (list), POST (create)
- `asset-classes/[id]/route.ts` — PATCH (update)
- `breakage/route.ts` — GET (list postings)
- `breakage/recognize/route.ts` — POST (run batch recognition)
- `breakage/summary/route.ts` — GET (summary)

### Frontend

**Hooks:**

- `use-fixed-assets.ts` — useFixedAssets(filters), useFixedAsset(id), useAssetRegister(), useDepreciationSchedule(assetId), useDepreciationForecast(months), useAssetSummaryByClass(), useFixedAssetMutations() {createClass, updateClass, createAsset, updateAsset, calculateDepreciation, postDepreciation, disposeAsset}
- `use-breakage.ts` — useBreakagePostings(filters), useBreakageSummary(), useBreakageMutations() {runRecognition}

**Pages:**

- `fixed-assets/page.tsx` + `fixed-assets-content.tsx` — 3-tab layout: Asset Register (data table with all assets, status badges, book value), Depreciation (forecast chart + post button for current period), Asset Classes (CRUD table)
- `fixed-assets/[id]/page.tsx` + `asset-detail-content.tsx` — asset detail: header card (name, number, class, acquisition info), depreciation schedule table, disposal section

**Components:**

- `asset-register-table.tsx` — sortable/filterable data table with columns: asset#, name, class, acquisition date, cost, accumulated dep, book value, status
- `depreciation-schedule-table.tsx` — period, amount, accumulated, book value, status badge (scheduled/posted)
- `depreciation-forecast-chart.tsx` — Recharts bar chart: monthly depreciation expense for next 12 months
- `asset-form-dialog.tsx` — portal dialog for create/edit asset with AccountPicker for GL accounts
- `asset-class-form-dialog.tsx` — portal dialog for create/edit class
- `dispose-asset-dialog.tsx` — portal dialog: disposal date, proceeds amount, shows computed gain/loss
- `post-depreciation-dialog.tsx` — confirm dialog: period selector, shows assets to be posted, total amount
- `breakage-summary-card.tsx` — KPI card: recognized, pending, trend
- `breakage-run-dialog.tsx` — confirm dialog for batch recognition

**Navigation:**

- Add "Fixed Assets" child under Accounting sidebar (icon: Package)
- Add "Breakage" tab under Revenue & Cost section in `accounting-navigation.ts`

---

## SESSION 3: Budget vs. Actual + Payroll GL

**Features:** #2 Budget vs. Actual, #5 Payroll GL Integration

### Migration 0188 (`0188_budgets_and_payroll.sql`)

**New tables (5):**

- **gl_budgets** — (id, tenant_id, name, fiscal_year INT, budget_type TEXT [annual|quarterly|monthly], status TEXT [draft|approved|active|closed], approved_by, approved_at, notes, created_by, created_at, updated_at) — UNIQUE(tenant_id, name, fiscal_year)
- **gl_budget_lines** — (id, tenant_id, budget_id FK, account_id FK, location_id, profit_center_id, period TEXT 'YYYY-MM', amount NUMERIC(12,2), notes, created_at, updated_at) — UNIQUE(budget_id, account_id, COALESCE(location_id,''), COALESCE(profit_center_id,''), period)
- **payroll_gl_mappings** — (id, tenant_id, category_key TEXT, gl_account_id FK, description, created_at, updated_at) — UNIQUE(tenant_id, category_key)
- **payroll_runs** — (id, tenant_id, pay_period_start DATE, pay_period_end DATE, run_date DATE, status TEXT [draft|calculated|approved|posted|voided], total_gross NUMERIC(12,2), total_net NUMERIC(12,2), total_employer_taxes NUMERIC(12,2), total_deductions NUMERIC(12,2), employee_count INT, journal_entry_id FK nullable, approved_by, approved_at, created_by, created_at, updated_at)
- **payroll_run_lines** — (id, tenant_id, payroll_run_id FK, employee_id, employee_name, department, gross_pay NUMERIC(12,2), net_pay NUMERIC(12,2), federal_tax NUMERIC(12,2), state_tax NUMERIC(12,2), social_security NUMERIC(12,2), medicare NUMERIC(12,2), other_deductions NUMERIC(12,2), employer_social_security NUMERIC(12,2), employer_medicare NUMERIC(12,2), employer_futa NUMERIC(12,2), employer_suta NUMERIC(12,2), created_at)

### Backend

**Budget commands (6):** createBudget, updateBudget, approveBudget, closeBudget, importBudgetFromCsv, manageBudgetLines (add/update/delete in one file)

**Budget queries (5):** listBudgets, getBudget, getBudgetSummary, getBudgetVariance (joins budget_lines with GL actuals per account/period, computes $ and % variance), getVarianceReport (formatted for export)

**Payroll commands (7):** createPayrollRun, addPayrollLines, calculatePayrollRun (sums all lines into run totals), approvePayrollRun, postPayrollRun (builds balanced JE: Dr Gross Pay Expense / Cr Fed Tax Payable + Cr State Tax Payable + Cr FICA Payable + Cr Net Pay Clearing + Cr Other Deductions; Dr Employer Tax Expenses / Cr Employer FICA/FUTA/SUTA Payable), voidPayrollRun (void JE + set status=voided), savePayrollGlMapping

**Payroll queries (5):** listPayrollRuns, getPayrollRun (with lines), getPayrollGlReconciliation (clearing account must net $0), getPayrollSummary (YTD totals by category), listPayrollGlMappings

### API Routes (~16 files)

- `budgets/route.ts`, `budgets/[id]/route.ts`, `budgets/[id]/approve/route.ts`, `budgets/[id]/close/route.ts`, `budgets/[id]/lines/route.ts`, `budgets/import/route.ts`, `budgets/variance/route.ts`, `budgets/variance/export/route.ts`
- `payroll/runs/route.ts`, `payroll/runs/[id]/route.ts`, `payroll/runs/[id]/lines/route.ts`, `payroll/runs/[id]/calculate/route.ts`, `payroll/runs/[id]/approve/route.ts`, `payroll/runs/[id]/post/route.ts`, `payroll/runs/[id]/void/route.ts`, `payroll/mappings/route.ts`

### Frontend

**Hooks:**

- `use-budgets.ts` — useBudgets(filters), useBudget(id), useBudgetVariance(params), useBudgetMutations()
- `use-payroll.ts` — usePayrollRuns(filters), usePayrollRun(id), usePayrollGlReconciliation(), usePayrollMappings(), usePayrollMutations()

**Pages:**

- `budgets/page.tsx` + `budgets-content.tsx` — 3-tab: Budget List (CRUD table, status badges, approve button), Variance Report (table: account, budget, actual, $var, %var with red/green coloring), Import (CSV upload wizard)
- `budgets/[id]/page.tsx` + `budget-detail-content.tsx` — budget detail: header (name, year, status), line items editor (account picker, period selector, amount input), save/approve actions
- `payroll/page.tsx` + `payroll-content.tsx` — 2-tab: Payroll Runs (list with status, employee count, totals), GL Mappings (category→account mapping table with AccountPicker)
- `payroll/[id]/page.tsx` + `payroll-detail-content.tsx` — run detail: header (period, status, totals summary), employee lines table (editable for draft), calculate/approve/post action bar, GL preview section

**Components:**

- `budget-line-editor.tsx` — inline editable grid: account picker, 12 month columns, row totals
- `variance-table.tsx` — data table with budget/actual/variance columns, conditional red/green formatting, drill-down to GL detail
- `variance-chart.tsx` — Recharts grouped bar chart (budget vs actual by account or period)
- `budget-import-wizard.tsx` — 3-step: upload CSV, map columns, preview & confirm
- `payroll-line-form.tsx` — employee line entry form with all tax fields
- `payroll-gl-preview.tsx` — read-only journal entry preview before posting
- `payroll-mapping-row.tsx` — single mapping row: category label + AccountPicker
- `payroll-summary-cards.tsx` — KPI cards: total gross, total net, total taxes, employee count

**Navigation:**

- Add "Budgets" child under Accounting sidebar (icon: Target)
- Add "Payroll" child under Accounting sidebar (icon: Users)
- Add "Variance" tab under Financials section

---

## SESSION 4: Revenue Recognition + Lease Accounting

**Features:** #7 Revenue Recognition Engine (ASC 606), #8 Lease Accounting (ASC 842)

### Migration 0189 (`0189_revenue_recognition_and_leases.sql`)

**New tables (5):**

- **revenue_contracts** — (id, tenant_id, customer_id, contract_number, start_date, end_date, total_contract_value NUMERIC(12,2), status TEXT [draft|active|completed|cancelled], created_by, created_at, updated_at) — UNIQUE(tenant_id, contract_number)
- **revenue_performance_obligations** — (id, tenant_id, contract_id FK, description, standalone_sell_price NUMERIC(12,2), allocated_price NUMERIC(12,2) DEFAULT 0, satisfaction_type TEXT [point_in_time|over_time], satisfaction_date, percent_complete NUMERIC(5,2) DEFAULT 0, revenue_account_id FK, deferred_revenue_account_id FK, created_at, updated_at)
- **revenue_recognition_schedules** — (id, tenant_id, obligation_id FK, period_date DATE, recognized_amount NUMERIC(12,2), cumulative_recognized NUMERIC(12,2), journal_entry_id FK nullable, status TEXT [scheduled|posted], created_at)
- **leases** — (id, tenant_id, lease_number, lessor, description, lease_type TEXT [operating|finance], start_date, end_date, monthly_payment NUMERIC(12,2), annual_escalation NUMERIC(5,4) DEFAULT 0, discount_rate NUMERIC(5,4), rou_asset_account_id FK, lease_liability_account_id FK, interest_expense_account_id FK, depreciation_expense_account_id FK, status TEXT [active|expired|terminated], created_at, updated_at) — UNIQUE(tenant_id, lease_number)
- **lease_amortization_schedule** — (id, tenant_id, lease_id FK, period_date DATE, payment_amount NUMERIC(12,2), interest_portion NUMERIC(12,2), principal_portion NUMERIC(12,2), rou_depreciation NUMERIC(12,2), beginning_liability NUMERIC(12,2), ending_liability NUMERIC(12,2), beginning_rou_asset NUMERIC(12,2), ending_rou_asset NUMERIC(12,2), journal_entry_id FK nullable, status TEXT [scheduled|posted], created_at)

### Backend

**RevRec commands (6):** createRevenueContract, addPerformanceObligation, allocateTransactionPrice (distributes contract value proportional to standalone selling prices), generateRecognitionSchedule (creates monthly rows based on satisfaction type), postRevenueRecognition (batch post for period: Dr Deferred Revenue Cr Revenue), updatePercentComplete (for over-time obligations)

**RevRec queries (4):** listRevenueContracts, getRevenueContract (with obligations + schedules), getDeferredRevenueReport (total deferred by period), getRecognitionForecast (upcoming recognition amounts)

**Lease commands (5):** createLease, calculateLeaseSchedule (PV of payments at discount rate → generates full amortization), postLeasePayment (for period: Dr Interest Expense + Dr Lease Liability Cr Cash; Dr Depreciation Expense Cr ROU Asset), terminateLease (early termination GL), modifyLease (recalculate schedule with new terms)

**Lease queries (5):** listLeases, getLease (with schedule), getLeaseSchedule, getRouAssetSummary (total ROU assets on balance sheet), getLeaseLiabilitySummary (current + long-term liability split)

**Helpers (2):**

- `helpers/revenue-allocation.ts` — allocateBySSP(obligations) → distributes contract value proportionally to standalone selling prices, with remainder distribution for rounding
- `helpers/lease-calculator.ts` — calculatePresentValue(payments, rate), buildAmortizationSchedule(lease), calculateRouDepreciation(cost, term)

### API Routes (~14 files)

- `revenue-contracts/route.ts`, `revenue-contracts/[id]/route.ts`, `revenue-contracts/[id]/obligations/route.ts`, `revenue-contracts/[id]/allocate/route.ts`, `revenue-contracts/[id]/schedule/route.ts`, `revenue-recognition/post/route.ts`, `revenue-recognition/deferred/route.ts`, `revenue-recognition/forecast/route.ts`
- `leases/route.ts`, `leases/[id]/route.ts`, `leases/[id]/schedule/route.ts`, `leases/[id]/post-payment/route.ts`, `leases/[id]/terminate/route.ts`, `leases/summary/route.ts`

### Frontend

**Hooks:**

- `use-revenue-contracts.ts` — useRevenueContracts(filters), useRevenueContract(id), useDeferredRevenueReport(params), useRecognitionForecast(months), useRevRecMutations()
- `use-leases.ts` — useLeases(filters), useLease(id), useLeaseSchedule(leaseId), useRouAssetSummary(), useLeaseLiabilitySummary(), useLeaseMutations()

**Pages:**

- `revenue-recognition/page.tsx` + `revenue-recognition-content.tsx` — 3-tab: Contracts (list with status, value, completion), Deferred Revenue (report with period breakdown chart), Recognition Forecast (upcoming recognition amounts chart)
- `revenue-recognition/[id]/page.tsx` + `contract-detail-content.tsx` — contract detail: header, obligations table (with SSP, allocated price, satisfaction type, % complete), recognition schedule table, allocate/generate/post action buttons
- `leases/page.tsx` + `leases-content.tsx` — 2-tab: Lease Register (list with type, lessor, monthly payment, status, ROU value), Summary (ROU assets + liabilities KPI cards)
- `leases/[id]/page.tsx` + `lease-detail-content.tsx` — lease detail: header card (type, terms, rates), amortization schedule table (payment, interest, principal, ROU dep, balances), post payment button

**Components:**

- `contract-form-dialog.tsx` — create/edit contract with customer picker, dates, value
- `obligation-form-dialog.tsx` — add obligation: description, SSP, satisfaction type, GL account pickers
- `recognition-schedule-table.tsx` — period, amount, cumulative, status, actions
- `deferred-revenue-chart.tsx` — Recharts stacked area chart: deferred balance over time
- `lease-form-dialog.tsx` — create lease: all fields including rates, GL account pickers
- `amortization-schedule-table.tsx` — full schedule with payment/interest/principal/dep/balance columns
- `lease-summary-cards.tsx` — KPI: total ROU assets, current liability, long-term liability, monthly expense
- `percent-complete-editor.tsx` — inline slider/input for updating % complete on over-time obligations

**Navigation:**

- Add "Revenue Recognition" child under Accounting sidebar (icon: TrendingUp)
- Add "Leases" child under Accounting sidebar (icon: Building)
- Add tabs to Revenue & Cost section in `accounting-navigation.ts`

---

## SESSION 5: Intercompany + Multi-Currency

**Features:** #6 Intercompany/Consolidation, #9 Multi-Currency Implementation

### Migration 0190 (`0190_intercompany_and_multicurrency.sql`)

**New tables (4):**

- **currency_exchange_rates** — (id, tenant_id, from_currency CHAR(3), to_currency CHAR(3), effective_date DATE, rate NUMERIC(12,6), source TEXT [manual|api], created_by, created_at) — UNIQUE(tenant_id, from_currency, to_currency, effective_date)
- **ic_entities** — (id, tenant_id, entity_name, entity_code, currency_code CHAR(3) DEFAULT 'USD', parent_entity_id TEXT self-FK, is_elimination_entity BOOLEAN DEFAULT false, created_at, updated_at) — UNIQUE(tenant_id, entity_code)
- **ic_transactions** — (id, tenant_id, from_entity_id FK, to_entity_id FK, transaction_date DATE, amount NUMERIC(12,2), currency_code CHAR(3) DEFAULT 'USD', description, status TEXT [pending|confirmed|eliminated], journal_entry_id FK nullable, counterpart_journal_entry_id FK nullable, created_at, updated_at)
- **ic_elimination_rules** — (id, tenant_id, rule_type TEXT [revenue_expense|receivable_payable|investment_equity], from_account_id FK, to_account_id FK, elimination_account_id FK, created_at, updated_at)

**ALTER TABLE:**

- `accounting_settings` ADD: `default_fx_gain_loss_account_id TEXT`, `default_fx_unrealized_gain_loss_account_id TEXT`

### Backend

**Multi-currency commands (3):** saveExchangeRate, revalueForeignCurrencyAccounts (month-end: recalculate foreign-denominated GL balances at closing rate, post unrealized gain/loss), postFxGainLoss (realized gain/loss on settlement)

**Multi-currency queries (4):** getExchangeRate (effective rate for date), listExchangeRates, getFxExposureReport (balances by currency), getUnrealizedFxGainLoss

**IC commands (4):** createIcTransaction (creates JE on sender side: Dr IC Receivable Cr Revenue/Expense), confirmIcTransaction (creates counterpart JE on receiver: Dr Expense/Asset Cr IC Payable), runConsolidationElimination (matches IC transactions, creates elimination JEs per rules), createEliminationRule

**IC queries (4):** listIcTransactions, getConsolidationReport (entity-by-entity + eliminations + consolidated), getIcBalances (net IC receivable/payable per entity pair), listEliminationRules

**Helper (1):**

- `helpers/currency-converter.ts` — convertAmount(amount, fromCurrency, toCurrency, date, tx) → resolves rate, converts, returns {convertedAmount, rate}

**Modified files:**

- `commands/post-journal-entry.ts` — when transactionCurrency != baseCurrency, call convertAmount for each line, store both original and converted amounts. The columns already exist from migration 0121.
- `helpers/validate-journal.ts` — balance check uses converted amounts when exchange rate present

### API Routes (~12 files)

- `exchange-rates/route.ts`, `exchange-rates/[id]/route.ts`
- `fx/revalue/route.ts`, `fx/exposure/route.ts`, `fx/unrealized/route.ts`
- `intercompany/entities/route.ts`, `intercompany/entities/[id]/route.ts`
- `intercompany/transactions/route.ts`, `intercompany/transactions/[id]/confirm/route.ts`
- `intercompany/elimination-rules/route.ts`
- `intercompany/consolidation/route.ts`, `intercompany/consolidation/run/route.ts`

### Frontend

**Hooks:**

- `use-exchange-rates.ts` — useExchangeRates(filters), useExchangeRateMutations(), useFxExposure(), useUnrealizedFxGainLoss()
- `use-intercompany.ts` — useIcEntities(), useIcTransactions(filters), useConsolidationReport(), useIcBalances(), useEliminationRules(), useIcMutations()

**Pages:**

- `multi-currency/page.tsx` + `multi-currency-content.tsx` — 3-tab: Exchange Rates (rate table with date, from/to, rate, manual entry form), FX Exposure (balances by currency table + chart), Revaluation (run revaluation button, history of reval entries)
- `intercompany/page.tsx` + `intercompany-content.tsx` — 4-tab: Entities (hierarchy tree with CRUD), Transactions (list with status, confirm action), Elimination Rules (CRUD table), Consolidation (run button, report view with entity columns + eliminations + consolidated)

**Components:**

- `exchange-rate-form.tsx` — from/to currency selects, date, rate input
- `fx-exposure-chart.tsx` — Recharts bar chart by currency
- `entity-hierarchy-tree.tsx` — collapsible tree of IC entities with add/edit actions
- `ic-transaction-form.tsx` — from/to entity pickers, amount, currency, description
- `consolidation-report-table.tsx` — multi-column table: one column per entity + eliminations + consolidated total
- `elimination-rule-form.tsx` — rule type select, account pickers for from/to/elimination

**Navigation:**

- Add "Multi-Currency" tab under Banking section
- Add "Intercompany" child under Accounting sidebar (icon: ArrowLeftRight)

---

## SESSION 6: Segment P&L + Outstanding Checks + Policies

**Features:** #11 Segment P&L by Profit Center, #15 Outstanding Check Detection, #13 Accounting Policy Documentation

### Migration 0191 (`0191_segments_checks_policies.sql`)

**New tables (1):**

- **accounting_policies** — (id, tenant_id, policy_name, category TEXT [revenue_recognition|inventory_valuation|depreciation|lease_classification|fx_translation|impairment|contingencies|subsequent_events], policy_text TEXT, effective_date DATE, approved_by, approved_at, superseded_by TEXT nullable, is_active BOOLEAN DEFAULT true, created_at, updated_at)

**ALTER TABLE:**

- `bank_reconciliation_items` ADD: `check_number TEXT`, `check_date DATE`, `payee TEXT`, `is_outstanding BOOLEAN DEFAULT false`

### Backend

**Segment queries (3):** getSegmentProfitAndLoss (reuses P&L logic with profitCenterId filter on gl_journal_lines), getSegmentComparison (side-by-side P&L for N profit centers), getSegmentBalanceSheet (assets/liabilities/equity by profit center)

**Outstanding check commands (3):** markCheckCleared, markCheckOutstanding, voidOutstandingCheck (voids the AP payment + GL reversal)

**Outstanding check queries (3):** listOutstandingChecks, getOutstandingCheckSummary (total by age bucket), getCheckRegister (all checks with cleared/outstanding status)

**Policy commands (3):** createPolicy, updatePolicy, supersedePolicy (deactivates old, links superseded_by)

**Policy queries (3):** listPolicies, getPolicy, getActivePoliciesByCategory

**Modified:** startBankReconciliation — after populating GL lines, query AP payment GL lines for the bank account that reference check payments, mark them as outstanding with check_number/date/payee from AP payment record

### API Routes (~10 files)

- `segments/profit-and-loss/route.ts`, `segments/comparison/route.ts`, `segments/balance-sheet/route.ts`
- `outstanding-checks/route.ts`, `outstanding-checks/[id]/clear/route.ts`, `outstanding-checks/[id]/void/route.ts`, `outstanding-checks/summary/route.ts`
- `policies/route.ts`, `policies/[id]/route.ts`, `policies/[id]/supersede/route.ts`

### Frontend

**Hooks:**

- `use-segments.ts` — useSegmentPnL(profitCenterId, params), useSegmentComparison(profitCenterIds, params), useSegmentBalanceSheet(profitCenterId, params)
- `use-outstanding-checks.ts` — useOutstandingChecks(filters), useCheckSummary(), useCheckRegister(), useCheckMutations()
- `use-accounting-policies.ts` — usePolicies(filters), usePolicy(id), useActivePolicies(category), usePolicyMutations()

**Pages:**

- `segments/page.tsx` + `segments-content.tsx` — 2-tab: Segment P&L (profit center selector dropdown, full P&L below filtered by segment, comparison mode toggle to show 2+ segments side-by-side), Segment Balance Sheet (same with BS)
- (Outstanding checks: added as new tab on existing banking page)
- `policies/page.tsx` + `policies-content.tsx` — policy list with category filter, create/edit dialog, supersede action, active/inactive toggle

**Components:**

- `segment-pnl-table.tsx` — standard P&L table with profit center column header
- `segment-comparison-table.tsx` — multi-column P&L: one column per profit center + total
- `profit-center-selector.tsx` — dropdown with multi-select for comparison mode
- `outstanding-checks-table.tsx` — data table: check#, date, payee, amount, age days, clear/void actions
- `check-age-summary.tsx` — KPI cards: 0-30 days, 31-60, 61-90, 90+ with total amounts
- `policy-form-dialog.tsx` — create/edit: name, category select, rich text editor for policy text, effective date
- `policy-card.tsx` — policy display card with category badge, effective date, approved by

**Navigation:**

- Add "Segments" tab under Financials section
- Add "Outstanding Checks" tab under Banking section
- Add "Policies" child under Accounting sidebar (icon: FileText)

---

## SESSION 7: Schema Files + Tests + Bootstrap + Close Checklist

**Features:** Drizzle ORM schema definitions, test suite, COA template updates, close checklist extensions, permission seeds, navigation final wiring

### Migration 0192 (`0192_accounting_features_templates.sql`)

**Seed data only** — new COA template accounts for all 4 business types:

- Fixed Assets (15000), Accumulated Depreciation (15500), Depreciation Expense (68000), Gain/Loss on Disposal (89000)
- Salaries & Wages (61000), Federal Tax Payable (21500), State Tax Payable (21600), FICA Payable (21700), Net Pay Clearing (21800), Employer Payroll Tax Expense (61500)
- FX Gain/Loss (89500), Unrealized FX Gain/Loss (89600)
- Deferred Revenue (23000), Right-of-Use Assets (16000), Lease Liability (24000)
- Breakage Income (49200)

### Drizzle Schema Files (`packages/db/src/schema/`)

- `fixed-assets.ts` — fixedAssetClasses, fixedAssets, fixedAssetDepreciationSchedule (3 tables)
- `budgets.ts` — glBudgets, glBudgetLines (2 tables)
- `payroll.ts` — payrollRuns, payrollRunLines, payrollGlMappings (3 tables)
- `revenue-recognition.ts` — revenueContracts, revenuePerformanceObligations, revenueRecognitionSchedules (3 tables)
- `leases.ts` — leases, leaseAmortizationSchedule (2 tables)
- `intercompany.ts` — icEntities, icTransactions, icEliminationRules (3 tables)
- `exchange-rates.ts` — currencyExchangeRates (1 table)
- `gl-audit.ts` — glApprovalRules, glApprovalRequests, glReconciliations, glReconciliationItems, glCombinationRules, accountingPolicies, breakageIncomePostings (7 tables)

**Modified:** `packages/db/src/schema/index.ts` — add 8 new exports, `packages/db/src/schema/accounting.ts` — add 4 columns to glJournalEntries

### Tests (`packages/modules/accounting/src/tests/`)

| Test File | Est. Lines | Coverage |
|-----------|-----------|----------|
| `approval-workflow.test.ts` | ~200 | rule matching, SOD enforcement, pending→approved→posted flow, rejection, expiry |
| `gl-reconciliation.test.ts` | ~150 | start/complete/approve lifecycle, variance calculation, item resolution |
| `combination-rules.test.ts` | ~100 | required pair, forbidden pair, validation integration |
| `prior-period.test.ts` | ~100 | locked period bypass, adjustment flags, impact calculation |
| `fixed-assets.test.ts` | ~250 | all 4 depreciation methods, disposal gain/loss, schedule generation, batch posting |
| `breakage-automation.test.ts` | ~100 | single + batch recognition, idempotency |
| `budget-variance.test.ts` | ~150 | budget CRUD, variance calculation ($ and %), CSV import |
| `payroll-gl.test.ts` | ~200 | run lifecycle, GL posting balance validation, clearing account reconciliation, void |
| `revenue-recognition.test.ts` | ~200 | SSP allocation, schedule generation, over-time % complete, GL posting |
| `lease-accounting.test.ts` | ~200 | PV calculation, amortization schedule, payment posting, termination |
| `intercompany.test.ts` | ~150 | IC transaction lifecycle, elimination rules, consolidation report |
| `multi-currency.test.ts` | ~150 | exchange rate resolution, conversion, FX revaluation, GL posting with currency |
| `segment-pnl.test.ts` | ~100 | P&L by profit center, comparison, balance sheet segment |
| `outstanding-checks.test.ts` | ~100 | auto-detection, clear/void, summary |
| `accounting-policies.test.ts` | ~80 | CRUD, supersede, category filter |
| **Total** | **~2,230** | |

### Close Checklist Extensions

Modify `queries/get-close-checklist.ts` to add 8 new items:

1. "All GL entries approved" — count pending approvals, must be 0
2. "All control accounts reconciled" — query reconciliation dashboard, all must be 'approved'
3. "Fixed asset depreciation posted" — scheduled rows for current period must all be 'posted'
4. "Budget variance reviewed" — active budget exists and variance acknowledged
5. "Payroll clearing account at $0" — payroll clearing GL balance must be 0
6. "Revenue recognition posted" — scheduled rows for current period all 'posted'
7. "Lease payments posted" — scheduled rows for current period all 'posted'
8. "IC transactions eliminated" — no confirmed (un-eliminated) IC transactions for the period

### Bootstrap Updates

Modify `helpers/bootstrap-tenant-coa.ts`:

- Add new template accounts for fixed assets, payroll, FX, ROU, leases, breakage
- Wire new default accounts in accounting_settings (defaultFixedAssetAccountId, defaultDepreciationExpenseAccountId, etc.)

### Permission Seeds

Add new permissions to core permission seeds:

- `accounting.approvals.view`, `accounting.approvals.manage` (approve/reject)
- `accounting.reconciliations.view`, `accounting.reconciliations.manage`, `accounting.reconciliations.approve`
- `accounting.fixed_assets.view`, `accounting.fixed_assets.manage`
- `accounting.budgets.view`, `accounting.budgets.manage`, `accounting.budgets.approve`
- `accounting.payroll.view`, `accounting.payroll.manage`, `accounting.payroll.approve`
- `accounting.revenue_recognition.view`, `accounting.revenue_recognition.manage`
- `accounting.leases.view`, `accounting.leases.manage`
- `accounting.intercompany.view`, `accounting.intercompany.manage`
- `accounting.fx.view`, `accounting.fx.manage`
- `accounting.policies.view`, `accounting.policies.manage`

**Role defaults:** Owner/Manager → all *.manage, Supervisor → all *.view + reconciliations.manage, Staff/Cashier/Server → none (not accounting roles)

### Final Navigation Wiring

Complete accounting sidebar structure:

```
Accounting (Landmark)
├── Dashboard
├── General Ledger (BookOpen)
│   ├── Chart of Accounts
│   ├── Journal Entries
│   ├── GL Mappings
│   ├── Recurring Templates
│   ├── Approvals        ← NEW
│   └── Combination Rules ← NEW
├── Fixed Assets (Package) ← NEW
├── Payables (Receipt)
├── Receivables (Wallet)
├── Budgets (Target) ← NEW
├── Payroll (Users) ← NEW
├── Banking (Building2)
│   ├── Bank Reconciliation
│   ├── Deposits
│   ├── Outstanding Checks ← NEW
│   └── Multi-Currency     ← NEW
├── Revenue & Cost (DollarSign)
│   ├── Revenue Recognition ← NEW
│   ├── Leases             ← NEW
│   └── Breakage           ← NEW
├── Intercompany (ArrowLeftRight) ← NEW
├── Tax (FileBarChart)
├── Financials (Scale)
│   ├── P&L
│   ├── Balance Sheet
│   ├── Cash Flow
│   ├── Segments          ← NEW
│   └── Variance Report   ← NEW
├── Period Close (Lock)
│   ├── Close Checklist
│   └── Reconciliations   ← NEW
└── Policies (FileText) ← NEW
```

---

## Verification Plan

After each session, run:

```bash
pnpm type-check                    # TypeScript strict mode passes
pnpm test --filter @oppsera/module-accounting  # All tests pass
pnpm lint                          # ESLint clean
pnpm build                         # Full build succeeds
```

After all 7 sessions:

```bash
pnpm db:migrate                    # Run migrations 0186-0192 on local DB
pnpm test                          # Full test suite (3,500+ tests)
pnpm dev                           # Manual UI walkthrough of all 15 features
```

### Manual Verification Checklist

- [ ] Navigate to each new page from sidebar
- [ ] Create a fixed asset, calculate depreciation, post depreciation, verify GL entry
- [ ] Create a budget, add lines, run variance report against GL actuals
- [ ] Create a payroll run, add lines, calculate, approve, post, verify GL entry balances
- [ ] Create a revenue contract, add obligations, allocate price, generate schedule, post recognition
- [ ] Create a lease, calculate schedule, post payment, verify ROU/liability balances
- [ ] Create IC entities + transaction, confirm, run elimination, view consolidation report
- [ ] Save exchange rate, post multi-currency JE, run FX revaluation
- [ ] Create approval rule (>$10K), post $15K manual JE, verify it goes to pending_approval
- [ ] Start account reconciliation, add items, complete, approve (different user)
- [ ] Create combination rule, verify it blocks invalid JE
- [ ] Post prior period adjustment to locked period
- [ ] View segment P&L filtered by profit center
- [ ] Run breakage recognition for expired vouchers
- [ ] Create accounting policy, supersede it
- [ ] Start bank rec, verify outstanding checks auto-detected
- [ ] Run period close checklist, verify all 8 new items appear
