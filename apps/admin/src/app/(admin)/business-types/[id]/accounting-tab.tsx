'use client';

import { useEffect, useState, useCallback } from 'react';
import { Save, Loader2, Lock, Clock } from 'lucide-react';
import { useAccountingTemplate } from '@/hooks/use-business-type-detail';

// ── Workflow registry (mirrors @oppsera/shared erp-tiers.ts) ──────

const WORKFLOW_KEYS: Record<string, string[]> = {
  accounting: [
    'journal_posting',
    'period_close',
    'bank_reconciliation',
    'depreciation',
    'revenue_recognition',
    'year_end_close',
    'eod_reconciliation',
    'intercompany',
    'budget_variance',
    'dormant_accounts',
  ],
  payments: [
    'settlement_matching',
    'tip_payout',
    'refund_approval',
    'cash_variance_alert',
    'deposit_verification',
    'chargeback_deadlines',
  ],
  inventory: [
    'costing',
    'reorder_alerts',
  ],
  ap: [
    'bill_approval',
    'payment_approval',
    'payment_scheduling',
  ],
  ar: [
    'invoice_posting',
    'late_fee_assessment',
    'credit_hold',
    'dunning',
    'recurring_invoices',
  ],
};

const MODULE_LABELS: Record<string, string> = {
  accounting: 'Accounting',
  payments: 'Payments',
  inventory: 'Inventory',
  ap: 'Accounts Payable',
  ar: 'Accounts Receivable',
};

const WORKFLOW_LABELS: Record<string, { name: string; description: string }> = {
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
  'payments.settlement_matching':   { name: 'Settlement Matching', description: 'Auto-match card settlements to tenders' },
  'payments.tip_payout':            { name: 'Tip Payout', description: 'Auto-calculate tip payouts' },
  'payments.refund_approval':       { name: 'Refund Approval', description: 'Require manager approval for refunds above a configurable threshold' },
  'payments.cash_variance_alert':   { name: 'Cash Variance Alerts', description: 'Auto-alert managers when cash over/short exceeds tolerance' },
  'payments.deposit_verification':  { name: 'Deposit Verification', description: 'Auto-verify deposit slip totals against expected cash from close batches' },
  'payments.chargeback_deadlines':  { name: 'Chargeback Deadlines', description: 'Auto-escalate chargebacks approaching response deadlines' },
  'inventory.costing':              { name: 'Inventory Costing', description: 'Auto-recompute inventory costs' },
  'inventory.reorder_alerts':       { name: 'Reorder Alerts', description: 'Auto-generate purchase orders vs alerts only' },
  'ap.bill_approval':               { name: 'Bill Approval', description: 'Auto-post bills or require approval workflow' },
  'ap.payment_approval':            { name: 'Payment Approval', description: 'Auto-schedule payments or require approval' },
  'ap.payment_scheduling':          { name: 'Payment Scheduling', description: 'Auto-schedule vendor payments by due date with early-pay discount optimization' },
  'ar.invoice_posting':             { name: 'Invoice Posting', description: 'Auto-post invoices or save as draft' },
  'ar.late_fee_assessment':         { name: 'Late Fee Assessment', description: 'Auto-assess late fees or manual assessment' },
  'ar.credit_hold':                 { name: 'Credit Hold Enforcement', description: 'Auto-block new orders when customer AR balance exceeds credit limit' },
  'ar.dunning':                     { name: 'Dunning & Collections', description: 'Auto-send payment reminders at aging milestones (30/60/90 days)' },
  'ar.recurring_invoices':          { name: 'Recurring Invoices', description: 'Auto-generate invoices from recurring billing templates' },
};

const PROTECTED_WORKFLOWS = new Set([
  'accounting.journal_posting',
  'accounting.period_close',
  'inventory.costing',
  'payments.settlement_matching',
  'ar.credit_hold',
]);

const COMING_SOON_WORKFLOWS = new Set([
  'accounting.intercompany',
  'accounting.budget_variance',
  'accounting.dormant_accounts',
  'payments.chargeback_deadlines',
  'ap.payment_scheduling',
  'ar.dunning',
  'ar.recurring_invoices',
]);

// ── Types ─────────────────────────────────────────────────────────

interface WorkflowConfig {
  autoMode: boolean;
  approvalRequired: boolean;
  userVisible: boolean;
}

type WorkflowDefaults = Record<string, WorkflowConfig>;

// ── Component ─────────────────────────────────────────────────────

