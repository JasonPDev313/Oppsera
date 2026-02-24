'use client';

import { ChevronDown, CheckCircle, SkipForward } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface PhaseStatus {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  totalSteps: number;
  completedSteps: number;
  isSkipped: boolean;
}

interface OnboardingPhaseProps {
  phase: PhaseStatus;
  isExpanded: boolean;
  onToggle: () => void;
  onSkip: () => void;
  children: React.ReactNode;
}

export function OnboardingPhase({ phase, isExpanded, onToggle, onSkip, children }: OnboardingPhaseProps) {
  const Icon = phase.icon;
  const isComplete = phase.completedSteps === phase.totalSteps;
  const percentage = phase.totalSteps > 0
    ? Math.round((phase.completedSteps / phase.totalSteps) * 100)
    : 0;

  return (
    <div className={`rounded-lg border transition-colors ${
      phase.isSkipped
        ? 'border-gray-500/15 bg-gray-500/5 opacity-60'
        : isComplete
          ? 'border-green-500/30 bg-green-500/5'
          : 'border-gray-500/20 bg-surface'
    }`}>
      {/* Header — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-4 p-4 text-left"
      >
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          isComplete
            ? 'bg-green-500/15'
            : phase.isSkipped
              ? 'bg-gray-500/10'
              : 'bg-indigo-500/10'
        }`}>
          {isComplete ? (
            <CheckCircle className="h-5 w-5 text-green-600" />
          ) : (
            <Icon className={`h-5 w-5 ${phase.isSkipped ? 'text-gray-400' : 'text-indigo-600'}`} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{phase.label}</h3>
            {phase.isSkipped && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700">
                <SkipForward className="h-3 w-3" /> Skipped
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{phase.description}</p>
        </div>

        {/* Completion badge */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <span className={`text-xs font-semibold ${isComplete ? 'text-green-600' : 'text-gray-500'}`}>
              {phase.completedSteps}/{phase.totalSteps}
            </span>
            <div className="mt-1 h-1.5 w-20 rounded-full bg-gray-500/10">
              <div
                className={`h-full rounded-full transition-all ${isComplete ? 'bg-green-500' : 'bg-indigo-500'}`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
          <ChevronDown
            className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-gray-500/10 px-4 pb-4 pt-3">
          <div className="space-y-2">
            {children}
          </div>

          {/* Skip / Unskip */}
          {!isComplete && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSkip(); }}
                className="flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-gray-600"
              >
                <SkipForward className="h-3 w-3" />
                {phase.isSkipped ? 'Unskip this phase' : 'Skip this phase'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
