'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  CheckCircle2,
  XCircle,
  Shield,
  Loader2,
  Server,
  Settings2,
  Cpu,
  ArrowLeft,
  AlertTriangle,
  Eye,
  EyeOff,
  Save,
  ShieldCheck,
  X,
  FlaskConical,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Landmark,
  Copy,
} from 'lucide-react';
import {
  usePaymentProviders,
  useMerchantAccounts,
  usePaymentProcessorMutations,
  useMerchantAccountSetup,
  useVerifyCredentials,
} from '@/hooks/use-payment-processors';
import type {
  MerchantAccountInfo,
  VerifyCredentialRow,
} from '@/hooks/use-payment-processors';
import { DialogOverlay, ToggleRow } from './_shared';

// ── CardPointe Sandbox / UAT Test Data ──────────────────────
const SANDBOX_DEFAULTS = {
  site: 'fts-uat',
  merchantId: '496160873888',
  displayName: 'Sandbox Test Account',
} as const;

const SANDBOX_TEST_CREDENTIALS = {
  site: 'fts-uat',
  username: 'testing',
  password: 'testing123',
  authorizationKey: '',
  achUsername: '',
  achPassword: '',
  fundingUsername: '',
  fundingPassword: '',
} as const;

const SANDBOX_TEST_CARDS = [
  { brand: 'Visa', number: '4111 1111 1111 1111', use: 'Standard approval' },
  { brand: 'Visa', number: '4444 3333 2222 1111', use: 'Standard approval (alt)' },
  { brand: 'Visa', number: '4387 7501 0101 0101', use: 'Partial authorization ($6+)' },
  { brand: 'Visa', number: '4999 0062 0062 0062', use: 'Timeout (respcode 62)' },
  { brand: 'Visa', number: '4000 0654 3342 1984', use: 'Amount-driven response codes' },
  { brand: 'Mastercard', number: '5111 1111 1111 1111', use: 'Standard approval' },
  { brand: 'Mastercard', number: '5111 0062 0062 0062', use: 'Timeout (respcode 62)' },
  { brand: 'Amex', number: '3411 115992 42008', use: 'Association response codes' },
  { brand: 'Discover', number: '6011 0009 9550 0000', use: 'Standard approval' },
  { brand: 'Discover', number: '6465 0062 0062 0062', use: 'Timeout (respcode 62)' },
] as const;

const SANDBOX_ACH_DATA = {
  routingNumbers: ['036001808', '011401533'],
  note: 'Any account number accepted in UAT. Format: routing/account (e.g. 036001808/1234567890)',
} as const;