export function AccountingTab({
  versionId,
  isReadOnly,
}: {
  versionId: string;
  isReadOnly: boolean;
}) {
  const { template, isLoading, isSaving, error, load, save } =
    useAccountingTemplate(versionId);

  const [workflows, setWorkflows] = useState<WorkflowDefaults>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    load();
  }, [load]);

  // Sync from loaded template
  useEffect(() => {
    if (!template) return;
    const saved = (template.workflowDefaults ?? {}) as WorkflowDefaults;
    // Merge saved with full workflow list (fill missing with defaults)
    const merged: WorkflowDefaults = {};
    for (const [moduleKey, keys] of Object.entries(WORKFLOW_KEYS)) {
      for (const wk of keys) {
        const compositeKey = `${moduleKey}.${wk}`;
        merged[compositeKey] = saved[compositeKey] ?? {
          autoMode: true,
          approvalRequired: false,
          userVisible: false,
        };
      }
    }
    setWorkflows(merged);
    setDirty(false);
  }, [template]);

  const handleToggle = useCallback(
    (compositeKey: string, field: keyof WorkflowConfig, value: boolean) => {
      if (isReadOnly) return;
      setWorkflows((prev) => {
        const cur = prev[compositeKey] ?? { autoMode: true, approvalRequired: false, userVisible: false };
        return { ...prev, [compositeKey]: { autoMode: cur.autoMode, approvalRequired: cur.approvalRequired, userVisible: cur.userVisible, [field]: value } };
      });
      setDirty(true);
    },
    [isReadOnly],
  );

  const handleSave = async () => {
    try {
      await save({
        revenueCategories: template?.revenueCategories ?? {},
        paymentGlMappings: template?.paymentGlMappings ?? {},
        taxBehavior: template?.taxBehavior ?? {},
        deferredRevenue: template?.deferredRevenue ?? {},
        cogsBehavior: template?.cogsBehavior ?? 'disabled',
        fiscalSettings: template?.fiscalSettings ?? {},
        workflowDefaults: workflows,
      });
      setDirty(false);
    } catch {
      // error is set in hook
    }
  };

  if (isLoading && !template) {
    return <div className="text-center text-slate-400 py-12">Loading workflow defaults...</div>;
  }

  if (error && !template) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-8">
      {isReadOnly && (
        <div className="text-xs text-amber-400">Read-only — create a new draft to edit</div>
      )}

      {Object.entries(WORKFLOW_KEYS).map(([moduleKey, workflowKeys]) => (
        <div key={moduleKey}>
          <h3 className="mb-3 text-sm font-semibold text-white">
            {MODULE_LABELS[moduleKey] ?? moduleKey}
          </h3>
          <div className="space-y-2">
            {workflowKeys.map((wk) => {
              const compositeKey = `${moduleKey}.${wk}`;
              const config = workflows[compositeKey] ?? {
                autoMode: true,
                approvalRequired: false,
                userVisible: false,
              };
              const comingSoon = COMING_SOON_WORKFLOWS.has(compositeKey);
              const isProtected = PROTECTED_WORKFLOWS.has(compositeKey);
              return (
                <WorkflowRow
                  key={compositeKey}
                  compositeKey={compositeKey}
                  autoMode={config.autoMode}
                  approvalRequired={config.approvalRequired}
                  userVisible={config.userVisible}
                  isProtected={isProtected}
                  isComingSoon={comingSoon}
                  disabled={isReadOnly}
                  onToggle={handleToggle}
                />
              );
            })}
          </div>
        </div>
      ))}

      {/* Save */}
      {!isReadOnly && (
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={isSaving || !dirty}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save Workflow Defaults
          </button>
        </div>
      )}
    </div>
  );
}

// ── Workflow Row ──────────────────────────────────────────────────

function WorkflowRow({
  compositeKey,
  autoMode,
  approvalRequired,
  userVisible,
  isProtected,
  isComingSoon,
  disabled,
  onToggle,
}: {
  compositeKey: string;
  autoMode: boolean;
  approvalRequired: boolean;
  userVisible: boolean;
  isProtected: boolean;
  isComingSoon: boolean;
  disabled: boolean;
  onToggle: (key: string, field: keyof WorkflowConfig, value: boolean) => void;
}) {
  const info = WORKFLOW_LABELS[compositeKey] ?? {
    name: compositeKey.split('.')[1]?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ?? compositeKey,
    description: '',
  };

  const isDisabled = disabled || isComingSoon;

  return (
    <div
      className={`flex items-center gap-4 rounded-lg border px-4 py-3 ${
        isComingSoon
          ? 'border-slate-700/50 bg-slate-800/50'
          : 'border-slate-700 bg-slate-800'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-medium ${isComingSoon ? 'text-slate-500' : 'text-white'}`}>
            {info.name}
          </p>
          {isProtected && !isComingSoon && (
            <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-500">
              <Lock className="h-3 w-3" />
              Protected
            </span>
          )}
          {isComingSoon && (
            <span className="inline-flex items-center gap-1 rounded bg-indigo-500/10 px-1.5 py-0.5 text-xs font-medium text-indigo-400">
              <Clock className="h-3 w-3" />
              Coming Soon
            </span>
          )}
        </div>
        {info.description && (
          <p className="mt-0.5 text-xs text-slate-400">{info.description}</p>
        )}
      </div>

      <div className="flex items-center gap-6">
        <ToggleColumn
          label="Auto"
          checked={isComingSoon ? false : autoMode}
          disabled={isDisabled || (isProtected && autoMode)}
          dimmed={isComingSoon}
          onChange={(val) => onToggle(compositeKey, 'autoMode', val)}
        />
        <ToggleColumn
          label="Approval"
          checked={isComingSoon ? false : approvalRequired}
          disabled={isDisabled}
          dimmed={isComingSoon}
          onChange={(val) => onToggle(compositeKey, 'approvalRequired', val)}
        />
        <ToggleColumn
          label="Visible"
          checked={isComingSoon ? false : userVisible}
          disabled={isDisabled}
          dimmed={isComingSoon}
          onChange={(val) => onToggle(compositeKey, 'userVisible', val)}
        />
      </div>
    </div>
  );
}

// ── Toggle Column ────────────────────────────────────────────────

function ToggleColumn({
  label,
  checked,
  disabled,
  dimmed,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  dimmed: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`text-xs font-medium ${dimmed ? 'text-slate-600' : 'text-slate-400'}`}>
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? 'bg-indigo-600' : 'bg-slate-600'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
