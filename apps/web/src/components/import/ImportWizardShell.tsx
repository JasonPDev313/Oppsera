'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { StepIndicator } from './StepIndicator';
import type { StepDef } from './StepIndicator';

interface ImportWizardShellProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  steps: StepDef[];
  currentStep: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  preventClose?: boolean;
  onReset?: () => void;
  maxWidth?: 'max-w-2xl' | 'max-w-3xl' | 'max-w-4xl';
}

export function ImportWizardShell({
  open,
  onClose,
  title,
  subtitle,
  steps,
  currentStep,
  children,
  footer,
  preventClose,
  onReset,
  maxWidth = 'max-w-3xl',
}: ImportWizardShellProps) {
  // Close on Escape (unless preventClose)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !preventClose) {
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose, preventClose]);

  // Reset on close
  useEffect(() => {
    if (!open && onReset) onReset();
  }, [open]);

  if (!open) return null;

  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={preventClose ? undefined : onClose}
      />

      {/* Dialog */}
      <div
        className={`relative mx-4 w-full ${maxWidth} rounded-xl bg-surface shadow-xl flex flex-col max-h-[90vh] overflow-hidden`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {subtitle}
              </p>
            )}
          </div>
          {!preventClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-200/50 hover:text-gray-500"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Step indicator */}
        <StepIndicator steps={steps} currentStep={currentStep} />

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-700">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