export default function MerchantAccountsTab() {
  const { providers } = usePaymentProviders();
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const { accounts, isLoading } = useMerchantAccounts(selectedProviderId);
  const mutations = usePaymentProcessorMutations();

  const [showAddMid, setShowAddMid] = useState(false);
  const [editingMid, setEditingMid] = useState<MerchantAccountInfo | null>(null);
  const [setupAccountId, setSetupAccountId] = useState<string | null>(null);
  const [showVerifyReport, setShowVerifyReport] = useState(false);

  if (setupAccountId && selectedProviderId) {
    return (
      <MerchantAccountSetupPanel
        providerId={selectedProviderId}
        accountId={setupAccountId}
        onBack={() => setSetupAccountId(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium text-foreground">Merchant Accounts</h2>
          {providers.length > 0 && (
            <select
              value={selectedProviderId ?? ''}
              onChange={(e) => setSelectedProviderId(e.target.value || null)}
              className="rounded-md border border-input bg-surface px-3 py-1.5 text-sm"
            >
              <option value="">Select provider...</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowVerifyReport(true)}
            disabled={!selectedProviderId || accounts.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-sm font-medium text-indigo-400 hover:bg-indigo-500/20 disabled:opacity-50"
          >
            <ShieldCheck className="h-4 w-4" /> Verify Credentials
          </button>
          <button
            onClick={() => setShowAddMid(true)}
            disabled={!selectedProviderId}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Add MID
          </button>
        </div>
      </div>

      {!selectedProviderId ? (
        <div className="rounded-lg border-2 border-dashed border-input p-12 text-center">
          <p className="text-sm text-muted-foreground">Select a provider to manage merchant accounts.</p>
        </div>
      ) : isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading merchant accounts...</div>
      ) : accounts.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-input p-12 text-center">
          <Server className="mx-auto h-12 w-12 text-muted-foreground" />
          <p className="mt-4 text-sm font-medium text-foreground">No merchant accounts</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a merchant ID (MID) to start processing payments with this provider.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Merchant ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Display Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Location</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {accounts.map((a) => (
                <tr key={a.id} className="hover:bg-accent/50">
                  <td className="px-4 py-3 text-sm font-mono text-foreground">
                    {a.merchantId}
                    {a.isDefault && (
                      <span className="ml-2 rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs font-medium text-indigo-400">
                        Default
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">{a.displayName}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{a.locationId ?? 'Tenant-wide'}</td>
                  <td className="px-4 py-3 text-sm">
                    {a.isActive ? (
                      <span className="text-green-500">Active</span>
                    ) : (
                      <span className="text-muted-foreground">Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setSetupAccountId(a.id)}
                        className="inline-flex items-center gap-1 rounded bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-400 hover:bg-indigo-500/20"
                      >
                        <Settings2 className="h-3 w-3" /> Setup
                      </button>
                      {!a.isDefault && a.isActive && (
                        <button
                          onClick={() =>
                            mutations.updateMerchantAccount.mutate({
                              providerId: a.providerId,
                              accountId: a.id,
                              isDefault: true,
                            })
                          }
                          className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                        >
                          Set Default
                        </button>
                      )}
                      <button
                        onClick={() => setEditingMid(a)}
                        className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                      >
                        Edit
                      </button>
                      {a.isActive && (
                        <button
                          onClick={() =>
                            mutations.deleteMerchantAccount.mutate({
                              providerId: a.providerId,
                              accountId: a.id,
                            })
                          }
                          className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-500/10"
                        >
                          Deactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialogs */}
      {showAddMid && selectedProviderId && (
        <AddMidDialog
          onClose={() => setShowAddMid(false)}
          onSubmit={(input) => {
            mutations.createMerchantAccount.mutate(
              { ...input, providerId: selectedProviderId },
              { onSuccess: () => setShowAddMid(false) },
            );
          }}
          isLoading={mutations.createMerchantAccount.isPending}
        />
      )}

      {editingMid && (
        <EditMidDialog
          account={editingMid}
          onClose={() => setEditingMid(null)}
          onSubmit={(input) => {
            mutations.updateMerchantAccount.mutate(
              { providerId: editingMid.providerId, accountId: editingMid.id, ...input },
              { onSuccess: () => setEditingMid(null) },
            );
          }}
          isLoading={mutations.updateMerchantAccount.isPending}
        />
      )}

      {showVerifyReport && selectedProviderId && (
        <VerifyCredentialsReport
          providerId={selectedProviderId}
          onClose={() => setShowVerifyReport(false)}
        />
      )}
    </div>
  );
}

// ── Add MID Dialog ───────────────────────────────────────────
function AddMidDialog({
  onClose,
  onSubmit,
  isLoading,
}: {
  onClose: () => void;
  onSubmit: (input: { merchantId: string; displayName: string; isDefault: boolean }) => void;
  isLoading: boolean;
}) {
  const [merchantId, setMerchantId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  return (
    <DialogOverlay onClose={onClose}>
      <h3 className="text-lg font-semibold text-foreground">Add Merchant Account</h3>
      <div className="mt-4 space-y-3">
        {/* Sandbox quick-fill */}
        <button
          type="button"
          onClick={() => {
            setMerchantId(SANDBOX_DEFAULTS.merchantId);
            setDisplayName(SANDBOX_DEFAULTS.displayName);
          }}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-500 hover:bg-amber-500/20"
        >
          <FlaskConical className="h-4 w-4" />
          Use Sandbox UAT Test MID
        </button>
        <div>
          <label className="block text-sm font-medium text-foreground">Merchant ID (MID)</label>
          <input
            type="text"
            value={merchantId}
            onChange={(e) => setMerchantId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            placeholder="496160873888"
          />
          <p className="mt-1 text-xs text-muted-foreground">Your processor-assigned merchant identifier.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            placeholder="Main Processing Account"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="rounded border-input" />
          <span className="text-foreground">Set as default MID for this provider</span>
        </label>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent">Cancel</button>
        <button
          onClick={() => onSubmit({ merchantId, displayName, isDefault })}
          disabled={isLoading || !merchantId || !displayName}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Add MID
        </button>
      </div>
    </DialogOverlay>
  );
}

// ── Edit MID Dialog ──────────────────────────────────────────
function EditMidDialog({
  account,
  onClose,
  onSubmit,
  isLoading,
}: {
  account: MerchantAccountInfo;
  onClose: () => void;
  onSubmit: (input: { displayName: string; isDefault: boolean }) => void;
  isLoading: boolean;
}) {
  const [displayName, setDisplayName] = useState(account.displayName);
  const [isDefault, setIsDefault] = useState(account.isDefault);

  return (
    <DialogOverlay onClose={onClose}>
      <h3 className="text-lg font-semibold text-foreground">Edit Merchant Account</h3>
      <p className="mt-1 text-sm text-muted-foreground">MID: {account.merchantId}</p>
      <div className="mt-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-foreground">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="rounded border-input" />
          <span className="text-foreground">Set as default MID for this provider</span>
        </label>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent">Cancel</button>
        <button
          onClick={() => onSubmit({ displayName, isDefault })}
          disabled={isLoading || !displayName}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Changes
        </button>
      </div>
    </DialogOverlay>
  );
}

// ── Merchant Account Setup Panel ─────────────────────────────
function MerchantAccountSetupPanel({
  providerId,
  accountId,
  onBack,
}: {
  providerId: string;
  accountId: string;
  onBack: () => void;
}) {
  const { setup, isLoading, save, isSaving, saveError, refetch } =
    useMerchantAccountSetup(providerId, accountId);
  const [showVerify, setShowVerify] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [hsn, setHsn] = useState('');
  const [achMerchantId, setAchMerchantId] = useState('');
  const [fundingMerchantId, setFundingMerchantId] = useState('');
  const [useForCardSwipe, setUseForCardSwipe] = useState(true);
  const [readerBeep, setReaderBeep] = useState(true);
  const [isProduction, setIsProduction] = useState(false);
  const [allowManualEntry, setAllowManualEntry] = useState(false);
  const [tipOnDevice, setTipOnDevice] = useState(false);

  const [credSite, setCredSite] = useState('');
  const [credUsername, setCredUsername] = useState('');
  const [credPassword, setCredPassword] = useState('');
  const [credAuthKey, setCredAuthKey] = useState('');
  const [credAchUsername, setCredAchUsername] = useState('');
  const [credAchPassword, setCredAchPassword] = useState('');
  const [credFundingUsername, setCredFundingUsername] = useState('');
  const [credFundingPassword, setCredFundingPassword] = useState('');

  const [showPasswords, setShowPasswords] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showTestData, setShowTestData] = useState(false);

  useEffect(() => {
    if (!setup) return;
    const a = setup.account;
    setDisplayName(a.displayName);
    setHsn(a.hsn ?? '');
    setAchMerchantId(a.achMerchantId ?? '');
    setFundingMerchantId(a.fundingMerchantId ?? '');
    setUseForCardSwipe(a.useForCardSwipe);
    setReaderBeep(a.readerBeep);
    setIsProduction(a.isProduction);
    setAllowManualEntry(a.allowManualEntry);
    setTipOnDevice(a.tipOnDevice);
    if (setup.credentials.site) {
      setCredSite(setup.credentials.site);
    }
  }, [setup]);

  const handleSave = () => {
    const body: Record<string, unknown> = {
      displayName,
      hsn: hsn || null,
      achMerchantId: achMerchantId || null,
      fundingMerchantId: fundingMerchantId || null,
      useForCardSwipe,
      readerBeep,
      isProduction,
      allowManualEntry,
      tipOnDevice,
    };

    if (credUsername && credPassword) {
      body.credentials = {
        site: credSite || 'fts-uat',
        username: credUsername,
        password: credPassword,
        authorizationKey: credAuthKey || undefined,
        achUsername: credAchUsername || undefined,
        achPassword: credAchPassword || undefined,
        fundingUsername: credFundingUsername || undefined,
        fundingPassword: credFundingPassword || undefined,
      };
    }

    save(body, {
      onSuccess: () => {
        setSaved(true);
        refetch();
        setTimeout(() => setSaved(false), 3000);
      },
    });
  };

  if (isLoading) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
        <p className="mt-2">Loading merchant account setup...</p>
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-red-500">Merchant account not found.</p>
        <button onClick={onBack} className="mt-4 text-sm text-indigo-500 hover:text-indigo-400">
          &larr; Back to Merchant Accounts
        </button>
      </div>
    );
  }

  const maskedCreds = setup.credentials;
  const hasSavedCreds = !!setup.credentialId;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Back">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Merchant Account Setup</h2>
          <p className="text-sm text-muted-foreground">
            {setup.account.displayName} &mdash; MID: <code className="text-xs">{setup.account.merchantId}</code>
          </p>
        </div>
      </div>

      {/* Credentials Section */}
      <fieldset className="rounded-lg border border-border p-5">
        <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-foreground">
          <Shield className="h-4 w-4 text-indigo-500" />
          CardPointe Credentials
        </legend>
        <div className="mt-3 space-y-4">
          {/* ── Testing / Production Mode Toggle ── */}
          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Environment Mode</p>
              <div className="inline-flex rounded-lg border border-input bg-surface p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsProduction(false);
                    setCredSite(SANDBOX_TEST_CREDENTIALS.site);
                    setCredUsername(SANDBOX_TEST_CREDENTIALS.username);
                    setCredPassword(SANDBOX_TEST_CREDENTIALS.password);
                    setCredAuthKey(SANDBOX_TEST_CREDENTIALS.authorizationKey);
                    setCredAchUsername(SANDBOX_TEST_CREDENTIALS.achUsername);
                    setCredAchPassword(SANDBOX_TEST_CREDENTIALS.achPassword);
                    setCredFundingUsername(SANDBOX_TEST_CREDENTIALS.fundingUsername);
                    setCredFundingPassword(SANDBOX_TEST_CREDENTIALS.fundingPassword);
                    setDisplayName(SANDBOX_DEFAULTS.displayName);
                    setShowPasswords(true);
                    setShowTestData(true);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    !isProduction
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <FlaskConical className="h-4 w-4" />
                  Testing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsProduction(true);
                    setCredSite('fts');
                    // Clear test credentials so user enters their own
                    if (credUsername === SANDBOX_TEST_CREDENTIALS.username) setCredUsername('');
                    if (credPassword === SANDBOX_TEST_CREDENTIALS.password) setCredPassword('');
                    setShowTestData(false);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    isProduction
                      ? 'bg-green-600 text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Shield className="h-4 w-4" />
                  Production
                </button>
              </div>
            </div>
            {!isProduction ? (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="text-xs text-amber-500">
                  <p className="font-medium">Sandbox / UAT Mode</p>
                  <p className="mt-0.5">
                    Test credentials have been auto-filled. Transactions will be processed against the
                    CardPointe UAT environment &mdash; no real charges will occur.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <div className="text-xs text-red-500">
                  <p className="font-medium">Production Mode</p>
                  <p className="mt-0.5">
                    This account will process <strong>real credit card transactions with real money</strong>.
                    Enter your production credentials provided by CardPointe.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Test Data (visible in Testing mode) */}
          {!isProduction && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <button
                type="button"
                onClick={() => setShowTestData(!showTestData)}
                className="flex w-full items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium text-amber-500">Test Cards &amp; Reference Data</span>
                </div>
                {showTestData ? <ChevronUp className="h-4 w-4 text-amber-500" /> : <ChevronDown className="h-4 w-4 text-amber-500" />}
              </button>
              {showTestData && <SandboxTestDataPanel />}
            </div>
          )}

          {/* Site + Status Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                Site: <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{credSite || 'not set'}</code>
              </span>
              <span className="text-xs text-muted-foreground">
                {hasSavedCreds ? (
                  <span className="inline-flex items-center gap-1 text-green-500">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Credentials saved{setup.isSandbox && ' (Sandbox)'}
                  </span>
                ) : (
                  <span className="text-amber-500">No credentials saved yet</span>
                )}
              </span>
            </div>
            <button type="button" onClick={() => setShowPasswords(!showPasswords)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              {showPasswords ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showPasswords ? 'Hide' : 'Show'} values
            </button>
          </div>

          {/* Primary Credentials */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-foreground">CardPointe Username <span className="text-red-500">*</span></label>
              <input type={showPasswords ? 'text' : 'password'} value={credUsername} onChange={(e) => setCredUsername(e.target.value)} placeholder={maskedCreds.username || 'YOUR_CARDPOINTE_USERNAME'} className="mt-1 w-full rounded-lg border border-input px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground">CardPointe Password <span className="text-red-500">*</span></label>
              <input type={showPasswords ? 'text' : 'password'} value={credPassword} onChange={(e) => setCredPassword(e.target.value)} placeholder={maskedCreds.password || 'YOUR_CARDPOINTE_PASSWORD'} className="mt-1 w-full rounded-lg border border-input px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground">Authorization Key <span className="text-muted-foreground">(optional)</span></label>
            <input type={showPasswords ? 'text' : 'password'} value={credAuthKey} onChange={(e) => setCredAuthKey(e.target.value)} placeholder={maskedCreds.authorizationKey || 'YOUR_AUTH_KEY'} className="mt-1 w-full rounded-lg border border-input px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {/* ACH Credentials */}
          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <p className="mb-3 text-sm font-medium text-foreground">ACH Credentials <span className="text-muted-foreground">(if ACH is enabled)</span></p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-foreground">ACH Username</label>
                <input type={showPasswords ? 'text' : 'password'} value={credAchUsername} onChange={(e) => setCredAchUsername(e.target.value)} placeholder={maskedCreds.achUsername || 'YOUR_ACH_USERNAME'} className="mt-1 w-full rounded-lg border border-input px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground">ACH Password</label>
                <input type={showPasswords ? 'text' : 'password'} value={credAchPassword} onChange={(e) => setCredAchPassword(e.target.value)} placeholder={maskedCreds.achPassword || 'YOUR_ACH_PASSWORD'} className="mt-1 w-full rounded-lg border border-input px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
          </div>

          {/* Funding Credentials */}
          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <p className="mb-3 text-sm font-medium text-foreground">Funding Credentials <span className="text-muted-foreground">(optional)</span></p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-foreground">Funding Username</label>
                <input type={showPasswords ? 'text' : 'password'} value={credFundingUsername} onChange={(e) => setCredFundingUsername(e.target.value)} placeholder={maskedCreds.fundingUsername || 'FUNDING_USERNAME'} className="mt-1 w-full rounded-lg border border-input px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground">Funding Password</label>
                <input type={showPasswords ? 'text' : 'password'} value={credFundingPassword} onChange={(e) => setCredFundingPassword(e.target.value)} placeholder={maskedCreds.fundingPassword || 'FUNDING_PASSWORD'} className="mt-1 w-full rounded-lg border border-input px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
          </div>
        </div>
      </fieldset>

      {/* Account Settings */}
      <fieldset className="rounded-lg border border-border p-5">
        <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-foreground">
          <Settings2 className="h-4 w-4 text-indigo-500" /> Account Settings
        </legend>
        <div className="mt-3 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground">Merchant Name <span className="text-red-500">*</span></label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="YOUR_MERCHANT_NAME" className="mt-1 w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground">HSN (Hardware Serial Number) <span className="text-muted-foreground">(optional)</span></label>
            <input type="text" value={hsn} onChange={(e) => setHsn(e.target.value)} placeholder="OPTIONAL_HSN" className="mt-1 w-full rounded-lg border border-input px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground">ACH Merchant ID <span className="text-muted-foreground">(if ACH is enabled)</span></label>
            <input type="text" value={achMerchantId} onChange={(e) => setAchMerchantId(e.target.value)} placeholder="YOUR_ACH_MID" className="mt-1 w-full rounded-lg border border-input px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground">Funding Merchant ID <span className="text-muted-foreground">(optional)</span></label>
            <input type="text" value={fundingMerchantId} onChange={(e) => setFundingMerchantId(e.target.value)} placeholder="FUNDING_MID" className="mt-1 w-full rounded-lg border border-input px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
      </fieldset>

      {/* Terminal & Processing Options */}
      <fieldset className="rounded-lg border border-border p-5">
        <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-foreground">
          <Cpu className="h-4 w-4 text-indigo-500" /> Terminal &amp; Processing Options
        </legend>
        <div className="mt-3 space-y-5">
          <ToggleRow label="Use For Card Swipe" description="Enable CardConnect for in-person payments (swiped, dipped, or tapped cards)." checked={useForCardSwipe} onChange={setUseForCardSwipe} />
          <ToggleRow label="Reader Beep Sound" description="When enabled, the card reader will beep to confirm a successful tap or dip." checked={readerBeep} onChange={setReaderBeep} />
          <ToggleRow label="Allow Manual Entry from POS" description="Permit cashiers to manually type in card numbers at the POS terminal." checked={allowManualEntry} onChange={setAllowManualEntry} />
          <ToggleRow label="Tip on Device" description="Show a tip prompt on the payment terminal so the customer can add a tip." checked={tipOnDevice} onChange={setTipOnDevice} />
        </div>
      </fieldset>

      {/* Save Bar */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted p-4">
        <button onClick={handleSave} disabled={isSaving || !displayName} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
        </button>
        <button onClick={() => setShowVerify(true)} disabled={!hasSavedCreds} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-2.5 text-sm font-medium text-indigo-400 hover:bg-indigo-500/20 disabled:opacity-50">
          <ShieldCheck className="h-4 w-4" /> Verify Credentials
        </button>
        {saved && <span className="flex items-center gap-1 text-sm font-medium text-green-500"><CheckCircle2 className="h-4 w-4" /> Saved successfully</span>}
        {saveError && <span className="text-sm text-red-500">{saveError instanceof Error ? saveError.message : 'Failed to save'}</span>}
        <span className="ml-auto text-xs text-muted-foreground">Click Save to apply all changes.</span>
      </div>

      {showVerify && (
        <VerifyCredentialsReport providerId={providerId} onClose={() => setShowVerify(false)} />
      )}
    </div>
  );
}

// ── Sandbox Test Data Panel ──────────────────────────────────
function SandboxTestDataPanel() {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text.replace(/\s/g, ''));
  };

  return (
    <div className="mt-4 space-y-4 border-t border-amber-500/30 pt-4">
      {/* Test MID */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-500">Sandbox Merchant ID</p>
        <div className="mt-1 flex items-center gap-2">
          <code className="rounded bg-amber-500/20 px-2 py-1 text-sm font-mono text-amber-500">{SANDBOX_DEFAULTS.merchantId}</code>
          <button
            type="button"
            onClick={() => copyToClipboard(SANDBOX_DEFAULTS.merchantId)}
            className="rounded p-1 text-amber-500 hover:bg-amber-500/20"
            title="Copy MID"
            aria-label="Copy MID"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <span className="text-xs text-amber-500">Use this MID when adding a new merchant account for testing.</span>
        </div>
      </div>

      {/* Test Cards */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-500">
          <CreditCard className="mr-1 inline h-3.5 w-3.5" />
          Test Card Numbers
        </p>
        <p className="mt-0.5 text-xs text-amber-500">CVV: any 3-4 digits &middot; Expiry: any future date (e.g. 1228)</p>
        <div className="mt-2 overflow-hidden rounded-md border border-amber-500/30">
          <table className="min-w-full text-xs">
            <thead className="bg-amber-500/20">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium text-amber-500">Brand</th>
                <th className="px-3 py-1.5 text-left font-medium text-amber-500">Card Number</th>
                <th className="px-3 py-1.5 text-left font-medium text-amber-500">Use Case</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-500/20">
              {SANDBOX_TEST_CARDS.map((card) => (
                <tr key={card.number} className="hover:bg-amber-500/10">
                  <td className="px-3 py-1.5 font-medium text-amber-500">{card.brand}</td>
                  <td className="px-3 py-1.5 font-mono text-amber-500">{card.number}</td>
                  <td className="px-3 py-1.5 text-amber-500">{card.use}</td>
                  <td className="px-1.5 py-1.5">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(card.number)}
                      className="rounded p-1 text-amber-500 hover:bg-amber-500/20 hover:text-amber-400"
                      title="Copy card number"
                      aria-label="Copy card number"
                    >
                      <Copy className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Amount-Driven Response Codes */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-500">Amount-Driven Response Codes</p>
        <p className="mt-0.5 text-xs text-amber-500">
          Use card <code className="rounded bg-amber-500/20 px-1 font-mono">4000065433421984</code> with amounts in the
          <strong> $1,000-$1,999</strong> range. The last 3 digits of the dollar amount = the response code.
        </p>
        <p className="mt-1 text-xs text-amber-500">
          Example: <code className="font-mono">$1332.00</code> → respcode 332 (&ldquo;Account locked&rdquo;) &middot;
          <code className="font-mono"> $1695.00</code> → respcode 695
        </p>
      </div>

      {/* ACH Test Data */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-500">
          <Landmark className="mr-1 inline h-3.5 w-3.5" />
          ACH Test Data
        </p>
        <div className="mt-1 space-y-1">
          {SANDBOX_ACH_DATA.routingNumbers.map((rn) => (
            <div key={rn} className="flex items-center gap-2">
              <span className="text-xs text-amber-500">Routing:</span>
              <code className="rounded bg-amber-500/20 px-1.5 py-0.5 text-xs font-mono text-amber-500">{rn}</code>
              <button
                type="button"
                onClick={() => copyToClipboard(rn)}
                className="rounded p-0.5 text-amber-500 hover:bg-amber-500/20"
                title="Copy routing number"
                aria-label="Copy routing number"
              >
                <Copy className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          ))}
          <p className="text-xs text-amber-500">{SANDBOX_ACH_DATA.note}</p>
        </div>
      </div>

      {/* AVS Testing */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-500">AVS Test Zip Codes</p>
        <p className="mt-0.5 text-xs text-amber-500">
          The last 3 digits of the postal code control the AVS response (e.g. zip <code className="font-mono">55112</code>).
          You can also include a 3-digit code in the address field (e.g. <code className="font-mono">&ldquo;112 Main Street&rdquo;</code>).
        </p>
      </div>

      {/* Rate Limits */}
      <div className="rounded-md border border-amber-500/30 bg-amber-500/20 p-2.5">
        <p className="text-xs text-amber-500">
          <strong>UAT Rate Limit:</strong> 20 TPM per IP for <code className="font-mono">funding</code>,{' '}
          <code className="font-mono">inquire</code>, <code className="font-mono">profile</code>,{' '}
          <code className="font-mono">settlestat</code> endpoints.
          Contact <strong>integrationdelivery@fiserv.com</strong> for your UAT API credentials if you haven&apos;t received them yet.
        </p>
      </div>
    </div>
  );
}

// ── Verify Credentials Report ────────────────────────────────
function VerifyCredentialsReport({ providerId, onClose }: { providerId: string; onClose: () => void }) {
  const { verify, isVerifying, result, error, reset } = useVerifyCredentials(providerId);

  useEffect(() => {
    verify();
    return () => reset();
  }, []);

  const statusColor = (status: VerifyCredentialRow['status']) => {
    switch (status) {
      case 'OK': return 'text-green-500 bg-green-500/10';
      case 'Unauthorized': return 'text-red-500 bg-red-500/10';
      case 'Blank Credentials': return 'text-amber-500 bg-amber-500/10';
      case 'Timeout': return 'text-orange-500 bg-orange-500/10';
      default: return 'text-red-500 bg-red-500/10';
    }
  };

  const statusIcon = (status: VerifyCredentialRow['status']) => {
    switch (status) {
      case 'OK': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'Unauthorized': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'Blank Credentials': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      default: return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-4xl rounded-xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-indigo-500" />
            <div>
              <h2 className="text-lg font-semibold text-foreground">Verify Credentials</h2>
              <p className="text-sm text-muted-foreground">Testing connectivity for all credential types</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="px-6 py-4">
          {isVerifying ? (
            <div className="py-16 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-indigo-500" />
              <p className="mt-3 text-sm font-medium text-foreground">Testing credentials...</p>
            </div>
          ) : error ? (
            <div className="py-12 text-center">
              <XCircle className="mx-auto h-10 w-10 text-red-400" />
              <p className="mt-3 text-sm font-medium text-red-500">{error instanceof Error ? error.message : 'Failed to verify credentials'}</p>
              <button onClick={() => verify()} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">Retry</button>
            </div>
          ) : result ? (
            <div className="space-y-3">
              {(() => {
                const okCount = result.rows.filter((r) => r.status === 'OK').length;
                const total = result.rows.length;
                const allOk = okCount === total;
                return (
                  <div className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium ${allOk ? 'border-green-500/30 bg-green-500/10 text-green-500' : 'border-amber-500/30 bg-amber-500/10 text-amber-500'}`}>
                    {allOk ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    {okCount} of {total} credential{total !== 1 ? 's' : ''} verified successfully
                    <span className="ml-auto text-xs font-normal text-muted-foreground">{new Date(result.testedAt).toLocaleString()}</span>
                  </div>
                );
              })()}
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Merchant Account</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Account Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">MID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">User Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Password</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-surface">
                    {result.rows.map((row, idx) => (
                      <tr key={`${row.merchantAccountId}-${row.accountType}`} className="hover:bg-accent/50">
                        <td className="px-4 py-2.5 text-sm text-foreground">
                          {idx === 0 || result.rows[idx - 1]!.merchantAccountId !== row.merchantAccountId ? (
                            <div><span className="font-medium">{row.displayName}</span><span className="ml-2 font-mono text-xs text-muted-foreground">{row.merchantId}</span></div>
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5 text-sm">
                          <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${row.accountType === 'Ecom' ? 'bg-blue-500/10 text-blue-400' : row.accountType === 'ACH' ? 'bg-purple-500/10 text-purple-400' : 'bg-teal-500/10 text-teal-400'}`}>{row.accountType}</span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-sm text-muted-foreground">{row.mid}</td>
                        <td className="px-4 py-2.5 text-sm text-muted-foreground">{row.username || <span className="italic text-muted-foreground">blank</span>}</td>
                        <td className="px-4 py-2.5 font-mono text-sm text-muted-foreground">{row.password || <span className="italic text-muted-foreground">blank</span>}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${statusColor(row.status)}`} title={row.error}>
                            {statusIcon(row.status)} {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-between border-t border-border px-6 py-3">
          <p className="text-xs text-muted-foreground">Tests each credential type by calling the CardPointe inquire endpoint.</p>
          <div className="flex items-center gap-2">
            {result && (
              <button onClick={() => verify()} disabled={isVerifying} className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50">
                <ShieldCheck className="h-4 w-4" /> Re-test
              </button>
            )}
            <button onClick={onClose} className="rounded-md bg-muted px-4 py-1.5 text-sm font-medium text-foreground hover:bg-accent">Close</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
