'use client';

import { useState, useCallback } from 'react';
import { CheckCircle, ChevronRight, Landmark, BookOpen, Settings2, Sparkles } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import Link from 'next/link';

interface BootstrapWizardProps {
  onComplete: () => void;
}

const TEMPLATES = [
  {
    id: 'retail',
    templateKey: 'retail',
    label: 'Retail',
    description: 'Merchandise sales, inventory, COGS, POS operations',
    icon: '🏪',
  },
  {
    id: 'restaurant',
    templateKey: 'restaurant',
    label: 'Restaurant',
    description: 'Food & beverage revenue, kitchen costs, bar operations',
    icon: '🍽️',
  },
  {
    id: 'hybrid',
    templateKey: 'hybrid',
    label: 'Hybrid / Multi-Venue',
    description: 'Combined retail, F&B, and service operations with all revenue streams',
    icon: '🏢',
  },
  {
    id: 'hotel',
    templateKey: 'hybrid',
    label: 'Hotel / Resort',
    description: 'Room revenue, F&B, spa services, and property management',
    icon: '🏨',
    subtext: 'Includes PMS integration',
  },
  {
    id: 'spa',
    templateKey: 'hybrid',
    label: 'Spa / Wellness',
    description: 'Service revenue, provider commissions, packages, and retail',
    icon: '💆',
    subtext: 'Includes Spa Management integration',
  },
  {
    id: 'enterprise',
    templateKey: 'hybrid',
    label: 'Enterprise',
    description: 'Full-featured accounts for multi-location, multi-vertical operations',
    icon: '🏗️',
  },
];

const STEPS = ['Welcome', 'Choose Template', 'State', 'Review', 'Configure', 'Complete'];

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois',
  'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts',
  'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
  'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota',
  'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
  'Wisconsin', 'Wyoming',
];

