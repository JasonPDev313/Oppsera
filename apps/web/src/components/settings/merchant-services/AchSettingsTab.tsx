'use client';

import { useState } from 'react';
import { CreditCard, Landmark, Info, Loader2, CheckCircle2 } from 'lucide-react';
import {
  usePaymentProviders,
  useMerchantAccounts,
} from '@/hooks/use-payment-processors';
import type { MerchantAccountInfo } from '@/hooks/use-payment-processors';

const SEC_CODE_OPTIONS = [
  { value: 'WEB', label: 'WEB', desc: 'Internet-initiated (web/mobile payments)' },
  { value: 'PPD', label: 'PPD', desc: 'Pre-authorized (recurring autopay)' },
  { value: 'CCD', label: 'CCD', desc: 'Corporate (business-to-business)' },
  { value: 'TEL', label: 'TEL', desc: 'Telephone-initiated' },
] as const;

const VERIFICATION_MODE_OPTIONS = [
  { value: 'none', label: 'None', desc: 'No verification required' },
  { value: 'account_validation', label: 'Account Validation', desc: 'CardPointe real-time validation (WEB entries)' },
  { value: 'micro_deposit', label: 'Micro-Deposit', desc: 'Two small deposits — customer confirms amounts' },
] as const;

export default function AchSettingsTab() {
  const { providers, isLoading: providersLoading } = usePaymentProviders();
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    providers[0]?.id ?? null,
  );
  const { accounts, isLoading: accountsLoading } = useMerchantAccounts(selectedProviderId);

  if (!selectedProviderId && providers.length > 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Select a provider to configure ACH settings for its merchant accounts.
        </p>
        <div className="space-y-2">
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedProviderId(p.id)}
              className="flex w-full items-center gap-3 rounded-lg border border-border px-4 py-3 text-left hover:bg-muted"
            >
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <div>
                <span className="text-sm font-medium text-foreground">{p.displayName}</span>
                <span className="ml-2 text-xs text-muted-foreground">{p.code}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (providersLoading || accountsLoading) {
    return (
      <div className="space-y-3">
        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
        <div className="h-32 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-input py-8">
        <Landmark className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No merchant accounts found. Create a Merchant Account (MID) first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
          <div className="text-sm text-blue-500">
            <p className="font-medium">NACHA Compliance</p>
            <p className="mt-1">
              ACH payments require a Company Name that appears on customer bank statements.
              The SEC code determines how the payment was authorized.
              WEB is standard for online payments; PPD is required for recurring autopay.
            </p>
          </div>
        </div>
      </div>

      {accounts.map((mid) => (
        <AchMidSettingsCard key={mid.id} mid={mid} />
      ))}
    </div>
  );
}

function AchMidSettingsCard({ mid }: { mid: MerchantAccountInfo }) {
  const [achEnabled, setAchEnabled] = useState((mid as any).achEnabled ?? false);
  const [secCode, setSecCode] = useState((mid as any).achDefaultSecCode ?? 'WEB');
  const [companyName, setCompanyName] = useState((mid as any).achCompanyName ?? '');
  const [companyId, setCompanyId] = useState((mid as any).achCompanyId ?? '');
  const [verificationMode, setVerificationMode] = useState((mid as any).achVerificationMode ?? 'none');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/v1/settings/payment-processors/${mid.id}/ach`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          achEnabled,
          achDefaultSecCode: secCode,
          achCompanyName: companyName || undefined,
          achCompanyId: companyId || undefined,
          achVerificationMode: verificationMode,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error?.message ?? 'Failed to save');
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save ACH settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-emerald-600" />
          <h3 className="text-base font-semibold text-foreground">{mid.displayName}</h3>
          <span className="text-xs text-muted-foreground">MID: {mid.merchantId}</span>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-sm text-muted-foreground">ACH Enabled</span>
          <input
            type="checkbox"
            checked={achEnabled}
            onChange={(e) => setAchEnabled(e.target.checked)}
            className="h-4 w-4 rounded text-emerald-600"
          />
        </label>
      </div>

      {achEnabled && (
        <div className="space-y-4">
          {/* Company Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Company Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Your Company Name"
              maxLength={100}
              className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Appears on customer bank statements. Required by NACHA.
            </p>
          </div>

          {/* Company ID */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Company ID <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              type="text"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              placeholder="Originator ID"
              maxLength={50}
              className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              NACHA originator identification number.
            </p>
          </div>

          {/* Default SEC Code */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Default SEC Code</label>
            <div className="grid grid-cols-2 gap-2">
              {SEC_CODE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 ${
                    secCode === opt.value
                      ? 'border-indigo-500/30 bg-indigo-500/10'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  <input
                    type="radio"
                    name={`secCode-${mid.id}`}
                    value={opt.value}
                    checked={secCode === opt.value}
                    onChange={() => setSecCode(opt.value)}
                    className="mt-0.5 h-4 w-4 text-indigo-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-foreground">{opt.label}</span>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Verification Mode */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Bank Account Verification</label>
            <div className="space-y-2">
              {VERIFICATION_MODE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 ${
                    verificationMode === opt.value
                      ? 'border-indigo-500/30 bg-indigo-500/10'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  <input
                    type="radio"
                    name={`verify-${mid.id}`}
                    value={opt.value}
                    checked={verificationMode === opt.value}
                    onChange={() => setVerificationMode(opt.value)}
                    className="mt-0.5 h-4 w-4 text-indigo-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-foreground">{opt.label}</span>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Save / Error */}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isSaving || (achEnabled && !companyName)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save ACH Settings
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-green-500">
            <CheckCircle2 className="h-4 w-4" />
            Saved
          </span>
        )}
        {error && (
          <span className="text-sm text-red-500">{error}</span>
        )}
      </div>
    </div>
  );
}
