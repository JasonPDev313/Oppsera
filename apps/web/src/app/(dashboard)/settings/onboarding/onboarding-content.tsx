'use client';

import { useState, useCallback } from 'react';
import { Rocket, RefreshCw, Loader2, PartyPopper, CheckCircle } from 'lucide-react';
import { useEntitlementsContext } from '@/components/entitlements-provider';
import { useOnboardingStatus } from '@/hooks/use-onboarding-status';
import { ONBOARDING_PHASES } from '@/components/onboarding/phase-definitions';
import { OnboardingPhase, type PhaseStatus } from '@/components/onboarding/onboarding-phase';
import { OnboardingStep } from '@/components/onboarding/onboarding-step';
import { BootstrapWizard } from '@/components/accounting/bootstrap-wizard';
import { ImportDataSection } from '@/components/onboarding/ImportDataSection';

// Steps that have automatic API-based completion detection (no manual toggle needed)
const AUTO_DETECTED_STEPS = new Set([
  // Organization
  'organization.locations',
  'organization.profit_centers',
  'organization.terminals',
  // Users
  'users.invite_users',
  'users.custom_roles',
  // Catalog
  'catalog.hierarchy',
  'catalog.tax_config',
  'catalog.items',
  'catalog.import_items',
  'catalog.modifiers',
  'catalog.packages',
  // Inventory
  'inventory.vendors',
  'inventory.opening_balances',
  // Customers
  'customers.customer_records',
  'customers.membership_plans',
  'customers.billing_accounts',
  // Data Import
  'data_import.import_overview',
  'data_import.first_import_complete',
  // Accounting (all from useAccountingSetupStatus)
  'accounting.bootstrap',
  'accounting.import_coa',
  'accounting.control_accounts',
  'accounting.mappings',
  'accounting.bank_accounts',
  'accounting.pos_posting',
  // F&B
  'fnb.floor_plans',
  'fnb.sync_tables',
  'fnb.kds_stations',
  // Reporting
  'reporting.custom_reports',
  'reporting.ai_lenses',
  // Go Live (all computed)
  'go_live.all_phases_complete',
  'go_live.test_order',
  'go_live.verify_gl',
  'go_live.final_review',
]);

