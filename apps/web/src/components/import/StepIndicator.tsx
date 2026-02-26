'use client';

import { CheckCircle } from 'lucide-react';

export interface StepDef {
  key: string;
  label: string;
}

interface StepIndicatorProps {
  steps: StepDef[];
  currentStep: string;
  completedSteps?: Set<string>;
}

export function StepIndicator({ steps, currentStep, completedSteps }: StepIndicatorProps) {
  const currentIdx = steps.findIndex((s) => s.key === currentStep);

  return (
    <div className="flex items-center gap-2 px-6 py-3 border-b border-border">
      {steps.map((s, i) => {
        const isCompleted = completedSteps ? completedSteps.has(s.key) : i < currentIdx;
        const isCurrent = i === currentIdx;

        return (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                isCompleted
                  ? 'bg-green-500 text-white'
                  : isCurrent
                    ? 'bg-indigo-600 text-white'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {isCompleted ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span
              className={`text-sm ${
                isCurrent
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground'
              }`}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <div className="w-8 h-px bg-muted" />
            )}
          </div>
        );
      })}
    </div>
  );
}
