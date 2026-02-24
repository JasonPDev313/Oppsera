'use client';

import { Lock } from 'lucide-react';

export interface WorkflowConfigRowProps {
  moduleKey: string;
  workflowKey: string;
  autoMode: boolean;
  approvalRequired: boolean;
  userVisible: boolean;
  isProtected: boolean;
  isSaving: boolean;
  onToggle: (field: 'autoMode' | 'approvalRequired' | 'userVisible', value: boolean) => void;
}

const WORKFLOW_LABELS: Record<string, { name: string; description: string }> = {
  'accounting.journal_posting': { name: 'Journal Posting', description: 'Auto-post GL entries or save as draft' },
  'accounting.period_close': { name: 'Period Close', description: 'Auto-close periods or require manual checklist' },
  'accounting.bank_reconciliation': { name: 'Bank Reconciliation', description: 'Auto-match bank feeds or manual reconciliation' },
  'accounting.depreciation': { name: 'Depreciation', description: 'Auto-post monthly depreciation entries' },
  'accounting.revenue_recognition': { name: 'Revenue Recognition', description: 'Auto-schedule revenue recognition' },
  'payments.settlement_matching': { name: 'Settlement Matching', description: 'Auto-match card settlements to tenders' },
  'payments.tip_payout': { name: 'Tip Payout', description: 'Auto-calculate tip payouts' },
  'inventory.costing': { name: 'Inventory Costing', description: 'Auto-recompute inventory costs' },
  'inventory.reorder_alerts': { name: 'Reorder Alerts', description: 'Auto-generate purchase orders vs alerts only' },
  'ap.bill_approval': { name: 'Bill Approval', description: 'Auto-post bills or require approval workflow' },
  'ap.payment_approval': { name: 'Payment Approval', description: 'Auto-schedule payments or require approval' },
  'ar.invoice_posting': { name: 'Invoice Posting', description: 'Auto-post invoices or save as draft' },
  'ar.late_fee_assessment': { name: 'Late Fee Assessment', description: 'Auto-assess late fees or manual assessment' },
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
  isSaving,
  onToggle,
}: WorkflowConfigRowProps) {
  const key = `${moduleKey}.${workflowKey}`;
  const info = WORKFLOW_LABELS[key] ?? {
    name: workflowKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    description: '',
  };

  return (
    <div className="flex items-center gap-4 rounded-lg border border-gray-200 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900">{info.name}</p>
          {isProtected && (
            <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-700" title="Protected workflow — auto mode cannot be disabled for SMB">
              <Lock className="h-3 w-3" />
              Protected
            </span>
          )}
        </div>
        {info.description && (
          <p className="mt-0.5 text-xs text-gray-500">{info.description}</p>
        )}
      </div>

      <div className="flex items-center gap-6">
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs font-medium text-gray-500">Auto</span>
          <Toggle
            checked={autoMode}
            disabled={isSaving || (isProtected && autoMode)}
            onChange={(val) => onToggle('autoMode', val)}
          />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs font-medium text-gray-500">Approval</span>
          <Toggle
            checked={approvalRequired}
            disabled={isSaving}
            onChange={(val) => onToggle('approvalRequired', val)}
          />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs font-medium text-gray-500">Visible</span>
          <Toggle
            checked={userVisible}
            disabled={isSaving}
            onChange={(val) => onToggle('userVisible', val)}
          />
        </div>
      </div>
    </div>
  );
}
