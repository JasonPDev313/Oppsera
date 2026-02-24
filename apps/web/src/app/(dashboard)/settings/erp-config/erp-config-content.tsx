'use client';

import { useState, useCallback } from 'react';
import { Loader2, Play, TrendingUp, Sliders, Timer } from 'lucide-react';
import {
  useErpConfig,
  useTenantTier,
  useCloseOrchestratorRuns,
  useErpMutations,
} from '@/hooks/use-erp-config';
import type { TierEvaluationResult } from '@/hooks/use-erp-config';
import { TierBadge } from '@/components/erp/tier-badge';
import { TierComparisonTable } from '@/components/erp/tier-comparison-table';
import { WorkflowConfigRow } from '@/components/erp/workflow-config-row';
import { CloseRunDetail } from '@/components/erp/close-run-detail';
import { ChangeTierDialog } from '@/components/erp/change-tier-dialog';
import { WORKFLOW_KEYS } from '@oppsera/shared';

const SMB_PROTECTED = new Set([
  'accounting.journal_posting',
  'accounting.period_close',
  'inventory.costing',
  'payments.settlement_matching',
]);

const MODULE_LABELS: Record<string, string> = {
  accounting: 'Accounting',
  payments: 'Payments',
  inventory: 'Inventory',
  ap: 'Accounts Payable',
  ar: 'Accounts Receivable',
};

// ── Main Content ────────────────────────────────────────────────

export default function ErpConfigContent() {
  const [activeTab, setActiveTab] = useState<'tier' | 'workflows' | 'auto-close'>('tier');

  const tabs = [
    { id: 'tier' as const, label: 'Business Tier', icon: TrendingUp },
    { id: 'workflows' as const, label: 'Workflows', icon: Sliders },
    { id: 'auto-close' as const, label: 'Auto-Close', icon: Timer },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">ERP Configuration</h1>
      <p className="mt-1 text-sm text-gray-500">
        Configure business tier, workflow behavior, and auto-close settings
      </p>

      <div className="mt-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-6">
        {activeTab === 'tier' && <TierTab />}
        {activeTab === 'workflows' && <WorkflowsTab />}
        {activeTab === 'auto-close' && <AutoCloseTab />}
      </div>
    </div>
  );
}

// ── Tier Tab ────────────────────────────────────────────────────

