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
    key: 'golf',
    label: 'Golf Course',
    description: 'Green fees, cart rentals, pro shop, F&B, course maintenance',
    icon: '⛳',
  },
  {
    key: 'retail',
    label: 'Retail',
    description: 'Merchandise sales, inventory, COGS, POS operations',
    icon: '🏪',
  },
  {
    key: 'restaurant',
    label: 'Restaurant',
    description: 'Food & beverage revenue, kitchen costs, bar operations',
    icon: '🍽️',
  },
  {
    key: 'hybrid',
    label: 'Hybrid / Multi-Venue',
    description: 'Combined operations with all revenue streams',
    icon: '🏢',
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
    setIsBootstrapping(true);
    setErrorDetail(null);
    try {
      const res = await apiFetch<{ data: { accountCount: number; classificationCount: number } }>(
        '/api/v1/accounting/bootstrap',
        {
          method: 'POST',
          body: JSON.stringify({
            templateKey: selectedTemplate,
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
      toast.error(isMigration ? 'Database migrations need to be run first' : message);
      setErrorDetail(message);
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
                  ? 'bg-green-500/15 text-green-600'
                  : i === step
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-500/10 text-gray-400'
              }`}
            >
              {i < step ? <CheckCircle className="h-5 w-5" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-8 ${i < step ? 'bg-green-500/40' : 'bg-gray-500/20'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      {step === 0 && (
        <div className="text-center space-y-4">
          <Landmark className="mx-auto h-16 w-16 text-indigo-600" />
          <h2 className="text-xl font-semibold text-gray-900">Set Up Accounting</h2>
          <p className="text-gray-500">
            We&apos;ll create a chart of accounts, configure default settings, and set up GL mappings
            so your sales automatically flow into your general ledger.
          </p>
          <button
            type="button"
            onClick={() => setStep(1)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Get Started <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Choose a Template</h2>
          <p className="text-sm text-gray-500">
            Select the template that best matches your business. Accounts can be customized after setup.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setSelectedTemplate(t.key)}
                className={`rounded-lg border-2 p-4 text-left transition-colors ${
                  selectedTemplate === t.key
                    ? 'border-indigo-600 bg-indigo-500/10'
                    : 'border-gray-500/20 hover:border-gray-500/40'
                }`}
              >
                <span className="text-2xl">{t.icon}</span>
                <h3 className="mt-2 text-sm font-semibold text-gray-900">{t.label}</h3>
                <p className="mt-1 text-xs text-gray-500">{t.description}</p>
              </button>
            ))}
          </div>
          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={() => setStep(0)}
              className="rounded-lg border border-gray-500/30 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-500/10"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => selectedTemplate && setStep(2)}
              disabled={!selectedTemplate}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Select Your State</h2>
          <p className="text-sm text-gray-500">
            Choose your state to customize tax-related account names. You can skip this and edit later.
          </p>
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            className="w-full rounded-lg border border-gray-500/30 bg-surface px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">Skip (leave as placeholder)</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {selectedState && (
            <div className="rounded-lg border border-gray-500/20 bg-gray-500/5 p-3 text-sm text-gray-500">
              Preview: <span className="font-medium text-gray-900">Sales Tax Payable - {selectedState}</span>
            </div>
          )}
          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-lg border border-gray-500/30 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-500/10"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Review Template</h2>
          <p className="text-sm text-gray-500">
            The <strong>{TEMPLATES.find((t) => t.key === selectedTemplate)?.label}</strong> template
            will create a standard chart of accounts including:
          </p>
          <div className="rounded-lg border border-gray-500/20 bg-gray-500/5 p-4 space-y-2 text-sm text-gray-600">
            <p>• Asset accounts (cash, bank, receivables, inventory)</p>
            <p>• Liability accounts (payables, tax payable, loans)</p>
            <p>• Equity accounts (retained earnings, owner&apos;s equity)</p>
            <p>• Revenue accounts (specific to your business type)</p>
            <p>• Expense accounts (payroll, rent, utilities, supplies)</p>
          </div>
          {selectedState && (
            <p className="text-xs text-gray-500">
              State-specific accounts will be customized for <strong>{selectedState}</strong>.
            </p>
          )}
          <p className="text-xs text-gray-500">
            All accounts can be customized, added, or removed after setup.
          </p>
          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-lg border border-gray-500/30 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-500/10"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep(4)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Ready to Set Up</h2>
          <p className="text-sm text-gray-500">
            Click below to create your chart of accounts and configure default settings.
            This will also set up control accounts for AP, AR, and sales tax.
          </p>
          {errorDetail && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700">
              <p className="font-medium">Setup failed</p>
              <p className="mt-1 text-xs break-all">{errorDetail}</p>
            </div>
          )}
          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="rounded-lg border border-gray-500/30 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-500/10"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleBootstrap}
              disabled={isBootstrapping}
              className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isBootstrapping ? 'Setting up...' : errorDetail ? 'Retry' : 'Create Accounts'}
            </button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="text-center space-y-4">
          <Sparkles className="mx-auto h-16 w-16 text-green-500" />
          <h2 className="text-xl font-semibold text-gray-900">Accounting is Ready!</h2>
          <p className="text-gray-500">
            Your chart of accounts has been created. Here are some next steps:
          </p>
          <div className="mx-auto max-w-sm space-y-2">
            <Link
              href="/accounting/accounts"
              onClick={onComplete}
              className="flex items-center gap-3 rounded-lg border border-gray-500/20 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-500/10"
            >
              <BookOpen className="h-5 w-5 text-gray-400" />
              Review Chart of Accounts
            </Link>
            <Link
              href="/accounting/mappings"
              onClick={onComplete}
              className="flex items-center gap-3 rounded-lg border border-gray-500/20 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-500/10"
            >
              <Settings2 className="h-5 w-5 text-gray-400" />
              Configure GL Mappings
            </Link>
            <Link
              href="/accounting/settings"
              onClick={onComplete}
              className="flex items-center gap-3 rounded-lg border border-gray-500/20 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-500/10"
            >
              <Settings2 className="h-5 w-5 text-gray-400" />
              Accounting Settings
            </Link>
          </div>
          <button
            type="button"
            onClick={onComplete}
            className="mt-4 rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
