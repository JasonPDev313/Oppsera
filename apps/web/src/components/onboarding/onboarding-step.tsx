'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle, Circle, ArrowRight, ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface StepStatus {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  href?: string;
  isComplete: boolean;
  /** True if completion came from manual user toggle (not API detection) */
  isManuallyDone?: boolean;
}

interface OnboardingStepProps {
  step: StepStatus;
  /** Custom content rendered when the step is expanded */
  inlineContent?: React.ReactNode;
  /** If provided, shows a "Mark as done" toggle for manual completion */
  onMarkDone?: () => void;
}

export function OnboardingStep({ step, inlineContent, onMarkDone }: OnboardingStepProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const Icon = step.icon;

  return (
    <div
      className={`rounded-lg border transition-colors ${
        step.isComplete
          ? 'border-green-500/20 bg-green-500/5'
          : isExpanded
            ? 'border-indigo-500/30 bg-surface'
            : 'border-gray-500/10 bg-surface'
      }`}
    >
      {/* Header — clickable to expand/collapse for incomplete steps */}
      <div className="flex w-full items-start gap-3 p-3 text-left">
        <button
          type="button"
          onClick={() => !step.isComplete && setIsExpanded((v) => !v)}
          disabled={step.isComplete && !step.isManuallyDone}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          <div className="mt-0.5 shrink-0">
            {step.isComplete ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground/60" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Icon
                className={`h-4 w-4 shrink-0 ${step.isComplete ? 'text-green-500' : 'text-muted-foreground'}`}
              />
              <h4
                className={`text-sm font-medium ${step.isComplete ? 'text-green-500' : 'text-foreground'}`}
              >
                {step.label}
              </h4>
            </div>
            <p className="ml-6 mt-0.5 text-xs text-muted-foreground">{step.description}</p>
          </div>
        </button>

        {step.isComplete ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-500">
              Done
            </span>
            {step.isManuallyDone && onMarkDone && (
              <button
                type="button"
                onClick={onMarkDone}
                className="text-xs text-muted-foreground hover:text-foreground"
                title="Undo manual completion"
              >
                Undo
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            className="shrink-0"
          >
            <ChevronDown
              className={`mt-0.5 h-4 w-4 text-muted-foreground transition-transform ${
                isExpanded ? 'rotate-180' : ''
              }`}
            />
          </button>
        )}
      </div>

      {/* Expanded content */}
      {isExpanded && !step.isComplete && (
        <div className="ml-11 border-t border-gray-500/10 px-3 pb-3 pt-3">
          {inlineContent ?? (
            step.href ? (
              <Link
                href={step.href}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Open {step.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <p className="text-sm italic text-muted-foreground">
                This configuration will be available in a future update.
              </p>
            )
          )}
          {onMarkDone && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onMarkDone(); }}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-gray-500/20 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-gray-500/10"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Mark as done
            </button>
          )}
        </div>
      )}
    </div>
  );
}
