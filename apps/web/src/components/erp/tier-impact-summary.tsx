'use client';

import { CheckCircle2, Settings2, ShieldCheck, Info } from 'lucide-react';
import { TIER_WORKFLOW_DEFAULTS } from '@oppsera/shared';
import type { BusinessTier } from '@oppsera/shared';

const WORKFLOW_FRIENDLY_NAMES: Record<string, string> = {
  'accounting.journal_posting': 'Journal posting',
  'accounting.period_close': 'Period closes',
  'accounting.bank_reconciliation': 'Bank reconciliation',
  'accounting.depreciation': 'Depreciation',
  'accounting.revenue_recognition': 'Revenue recognition',
  'payments.settlement_matching': 'Card settlement matching',
  'payments.tip_payout': 'Tip payouts',
  'inventory.costing': 'Inventory costing',
  'inventory.reorder_alerts': 'Reorder alerts',
  'ap.bill_approval': 'Bill approval',
  'ap.payment_approval': 'Payment approval',
  'ar.invoice_posting': 'Invoice posting',
  'ar.late_fee_assessment': 'Late fee assessment',
};

interface GroupedWorkflows {
  automatic: string[];
  manual: string[];
  manualWithApproval: string[];
}

function groupWorkflows(tier: BusinessTier): GroupedWorkflows {
  const defaults = TIER_WORKFLOW_DEFAULTS[tier] ?? {};
  const grouped: GroupedWorkflows = { automatic: [], manual: [], manualWithApproval: [] };

  for (const [key, config] of Object.entries(defaults)) {
    const name = WORKFLOW_FRIENDLY_NAMES[key] ?? key;
    if (config.approvalRequired) {
      grouped.manualWithApproval.push(name);
    } else if (config.autoMode) {
      grouped.automatic.push(name);
    } else {
      grouped.manual.push(name);
    }
  }

  return grouped;
}

const TIER_DESCRIPTIONS: Record<BusinessTier, { headline: string; detail: string }> = {
  SMB: {
    headline: 'Your ERP runs on autopilot.',
    detail:
      'Behind the scenes, OppsEra handles all accounting, payment matching, and inventory workflows automatically. You won\'t see these in the sidebar — they\'re running silently. If your business grows and you need manual control, evaluate your tier below.',
  },
  MID_MARKET: {
    headline: 'You have visibility with selective manual control.',
    detail:
      'Accounting workflows appear in your sidebar so you can monitor and intervene when needed. Most processes still run automatically, but key workflows like period closes and bank reconciliation are in your hands.',
  },
  ENTERPRISE: {
    headline: 'Full manual control with approval chains.',
    detail:
      'All accounting workflows are visible and require explicit action. Key financial operations need approval before they execute. This gives your team maximum oversight and audit control.',
  },
};

function WorkflowList({
  items,
  icon: Icon,
  label,
  color,
}: {
  items: string[];
  icon: typeof CheckCircle2;
  label: string;
  color: string;
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-sm font-medium text-foreground">{label}</span>
      </div>
      <p className="ml-6 mt-1 text-sm text-muted-foreground">{items.join(', ')}</p>
    </div>
  );
}

export function TierImpactSummary({ businessTier }: { businessTier: string }) {
  const tier = businessTier as BusinessTier;
  const desc = TIER_DESCRIPTIONS[tier] ?? TIER_DESCRIPTIONS.SMB;
  const grouped = groupWorkflows(tier);

  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <div className="flex items-center gap-2">
        <Info className="h-5 w-5 text-indigo-600" />
        <h3 className="text-sm font-semibold text-foreground">
          What {tier === 'SMB' ? 'SMB' : tier === 'MID_MARKET' ? 'Mid-Market' : 'Enterprise'} Tier Means for You
        </h3>
      </div>

      <p className="mt-3 text-sm font-medium text-foreground">{desc.headline}</p>
      <p className="mt-1 text-sm text-muted-foreground">{desc.detail}</p>

      <div className="mt-4 space-y-3">
        <WorkflowList
          items={grouped.automatic}
          icon={CheckCircle2}
          label="Automatic"
          color="text-green-500"
        />
        <WorkflowList
          items={grouped.manual}
          icon={Settings2}
          label="Manual"
          color="text-blue-500"
        />
        <WorkflowList
          items={grouped.manualWithApproval}
          icon={ShieldCheck}
          label="Manual with approval"
          color="text-purple-500"
        />
      </div>

      {tier === 'SMB' && (
        <p className="mt-4 text-xs text-muted-foreground">
          Accounting workflows are hidden from your sidebar at this tier. Upgrade to Mid-Market to see and control them.
        </p>
      )}
      {tier === 'MID_MARKET' && (
        <p className="mt-4 text-xs text-muted-foreground">
          Approval workflows are available on the Enterprise tier for additional oversight.
        </p>
      )}
    </div>
  );
}
