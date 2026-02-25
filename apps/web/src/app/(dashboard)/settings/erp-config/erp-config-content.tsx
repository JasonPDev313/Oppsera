'use client';

import { useState, useCallback } from 'react';
import { Loader2, Play, TrendingUp, Sliders, Timer, Clock, Moon } from 'lucide-react';
import {
  useErpConfig,
  useTenantTier,
  useCloseOrchestratorRuns,
  useErpMutations,
  useAutoCloseSettings,
} from '@/hooks/use-erp-config';
import type { TierEvaluationResult } from '@/hooks/use-erp-config';
import { TierComparisonTable } from '@/components/erp/tier-comparison-table';
import { WorkflowConfigRow } from '@/components/erp/workflow-config-row';
import { CloseRunDetail } from '@/components/erp/close-run-detail';
import { ChangeTierDialog } from '@/components/erp/change-tier-dialog';
import { BusinessProfileCard } from '@/components/erp/business-profile-card';
import { TierImpactSummary } from '@/components/erp/tier-impact-summary';
import { TierEvaluationSection } from '@/components/erp/tier-evaluation-section';
import { WORKFLOW_KEYS, COMING_SOON_WORKFLOWS } from '@oppsera/shared';

const SMB_PROTECTED = new Set([
  'accounting.journal_posting',
  'accounting.period_close',
  'inventory.costing',
  'payments.settlement_matching',
  'ar.credit_hold',
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
  const { tier, isLoading, refetch } = useTenantTier();
  const { evaluateTier, changeTier } = useErpMutations();
  const [pendingEvaluation, setPendingEvaluation] = useState<TierEvaluationResult | null>(null);
  const [showChangeDialog, setShowChangeDialog] = useState(false);

  const handleEvaluate = useCallback(async () => {
    const result = await evaluateTier.mutateAsync();
    return result;
  }, [evaluateTier]);

  const handleRequestChange = useCallback((evaluation: TierEvaluationResult) => {
    setPendingEvaluation(evaluation);
    setShowChangeDialog(true);
  }, []);

  const handleChangeTier = useCallback(
    async (reason: string) => {
      if (!pendingEvaluation) return;
      await changeTier.mutateAsync({ newTier: pendingEvaluation.recommendedTier, reason });
      setShowChangeDialog(false);
      setPendingEvaluation(null);
      refetch();
    },
    [changeTier, pendingEvaluation, refetch],
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
      {/* Section A: Business Profile */}
      <BusinessProfileCard tier={tier} />

      {/* Section B: What Your Tier Means */}
      <TierImpactSummary businessTier={tier.businessTier} />

      {/* Section C: Tier Evaluation */}
      <TierEvaluationSection
        currentTier={tier.businessTier}
        tierOverride={tier.tierOverride}
        tierLastEvaluatedAt={tier.tierLastEvaluatedAt}
        onEvaluate={handleEvaluate}
        isEvaluating={evaluateTier.isPending}
        onRequestChange={handleRequestChange}
      />

      {/* Section D: Tier Comparison */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-gray-900">Tier Comparison</h3>
        <TierComparisonTable currentTier={tier.businessTier} />
      </div>

      {/* Change Dialog */}
      {showChangeDialog && pendingEvaluation && (
        <ChangeTierDialog
          currentTier={tier.businessTier}
          recommendedTier={pendingEvaluation.recommendedTier}
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
              const comingSoon = COMING_SOON_WORKFLOWS.has(compositeKey);
              return (
                <WorkflowConfigRow
                  key={compositeKey}
                  moduleKey={moduleKey}
                  workflowKey={wk}
                  autoMode={config?.autoMode ?? true}
                  approvalRequired={config?.approvalRequired ?? false}
                  userVisible={config?.userVisible ?? false}
                  isProtected={currentTier === 'SMB' && SMB_PROTECTED.has(compositeKey)}
                  isComingSoon={comingSoon}
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
  const { settings, isLoading: settingsLoading, updateSettings } = useAutoCloseSettings();
  const [businessDate, setBusinessDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });

  const handleTrigger = useCallback(async () => {
    await triggerClose.mutateAsync({ businessDate });
  }, [triggerClose, businessDate]);

  const handleAutoCloseToggle = useCallback(
    async (enabled: boolean) => {
      await updateSettings.mutateAsync({ autoCloseEnabled: enabled });
    },
    [updateSettings],
  );

  const handleAutoCloseTimeChange = useCallback(
    async (time: string) => {
      await updateSettings.mutateAsync({ autoCloseTime: time });
    },
    [updateSettings],
  );

  const handleSkipHolidaysToggle = useCallback(
    async (skip: boolean) => {
      await updateSettings.mutateAsync({ autoCloseSkipHolidays: skip });
    },
    [updateSettings],
  );

  const handleDayEndToggle = useCallback(
    async (enabled: boolean) => {
      await updateSettings.mutateAsync({ dayEndCloseEnabled: enabled });
    },
    [updateSettings],
  );

  const handleDayEndTimeChange = useCallback(
    async (time: string) => {
      await updateSettings.mutateAsync({ dayEndCloseTime: time });
    },
    [updateSettings],
  );

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Auto-Close Schedule */}
      <div className="rounded-lg border border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-500" />
            <div>
              <h3 className="text-sm font-medium text-gray-900">Auto-Close Schedule</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Automatically run the close orchestrator at a scheduled time each day.
                Posts draft journal entries and checks all closing steps.
              </p>
            </div>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={settings?.autoCloseEnabled ?? false}
              onChange={(e) => handleAutoCloseToggle(e.target.checked)}
              disabled={updateSettings.isPending}
              className="peer sr-only"
            />
            <div className="peer h-5 w-9 rounded-full bg-gray-200 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-indigo-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-disabled:opacity-50" />
          </label>
        </div>

        {settings?.autoCloseEnabled && (
          <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-gray-100 pt-4">
            <div>
              <label className="block text-xs font-medium text-gray-700">Auto-Close Time</label>
              <input
                type="time"
                value={settings.autoCloseTime}
                onChange={(e) => handleAutoCloseTimeChange(e.target.value)}
                disabled={updateSettings.isPending}
                className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
              />
            </div>
            <label className="flex items-center gap-2 pb-2">
              <input
                type="checkbox"
                checked={settings.autoCloseSkipHolidays}
                onChange={(e) => handleSkipHolidaysToggle(e.target.checked)}
                disabled={updateSettings.isPending}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
              />
              <span className="text-xs text-gray-700">Skip holidays</span>
            </label>
          </div>
        )}
      </div>

      {/* Day End Close */}
      <div className="rounded-lg border border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Moon className="h-4 w-4 text-gray-500" />
            <div>
              <h3 className="text-sm font-medium text-gray-900">Day End Close</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Run the close orchestrator at the end of each business day.
                Triggers before the auto-close to finalize the current day&apos;s operations.
              </p>
            </div>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={settings?.dayEndCloseEnabled ?? false}
              onChange={(e) => handleDayEndToggle(e.target.checked)}
              disabled={updateSettings.isPending}
              className="peer sr-only"
            />
            <div className="peer h-5 w-9 rounded-full bg-gray-200 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-indigo-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-disabled:opacity-50" />
          </label>
        </div>

        {settings?.dayEndCloseEnabled && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <div>
              <label className="block text-xs font-medium text-gray-700">Day End Close Time</label>
              <input
                type="time"
                value={settings.dayEndCloseTime}
                onChange={(e) => handleDayEndTimeChange(e.target.value)}
                disabled={updateSettings.isPending}
                className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
              />
            </div>
          </div>
        )}
      </div>

      {/* Manual Close Trigger */}
      <div className="rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-900">Manual Close Trigger</h3>
        <p className="mt-1 text-xs text-gray-500">
          Run the close orchestrator for a specific business date. This will auto-execute any steps
          that are configured for automatic mode.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
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
            No close orchestrator runs yet. Trigger a manual run above or enable a scheduled close.
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