function TierTab() {
  const { tier, isLoading } = useTenantTier();
  const { evaluateTier, changeTier } = useErpMutations();
  const [evaluation, setEvaluation] = useState<TierEvaluationResult | null>(null);
  const [showChangeDialog, setShowChangeDialog] = useState(false);

  const handleEvaluate = useCallback(async () => {
    const result = await evaluateTier.mutateAsync();
    setEvaluation(result);
  }, [evaluateTier]);

  const handleChangeTier = useCallback(
    async (reason: string) => {
      if (!evaluation) return;
      await changeTier.mutateAsync({ newTier: evaluation.recommendedTier, reason });
      setShowChangeDialog(false);
      setEvaluation(null);
    },
    [changeTier, evaluation],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!tier) {
    return <p className="text-sm text-gray-500">Unable to load tier information.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Current Tier */}
      <div className="rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-500">Current Business Tier</h3>
            <div className="mt-2 flex items-center gap-3">
              <TierBadge tier={tier.businessTier} size="lg" />
              {tier.tierOverride && (
                <span className="text-xs text-gray-500">
                  (manually set{tier.tierOverrideReason ? `: ${tier.tierOverrideReason}` : ''})
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Business Vertical</p>
            <p className="mt-1 text-sm font-medium text-gray-900">
              {tier.businessVertical.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </p>
          </div>
        </div>

        {tier.tierLastEvaluatedAt && (
          <p className="mt-3 text-xs text-gray-400">
            Last evaluated: {new Date(tier.tierLastEvaluatedAt).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Evaluate Section */}
      <div className="rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-900">Tier Evaluation</h3>
            <p className="mt-1 text-xs text-gray-500">
              Run the auto-classifier to see if your business tier should change based on current metrics.
            </p>
          </div>
          <button
            type="button"
            onClick={handleEvaluate}
            disabled={evaluateTier.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {evaluateTier.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <TrendingUp className="h-4 w-4" />
            )}
            Evaluate
          </button>
        </div>

        {evaluation && (
          <div className="mt-4 space-y-4">
            {/* Metrics Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricCard label="Annual Revenue" value={`$${evaluation.metrics.annualRevenue.toLocaleString()}`} />
              <MetricCard label="Locations" value={String(evaluation.metrics.locationCount)} />
              <MetricCard label="Users" value={String(evaluation.metrics.userCount)} />
              <MetricCard label="GL Accounts" value={String(evaluation.metrics.glAccountCount)} />
            </div>

            {/* Recommendation */}
            <div
              className={`rounded-lg p-4 ${
                evaluation.shouldUpgrade
                  ? 'bg-blue-50 border border-blue-200'
                  : 'bg-green-50 border border-green-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-900">
                  Recommended Tier:
                </span>
                <TierBadge tier={evaluation.recommendedTier} size="lg" />
                {evaluation.shouldUpgrade ? (
                  <button
                    type="button"
                    onClick={() => setShowChangeDialog(true)}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Change Tier
                  </button>
                ) : (
                  <span className="ml-auto text-sm text-green-700">No change needed</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Comparison Table */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-gray-900">Tier Comparison</h3>
        <TierComparisonTable currentTier={tier.businessTier} />
      </div>

      {/* Change Dialog */}
      {showChangeDialog && evaluation && (
        <ChangeTierDialog
          currentTier={tier.businessTier}
          recommendedTier={evaluation.recommendedTier}
          warnings={[]}
          dataPreservation={['All existing data is preserved during tier changes.']}
          onConfirm={handleChangeTier}
          onClose={() => setShowChangeDialog(false)}
          isSubmitting={changeTier.isPending}
        />
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-900">{value}</p>
    </div>
  );
}

// ── Workflows Tab ───────────────────────────────────────────────

function WorkflowsTab() {
  const { configs, isLoading } = useErpConfig();
  const { tier } = useTenantTier();
  const { updateConfig } = useErpMutations();
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const handleToggle = useCallback(
    async (
      moduleKey: string,
      workflowKey: string,
      field: 'autoMode' | 'approvalRequired' | 'userVisible',
      value: boolean,
    ) => {
      const key = `${moduleKey}.${workflowKey}`;
      setSavingKey(key);
      try {
        await updateConfig.mutateAsync({
          moduleKey,
          workflowKey,
          [field]: value,
        });
      } finally {
        setSavingKey(null);
      }
    },
    [updateConfig],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const currentTier = tier?.businessTier ?? 'SMB';

  return (
    <div className="space-y-8">
      {Object.entries(WORKFLOW_KEYS).map(([moduleKey, workflowKeys]) => (
        <div key={moduleKey}>
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            {MODULE_LABELS[moduleKey] ?? moduleKey}
          </h3>
          <div className="space-y-2">
            {workflowKeys.map((wk) => {
              const compositeKey = `${moduleKey}.${wk}`;
              const config = configs[compositeKey];
              return (
                <WorkflowConfigRow
                  key={compositeKey}
                  moduleKey={moduleKey}
                  workflowKey={wk}
                  autoMode={config?.autoMode ?? true}
                  approvalRequired={config?.approvalRequired ?? false}
                  userVisible={config?.userVisible ?? false}
                  isProtected={currentTier === 'SMB' && SMB_PROTECTED.has(compositeKey)}
                  isSaving={savingKey === compositeKey}
                  onToggle={(field, value) => handleToggle(moduleKey, wk, field, value)}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Auto-Close Tab ──────────────────────────────────────────────

function AutoCloseTab() {
  const { items, isLoading: runsLoading } = useCloseOrchestratorRuns({ limit: 10 });
  const { triggerClose } = useErpMutations();
  const [businessDate, setBusinessDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });

  const handleTrigger = useCallback(async () => {
    await triggerClose.mutateAsync({ businessDate });
  }, [triggerClose, businessDate]);

  return (
    <div className="space-y-6">
      {/* Trigger Section */}
      <div className="rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-900">Manual Close Trigger</h3>
        <p className="mt-1 text-xs text-gray-500">
          Run the close orchestrator for a specific business date. This will auto-execute any steps
          that are configured for automatic mode.
        </p>
        <div className="mt-4 flex items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700">Business Date</label>
            <input
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button
            type="button"
            onClick={handleTrigger}
            disabled={triggerClose.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {triggerClose.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Run Now
          </button>
        </div>
      </div>

      {/* Recent Runs */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-gray-900">Recent Close Runs</h3>
        {runsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-500">
            No close orchestrator runs yet. Trigger a manual run above or enable auto-close in accounting settings.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((run) => (
              <CloseRunDetail key={run.id} run={run} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
