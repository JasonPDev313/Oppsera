'use client';

import { useState, useCallback } from 'react';
import {
  Play,
  CheckCircle2,
  Circle,
  Loader2,
  AlertTriangle,
  DollarSign,
  FileText,
  CreditCard,
  CalendarDays,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { useBillingCycleRun, useBillingCycleMutations } from '@/hooks/use-membership';
import type { BillingStepName } from '@/types/membership';

// ── Helpers ───────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  const abs = Math.abs(cents);
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(abs / 100);
  if (cents < 0) return `(${formatted})`;
  return formatted;
}

function formatDate(iso: string | null): string {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const STEPS: { name: BillingStepName; label: string; description: string }[] = [
  { name: 'preview_dues', label: 'Preview Dues', description: 'Review dues to be billed this cycle' },
  { name: 'preview_initiation', label: 'Preview Initiation', description: 'Review initiation installments due' },
  { name: 'compute_minimums', label: 'Compute Minimums', description: 'Calculate minimum spend shortfalls' },
  { name: 'exception_review', label: 'Exception Review', description: 'Review and exclude specific accounts' },
  { name: 'generate_statements', label: 'Generate Statements', description: 'Create member statements' },
  { name: 'run_autopay', label: 'Run Autopay', description: 'Process autopay collections' },
  { name: 'review_close', label: 'Review & Close', description: 'Final review and close the billing cycle' },
];

const STATUS_LABELS: Record<string, string> = {
  preview: 'Preview',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// ── Step Indicator ───────────────────────────────────────────────

function StepIndicator({
  stepIndex,
  currentStep,
  completedSteps,
  step,
  onClick,
}: {
  stepIndex: number;
  currentStep: number;
  completedSteps: Set<string>;
  step: { name: BillingStepName; label: string };
  onClick: () => void;
}) {
  const isCompleted = completedSteps.has(step.name);
  const isCurrent = stepIndex === currentStep;
  const isPast = stepIndex < currentStep;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
        isCurrent
          ? 'bg-indigo-500/10 text-indigo-500 font-medium'
          : isCompleted || isPast
            ? 'text-muted-foreground hover:bg-accent'
            : 'text-muted-foreground'
      }`}
    >
      {isCompleted ? (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
      ) : isCurrent ? (
        <ChevronRight className="h-5 w-5 shrink-0 text-indigo-600" />
      ) : (
        <Circle className="h-5 w-5 shrink-0" />
      )}
      <span>{step.label}</span>
    </button>
  );
}

// ── Totals Summary ──────────────────────────────────────────────

function TotalsSummary({
  run,
}: {
  run: {
    totalDuesBilledCents: number;
    totalInitiationBilledCents: number;
    totalMinimumsChargedCents: number;
    totalLateFeesCents: number;
    totalStatementsGenerated: number;
    totalAutopayCollectedCents: number;
  };
}) {
  const items = [
    { label: 'Dues Billed', value: formatMoney(run.totalDuesBilledCents), icon: DollarSign },
    { label: 'Initiation Billed', value: formatMoney(run.totalInitiationBilledCents), icon: DollarSign },
    { label: 'Minimums Charged', value: formatMoney(run.totalMinimumsChargedCents), icon: AlertTriangle },
    { label: 'Late Fees', value: formatMoney(run.totalLateFeesCents), icon: AlertTriangle },
    { label: 'Statements', value: String(run.totalStatementsGenerated), icon: FileText },
    { label: 'Autopay Collected', value: formatMoney(run.totalAutopayCollectedCents), icon: CreditCard },
  ];

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">
        Cycle Totals
      </h3>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <item.icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </div>
            <span className="font-medium text-foreground">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Step Content Panel ──────────────────────────────────────────

function StepContent({
  step,
  isCompleted,
  isExecuting,
  onExecute,
  run,
}: {
  step: (typeof STEPS)[number];
  isCompleted: boolean;
  isExecuting: boolean;
  onExecute: () => void;
  run: { previewSummary: Record<string, unknown> | null } | null;
}) {
  const previewSummary = run?.previewSummary;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{step.label}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
      </div>

      {/* Show preview info when available */}
      {step.name === 'preview_dues' && previewSummary && (
        <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm">
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">
              {Number(
                (previewSummary.duesPreview as Record<string, unknown>)?.count ?? previewSummary.totalAccounts ?? 0,
              )}
            </span>{' '}
            accounts will be billed for dues this cycle.
          </p>
        </div>
      )}

      {step.name === 'exception_review' && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-500">
          Review the billing preview and mark any accounts to exclude before proceeding.
          Exceptions can be added during this step.
        </div>
      )}

      {step.name === 'review_close' && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-blue-500">
          This is the final step. Once closed, the billing cycle cannot be undone.
          Review all totals carefully before proceeding.
        </div>
      )}

      {/* Status + action */}
      <div className="flex items-center gap-3">
        {isCompleted ? (
          <div className="flex items-center gap-2 text-sm text-green-500">
            <CheckCircle2 className="h-4 w-4" />
            <span>Step completed</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onExecute}
            disabled={isExecuting}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isExecuting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Executing...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Execute Step
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Create Cycle Dialog ─────────────────────────────────────────

function CreateCyclePanel({
  onCreated,
}: {
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const { isLoading, createPreview } = useBillingCycleMutations();
  const [cycleDate, setCycleDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );

  const handleCreate = async () => {
    try {
      await createPreview(cycleDate);
      toast.success('Billing cycle preview created');
      onCreated();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to create billing cycle preview',
      );
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/10">
          <CalendarDays className="h-6 w-6 text-indigo-600" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">
          Start New Billing Cycle
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Create a billing cycle preview to review dues, initiation installments,
          minimums, statements, and autopay before closing the period.
        </p>

        <div className="mt-6 flex flex-col items-center gap-4">
          <div className="w-full max-w-xs">
            <label htmlFor="cycleDate" className="block text-left text-sm font-medium text-foreground">
              Cycle Date
            </label>
            <input
              id="cycleDate"
              type="date"
              value={cycleDate}
              onChange={(e) => setCycleDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={isLoading || !cycleDate}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating Preview...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Create Preview
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────

export function BillingCommandCenter() {
  const { data: run, isLoading, mutate: refresh } = useBillingCycleRun();
  const { isLoading: isMutating, executeStep, closeCycle } = useBillingCycleMutations();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);

  // Derive completed steps from the run data
  const completedSteps = new Set<string>(
    (run?.steps ?? []).map((s) => String(s.stepName)),
  );

  const handleExecuteStep = useCallback(async () => {
    if (!run) return;
    const step = STEPS[currentStep];
    if (!step) return;

    try {
      // The final step triggers the close
      if (step.name === 'review_close') {
        await closeCycle(run.id);
        toast.success('Billing cycle closed successfully');
      } else {
        await executeStep(run.id, step.name);
        toast.success(`Step "${step.label}" completed`);
      }
      await refresh();
      // Auto-advance to next step
      if (currentStep < STEPS.length - 1) {
        setCurrentStep((prev) => prev + 1);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : `Failed to execute step "${step.label}"`,
      );
    }
  }, [run, currentStep, executeStep, closeCycle, refresh, toast]);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-7 w-64 animate-pulse rounded bg-muted" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          <div className="h-96 animate-pulse rounded-lg bg-muted" />
          <div className="h-96 animate-pulse rounded-lg bg-muted lg:col-span-2" />
          <div className="h-96 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  // No active run -- show create panel
  if (!run) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-foreground">Billing Command Center</h1>
        <CreateCyclePanel onCreated={refresh} />
      </div>
    );
  }

  const isCompleted = run.status === 'completed';
  const isCancelled = run.status === 'cancelled';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Billing Command Center
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cycle Date: {formatDate(run.cycleDate)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            variant={
              isCompleted
                ? 'success'
                : isCancelled
                  ? 'neutral'
                  : run.status === 'in_progress'
                    ? 'warning'
                    : 'info'
            }
          >
            {STATUS_LABELS[run.status] ?? run.status}
          </Badge>
          <button
            type="button"
            onClick={refresh}
            className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Refresh"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Completed banner */}
      {isCompleted && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
          <div className="flex items-center gap-2 text-sm text-green-500">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">
              Billing cycle completed on {formatDate(run.completedAt ?? null)}
            </span>
          </div>
        </div>
      )}

      {/* Main layout: sidebar steps + content + totals */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Step sidebar */}
        <div className="rounded-lg border border-border bg-surface p-3">
          <h3 className="mb-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Steps
          </h3>
          <nav className="space-y-0.5">
            {STEPS.map((step, i) => (
              <StepIndicator
                key={step.name}
                stepIndex={i}
                currentStep={currentStep}
                completedSteps={completedSteps}
                step={step}
                onClick={() => setCurrentStep(i)}
              />
            ))}
          </nav>
        </div>

        {/* Step content */}
        <div className="rounded-lg border border-border bg-surface p-6 lg:col-span-2">
          {STEPS[currentStep] && (
            <StepContent
              step={STEPS[currentStep]}
              isCompleted={isCompleted || completedSteps.has(STEPS[currentStep].name)}
              isExecuting={isMutating}
              onExecute={handleExecuteStep}
              run={run}
            />
          )}
        </div>

        {/* Totals sidebar */}
        <TotalsSummary run={run} />
      </div>
    </div>
  );
}
