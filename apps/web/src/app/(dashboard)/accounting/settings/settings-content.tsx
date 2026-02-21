'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { AccountPicker } from '@/components/accounting/account-picker';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { useAccountingSettings } from '@/hooks/use-accounting';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';

const MONTHS = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

export default function SettingsContent() {
  const { data: settings, isLoading, mutate } = useAccountingSettings();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const [form, setForm] = useState({
    fiscalYearStartMonth: '1',
    autoPostMode: 'auto_post' as 'auto_post' | 'draft_only',
    defaultAPControlAccountId: null as string | null,
    defaultARControlAccountId: null as string | null,
    defaultSalesTaxPayableAccountId: null as string | null,
    defaultUndepositedFundsAccountId: null as string | null,
    defaultRetainedEarningsAccountId: null as string | null,
    defaultRoundingAccountId: null as string | null,
    roundingToleranceCents: 5,
    enableCogsPosting: false,
    enableInventoryPosting: false,
    postByLocation: false,
    enableUndepositedFundsWorkflow: false,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        fiscalYearStartMonth: String(settings.fiscalYearStartMonth),
        autoPostMode: settings.autoPostMode,
        defaultAPControlAccountId: settings.defaultAPControlAccountId,
        defaultARControlAccountId: settings.defaultARControlAccountId,
        defaultSalesTaxPayableAccountId: settings.defaultSalesTaxPayableAccountId,
        defaultUndepositedFundsAccountId: settings.defaultUndepositedFundsAccountId,
        defaultRetainedEarningsAccountId: settings.defaultRetainedEarningsAccountId,
        defaultRoundingAccountId: settings.defaultRoundingAccountId,
        roundingToleranceCents: settings.roundingToleranceCents,
        enableCogsPosting: settings.enableCogsPosting,
        enableInventoryPosting: settings.enableInventoryPosting,
        postByLocation: settings.postByLocation,
        enableUndepositedFundsWorkflow: settings.enableUndepositedFundsWorkflow,
      });
    }
  }, [settings]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await apiFetch('/api/v1/accounting/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          fiscalYearStartMonth: parseInt(form.fiscalYearStartMonth),
          autoPostMode: form.autoPostMode,
          defaultAPControlAccountId: form.defaultAPControlAccountId,
          defaultARControlAccountId: form.defaultARControlAccountId,
          defaultSalesTaxPayableAccountId: form.defaultSalesTaxPayableAccountId,
          defaultUndepositedFundsAccountId: form.defaultUndepositedFundsAccountId,
          defaultRetainedEarningsAccountId: form.defaultRetainedEarningsAccountId,
          defaultRoundingAccountId: form.defaultRoundingAccountId,
          roundingToleranceCents: form.roundingToleranceCents,
          enableCogsPosting: form.enableCogsPosting,
          enableInventoryPosting: form.enableInventoryPosting,
          postByLocation: form.postByLocation,
          enableUndepositedFundsWorkflow: form.enableUndepositedFundsWorkflow,
        }),
      });
      toast.success('Settings saved');
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  }, [form, mutate, toast]);

  if (isLoading) {
    return (
      <AccountingPageShell title="Accounting Settings" breadcrumbs={[{ label: 'Settings' }]}>
        <div className="space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      </AccountingPageShell>
    );
  }

  return (
    <AccountingPageShell title="Accounting Settings" breadcrumbs={[{ label: 'Settings' }]}>
      <div className="mx-auto max-w-2xl space-y-8">
        {/* General */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">General</h2>
          <div className="rounded-lg border border-gray-200 bg-surface p-4 space-y-4">
            <FormField label="Base Currency">
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                USD — US Dollar
                <span className="text-xs text-gray-400">(Multi-currency coming soon)</span>
              </div>
            </FormField>

            <FormField label="Fiscal Year Start Month">
              <Select
                options={MONTHS}
                value={form.fiscalYearStartMonth}
                onChange={(v) => setForm((f) => ({ ...f, fiscalYearStartMonth: v as string }))}
              />
            </FormField>

            <FormField label="Auto-Post Mode" helpText="Controls whether new entries are automatically posted or saved as drafts">
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="autoPostMode"
                    checked={form.autoPostMode === 'auto_post'}
                    onChange={() => setForm((f) => ({ ...f, autoPostMode: 'auto_post' }))}
                    className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">Auto-post entries</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="autoPostMode"
                    checked={form.autoPostMode === 'draft_only'}
                    onChange={() => setForm((f) => ({ ...f, autoPostMode: 'draft_only' }))}
                    className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">Create as draft (manual posting)</span>
                </label>
              </div>
            </FormField>
          </div>
        </section>

        {/* Default Accounts */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Default Accounts</h2>
          <div className="rounded-lg border border-gray-200 bg-surface p-4 space-y-4">
            {[
              { key: 'defaultAPControlAccountId', label: 'AP Control Account', help: 'Used for accounts payable postings' },
              { key: 'defaultARControlAccountId', label: 'AR Control Account', help: 'Used for accounts receivable postings' },
              { key: 'defaultSalesTaxPayableAccountId', label: 'Sales Tax Payable', help: 'Used for tax collection postings' },
              { key: 'defaultUndepositedFundsAccountId', label: 'Undeposited Funds', help: 'Holds funds between POS collection and bank deposit' },
              { key: 'defaultRetainedEarningsAccountId', label: 'Retained Earnings', help: 'Year-end net income is transferred here' },
              { key: 'defaultRoundingAccountId', label: 'Rounding Account', help: 'Absorbs small rounding differences in journal entries' },
            ].map(({ key, label, help }) => (
              <FormField key={key} label={label} helpText={help}>
                <div className="flex items-center gap-2">
                  <AccountPicker
                    value={form[key as keyof typeof form] as string | null}
                    onChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
                    className="flex-1"
                  />
                  {!form[key as keyof typeof form] && (
                    <span title="Not configured">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                    </span>
                  )}
                </div>
              </FormField>
            ))}
          </div>
        </section>

        {/* Posting Options */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Posting Options</h2>
          <div className="rounded-lg border border-gray-200 bg-surface p-4 space-y-4">
            <FormField label="Rounding Tolerance (cents)" helpText="Max allowed imbalance before auto-rounding. Default: 5 cents">
              <input
                type="number"
                min="0"
                max="100"
                value={form.roundingToleranceCents}
                onChange={(e) => setForm((f) => ({ ...f, roundingToleranceCents: parseInt(e.target.value) || 0 }))}
                className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </FormField>

            {[
              { key: 'enableCogsPosting', label: 'Enable COGS Posting', help: 'Auto-post cost of goods sold when sales are recorded' },
              { key: 'enableInventoryPosting', label: 'Enable Inventory Posting', help: 'Auto-post inventory asset changes when stock moves' },
              { key: 'postByLocation', label: 'Post by Location', help: 'Include location dimension on journal lines for multi-location reporting' },
              { key: 'enableUndepositedFundsWorkflow', label: 'Enable Undeposited Funds', help: 'POS → Undeposited Funds → Bank deposit workflow' },
            ].map(({ key, label, help }) => (
              <label key={key} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form[key as keyof typeof form] as boolean}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">{label}</span>
                  <p className="text-xs text-gray-500">{help}</p>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* Period Lock */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Period Lock</h2>
          <div className="rounded-lg border border-gray-200 bg-surface p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Lock Period Through</p>
                <p className="text-sm text-gray-500">
                  {settings?.lockPeriodThrough ?? 'No periods locked'}
                </p>
              </div>
              <span className="text-xs text-gray-400">
                Entries cannot be posted to locked periods
              </span>
            </div>
          </div>
        </section>

        {/* Save */}
        <div className="flex justify-end border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </AccountingPageShell>
  );
}
