'use client';

import { useState, useCallback } from 'react';
import { CreditCard, Info, Loader2, Trash2 } from 'lucide-react';
import {
  usePaymentProviders,
  useSurchargeSettings,
  useSurchargeMutations,
} from '@/hooks/use-payment-processors';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DC','DE','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','PR','RI','SC','SD','TN','TX',
  'UT','VT','VA','WA','WV','WI','WY',
];

const DEFAULT_PROHIBITED_STATES = ['CT', 'ME', 'MA', 'OK', 'PR'];

export default function SurchargingTab() {
  const { providers, isLoading: providersLoading } = usePaymentProviders();
  const { settings, isLoading: settingsLoading } = useSurchargeSettings(undefined, true);
  const surchargeMutations = useSurchargeMutations();

  const isLoading = providersLoading || settingsLoading;
  const activeProviders = providers.filter((p) => p.isActive);
  const [selectedProviderId, setSelectedProviderId] = useState(activeProviders[0]?.id ?? '');

  const existingSetting = settings.find(
    (s) => s.providerId === selectedProviderId && !s.locationId && !s.terminalId,
  );

  const [isEnabled, setIsEnabled] = useState(existingSetting?.isEnabled ?? false);
  const [surchargeRate, setSurchargeRate] = useState(
    existingSetting ? (Number(existingSetting.surchargeRate) * 100).toFixed(2) : '3.50',
  );
  const [maxRate, setMaxRate] = useState(
    existingSetting ? (Number(existingSetting.maxSurchargeRate) * 100).toFixed(2) : '4.00',
  );
  const [applyToCreditOnly, setApplyToCreditOnly] = useState(
    existingSetting?.applyToCreditOnly ?? true,
  );
  const [exemptDebit, setExemptDebit] = useState(existingSetting?.exemptDebit ?? true);
  const [exemptPrepaid, setExemptPrepaid] = useState(existingSetting?.exemptPrepaid ?? true);
  const [customerDisclosure, setCustomerDisclosure] = useState(
    existingSetting?.customerDisclosureText ??
      'A surcharge of {rate}% will be applied to credit card transactions.',
  );
  const [receiptDisclosure, setReceiptDisclosure] = useState(
    existingSetting?.receiptDisclosureText ?? 'Credit Card Surcharge: ${amount}',
  );
  const [prohibitedStates, setProhibitedStates] = useState<string[]>(
    existingSetting?.prohibitedStates ?? DEFAULT_PROHIBITED_STATES,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleProviderChange = useCallback(
    (providerId: string) => {
      setSelectedProviderId(providerId);
      const setting = settings.find(
        (s) => s.providerId === providerId && !s.locationId && !s.terminalId,
      );
      setIsEnabled(setting?.isEnabled ?? false);
      setSurchargeRate(setting ? (Number(setting.surchargeRate) * 100).toFixed(2) : '3.50');
      setMaxRate(setting ? (Number(setting.maxSurchargeRate) * 100).toFixed(2) : '4.00');
      setApplyToCreditOnly(setting?.applyToCreditOnly ?? true);
      setExemptDebit(setting?.exemptDebit ?? true);
      setExemptPrepaid(setting?.exemptPrepaid ?? true);
      setCustomerDisclosure(
        setting?.customerDisclosureText ??
          'A surcharge of {rate}% will be applied to credit card transactions.',
      );
      setReceiptDisclosure(setting?.receiptDisclosureText ?? 'Credit Card Surcharge: ${amount}');
      setProhibitedStates(setting?.prohibitedStates ?? DEFAULT_PROHIBITED_STATES);
      setConfirmDelete(false);
    },
    [settings],
  );

  const rateNum = parseFloat(surchargeRate) / 100;
  const maxRateNum = parseFloat(maxRate) / 100;
  const rateValid = !isNaN(rateNum) && rateNum >= 0 && rateNum <= 0.1;
  const maxRateValid = !isNaN(maxRateNum) && maxRateNum >= 0 && maxRateNum <= 0.1;
  const rateExceedsMax = rateValid && maxRateValid && rateNum > maxRateNum;

  const handleSave = useCallback(() => {
    if (!selectedProviderId || !rateValid || !maxRateValid || rateExceedsMax) return;
    surchargeMutations.saveSurcharge.mutate({
      providerId: selectedProviderId,
      isEnabled,
      surchargeRate: rateNum,
      maxSurchargeRate: maxRateNum,
      applyToCreditOnly,
      exemptDebit,
      exemptPrepaid,
      customerDisclosureText: customerDisclosure,
      receiptDisclosureText: receiptDisclosure,
      prohibitedStates,
    });
  }, [
    selectedProviderId,
    isEnabled,
    rateNum,
    maxRateNum,
    rateValid,
    maxRateValid,
    rateExceedsMax,
    applyToCreditOnly,
    exemptDebit,
    exemptPrepaid,
    customerDisclosure,
    receiptDisclosure,
    prohibitedStates,
    surchargeMutations.saveSurcharge,
  ]);

  const toggleState = useCallback(
    (state: string) => {
      setProhibitedStates((prev) =>
        prev.includes(state) ? prev.filter((s) => s !== state) : [...prev, state],
      );
    },
    [],
  );

  if (isLoading) {
    return <div className="py-12 text-center text-muted-foreground">Loading surcharge settings...</div>;
  }

  if (activeProviders.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-input p-12 text-center">
        <CreditCard className="mx-auto h-12 w-12 text-muted-foreground" />
        <p className="mt-4 text-sm font-medium text-foreground">No active payment providers</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Add and activate a payment provider on the Providers tab before configuring surcharging.
        </p>
      </div>
    );
  }

  const overrides = settings.filter(
    (s) => s.providerId === selectedProviderId && (s.locationId || s.terminalId),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium text-foreground">Credit Card Surcharging</h2>
          {activeProviders.length > 1 && (
            <select
              value={selectedProviderId}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="rounded-md border border-input bg-surface px-3 py-1.5 text-sm"
            >
              {activeProviders.map((p) => (
                <option key={p.id} value={p.id}>{p.displayName}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Info banner */}
      <div className="rounded-md border border-blue-500/30 bg-blue-500/10 p-3">
        <div className="flex gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
          <div className="text-sm text-blue-500">
            <p className="font-medium">Surcharging compliance</p>
            <p className="mt-1">
              Credit card surcharges are regulated by card brand rules and state laws.
              Surcharges may only be applied to credit card transactions (not debit or prepaid).
              The surcharge rate must not exceed 4% or the merchant discount rate, whichever is lower.
              Some states prohibit surcharging entirely.
            </p>
          </div>
        </div>
      </div>

      {/* Enable/disable toggle */}
      <div className="rounded-lg border border-border p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-foreground">Enable Surcharging</h3>
            <p className="text-sm text-muted-foreground">
              When enabled, a surcharge will be applied to eligible credit card transactions.
            </p>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={(e) => setIsEnabled(e.target.checked)}
              className="peer sr-only"
            />
            <div className="peer h-6 w-11 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-input after:bg-white after:transition-all after:content-[''] peer-checked:bg-indigo-600 peer-checked:after:translate-x-full peer-checked:after:border-white" />
          </label>
        </div>
      </div>

      {isEnabled && (
        <>
          {/* Rate configuration */}
          <div className="rounded-lg border border-border p-5 space-y-4">
            <h3 className="font-medium text-foreground">Rate Configuration</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-foreground">Surcharge Rate (%)</label>
                <input
                  type="text"
                  value={surchargeRate}
                  onChange={(e) => setSurchargeRate(e.target.value)}
                  className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm bg-surface ${
                    !rateValid || rateExceedsMax
                      ? 'border-red-500/30 focus:border-red-500 focus:ring-red-500'
                      : 'border-input'
                  }`}
                  placeholder="3.50"
                />
                {!rateValid && (
                  <p className="mt-1 text-xs text-red-500">Rate must be between 0% and 10%.</p>
                )}
                {rateExceedsMax && (
                  <p className="mt-1 text-xs text-red-500">
                    Rate cannot exceed the maximum rate ({maxRate}%).
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground">Maximum Rate Cap (%)</label>
                <input
                  type="text"
                  value={maxRate}
                  onChange={(e) => setMaxRate(e.target.value)}
                  className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm bg-surface ${
                    !maxRateValid
                      ? 'border-red-500/30 focus:border-red-500 focus:ring-red-500'
                      : 'border-input'
                  }`}
                  placeholder="4.00"
                />
                {!maxRateValid && (
                  <p className="mt-1 text-xs text-red-500">Max rate must be between 0% and 10%.</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">Card brand rules cap surcharges at 4%.</p>
              </div>
            </div>
          </div>

          {/* Exemptions */}
          <div className="rounded-lg border border-border p-5 space-y-4">
            <h3 className="font-medium text-foreground">Card Type Exemptions</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={applyToCreditOnly} onChange={(e) => setApplyToCreditOnly(e.target.checked)} className="rounded border-input" />
                <span className="text-foreground">Apply to credit cards only</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={exemptDebit} onChange={(e) => setExemptDebit(e.target.checked)} className="rounded border-input" />
                <span className="text-foreground">Exempt debit cards</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={exemptPrepaid} onChange={(e) => setExemptPrepaid(e.target.checked)} className="rounded border-input" />
                <span className="text-foreground">Exempt prepaid cards</span>
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Card brand rules require that surcharges not be applied to debit or prepaid cards.
              Keep these checkboxes enabled for compliance.
            </p>
          </div>

          {/* Prohibited States */}
          <div className="rounded-lg border border-border p-5 space-y-4">
            <h3 className="font-medium text-foreground">Prohibited States</h3>
            <p className="text-sm text-muted-foreground">
              Select states where surcharging is prohibited by law. Transactions from customers in
              these states will not have a surcharge applied.
            </p>
            <div className="flex flex-wrap gap-2">
              {US_STATES.map((state) => {
                const isProhibited = prohibitedStates.includes(state);
                const isDefault = DEFAULT_PROHIBITED_STATES.includes(state);
                return (
                  <button
                    key={state}
                    onClick={() => toggleState(state)}
                    className={`rounded-md px-2 py-1 text-xs font-medium border transition-colors ${
                      isProhibited
                        ? 'bg-red-500/20 border-red-500/30 text-red-500'
                        : 'bg-surface border-border text-muted-foreground hover:border-input'
                    }`}
                    title={
                      isDefault && isProhibited
                        ? `${state} — prohibited by state law (recommended)`
                        : undefined
                    }
                  >
                    {state}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Pre-selected states (CT, ME, MA, OK, PR) are known to prohibit credit card surcharges.
              Consult legal counsel for the most current regulations.
            </p>
          </div>

          {/* Disclosure Text */}
          <div className="rounded-lg border border-border p-5 space-y-4">
            <h3 className="font-medium text-foreground">Disclosure Text</h3>
            <div>
              <label className="block text-sm font-medium text-foreground">Customer Disclosure</label>
              <textarea
                value={customerDisclosure}
                onChange={(e) => setCustomerDisclosure(e.target.value)}
                className="mt-1 block w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
                rows={2}
                maxLength={500}
                placeholder="A surcharge of {rate}% will be applied to credit card transactions."
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Displayed to the customer before payment. Use <code className="rounded bg-muted px-1">{'{rate}'}</code> for the percentage.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground">Receipt Disclosure</label>
              <input
                type="text"
                value={receiptDisclosure}
                onChange={(e) => setReceiptDisclosure(e.target.value)}
                className="mt-1 block w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
                maxLength={200}
                placeholder="Credit Card Surcharge: ${amount}"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Printed on the receipt. Use <code className="rounded bg-muted px-1">{'{amount}'}</code> for the dollar amount.
              </p>
            </div>
          </div>

          {/* Overrides summary */}
          {overrides.length > 0 && (
            <div className="rounded-lg border border-border p-5">
              <h3 className="font-medium text-foreground">Location & Terminal Overrides</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {overrides.length} override{overrides.length !== 1 ? 's' : ''} configured for
                specific locations or terminals.
              </p>
              <div className="mt-3 overflow-hidden rounded-lg border border-border">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase text-muted-foreground">Scope</th>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase text-muted-foreground">Enabled</th>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase text-muted-foreground">Rate</th>
                      <th className="px-4 py-2 text-right text-xs font-medium uppercase text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-surface">
                    {overrides.map((o) => (
                      <tr key={o.id}>
                        <td className="px-4 py-2 text-sm text-foreground">
                          {o.terminalId
                            ? `Terminal: ${o.terminalId}`
                            : `Location: ${o.locationId}`}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {o.isEnabled ? (
                            <span className="text-green-500">Yes</span>
                          ) : (
                            <span className="text-muted-foreground">No</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm text-foreground">
                          {(Number(o.surchargeRate) * 100).toFixed(2)}%
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => surchargeMutations.deleteSurcharge.mutate(o.id)}
                            className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-500/10"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Save / Delete buttons */}
      <div className="flex items-center justify-between">
        <div>
          {existingSetting && (
            <>
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-500">Delete surcharge settings?</span>
                  <button
                    onClick={() => {
                      surchargeMutations.deleteSurcharge.mutate(existingSetting.id);
                      setConfirmDelete(false);
                    }}
                    className="rounded-md border border-red-500/30 px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-500/10"
                  >
                    Confirm Delete
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-md border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-red-500/30 px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" /> Delete Settings
                </button>
              )}
            </>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={surchargeMutations.saveSurcharge.isPending || !selectedProviderId || (isEnabled && (!rateValid || !maxRateValid || rateExceedsMax))}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {surchargeMutations.saveSurcharge.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Surcharge Settings
        </button>
      </div>
    </div>
  );
}
