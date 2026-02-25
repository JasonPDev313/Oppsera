'use client';

import { Lock, Clock } from 'lucide-react';

export interface WorkflowConfigRowProps {
  moduleKey: string;
  workflowKey: string;
  autoMode: boolean;
  approvalRequired: boolean;
  userVisible: boolean;
  isProtected: boolean;
  isComingSoon: boolean;
  isSaving: boolean;
  onToggle: (field: 'autoMode' | 'approvalRequired' | 'userVisible', value: boolean) => void;
}

const WORKFLOW_LABELS: Record<string, { name: string; description: string }> = {
  // ── Accounting ──────────────────────────────────────────────────
  'accounting.journal_posting':     { name: 'Journal Posting', description: 'Auto-post GL entries or save as draft' },
  'accounting.period_close':        { name: 'Period Close', description: 'Auto-close periods or require manual checklist' },
  'accounting.bank_reconciliation': { name: 'Bank Reconciliation', description: 'Auto-match bank feeds or manual reconciliation' },
  'accounting.depreciation':        { name: 'Depreciation', description: 'Auto-post monthly depreciation entries' },
  'accounting.revenue_recognition': { name: 'Revenue Recognition', description: 'Auto-schedule revenue recognition' },
  'accounting.year_end_close':      { name: 'Year-End Close', description: 'Auto-generate retained earnings and close fiscal year' },
  'accounting.eod_reconciliation':  { name: 'End-of-Day Reconciliation', description: 'Orchestrate full close sequence — drawers, batches, deposits, settlements, GL' },
  'accounting.intercompany':        { name: 'Intercompany Transactions', description: 'Auto-balance intercompany transfers between sites and venues' },
  'accounting.budget_variance':     { name: 'Budget vs Actual', description: 'Auto-generate variance reports comparing budget to actuals per period' },
  'accounting.dormant_accounts':    { name: 'Dormant Account Detection', description: 'Auto-flag GL accounts with no activity for a configurable period' },
  // ── Payments ────────────────────────────────────────────────────
  'payments.settlement_matching':   { name: 'Settlement Matching', description: 'Auto-match card settlements to tenders' },
  'payments.tip_payout':            { name: 'Tip Payout', description: 'Auto-calculate tip payouts' },
  'payments.refund_approval':       { name: 'Refund Approval', description: 'Require manager approval for refunds above a configurable threshold' },
  'payments.cash_variance_alert':   { name: 'Cash Variance Alerts', description: 'Auto-alert managers when cash over/short exceeds tolerance' },
  'payments.deposit_verification':  { name: 'Deposit Verification', description: 'Auto-verify deposit slip totals against expected cash from close batches' },
  'payments.chargeback_deadlines':  { name: 'Chargeback Deadlines', description: 'Auto-escalate chargebacks approaching response deadlines' },
  // ── Inventory ───────────────────────────────────────────────────
  'inventory.costing':              { name: 'Inventory Costing', description: 'Auto-recompute inventory costs' },
  'inventory.reorder_alerts':       { name: 'Reorder Alerts', description: 'Auto-generate purchase orders vs alerts only' },
  // ── Accounts Payable ────────────────────────────────────────────
  'ap.bill_approval':               { name: 'Bill Approval', description: 'Auto-post bills or require approval workflow' },
  'ap.payment_approval':            { name: 'Payment Approval', description: 'Auto-schedule payments or require approval' },
  'ap.payment_scheduling':          { name: 'Payment Scheduling', description: 'Auto-schedule vendor payments by due date with early-pay discount optimization' },
  // ── Accounts Receivable ─────────────────────────────────────────
  'ar.invoice_posting':             { name: 'Invoice Posting', description: 'Auto-post invoices or save as draft' },
  'ar.late_fee_assessment':         { name: 'Late Fee Assessment', description: 'Auto-assess late fees or manual assessment' },
  'ar.credit_hold':                 { name: 'Credit Hold Enforcement', description: 'Auto-block new orders when customer AR balance exceeds credit limit' },
  'ar.dunning':                     { name: 'Dunning & Collections', description: 'Auto-send payment reminders at aging milestones (30/60/90 days)' },
  'ar.recurring_invoices':          { name: 'Recurring Invoices', description: 'Auto-generate invoices from recurring billing templates' },
};

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-indigo-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export function WorkflowConfigRow({
  moduleKey,
  workflowKey,
  autoMode,
  approvalRequired,
  userVisible,
  isProtected,
  isComingSoon,
  isSaving,
  onToggle,
}: WorkflowConfigRowProps) {
  const key = `${moduleKey}.${workflowKey}`;
  const info = WORKFLOW_LABELS[key] ?? {
    name: workflowKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    description: '',
  };

  const disabled = isSaving || isComingSoon;

  return (
    <div className={`flex items-center gap-4 rounded-lg border px-4 py-3 ${
      isComingSoon ? 'border-gray-100 bg-gray-50/50' : 'border-gray-200'
    }`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-medium ${isComingSoon ? 'text-gray-400' : 'text-gray-900'}`}>
            {info.name}
          </p>
          {isProtected && !isComingSoon && (
            <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-700" title="Protected workflow — auto mode cannot be disabled for SMB">
              <Lock className="h-3 w-3" />
              Protected
            </span>
          )}
          {isComingSoon && (
            <span className="inline-flex items-center gap-1 rounded bg-indigo-500/10 px-1.5 py-0.5 text-xs font-medium text-indigo-600">
              <Clock className="h-3 w-3" />
              Coming Soon
            </span>
          )}
        </div>
        {info.description && (
          <p className={`mt-0.5 text-xs ${isComingSoon ? 'text-gray-400' : 'text-gray-500'}`}>
            {info.description}
          </p>
        )}
      </div>

      <div className="flex items-center gap-6">
        <div className="flex flex-col items-center gap-1">
          <span className={`text-xs font-medium ${isComingSoon ? 'text-gray-300' : 'text-gray-500'}`}>Auto</span>
          <Toggle
            checked={isComingSoon ? false : autoMode}
            disabled={disabled || (isProtected && autoMode)}
            onChange={(val) => onToggle('autoMode', val)}
          />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className={`text-xs font-medium ${isComingSoon ? 'text-gray-300' : 'text-gray-500'}`}>Approval</span>
          <Toggle
            checked={isComingSoon ? false : approvalRequired}
            disabled={disabled}
            onChange={(val) => onToggle('approvalRequired', val)}
          />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className={`text-xs font-medium ${isComingSoon ? 'text-gray-300' : 'text-gray-500'}`}>Visible</span>
          <Toggle
            checked={isComingSoon ? false : userVisible}
            disabled={disabled}
            onChange={(val) => onToggle('userVisible', val)}
          />
        </div>
      </div>
    </div>
  );
}
