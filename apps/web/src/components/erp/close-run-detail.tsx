'use client';

import { useState } from 'react';
import { ChevronDown, CheckCircle2, XCircle, SkipForward, Clock, Loader2 } from 'lucide-react';
import type { CloseOrchestratorRun } from '@/hooks/use-erp-config';

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  completed: { icon: CheckCircle2, color: 'text-green-600', label: 'Completed' },
  failed: { icon: XCircle, color: 'text-red-600', label: 'Failed' },
  skipped: { icon: SkipForward, color: 'text-gray-400', label: 'Skipped' },
  running: { icon: Loader2, color: 'text-blue-600', label: 'Running' },
  pending: { icon: Clock, color: 'text-gray-400', label: 'Pending' },
};

function StepStatusIcon({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending!;
  const Icon = config.icon;
  return <Icon className={`h-4 w-4 ${config.color} ${status === 'running' ? 'animate-spin' : ''}`} />;
}

function RunStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: 'bg-green-500/15 text-green-700',
    failed: 'bg-red-500/15 text-red-700',
    partial: 'bg-amber-500/15 text-amber-700',
    running: 'bg-blue-500/15 text-blue-700',
    pending: 'bg-gray-500/15 text-gray-600',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? colors.pending}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export function CloseRunDetail({ run }: { run: CloseOrchestratorRun }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-gray-200">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
      >
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">{run.businessDate}</span>
            <RunStatusBadge status={run.status} />
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            {run.completedSteps}/{run.totalSteps} steps completed
            {run.failedSteps > 0 && ` · ${run.failedSteps} failed`}
            {run.skippedSteps > 0 && ` · ${run.skippedSteps} skipped`}
            {' · '}
            Triggered by {run.triggeredBy === 'auto' ? 'auto-close' : run.triggeredBy === 'manual' ? 'manual trigger' : 'user'}
          </p>
        </div>
        <span className="text-xs text-gray-400">
          {new Date(run.createdAt).toLocaleString()}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-gray-200 px-4 py-3">
          <div className="space-y-2">
            {run.stepResults.map((step) => (
              <div key={step.stepKey} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-gray-50">
                <StepStatusIcon status={step.status} />
                <span className="flex-1 text-sm text-gray-700">
                  {step.stepKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </span>
                {step.completedAt && step.startedAt && (
                  <span className="text-xs text-gray-400">
                    {Math.round((new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime()) / 1000)}s
                  </span>
                )}
                {step.error && (
                  <span className="max-w-xs truncate text-xs text-red-600" title={step.error}>
                    {step.error}
                  </span>
                )}
              </div>
            ))}
            {run.stepResults.length === 0 && (
              <p className="text-sm text-gray-400">No step details available</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