export function BootstrapWizard({ onComplete }: BootstrapWizardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<string>('');
  const [isBootstrapping, setIsBootstrapping] = useState(false);

  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const handleBootstrap = useCallback(async () => {
    if (!selectedTemplate) return;
    const template = TEMPLATES.find((t) => t.id === selectedTemplate);
    if (!template) return;
    setIsBootstrapping(true);
    setErrorDetail(null);
    try {
      const res = await apiFetch<{ data: { accountCount: number; classificationCount: number } }>(
        '/api/v1/accounting/bootstrap',
        {
          method: 'POST',
          body: JSON.stringify({
            templateKey: template.templateKey,
            stateName: selectedState || undefined,
          }),
        },
      );

      // Verify that accounts were actually created — prevents the "success but empty" loop
      if (!res.data || res.data.accountCount === 0) {
        setErrorDetail(
          'Bootstrap completed but no accounts were created. This can happen if migrations are pending. Run: pnpm db:migrate',
        );
        toast.error('No accounts created — check database migrations');
        return;
      }

      // Force refetch ALL accounting queries and WAIT for them to complete.
      // invalidateQueries marks as stale + triggers refetch, but we also
      // explicitly refetch to guarantee data is available before proceeding.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounting-settings'] }),
        queryClient.invalidateQueries({ queryKey: ['gl-accounts'] }),
        queryClient.invalidateQueries({ queryKey: ['accounting-health-summary'] }),
      ]);
      // Double-ensure: refetchQueries blocks until data is returned
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['accounting-settings'] }),
        queryClient.refetchQueries({ queryKey: ['gl-accounts'] }),
      ]);

      toast.success(`Accounting setup complete! ${res.data.accountCount} accounts created.`);
      setStep(5);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Bootstrap failed';
      const isMigration = message.includes('migration') || message.includes('schema') || message.includes('column') || message.includes('relation');
      const isNetwork = message.includes('fetch') || message.includes('network') || message.includes('Failed to fetch');
      const isTimeout = message.includes('timeout') || message.includes('timed out');
      const isPermission = message.includes('permission') || message.includes('RLS') || message.includes('denied');

      let friendlyMessage: string;
      if (isMigration) {
        friendlyMessage = 'Database schema is out of date. Database migrations need to be applied before accounting can be set up. Contact your administrator.';
      } else if (isNetwork) {
        friendlyMessage = 'Could not reach the server. Check your internet connection and try again.';
      } else if (isTimeout) {
        friendlyMessage = 'The request timed out. The server may be busy — please wait a moment and retry.';
      } else if (isPermission) {
        friendlyMessage = 'You do not have permission to set up accounting. Contact your administrator to grant the accounting.manage permission.';
      } else {
        friendlyMessage = message;
      }

      toast.error(friendlyMessage);
      setErrorDetail(friendlyMessage);
    } finally {
      setIsBootstrapping(false);
    }
  }, [selectedTemplate, selectedState, toast, queryClient]);

  return (
    <div className="mx-auto max-w-2xl">
      {/* Progress */}
      <div className="mb-8 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                i < step
                  ? 'bg-green-500/15 text-green-500'
                  : i === step
                    ? 'bg-indigo-600 text-white'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {i < step ? <CheckCircle className="h-5 w-5" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-8 ${i < step ? 'bg-green-500/40' : 'bg-muted'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      {step === 0 && (
        <div className="text-center space-y-4">
          <Landmark className="mx-auto h-16 w-16 text-indigo-500" />
          <h2 className="text-xl font-semibold text-foreground">Set Up Accounting</h2>
          <p className="text-muted-foreground">
            We&apos;ll create a chart of accounts, configure default settings, and set up GL mappings
            so your sales automatically flow into your general ledger.
          </p>
          <button
            type="button"
            onClick={() => setStep(1)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Get Started <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Choose a Template</h2>
          <p className="text-sm text-muted-foreground">
            Select the template that best matches your business. Accounts can be customized after setup.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTemplate(t.id)}
                className={`rounded-lg border-2 p-4 text-left transition-colors ${
                  selectedTemplate === t.id
                    ? 'border-indigo-600 bg-indigo-500/10'
                    : 'border-border hover:border-input'
                }`}
              >
                <span className="text-2xl">{t.icon}</span>
                <h3 className="mt-2 text-sm font-semibold text-foreground">{t.label}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
                {t.subtext && (
                  <p className="mt-1 text-xs font-medium text-indigo-400">{t.subtext}</p>
                )}
              </button>
            ))}
          </div>
          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={() => setStep(0)}
              className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => selectedTemplate && setStep(2)}
              disabled={!selectedTemplate}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Select Your State</h2>
          <p className="text-sm text-muted-foreground">
            Choose your state to customize tax-related account names. You can skip this and edit later.
          </p>
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">Skip (leave as placeholder)</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {selectedState && (
            <div className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
              Preview: <span className="font-medium text-foreground">Sales Tax Payable - {selectedState}</span>
            </div>
          )}
          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Review Template</h2>
          <p className="text-sm text-muted-foreground">
            The <strong>{TEMPLATES.find((t) => t.id === selectedTemplate)?.label}</strong> template
            will create a standard chart of accounts including:
          </p>
          <div className="rounded-lg border border-border bg-muted p-4 space-y-2 text-sm text-muted-foreground">
            <p>• Asset accounts (cash, bank, receivables, inventory)</p>
            <p>• Liability accounts (payables, tax payable, loans)</p>
            <p>• Equity accounts (retained earnings, owner&apos;s equity)</p>
            <p>• Revenue accounts (specific to your business type)</p>
            <p>• Expense accounts (payroll, rent, utilities, supplies)</p>
          </div>
          {selectedState && (
            <p className="text-xs text-muted-foreground">
              State-specific accounts will be customized for <strong>{selectedState}</strong>.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            All accounts can be customized, added, or removed after setup.
          </p>
          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep(4)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Ready to Set Up</h2>
          <p className="text-sm text-muted-foreground">
            Click below to create your chart of accounts and configure default settings.
            This will also set up control accounts for AP, AR, and sales tax.
          </p>
          {errorDetail && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0 rounded-full bg-red-500/20 p-1">
                  <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-red-500">Setup failed</p>
                  <p className="mt-1 text-sm text-red-400 wrap-break-word">{errorDetail}</p>
                </div>
              </div>
            </div>
          )}
          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleBootstrap}
              disabled={isBootstrapping}
              className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {isBootstrapping ? 'Setting up...' : errorDetail ? 'Retry' : 'Create Accounts'}
            </button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="text-center space-y-4">
          <Sparkles className="mx-auto h-16 w-16 text-green-500" />
          <h2 className="text-xl font-semibold text-foreground">Accounting is Ready!</h2>
          <p className="text-muted-foreground">
            Your chart of accounts has been created. Here are some next steps:
          </p>
          <div className="mx-auto max-w-sm space-y-2">
            <Link
              href="/accounting/accounts"
              onClick={onComplete}
              className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-accent"
            >
              <BookOpen className="h-5 w-5 text-muted-foreground" />
              Review Chart of Accounts
            </Link>
            <Link
              href="/accounting/mappings"
              onClick={onComplete}
              className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-accent"
            >
              <Settings2 className="h-5 w-5 text-muted-foreground" />
              Configure GL Mappings
            </Link>
            <Link
              href="/accounting/settings"
              onClick={onComplete}
              className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-accent"
            >
              <Settings2 className="h-5 w-5 text-muted-foreground" />
              Accounting Settings
            </Link>
          </div>
          <button
            type="button"
            onClick={onComplete}
            className="mt-4 rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
