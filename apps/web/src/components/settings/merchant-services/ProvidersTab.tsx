'use client';

import { useState, useCallback } from 'react';
import {
  CreditCard,
  Plus,
  CheckCircle2,
  XCircle,
  MoreVertical,
  Shield,
  Loader2,
  Link2,
  Key,
  Server,
} from 'lucide-react';
import {
  usePaymentProviders,
  useProviderCredentials,
  usePaymentProcessorMutations,
} from '@/hooks/use-payment-processors';
import type { ProviderSummary } from '@/hooks/use-payment-processors';
import { DialogOverlay } from './_shared';

// ── Provider Options ─────────────────────────────────────────
const PROVIDER_OPTIONS = [
  { code: 'cardconnect', displayName: 'CardConnect', providerType: 'both' as const, available: true, recommended: true },
  { code: 'clover', displayName: 'Clover', providerType: 'both' as const, available: true, recommended: true },
  { code: 'adyen', displayName: 'Adyen', providerType: 'gateway' as const, available: false, recommended: false },
  { code: 'square', displayName: 'Square', providerType: 'both' as const, available: false, recommended: false },
  { code: 'worldpay', displayName: 'Worldpay', providerType: 'gateway' as const, available: false, recommended: false },
] as const;

export default function ProvidersTab({
  onNavigateToMids,
}: {
  onNavigateToMids?: () => void;
}) {
  const { providers, isLoading } = usePaymentProviders();
  const mutations = usePaymentProcessorMutations();

  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [testResult, setTestResult] = useState<{ providerId: string; success: boolean; message: string } | null>(null);

  const selectedProvider = providers.find((p) => p.id === selectedProviderId) ?? null;

  const handleSelect = useCallback(
    (p: ProviderSummary) => {
      setSelectedProviderId(p.id);
      onNavigateToMids?.();
    },
    [onNavigateToMids],
  );

  if (isLoading) {
    return <div className="py-12 text-center text-muted-foreground">Loading providers...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-foreground">Payment Providers</h2>
        <button
          onClick={() => setShowAddProvider(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> Add Provider
        </button>
      </div>

      {providers.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-input p-12 text-center">
          <CreditCard className="mx-auto h-12 w-12 text-muted-foreground" />
          <p className="mt-4 text-sm font-medium text-foreground">No payment providers configured</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a payment provider like CardPointe to start processing card payments.
          </p>
          <button
            onClick={() => setShowAddProvider(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" /> Add Provider
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {providers.map((p) => (
            <div
              key={p.id}
              className={`cursor-pointer rounded-lg border p-4 transition-shadow hover:shadow-md ${
                selectedProviderId === p.id
                  ? 'border-indigo-500 ring-1 ring-indigo-500'
                  : 'border-border'
              }`}
              onClick={() => handleSelect(p)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-foreground">{p.displayName}</h3>
                    {p.isActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-500">
                        <CheckCircle2 className="h-3 w-3" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        <XCircle className="h-3 w-3" /> Inactive
                      </span>
                    )}
                    {p.isSandbox && (
                      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                        Sandbox
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Code: <code className="text-xs">{p.code}</code> &middot; Type: {p.providerType}
                  </p>
                </div>
                <div className="relative">
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="rounded p-1 hover:bg-muted"
                  >
                    <MoreVertical className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Key className="h-3.5 w-3.5" />
                  {p.hasCredentials ? 'Credentials saved' : 'No credentials'}
                </span>
                <span className="flex items-center gap-1">
                  <Server className="h-3.5 w-3.5" />
                  {p.merchantAccountCount} MID{p.merchantAccountCount !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedProviderId(p.id);
                    setShowCredentials(true);
                  }}
                  className="rounded border border-input px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                >
                  <Shield className="mr-1 inline-block h-3 w-3" />
                  Credentials
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setTestResult(null);
                    mutations.testConnection.mutate(
                      { providerId: p.id },
                      {
                        onSuccess: (data) => setTestResult({ providerId: p.id, success: data.success, message: data.message }),
                        onError: (err) => setTestResult({ providerId: p.id, success: false, message: err instanceof Error ? err.message : 'Connection test failed' }),
                      },
                    );
                  }}
                  disabled={mutations.testConnection.isPending || !p.hasCredentials}
                  className="rounded border border-input px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
                >
                  {mutations.testConnection.isPending ? (
                    <Loader2 className="mr-1 inline-block h-3 w-3 animate-spin" />
                  ) : (
                    <Link2 className="mr-1 inline-block h-3 w-3" />
                  )}
                  Test
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    mutations.updateProvider.mutate({ providerId: p.id, isActive: !p.isActive });
                  }}
                  className="rounded border border-input px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                >
                  {p.isActive ? 'Deactivate' : 'Activate'}
                </button>
              </div>

              {/* Inline test result */}
              {testResult && testResult.providerId === p.id && (
                <div
                  className={`mt-2 flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium ${
                    testResult.success
                      ? 'bg-green-500/10 text-green-500'
                      : 'bg-red-500/10 text-red-500'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 shrink-0" />
                  )}
                  {testResult.message}
                  <button
                    onClick={(e) => { e.stopPropagation(); setTestResult(null); }}
                    className="ml-auto shrink-0 text-current opacity-60 hover:opacity-100"
                  >
                    &times;
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Provider Dialog */}
      {showAddProvider && (
        <AddProviderDialog
          onClose={() => setShowAddProvider(false)}
          onSubmit={(input) => {
            mutations.createProvider.mutate(input, {
              onSuccess: () => setShowAddProvider(false),
            });
          }}
          isLoading={mutations.createProvider.isPending}
          existingCodes={providers.map((p) => p.code)}
        />
      )}

      {/* Credentials Dialog */}
      {showCredentials && selectedProviderId && (
        <CredentialsDialogWrapper
          providerId={selectedProviderId}
          providerCode={selectedProvider?.code ?? ''}
          onClose={() => setShowCredentials(false)}
          mutations={mutations}
        />
      )}
    </div>
  );
}

// ── Credentials Dialog Wrapper (owns its own data hook) ──────
function CredentialsDialogWrapper({
  providerId,
  providerCode,
  onClose,
  mutations,
}: {
  providerId: string;
  providerCode: string;
  onClose: () => void;
  mutations: ReturnType<typeof usePaymentProcessorMutations>;
}) {
  const { credentials, isLoading } = useProviderCredentials(providerId);
  const [site, setSite] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSandbox, setIsSandbox] = useState(false);

  const hasExisting = credentials.length > 0;

  return (
    <DialogOverlay onClose={onClose}>
      <h3 className="text-lg font-semibold text-foreground">
        {providerCode === 'cardpointe' ? 'CardPointe' : providerCode} Credentials
      </h3>

      {isLoading && <p className="mt-2 text-sm text-muted-foreground">Loading...</p>}

      {hasExisting && (
        <div className="mt-3 rounded-md bg-green-500/10 p-3 text-sm text-green-500">
          Credentials are saved. Enter new values to update, or test the existing connection.
        </div>
      )}

      <div className="mt-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-foreground">Site (Merchant ID)</label>
          <input
            type="text"
            value={site}
            onChange={(e) => setSite(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            placeholder="fts"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground">API Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            placeholder="testing"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground">API Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            placeholder="testing123"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isSandbox}
            onChange={(e) => setIsSandbox(e.target.checked)}
            className="rounded border-input"
          />
          <span className="text-foreground">Sandbox / Test Mode</span>
        </label>
      </div>

      {mutations.testConnection.data && (
        <div
          className={`mt-3 rounded-md p-3 text-sm ${
            mutations.testConnection.data.success
              ? 'bg-green-500/10 text-green-500'
              : 'bg-red-500/10 text-red-500'
          }`}
        >
          {mutations.testConnection.data.success
            ? 'Connection successful!'
            : `Connection failed: ${mutations.testConnection.data.message}`}
        </div>
      )}

      <div className="mt-6 flex justify-between">
        <button
          onClick={() =>
            mutations.testConnection.mutate({
              providerId,
              credentials: { site, username, password },
            })
          }
          disabled={mutations.testConnection.isPending || !site || !username || !password}
          className="inline-flex items-center gap-1.5 rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
        >
          {mutations.testConnection.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Link2 className="h-4 w-4" />
          )}
          Test Connection
        </button>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              mutations.saveCredentials.mutate(
                { providerId, credentials: { site, username, password }, isSandbox },
                { onSuccess: () => onClose() },
              )
            }
            disabled={mutations.saveCredentials.isPending || !site || !username || !password}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {mutations.saveCredentials.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Credentials
          </button>
        </div>
      </div>
    </DialogOverlay>
  );
}

// ── Add Provider Dialog ──────────────────────────────────────
function AddProviderDialog({
  onClose,
  onSubmit,
  isLoading,
  existingCodes,
}: {
  onClose: () => void;
  onSubmit: (input: { code: string; displayName: string; providerType: string }) => void;
  isLoading: boolean;
  existingCodes: string[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedOption = PROVIDER_OPTIONS.find((o) => o.code === selected);
  const isAlreadyAdded = selected ? existingCodes.includes(selected) : false;

  return (
    <DialogOverlay onClose={onClose}>
      <h3 className="text-lg font-semibold text-foreground">Add Payment Provider</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Select a payment processor to integrate with your business.
      </p>
      <div className="mt-4 space-y-2">
        {PROVIDER_OPTIONS.map((option) => {
          const alreadyAdded = existingCodes.includes(option.code);
          return (
            <button
              key={option.code}
              onClick={() => option.available && !alreadyAdded && setSelected(option.code)}
              disabled={!option.available || alreadyAdded}
              className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors ${
                selected === option.code
                  ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500'
                  : option.available && !alreadyAdded
                    ? 'border-border hover:border-input hover:bg-muted'
                    : 'border-border bg-muted opacity-60'
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{option.displayName}</span>
                  {option.recommended && (
                    <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-500">
                      Recommended
                    </span>
                  )}
                  {alreadyAdded && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      Already added
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {option.providerType === 'both'
                    ? 'Online + In-person'
                    : option.providerType === 'gateway'
                      ? 'Online only'
                      : 'In-person only'}
                </span>
              </div>
              {!option.available && (
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  Coming Soon
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            if (selectedOption && selectedOption.available) {
              onSubmit({
                code: selectedOption.code,
                displayName: selectedOption.displayName,
                providerType: selectedOption.providerType,
              });
            }
          }}
          disabled={isLoading || !selectedOption || !selectedOption.available || isAlreadyAdded}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Add Provider
        </button>
      </div>
    </DialogOverlay>
  );
}