export default function OnboardingContent() {
  const { isModuleEnabled } = useEntitlementsContext();
  const status = useOnboardingStatus();
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);
  const [showBootstrapWizard, setShowBootstrapWizard] = useState(false);

  // Filter phases to only show enabled modules
  const visiblePhases = ONBOARDING_PHASES.filter((phase) => {
    if (!phase.moduleKey) return true;
    return isModuleEnabled(phase.moduleKey);
  });

  const handleTogglePhase = useCallback((phaseKey: string) => {
    setExpandedPhase((prev) => (prev === phaseKey ? null : phaseKey));
  }, []);

  const handleBootstrapComplete = useCallback(() => {
    setShowBootstrapWizard(false);
    status.refresh();
  }, [status]);

  // ── Already marked as live ──
  if (status.completedAt) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-6 text-center">
          <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Business Setup Complete</h1>
          <p className="mt-2 text-sm text-gray-500">
            Onboarding was completed on{' '}
            {new Date(status.completedAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
          <button
            type="button"
            onClick={() => {
              try { localStorage.removeItem('oppsera_onboarding_completed_at'); } catch { /* ignore */ }
              window.location.reload();
            }}
            className="mt-4 text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            Review setup guide again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/10">
              <Rocket className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Business Setup Guide</h1>
              <p className="text-sm text-gray-500">
                Get your business fully configured and ready to go
              </p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={status.refresh}
          disabled={status.isLoading}
          className="flex items-center gap-1.5 rounded-lg border border-gray-500/20 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-500/10 disabled:opacity-50"
          title="Refresh completion status"
        >
          {status.isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {status.isLoading ? 'Checking...' : 'Refresh'}
        </button>
      </div>

      {/* Overall Progress */}
      <div className="mt-6 rounded-lg border border-gray-500/20 bg-surface p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-gray-700">Overall Progress</span>
          <span className="font-semibold text-gray-900">{status.overallPercentage}%</span>
        </div>
        <div className="mt-2 h-3 rounded-full bg-gray-500/10">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              status.isComplete ? 'bg-green-500' : 'bg-indigo-500'
            }`}
            style={{ width: `${status.overallPercentage}%` }}
          />
        </div>
      </div>

      {/* Celebration banner — shows when 100% complete */}
      {status.isComplete && (
        <div className="mt-4 rounded-lg border border-green-500/30 bg-green-500/5 p-6 text-center">
          <PartyPopper className="mx-auto h-10 w-10 text-green-500" />
          <h2 className="mt-3 text-lg font-bold text-green-700">
            Your business is ready to go live!
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            All setup phases are complete. You can start processing real transactions.
          </p>
          <button
            type="button"
            onClick={status.markComplete}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
          >
            <Rocket className="h-4 w-4" />
            Mark Business as Live
          </button>
        </div>
      )}

      {/* Phase List */}
      <div className="mt-6 space-y-3">
        {visiblePhases.map((phaseDef, index) => {
          const phaseCompletion = status.completion[phaseDef.key] ?? {};
          const completedSteps = phaseDef.steps.filter((s) => phaseCompletion[s.key]).length;

          const phaseStatus: PhaseStatus = {
            key: phaseDef.key,
            label: `Phase ${index + 1}: ${phaseDef.label}`,
            description: phaseDef.description,
            icon: phaseDef.icon,
            totalSteps: phaseDef.steps.length,
            completedSteps,
            isSkipped: status.skippedPhases.has(phaseDef.key),
          };

          return (
            <OnboardingPhase
              key={phaseDef.key}
              phase={phaseStatus}
              isExpanded={expandedPhase === phaseDef.key}
              onToggle={() => handleTogglePhase(phaseDef.key)}
              onSkip={() => status.toggleSkip(phaseDef.key)}
            >
              {phaseDef.steps.map((stepDef) => {
                const stepFullKey = `${phaseDef.key}.${stepDef.key}`;
                const isAutoDetected = AUTO_DETECTED_STEPS.has(stepFullKey);
                const isComplete = !!phaseCompletion[stepDef.key];

                const stepStatus = {
                  key: stepDef.key,
                  label: stepDef.label,
                  description: stepDef.description,
                  icon: stepDef.icon,
                  href: stepDef.href,
                  isComplete,
                  isManuallyDone: !isAutoDetected && isComplete,
                };

                // Special inline content for specific steps
                let inlineContent: React.ReactNode | undefined;
                if (phaseDef.key === 'accounting' && stepDef.key === 'bootstrap' && !isComplete) {
                  inlineContent = renderBootstrapInline(showBootstrapWizard, setShowBootstrapWizard, handleBootstrapComplete);
                } else if (phaseDef.key === 'data_import' && stepDef.key === 'import_overview' && !isComplete) {
                  inlineContent = <ImportDataSection />;
                }

                return (
                  <OnboardingStep
                    key={stepDef.key}
                    step={stepStatus}
                    inlineContent={inlineContent}
                    onMarkDone={
                      !isAutoDetected
                        ? () => status.toggleStepDone(phaseDef.key, stepDef.key)
                        : undefined
                    }
                  />
                );
              })}
            </OnboardingPhase>
          );
        })}
      </div>

      {/* Bottom note */}
      <div className="mt-8 rounded-lg border border-gray-500/10 bg-gray-500/5 p-4 text-center">
        <p className="text-xs text-gray-500">
          Most steps are detected automatically based on your data.
          Steps without automatic detection can be marked as done manually.
          You can skip entire phases that don&apos;t apply to your business.
          Progress is saved across sessions.
        </p>
      </div>
    </div>
  );
}

// ── Accounting Bootstrap inline content ──────────────────

function renderBootstrapInline(
  showWizard: boolean,
  setShowWizard: (v: boolean) => void,
  onComplete: () => void,
) {
  if (showWizard) {
    return <BootstrapWizard onComplete={onComplete} />;
  }

  return (
    <button
      type="button"
      onClick={() => setShowWizard(true)}
      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
    >
      <Rocket className="h-4 w-4" />
      Start Accounting Setup
    </button>
  );
}
