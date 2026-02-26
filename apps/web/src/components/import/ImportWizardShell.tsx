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
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="import-wizard-dialog-title">
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
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 id="import-wizard-dialog-title" className="text-lg font-semibold text-foreground">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
          {!preventClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            >
              <X className="h-5 w-5" aria-hidden="true" />
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
          <div className="flex items-center justify-between border-t border-border px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
