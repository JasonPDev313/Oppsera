'use client';

import { useEffect, useState } from 'react';
import { Save, Loader2, Check, AlertTriangle, X } from 'lucide-react';
import { useAccountingTemplate } from '@/hooks/use-business-type-detail';

const CURRENCIES = ['USD', 'CAD', 'GBP', 'AUD', 'EUR'] as const;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function AccountingTab({
  versionId,
  isReadOnly,
}: {
  versionId: string;
  isReadOnly: boolean;
}) {
  const { template, isLoading, isSaving, error, load, save } =
    useAccountingTemplate(versionId);

  // Revenue Categories
  const [serviceRevenue, setServiceRevenue] = useState('');
  const [retailRevenue, setRetailRevenue] = useState('');
  const [foodRevenue, setFoodRevenue] = useState('');
  const [beverageRevenue, setBeverageRevenue] = useState('');

  // Payment GL Mappings
  const [cash, setCash] = useState('');
  const [creditCard, setCreditCard] = useState('');
  const [giftCard, setGiftCard] = useState('');
  const [memberCharge, setMemberCharge] = useState('');

  // Tax
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [separateTaxLiability, setSeparateTaxLiability] = useState(true);

  // COGS
  const [cogsBehavior, setCogsBehavior] = useState('disabled');

  // Deferred Revenue
  const [deferredEnabled, setDeferredEnabled] = useState(false);
  const [deferredAccount, setDeferredAccount] = useState('');

  // Fiscal
  const [fiscalMonth, setFiscalMonth] = useState('01');
  const [reportingCurrency, setReportingCurrency] = useState('USD');

  useEffect(() => {
    load();
  }, [load]);

  // Sync from loaded template
  useEffect(() => {
    if (!template) return;
    const rev = template.revenueCategories ?? {};
    setServiceRevenue(rev.serviceRevenue ?? '');
    setRetailRevenue(rev.retailRevenue ?? '');
    setFoodRevenue(rev.foodRevenue ?? '');
    setBeverageRevenue(rev.beverageRevenue ?? '');

    const pay = template.paymentGlMappings ?? {};
    setCash(pay.cash ?? '');
    setCreditCard(pay.creditCard ?? '');
    setGiftCard(pay.giftCard ?? '');
    setMemberCharge(pay.memberCharge ?? '');

    const tax = template.taxBehavior ?? {};
    setTaxInclusive(tax.defaultTaxInclusive ?? false);
    setSeparateTaxLiability(tax.separateTaxLiability ?? true);

    setCogsBehavior(template.cogsBehavior ?? 'disabled');

    const def = template.deferredRevenue ?? {};
    setDeferredEnabled(def.enabled ?? false);
    setDeferredAccount(def.liabilityAccount ?? '');

    const fiscal = template.fiscalSettings ?? {};
    setFiscalMonth(fiscal.fiscalYearStart?.split('-')[0] ?? '01');
    setReportingCurrency(fiscal.reportingCurrency ?? 'USD');
  }, [template]);

  const handleSave = async () => {
    try {
      await save({
        revenueCategories: {
          serviceRevenue: serviceRevenue || undefined,
          retailRevenue: retailRevenue || undefined,
          foodRevenue: foodRevenue || undefined,
          beverageRevenue: beverageRevenue || undefined,
        },
        paymentGlMappings: {
          cash: cash || undefined,
          creditCard: creditCard || undefined,
          giftCard: giftCard || undefined,
          memberCharge: memberCharge || undefined,
        },
        taxBehavior: {
          defaultTaxInclusive: taxInclusive,
          separateTaxLiability,
        },
        cogsBehavior,
        deferredRevenue: {
          enabled: deferredEnabled,
          liabilityAccount: deferredAccount || undefined,
        },
        fiscalSettings: {
          fiscalYearStart: `${fiscalMonth}-01`,
          reportingCurrency,
        },
      });
    } catch {
      // error is set in hook
    }
  };

  if (isLoading && !template) {
    return <div className="text-center text-slate-400 py-12">Loading accounting template...</div>;
  }

  if (error && !template) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
        {error}
      </div>
    );
  }

  const validationStatus = template?.validationStatus ?? 'incomplete';
  const validationErrors = (template?.validationErrors ?? []) as string[];

  return (
    <div className="max-w-3xl space-y-6">
      {/* Validation Status */}
      <div className="flex items-center gap-3">
        <ValidationBadge status={validationStatus} />
        {isReadOnly && (
          <span className="text-xs text-amber-400">Read-only — create a new draft to edit</span>
        )}
      </div>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 space-y-1">
          {validationErrors.map((err, i) => (
            <p key={i} className="text-sm text-red-400 flex items-center gap-2">
              <X size={14} className="shrink-0" />
              {err}
            </p>
          ))}
        </div>
      )}

      {/* Revenue Categories */}
      <Section title="Revenue Categories">
        <GlInput label="Service Revenue" value={serviceRevenue} onChange={setServiceRevenue} disabled={isReadOnly} />
        <GlInput label="Retail Revenue" value={retailRevenue} onChange={setRetailRevenue} disabled={isReadOnly} />
        <GlInput label="Food Revenue" value={foodRevenue} onChange={setFoodRevenue} disabled={isReadOnly} />
        <GlInput label="Beverage Revenue" value={beverageRevenue} onChange={setBeverageRevenue} disabled={isReadOnly} />
      </Section>

      {/* Payment GL Mappings */}
      <Section title="Payment GL Mappings">
        <GlInput label="Cash" value={cash} onChange={setCash} disabled={isReadOnly} />
        <GlInput label="Credit Card" value={creditCard} onChange={setCreditCard} disabled={isReadOnly} />
        <GlInput label="Gift Card" value={giftCard} onChange={setGiftCard} disabled={isReadOnly} />
        <GlInput label="Member Charge" value={memberCharge} onChange={setMemberCharge} disabled={isReadOnly} />
      </Section>

      {/* Tax Behavior */}
      <Section title="Tax Behavior">
        <div className="space-y-3">
          <ToggleRow label="Tax Inclusive Pricing" checked={taxInclusive} onChange={setTaxInclusive} disabled={isReadOnly} />
          <ToggleRow label="Separate Tax Liability Account" checked={separateTaxLiability} onChange={setSeparateTaxLiability} disabled={isReadOnly} />
        </div>
      </Section>

      {/* COGS Behavior */}
      <Section title="COGS Behavior">
        <div className="flex gap-2">
          {['disabled', 'perpetual', 'periodic'].map((mode) => (
            <button
              key={mode}
              onClick={() => !isReadOnly && setCogsBehavior(mode)}
              disabled={isReadOnly}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                cogsBehavior === mode
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-700 text-slate-400 hover:text-white'
              } ${isReadOnly ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </Section>

      {/* Deferred Revenue */}
      <Section title="Deferred Revenue">
        <ToggleRow label="Enable Deferred Revenue" checked={deferredEnabled} onChange={setDeferredEnabled} disabled={isReadOnly} />
        {deferredEnabled && (
          <GlInput label="Liability Account" value={deferredAccount} onChange={setDeferredAccount} disabled={isReadOnly} />
        )}
      </Section>

      {/* Fiscal Settings */}
      <Section title="Fiscal Settings">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="fiscal-month" className="block text-sm font-medium text-slate-300 mb-1.5">
              Fiscal Year Start Month
            </label>
            <select
              id="fiscal-month"
              value={fiscalMonth}
              onChange={(e) => setFiscalMonth(e.target.value)}
              disabled={isReadOnly}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={String(i + 1).padStart(2, '0')}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="currency" className="block text-sm font-medium text-slate-300 mb-1.5">
              Reporting Currency
            </label>
            <select
              id="currency"
              value={reportingCurrency}
              onChange={(e) => setReportingCurrency(e.target.value)}
              disabled={isReadOnly}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      {/* Save */}
      {!isReadOnly && (
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save Accounting Template
          </button>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
      <h3 className="text-sm font-semibold text-white mb-4">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function GlInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-4">
      <label className="w-40 text-sm text-slate-400 shrink-0">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="GL account code"
        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
      />
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-300">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
        } ${checked ? 'bg-indigo-600' : 'bg-slate-600'}`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

function ValidationBadge({ status }: { status: string }) {
  if (status === 'valid') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-400">
        <Check size={14} />
        Valid
      </span>
    );
  }
  if (status === 'invalid') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-red-500/20 text-red-400">
        <X size={14} />
        Invalid
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-500/20 text-amber-400">
      <AlertTriangle size={14} />
      Incomplete
    </span>
  );
}
