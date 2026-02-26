'use client';

import { useState, useCallback, useEffect } from 'react';
import { Smartphone, Info, Loader2 } from 'lucide-react';
import {
  usePaymentProviders,
  useMerchantAccounts,
  usePaymentProcessorMutations,
} from '@/hooks/use-payment-processors';

export default function WalletsTab() {
  const { providers, isLoading } = usePaymentProviders();
  const mutations = usePaymentProcessorMutations();
  const activeProviders = providers.filter((p) => p.isActive);
  const [selectedProviderId, setSelectedProviderId] = useState(activeProviders[0]?.id ?? '');
  const selectedProvider = activeProviders.find((p) => p.id === selectedProviderId) ?? null;

  const { accounts } = useMerchantAccounts(selectedProviderId || null);
  const defaultMid = (accounts.find((a) => a.isDefault) ?? accounts[0])?.merchantId ?? '';

  const existingConfig = selectedProvider?.config ?? {};
  const [enableApplePay, setEnableApplePay] = useState(!!existingConfig.enableApplePay);
  const [enableGooglePay, setEnableGooglePay] = useState(!!existingConfig.enableGooglePay);
  const [googlePayMerchantId, setGooglePayMerchantId] = useState(
    (existingConfig.googlePayMerchantId as string) ?? '',
  );
  const [googlePayGatewayId, setGooglePayGatewayId] = useState(
    (existingConfig.googlePayGatewayId as string) ?? '',
  );

  // Auto-fill Gateway Merchant ID from the provider's default merchant account
  useEffect(() => {
    if (enableGooglePay && !googlePayGatewayId && defaultMid) {
      setGooglePayGatewayId(defaultMid);
    }
  }, [enableGooglePay, googlePayGatewayId, defaultMid]);

  const handleProviderChange = useCallback((providerId: string) => {
    setSelectedProviderId(providerId);
    const provider = providers.find((p) => p.id === providerId);
    const config = provider?.config ?? {};
    setEnableApplePay(!!config.enableApplePay);
    setEnableGooglePay(!!config.enableGooglePay);
    setGooglePayMerchantId((config.googlePayMerchantId as string) ?? '');
    setGooglePayGatewayId((config.googlePayGatewayId as string) ?? '');
  }, [providers]);

  const handleSave = useCallback(() => {
    if (!selectedProviderId) return;
    const mergedConfig = {
      ...existingConfig,
      enableApplePay,
      enableGooglePay,
      googlePayMerchantId: enableGooglePay ? googlePayMerchantId : undefined,
      googlePayGatewayId: enableGooglePay ? googlePayGatewayId : undefined,
    };
    mutations.updateProvider.mutate({ providerId: selectedProviderId, config: mergedConfig });
  }, [
    selectedProviderId,
    existingConfig,
    enableApplePay,
    enableGooglePay,
    googlePayMerchantId,
    googlePayGatewayId,
    mutations.updateProvider,
  ]);

  const googlePayValid = !enableGooglePay || (googlePayMerchantId.trim() !== '' && googlePayGatewayId.trim() !== '');

  if (isLoading) {
    return <div className="py-12 text-center text-muted-foreground">Loading providers...</div>;
  }

  if (activeProviders.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-input p-12 text-center">
        <Smartphone className="mx-auto h-12 w-12 text-muted-foreground" />
        <p className="mt-4 text-sm font-medium text-foreground">No active payment providers</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Add and activate a payment provider on the Providers tab before configuring wallet payments.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium text-foreground">Wallet Payment Configuration</h2>
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

      <p className="text-sm text-muted-foreground">
        Enable Apple Pay and Google Pay for customer-facing payment surfaces (Guest Pay, Member Portal, Booking Engine).
        Wallet payments are not available on POS terminals.
      </p>

      {/* Apple Pay */}
      <div className="rounded-lg border border-border p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-900 text-white">
              <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M15.24 5.26C14.34 6.33 12.95 7.13 11.77 7.05c-.18-1.3.47-2.7 1.21-3.56.84-1 2.32-1.73 3.52-1.77.15 1.38-.38 2.74-1.26 3.54zM16.48 7.45c-1.95-.12-3.6 1.11-4.52 1.11-.93 0-2.35-1.05-3.88-1.02-2 .03-3.84 1.16-4.87 2.95-2.08 3.59-.54 8.91 1.5 11.83.99 1.44 2.17 3.06 3.72 3 1.49-.06 2.06-.96 3.87-.96s2.32.96 3.9.93c1.61-.03 2.62-1.47 3.61-2.91 1.13-1.63 1.59-3.22 1.62-3.3-.04-.02-3.11-1.19-3.14-4.73-.03-2.96 2.42-4.38 2.53-4.45-1.38-2.04-3.54-2.26-4.3-2.32l-.04-.13z" fill="currentColor"/>
              </svg>
            </div>
            <div>
              <h3 className="font-medium text-foreground">Apple Pay</h3>
              <p className="text-sm text-muted-foreground">Accept payments via Apple Pay on Safari and iOS devices.</p>
            </div>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={enableApplePay}
              onChange={(e) => setEnableApplePay(e.target.checked)}
              className="peer sr-only"
            />
            <div className="peer h-6 w-11 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-input after:bg-white after:transition-all after:content-[''] peer-checked:bg-indigo-600 peer-checked:after:translate-x-full peer-checked:after:border-white" />
          </label>
        </div>

        {enableApplePay && (
          <div className="mt-4 rounded-md border border-blue-500/30 bg-blue-500/10 p-3">
            <div className="flex gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
              <div className="text-sm text-blue-500">
                <p className="font-medium">Domain verification required</p>
                <p className="mt-1">
                  Apple Pay requires a domain association file at{' '}
                  <code className="rounded bg-blue-500/20 px-1 py-0.5 text-xs">
                    /.well-known/apple-developer-merchantid-domain-association
                  </code>{' '}
                  on each domain where Apple Pay is used. Contact your Apple Developer account administrator
                  to register your domains and obtain the verification file.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Google Pay */}
      <div className="rounded-lg border border-border p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface border border-border">
              <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M19.17 10.23c0-.7-.06-1.37-.18-2.02H10v3.83h5.14a4.39 4.39 0 0 1-1.91 2.88v2.39h3.09c1.81-1.67 2.85-4.12 2.85-7.08z" fill="#4285F4"/>
                <path d="M10 20c2.58 0 4.74-.86 6.32-2.32l-3.09-2.39c-.85.57-1.94.91-3.23.91-2.48 0-4.58-1.68-5.33-3.93H1.48v2.47A9.99 9.99 0 0 0 10 20z" fill="#34A853"/>
                <path d="M4.67 12.27A6.01 6.01 0 0 1 4.36 10c0-.79.14-1.55.31-2.27V5.26H1.48A9.99 9.99 0 0 0 0 10c0 1.61.39 3.14 1.07 4.49l3.6-2.22z" fill="#FBBC05"/>
                <path d="M10 3.96c1.4 0 2.66.48 3.64 1.43l2.73-2.73A9.99 9.99 0 0 0 10 0 9.99 9.99 0 0 0 1.48 5.26l3.19 2.47C5.42 5.64 7.52 3.96 10 3.96z" fill="#EA4335"/>
              </svg>
            </div>
            <div>
              <h3 className="font-medium text-foreground">Google Pay</h3>
              <p className="text-sm text-muted-foreground">Accept payments via Google Pay on Chrome and Android devices.</p>
            </div>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={enableGooglePay}
              onChange={(e) => setEnableGooglePay(e.target.checked)}
              className="peer sr-only"
            />
            <div className="peer h-6 w-11 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-input after:bg-white after:transition-all after:content-[''] peer-checked:bg-indigo-600 peer-checked:after:translate-x-full peer-checked:after:border-white" />
          </label>
        </div>

        {enableGooglePay && (
          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-foreground">
                Google Pay Merchant ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={googlePayMerchantId}
                onChange={(e) => setGooglePayMerchantId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
                placeholder="BCR2DN4T..."
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Your Google Pay merchant ID from the Google Pay & Wallet Console.
                Required for production. Leave empty for TEST environment.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground">
                Gateway Merchant ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={googlePayGatewayId}
                onChange={(e) => setGooglePayGatewayId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
                placeholder="Your CardPointe merchant ID"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Your CardPointe MID passed to the CardConnect gateway for Google Pay transactions.
                {defaultMid ? ' Auto-filled from your default merchant account.' : ''}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={mutations.updateProvider.isPending || !selectedProviderId || !googlePayValid}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {mutations.updateProvider.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Wallet Settings
        </button>
      </div>
    </div>
  );
}
