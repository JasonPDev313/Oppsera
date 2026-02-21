'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CheckCircle,
  Circle,
  ArrowRight,
  ArrowLeft,
  BookOpen,
  Shield,
  ArrowRightLeft,
  Building2,
  Zap,
  ClipboardCheck,
} from 'lucide-react';
import { useAccountingSetupStatus } from '@/hooks/use-accounting-nav';

const STEP_ICONS: Record<string, typeof BookOpen> = {
  bootstrap: BookOpen,
  control_accounts: Shield,
  mappings: ArrowRightLeft,
  bank_accounts: Building2,
  pos_posting: Zap,
};

const STEP_DESCRIPTIONS: Record<string, string> = {
  bootstrap: 'Initialize your Chart of Accounts from a template matching your business type. This creates GL accounts, classifications, and default settings.',
  control_accounts: 'Configure which accounts serve as control accounts for AP, AR, Sales Tax, and Retained Earnings. These are critical for subledger posting.',
  mappings: 'Map your POS departments, payment types, and tax groups to GL accounts. This enables automatic posting from POS transactions.',
  bank_accounts: 'Register your bank accounts and link them to GL cash accounts. At least one bank account is required for AP payments and AR receipts.',
  pos_posting: 'Enable automatic posting of POS transactions to the general ledger. Once enabled, every tender will generate journal entries.',
};

const STORAGE_KEY = 'oppsera_accounting_setup_step';

export function SetupWizard({ onClose }: { onClose?: () => void }) {
  const setupStatus = useAccountingSetupStatus();
  const [currentStep, setCurrentStep] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? parseInt(saved, 10) : 0;
    }
    return 0;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(currentStep));
  }, [currentStep]);

  const steps = setupStatus.steps;
  const current = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const allComplete = setupStatus.isComplete;

  return (
    <div className="space-y-6">
      {/* Progress Bar */}
      <div>
        <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
          <span>Setup Progress</span>
          <span className="font-semibold">{setupStatus.overallPercentage}%</span>
        </div>
        <div className="h-2 rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all"
            style={{ width: `${setupStatus.overallPercentage}%` }}
          />
        </div>
      </div>

      {/* Step Indicators */}
      <div className="flex items-center gap-2">
        {steps.map((step, i) => {
          const Icon = step.isComplete ? CheckCircle : Circle;
          const isActive = i === currentStep;
          return (
            <button
              key={step.key}
              onClick={() => setCurrentStep(i)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-100 text-indigo-700'
                  : step.isComplete
                    ? 'bg-green-50 text-green-700'
                    : 'bg-gray-100 text-gray-500'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{step.label.split(' ').slice(0, 2).join(' ')}</span>
              <span className="sm:hidden">{i + 1}</span>
            </button>
          );
        })}
      </div>

      {/* Current Step Detail */}
      {current && (
        <div className="rounded-lg border border-gray-200 bg-surface p-6">
          <div className="flex items-start gap-4">
            {(() => {
              const StepIcon = STEP_ICONS[current.key] ?? ClipboardCheck;
              return (
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  current.isComplete ? 'bg-green-100' : 'bg-indigo-100'
                }`}>
                  <StepIcon className={`h-5 w-5 ${current.isComplete ? 'text-green-600' : 'text-indigo-600'}`} />
                </div>
              );
            })()}
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-gray-900">
                Step {currentStep + 1}: {current.label}
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                {STEP_DESCRIPTIONS[current.key]}
              </p>

              <div className="mt-4 flex items-center gap-2">
                {current.isComplete ? (
                  <span className="flex items-center gap-1 text-sm font-medium text-green-600">
                    <CheckCircle className="h-4 w-4" /> Complete
                  </span>
                ) : (
                  <Link
                    href={current.href}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Configure <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
          disabled={currentStep === 0}
          className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-800 disabled:opacity-30"
        >
          <ArrowLeft className="h-4 w-4" /> Previous
        </button>

        {isLastStep ? (
          allComplete && onClose ? (
            <button
              onClick={onClose}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              Setup Complete — Close Wizard
            </button>
          ) : (
            <span className="text-sm text-gray-500">
              Complete all steps to finish setup
            </span>
          )
        ) : (
          <button
            onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
            className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            Next <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
