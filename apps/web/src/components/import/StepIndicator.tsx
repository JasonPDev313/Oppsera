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
    <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-200/50 dark:border-gray-700/50">
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
                    : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
              }`}
            >
              {isCompleted ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span
              className={`text-sm ${
                isCurrent
                  ? 'font-medium text-gray-900 dark:text-gray-100'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <div className="w-8 h-px bg-gray-300 dark:bg-gray-600" />
            )}
          </div>
        );
      })}
    </div>
  );
}
