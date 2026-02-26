'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { AccountPicker } from '@/components/accounting/account-picker';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { useAccountingSettings } from '@/hooks/use-accounting';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import type { BreakageRecognitionMethod } from '@/types/accounting';

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
    defaultTipsPayableAccountId: null as string | null,
    defaultServiceChargeRevenueAccountId: null as string | null,
    defaultCashOverShortAccountId: null as string | null,
    defaultCompExpenseAccountId: null as string | null,
    defaultReturnsAccountId: null as string | null,
    defaultPayrollClearingAccountId: null as string | null,
    roundingToleranceCents: 5,
    enableCogsPosting: false,
    enableInventoryPosting: false,
    postByLocation: false,
    enableUndepositedFundsWorkflow: false,
    cogsPostingMode: 'disabled' as 'disabled' | 'perpetual' | 'periodic',
    periodicCogsMethod: 'weighted_average' as string,
    recognizeBreakageAutomatically: true,
    breakageRecognitionMethod: 'on_expiry' as BreakageRecognitionMethod,
    breakageIncomeAccountId: null as string | null,
    voucherExpiryEnabled: true,
    enableAutoRemap: false,
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
        defaultTipsPayableAccountId: settings.defaultTipsPayableAccountId ?? null,
        defaultServiceChargeRevenueAccountId: settings.defaultServiceChargeRevenueAccountId ?? null,
        defaultCashOverShortAccountId: settings.defaultCashOverShortAccountId ?? null,
        defaultCompExpenseAccountId: settings.defaultCompExpenseAccountId ?? null,
        defaultReturnsAccountId: settings.defaultReturnsAccountId ?? null,
        defaultPayrollClearingAccountId: settings.defaultPayrollClearingAccountId ?? null,
        roundingToleranceCents: settings.roundingToleranceCents,
        enableCogsPosting: settings.enableCogsPosting,
        enableInventoryPosting: settings.enableInventoryPosting,
        postByLocation: settings.postByLocation,
        enableUndepositedFundsWorkflow: settings.enableUndepositedFundsWorkflow,
        cogsPostingMode: settings.cogsPostingMode ?? 'disabled',
        periodicCogsMethod: settings.periodicCogsMethod ?? 'weighted_average',
        recognizeBreakageAutomatically: settings.recognizeBreakageAutomatically ?? true,
        breakageRecognitionMethod: settings.breakageRecognitionMethod ?? 'on_expiry',
        breakageIncomeAccountId: settings.breakageIncomeAccountId ?? null,
        voucherExpiryEnabled: settings.voucherExpiryEnabled ?? true,
        enableAutoRemap: settings.enableAutoRemap ?? false,
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
          defaultTipsPayableAccountId: form.defaultTipsPayableAccountId,
          defaultServiceChargeRevenueAccountId: form.defaultServiceChargeRevenueAccountId,
          defaultCashOverShortAccountId: form.defaultCashOverShortAccountId,
          defaultCompExpenseAccountId: form.defaultCompExpenseAccountId,
          defaultReturnsAccountId: form.defaultReturnsAccountId,
          defaultPayrollClearingAccountId: form.defaultPayrollClearingAccountId,
          roundingToleranceCents: form.roundingToleranceCents,
          enableCogsPosting: form.enableCogsPosting,
          enableInventoryPosting: form.enableInventoryPosting,
          postByLocation: form.postByLocation,
          enableUndepositedFundsWorkflow: form.enableUndepositedFundsWorkflow,
          cogsPostingMode: form.cogsPostingMode,
          periodicCogsMethod: form.cogsPostingMode === 'periodic' ? form.periodicCogsMethod : undefined,
          recognizeBreakageAutomatically: form.recognizeBreakageAutomatically,
          breakageRecognitionMethod: form.breakageRecognitionMethod,
          breakageIncomeAccountId: form.breakageIncomeAccountId,
          voucherExpiryEnabled: form.voucherExpiryEnabled,
          enableAutoRemap: form.enableAutoRemap,
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
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
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
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">General</h2>
          <div className="rounded-lg border border-border bg-surface p-4 space-y-4">
            <FormField label="Base Currency">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                USD — US Dollar
                <span className="text-xs text-muted-foreground">(Multi-currency coming soon)</span>
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
                    className="h-4 w-4 border-border text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-foreground">Auto-post entries</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="autoPostMode"
                    checked={form.autoPostMode === 'draft_only'}
                    onChange={() => setForm((f) => ({ ...f, autoPostMode: 'draft_only' }))}
                    className="h-4 w-4 border-border text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-foreground">Create as draft (manual posting)</span>
                </label>
              </div>
            </FormField>
          </div>
        </section>

        {/* Default Accounts */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Default Accounts</h2>
          <div className="rounded-lg border border-border bg-surface p-4 space-y-4">
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

        {/* Operations Accounts */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Operations Accounts</h2>
          <div className="rounded-lg border border-border bg-surface p-4 space-y-4">
            {[
              { key: 'defaultTipsPayableAccountId', label: 'Tips Payable', help: 'Liability account for collected tips pending payout' },
              { key: 'defaultServiceChargeRevenueAccountId', label: 'Service Charge Revenue', help: 'Revenue account for automatic service charges' },
              { key: 'defaultCashOverShortAccountId', label: 'Cash Over/Short', help: 'Expense account for drawer count variances at close' },
              { key: 'defaultCompExpenseAccountId', label: 'Comp Expense', help: 'Expense account for manager comps (separate from discounts)' },
              { key: 'defaultReturnsAccountId', label: 'Returns & Allowances', help: 'Contra-revenue account for product returns' },
              { key: 'defaultPayrollClearingAccountId', label: 'Payroll Clearing', help: 'Clearing account for tip payouts via payroll' },
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
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Posting Options</h2>
          <div className="rounded-lg border border-border bg-surface p-4 space-y-4">
            <FormField label="Rounding Tolerance (cents)" helpText="Max allowed imbalance before auto-rounding. Default: 5 cents">
              <input
                type="number"
                min="0"
                max="100"
                value={form.roundingToleranceCents}
                onChange={(e) => setForm((f) => ({ ...f, roundingToleranceCents: parseInt(e.target.value) || 0 }))}
                className="w-24 rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </FormField>

            <FormField label="COGS Posting Mode" helpText="How cost of goods sold is recorded in the general ledger">
              <div className="space-y-2">
                {([
                  { value: 'disabled', label: 'Disabled', desc: 'No COGS posting' },
                  { value: 'perpetual', label: 'Perpetual', desc: 'COGS posted per-tender at time of sale' },
                  { value: 'periodic', label: 'Periodic', desc: 'COGS calculated at period-end' },
                ] as const).map(({ value, label, desc }) => (
                  <label key={value} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="cogsPostingMode"
                      checked={form.cogsPostingMode === value}
                      onChange={() => setForm((f) => ({ ...f, cogsPostingMode: value }))}
                      className="h-4 w-4 border-border text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-foreground">
                      {label} <span className="text-muted-foreground">— {desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </FormField>

            {form.cogsPostingMode === 'periodic' && (
              <FormField label="Periodic Calculation Method">
                <Select
                  options={[
                    { value: 'weighted_average', label: 'Weighted Average' },
                    { value: 'fifo', label: 'FIFO' },
                    { value: 'standard', label: 'Standard Cost' },
                  ]}
                  value={form.periodicCogsMethod}
                  onChange={(v) => setForm((f) => ({ ...f, periodicCogsMethod: v as string }))}
                />
              </FormField>
            )}

            {[
              { key: 'enableInventoryPosting', label: 'Enable Inventory Posting', help: 'Auto-post inventory asset changes when stock moves' },
              { key: 'postByLocation', label: 'Post by Location', help: 'Include location dimension on journal lines for multi-location reporting' },
              { key: 'enableUndepositedFundsWorkflow', label: 'Enable Undeposited Funds', help: 'POS → Undeposited Funds → Bank deposit workflow' },
            ].map(({ key, label, help }) => (
              <label key={key} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form[key as keyof typeof form] as boolean}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <span className="text-sm font-medium text-foreground">{label}</span>
                  <p className="text-xs text-muted-foreground">{help}</p>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* GL Remap */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">GL Remap</h2>
          <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.enableAutoRemap}
                onChange={(e) => setForm((f) => ({ ...f, enableAutoRemap: e.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <span className="text-sm font-medium text-foreground">Auto-remap on mapping save</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When enabled, saving a GL mapping automatically voids and reposts affected transactions
                  with corrected accounts. Applies to tenders where all missing mappings are now configured.
                </p>
              </div>
            </label>
            {form.enableAutoRemap && (
              <div className="ml-7 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3">
                <p className="text-xs font-medium text-amber-500">Risks to consider:</p>
                <ul className="mt-1 text-xs text-amber-500 list-disc pl-4 space-y-0.5">
                  <li>Original GL entries will be voided and replaced — creates reversal + new posting pairs</li>
                  <li>Large batches (up to 50 tenders at a time) may take several seconds</li>
                  <li>If a period has already been closed or exported, remapped entries may create discrepancies</li>
                  <li>All remaps are audit-logged and can be reviewed in the Unmapped Events tab</li>
                </ul>
                <p className="mt-2 text-xs text-amber-500">
                  You can always use the manual &quot;Preview &amp; Remap&quot; tool on the Mappings page regardless of this setting.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Vouchers / Gift Cards */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Vouchers / Gift Cards</h2>
          <div className="rounded-lg border border-border bg-surface p-4 space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.voucherExpiryEnabled}
                onChange={(e) => setForm((f) => ({ ...f, voucherExpiryEnabled: e.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <span className="text-sm font-medium text-foreground">Allow voucher expiration</span>
                <p className="text-xs text-muted-foreground">When disabled, vouchers never expire (required in some jurisdictions, e.g. California)</p>
              </div>
            </label>

            {!form.voucherExpiryEnabled && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                <p className="text-xs text-amber-500">
                  With expiration disabled, vouchers will remain as outstanding liabilities indefinitely. No breakage income will be recognized.
                </p>
              </div>
            )}

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.recognizeBreakageAutomatically}
                onChange={(e) => setForm((f) => ({ ...f, recognizeBreakageAutomatically: e.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <span className="text-sm font-medium text-foreground">Automatically recognize breakage income</span>
                <p className="text-xs text-muted-foreground">When disabled, expired vouchers queue for manual review before GL posting</p>
              </div>
            </label>

            <FormField label="Recognition Method" helpText="How breakage income is recognized when a voucher expires">
              <div className="space-y-2">
                {([
                  { value: 'on_expiry', label: 'On Expiry', desc: 'Full balance recognized when voucher expires' },
                  { value: 'proportional', label: 'Proportional', desc: 'Recognized over voucher life (GAAP preferred)' },
                  { value: 'manual_only', label: 'Manual Only', desc: 'Never auto-recognize; always queue for review' },
                ] as const).map(({ value, label, desc }) => (
                  <label key={value} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="breakageRecognitionMethod"
                      checked={form.breakageRecognitionMethod === value}
                      onChange={() => setForm((f) => ({ ...f, breakageRecognitionMethod: value }))}
                      className="h-4 w-4 border-border text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-foreground">
                      {label} <span className="text-muted-foreground">— {desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </FormField>

            <FormField label="Breakage Income Account" helpText="GL account for breakage income recognition (overrides per-voucher-type setting)">
              <div className="flex items-center gap-2">
                <AccountPicker
                  value={form.breakageIncomeAccountId}
                  onChange={(v) => setForm((f) => ({ ...f, breakageIncomeAccountId: v }))}
                  className="flex-1"
                  accountTypes={['revenue']}
                />
                {!form.breakageIncomeAccountId && (
                  <span title="Falls back to per-voucher-type account">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                  </span>
                )}
              </div>
            </FormField>
          </div>
        </section>

        {/* Period Lock */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Period Lock</h2>
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Lock Period Through</p>
                <p className="text-sm text-muted-foreground">
                  {settings?.lockPeriodThrough ?? 'No periods locked'}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                Entries cannot be posted to locked periods
              </span>
            </div>
          </div>
        </section>

        {/* Save */}
        <div className="flex justify-end border-t border-border pt-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </AccountingPageShell>
  );
}
