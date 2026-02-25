'use client';

import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  CreditCard,
  Plus,
  CheckCircle2,
  XCircle,
  MoreVertical,
  Shield,
  Loader2,
  Link2,
  Unlink,
  Key,
  Server,
  Cpu,
  Pencil,
  Trash2,
  Smartphone,
  Info,
  Landmark,
  Settings2,
  ArrowLeft,
  AlertTriangle,
  Eye,
  EyeOff,
  Save,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  usePaymentProviders,
  useProviderCredentials,
  useMerchantAccounts,
  useTerminalAssignments,
  usePaymentProcessorMutations,
  useDeviceAssignments,
  useDeviceAssignmentMutations,
  useSurchargeSettings,
  useSurchargeMutations,
  useMerchantAccountSetup,
  useVerifyCredentials,
} from '@/hooks/use-payment-processors';
import type {
  ProviderSummary,
  MerchantAccountInfo,
  TerminalAssignmentInfo,
  DeviceAssignmentInfo,
  SurchargeSettingsInfo,
  MerchantAccountSetupData,
  VerifyCredentialRow,
  VerifyCredentialsResult,
} from '@/hooks/use-payment-processors';
import {
  CARDPOINTE_DEVICE_MODELS,
  getDeviceDisplayName,
} from '@oppsera/shared';

type Tab = 'providers' | 'mids' | 'terminals' | 'devices' | 'wallets' | 'surcharging' | 'ach';

export default function MerchantServicesContent() {
  const [tab, setTab] = useState<Tab>('providers');
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);

  // Dialogs
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [showAddMid, setShowAddMid] = useState(false);
  const [showAssignTerminal, setShowAssignTerminal] = useState(false);
  const [editingMid, setEditingMid] = useState<MerchantAccountInfo | null>(null);
  const [showAssignDevice, setShowAssignDevice] = useState(false);
  const [editingDevice, setEditingDevice] = useState<DeviceAssignmentInfo | null>(null);
  const [setupAccountId, setSetupAccountId] = useState<string | null>(null);
  const [showVerifyReport, setShowVerifyReport] = useState(false);

  // Data — only fetch for active tab to avoid unnecessary API calls on mount
  const { providers, isLoading: providersLoading } = usePaymentProviders();
  const { credentials, isLoading: credsLoading } = useProviderCredentials(selectedProviderId);
  const { accounts, isLoading: midsLoading } = useMerchantAccounts(selectedProviderId);
  const { assignments, isLoading: assignmentsLoading } = useTerminalAssignments(tab === 'terminals');
  const { devices, isLoading: devicesLoading } = useDeviceAssignments(undefined, tab === 'devices');
  const { settings: surchargeSettings, isLoading: surchargeLoading } = useSurchargeSettings(undefined, tab === 'surcharging');
  const mutations = usePaymentProcessorMutations();
  const deviceMutations = useDeviceAssignmentMutations();
  const surchargeMutations = useSurchargeMutations();

  const selectedProvider = providers.find((p) => p.id === selectedProviderId) ?? null;

  const handleSelectProvider = useCallback((p: ProviderSummary) => {
    setSelectedProviderId(p.id);
    setTab('mids');
  }, []);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Merchant Services</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure payment providers, merchant IDs, and terminal assignments.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {([
            { key: 'providers' as Tab, label: 'Providers' },
            { key: 'mids' as Tab, label: 'Merchant Accounts' },
            { key: 'terminals' as Tab, label: 'Terminal Assignments' },
            { key: 'devices' as Tab, label: 'Devices' },
            { key: 'wallets' as Tab, label: 'Wallet Payments' },
            { key: 'surcharging' as Tab, label: 'Surcharging' },
            { key: 'ach' as Tab, label: 'ACH Settings' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${
                tab === key
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {tab === 'providers' && (
        <ProvidersTab
          providers={providers}
          isLoading={providersLoading}
          selectedProviderId={selectedProviderId}
          onSelect={handleSelectProvider}
          onAdd={() => setShowAddProvider(true)}
          onToggle={(p) =>
            mutations.updateProvider.mutate({ providerId: p.id, isActive: !p.isActive })
          }
          onCredentials={(p) => {
            setSelectedProviderId(p.id);
            setShowCredentials(true);
          }}
          onTestConnection={(p) => mutations.testConnection.mutate({ providerId: p.id })}
          testLoading={mutations.testConnection.isPending}
        />
      )}

      {tab === 'mids' && (
        setupAccountId ? (
          <MerchantAccountSetupPanel
            providerId={selectedProviderId!}
            accountId={setupAccountId}
            onBack={() => setSetupAccountId(null)}
          />
        ) : (
          <MidsTab
            providers={providers}
            selectedProviderId={selectedProviderId}
            onSelectProvider={setSelectedProviderId}
            accounts={accounts}
            isLoading={midsLoading}
            onAdd={() => setShowAddMid(true)}
            onEdit={setEditingMid}
            onSetup={(a) => setSetupAccountId(a.id)}
            onVerify={() => setShowVerifyReport(true)}
            onDelete={(a) =>
              mutations.deleteMerchantAccount.mutate({
                providerId: a.providerId,
                accountId: a.id,
              })
            }
            onSetDefault={(a) =>
              mutations.updateMerchantAccount.mutate({
                providerId: a.providerId,
                accountId: a.id,
                isDefault: true,
              })
            }
          />
        )
      )}

      {tab === 'terminals' && (
        <TerminalAssignmentsTab
          assignments={assignments}
          isLoading={assignmentsLoading}
          onAssign={() => setShowAssignTerminal(true)}
        />
      )}

      {tab === 'devices' && (
        <DevicesTab
          devices={devices}
          isLoading={devicesLoading}
          onAssign={() => setShowAssignDevice(true)}
          onEdit={setEditingDevice}
          onRemove={(d) => deviceMutations.removeDevice.mutate(d.id)}
        />
      )}

      {tab === 'wallets' && (
        <WalletsTab
          providers={providers}
          isLoading={providersLoading}
          onSave={(providerId, config) =>
            mutations.updateProvider.mutate({ providerId, config })
          }
          isSaving={mutations.updateProvider.isPending}
        />
      )}

      {tab === 'surcharging' && (
        <SurchargingTab
          providers={providers}
          settings={surchargeSettings}
          isLoading={surchargeLoading || providersLoading}
          onSave={(input) => surchargeMutations.saveSurcharge.mutate(input)}
          onDelete={(id) => surchargeMutations.deleteSurcharge.mutate(id)}
          isSaving={surchargeMutations.saveSurcharge.isPending}
        />
      )}

      {tab === 'ach' && (
        <AchSettingsTab
          accounts={accounts}
          isLoading={midsLoading}
          selectedProviderId={selectedProviderId}
          providers={providers}
          onSelectProvider={(p) => setSelectedProviderId(p.id)}
        />
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
        <CredentialsDialog
          providerId={selectedProviderId}
          providerCode={selectedProvider?.code ?? ''}
          credentials={credentials}
          isLoading={credsLoading}
          onClose={() => setShowCredentials(false)}
          onSave={(input) => {
            mutations.saveCredentials.mutate(
              { ...input, providerId: selectedProviderId },
              { onSuccess: () => setShowCredentials(false) },
            );
          }}
          onTest={(creds) =>
            mutations.testConnection.mutate({
              providerId: selectedProviderId,
              credentials: creds,
            })
          }
          saveLoading={mutations.saveCredentials.isPending}
          testLoading={mutations.testConnection.isPending}
          testResult={mutations.testConnection.data ?? null}
        />
      )}

      {/* Add MID Dialog */}
      {showAddMid && selectedProviderId && (
        <AddMidDialog
          providerId={selectedProviderId}
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

      {/* Edit MID Dialog */}
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

      {/* Assign Terminal Dialog */}
      {showAssignTerminal && (
        <AssignTerminalDialog
          accounts={accounts}
          providers={providers}
          selectedProviderId={selectedProviderId}
          onSelectProvider={setSelectedProviderId}
          onClose={() => setShowAssignTerminal(false)}
          onSubmit={(input) => {
            mutations.assignTerminal.mutate(input, {
              onSuccess: () => setShowAssignTerminal(false),
            });
          }}
          isLoading={mutations.assignTerminal.isPending}
        />
      )}

      {/* Assign Device Dialog */}
      {showAssignDevice && (
        <AssignDeviceDialog
          providers={providers}
          existingDevices={devices}
          onClose={() => setShowAssignDevice(false)}
          onSubmit={(input) => {
            deviceMutations.assignDevice.mutate(input, {
              onSuccess: () => setShowAssignDevice(false),
            });
          }}
          isLoading={deviceMutations.assignDevice.isPending}
        />
      )}

      {/* Edit Device Dialog */}
      {editingDevice && (
        <EditDeviceDialog
          device={editingDevice}
          onClose={() => setEditingDevice(null)}
          onSubmit={(input) => {
            deviceMutations.updateDevice.mutate(
              { id: editingDevice.id, ...input },
              { onSuccess: () => setEditingDevice(null) },
            );
          }}
          isLoading={deviceMutations.updateDevice.isPending}
        />
      )}

      {/* Verify Credentials Report */}
      {showVerifyReport && selectedProviderId && (
        <VerifyCredentialsReport
          providerId={selectedProviderId}
          onClose={() => setShowVerifyReport(false)}
        />
      )}
    </div>
  );
}

// ── Providers Tab ─────────────────────────────────────────────

function ProvidersTab({
  providers,
  isLoading,
  selectedProviderId,
  onSelect,
  onAdd,
  onToggle,
  onCredentials,
  onTestConnection,
  testLoading,
}: {
  providers: ProviderSummary[];
  isLoading: boolean;
  selectedProviderId: string | null;
  onSelect: (p: ProviderSummary) => void;
  onAdd: () => void;
  onToggle: (p: ProviderSummary) => void;
  onCredentials: (p: ProviderSummary) => void;
  onTestConnection: (p: ProviderSummary) => void;
  testLoading: boolean;
}) {
  if (isLoading) {
    return <div className="py-12 text-center text-gray-400">Loading providers...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">Payment Providers</h2>
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> Add Provider
        </button>
      </div>

      {providers.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <CreditCard className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-4 text-sm font-medium text-gray-900">No payment providers configured</p>
          <p className="mt-1 text-sm text-gray-500">
            Add a payment provider like CardPointe to start processing card payments.
          </p>
          <button
            onClick={onAdd}
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
                  : 'border-gray-200'
              }`}
              onClick={() => onSelect(p)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gray-900">{p.displayName}</h3>
                    {p.isActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        <CheckCircle2 className="h-3 w-3" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        <XCircle className="h-3 w-3" /> Inactive
                      </span>
                    )}
                    {p.isSandbox && (
                      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                        Sandbox
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    Code: <code className="text-xs">{p.code}</code> &middot; Type: {p.providerType}
                  </p>
                </div>
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Actions dropdown placeholder
                    }}
                    className="rounded p-1 hover:bg-gray-100"
                  >
                    <MoreVertical className="h-4 w-4 text-gray-400" />
                  </button>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
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
                    onCredentials(p);
                  }}
                  className="rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Shield className="mr-1 inline-block h-3 w-3" />
                  Credentials
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTestConnection(p);
                  }}
                  disabled={testLoading || !p.hasCredentials}
                  className="rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {testLoading ? (
                    <Loader2 className="mr-1 inline-block h-3 w-3 animate-spin" />
                  ) : (
                    <Link2 className="mr-1 inline-block h-3 w-3" />
                  )}
                  Test
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(p);
                  }}
                  className="rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  {p.isActive ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── MIDs Tab ──────────────────────────────────────────────────

function MidsTab({
  providers,
  selectedProviderId,
  onSelectProvider,
  accounts,
  isLoading,
  onAdd,
  onEdit,
  onSetup,
  onVerify,
  onDelete,
  onSetDefault,
}: {
  providers: ProviderSummary[];
  selectedProviderId: string | null;
  onSelectProvider: (id: string) => void;
  accounts: MerchantAccountInfo[];
  isLoading: boolean;
  onAdd: () => void;
  onEdit: (a: MerchantAccountInfo) => void;
  onSetup: (a: MerchantAccountInfo) => void;
  onVerify: () => void;
  onDelete: (a: MerchantAccountInfo) => void;
  onSetDefault: (a: MerchantAccountInfo) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium text-gray-900">Merchant Accounts</h2>
          {providers.length > 0 && (
            <select
              value={selectedProviderId ?? ''}
              onChange={(e) => onSelectProvider(e.target.value)}
              className="rounded-md border border-gray-300 bg-surface px-3 py-1.5 text-sm"
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
            onClick={onVerify}
            disabled={!selectedProviderId || accounts.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
          >
            <ShieldCheck className="h-4 w-4" /> Verify Credentials
          </button>
          <button
            onClick={onAdd}
            disabled={!selectedProviderId}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Add MID
          </button>
        </div>
      </div>

      {!selectedProviderId ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <p className="text-sm text-gray-500">Select a provider to manage merchant accounts.</p>
        </div>
      ) : isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading merchant accounts...</div>
      ) : accounts.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <Server className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-4 text-sm font-medium text-gray-900">No merchant accounts</p>
          <p className="mt-1 text-sm text-gray-500">
            Add a merchant ID (MID) to start processing payments with this provider.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Merchant ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Display Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Location
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-surface">
              {accounts.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">
                    {a.merchantId}
                    {a.isDefault && (
                      <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                        Default
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">{a.displayName}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {a.locationId ?? 'Tenant-wide'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {a.isActive ? (
                      <span className="text-green-600">Active</span>
                    ) : (
                      <span className="text-gray-400">Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onSetup(a)}
                        className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                      >
                        <Settings2 className="h-3 w-3" /> Setup
                      </button>
                      {!a.isDefault && a.isActive && (
                        <button
                          onClick={() => onSetDefault(a)}
                          className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                        >
                          Set Default
                        </button>
                      )}
                      <button
                        onClick={() => onEdit(a)}
                        className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                      >
                        Edit
                      </button>
                      {a.isActive && (
                        <button
                          onClick={() => onDelete(a)}
                          className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50"
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
    </div>
  );
}

// ── Terminal Assignments Tab ──────────────────────────────────

function TerminalAssignmentsTab({
  assignments,
  isLoading,
  onAssign,
}: {
  assignments: TerminalAssignmentInfo[];
  isLoading: boolean;
  onAssign: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">Terminal → MID Assignments</h2>
        <button
          onClick={onAssign}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Link2 className="h-4 w-4" /> Assign Terminal
        </button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading assignments...</div>
      ) : assignments.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <Unlink className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-4 text-sm font-medium text-gray-900">No terminal assignments</p>
          <p className="mt-1 text-sm text-gray-500">
            Assign terminals to merchant accounts so each terminal knows which MID to use.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Terminal
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Merchant ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  MID Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-surface">
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">{a.terminalId}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">{a.merchantId}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{a.merchantDisplayName}</td>
                  <td className="px-4 py-3 text-sm">
                    {a.isActive ? (
                      <span className="text-green-600">Active</span>
                    ) : (
                      <span className="text-gray-400">Inactive</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Devices Tab ──────────────────────────────────────────────

function DevicesTab({
  devices,
  isLoading,
  onAssign,
  onEdit,
  onRemove,
}: {
  devices: DeviceAssignmentInfo[];
  isLoading: boolean;
  onAssign: () => void;
  onEdit: (d: DeviceAssignmentInfo) => void;
  onRemove: (d: DeviceAssignmentInfo) => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">Payment Devices</h2>
        <button
          onClick={onAssign}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> Assign Device
        </button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading devices...</div>
      ) : devices.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <Cpu className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-4 text-sm font-medium text-gray-900">No payment devices assigned</p>
          <p className="mt-1 text-sm text-gray-500">
            Assign a physical payment terminal (card reader) to a POS terminal by its Hardware
            Serial Number (HSN).
          </p>
          <button
            onClick={onAssign}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" /> Assign Device
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Terminal
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  HSN
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Device Model
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Label
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-surface">
              {devices.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-sm text-gray-900">{d.terminalName || d.terminalId}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">{d.hsn}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {getDeviceDisplayName(d.deviceModel)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{d.deviceLabel ?? '—'}</td>
                  <td className="px-4 py-3 text-sm">
                    {d.lastStatus === 'connected' ? (
                      <span className="inline-flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Connected
                      </span>
                    ) : d.lastStatus === 'error' ? (
                      <span className="inline-flex items-center gap-1 text-red-500">
                        <XCircle className="h-3.5 w-3.5" /> Error
                      </span>
                    ) : (
                      <span className="text-gray-400">
                        {d.isActive ? 'Not connected' : 'Inactive'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onEdit(d)}
                        className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {confirmRemove === d.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              onRemove(d);
                              setConfirmRemove(null);
                            }}
                            className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmRemove(null)}
                            className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmRemove(d.id)}
                          className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-500"
                          title="Remove"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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
    </div>
  );
}

// ── Wallets Tab ─────────────────────────────────────────────

function WalletsTab({
  providers,
  isLoading,
  onSave,
  isSaving,
}: {
  providers: ProviderSummary[];
  isLoading: boolean;
  onSave: (providerId: string, config: Record<string, unknown>) => void;
  isSaving: boolean;
}) {
  const activeProviders = providers.filter((p) => p.isActive);
  const [selectedProviderId, setSelectedProviderId] = useState(activeProviders[0]?.id ?? '');
  const selectedProvider = activeProviders.find((p) => p.id === selectedProviderId) ?? null;

  const existingConfig = selectedProvider?.config ?? {};
  const [enableApplePay, setEnableApplePay] = useState(!!existingConfig.enableApplePay);
  const [enableGooglePay, setEnableGooglePay] = useState(!!existingConfig.enableGooglePay);
  const [googlePayMerchantId, setGooglePayMerchantId] = useState(
    (existingConfig.googlePayMerchantId as string) ?? '',
  );
  const [googlePayGatewayId, setGooglePayGatewayId] = useState(
    (existingConfig.googlePayGatewayId as string) ?? '',
  );

  // Sync form state when provider selection changes
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
    onSave(selectedProviderId, mergedConfig);
  }, [
    selectedProviderId,
    existingConfig,
    enableApplePay,
    enableGooglePay,
    googlePayMerchantId,
    googlePayGatewayId,
    onSave,
  ]);

  const googlePayValid = !enableGooglePay || (googlePayMerchantId.trim() !== '' && googlePayGatewayId.trim() !== '');

  if (isLoading) {
    return <div className="py-12 text-center text-gray-400">Loading providers...</div>;
  }

  if (activeProviders.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
        <Smartphone className="mx-auto h-12 w-12 text-gray-400" />
        <p className="mt-4 text-sm font-medium text-gray-900">No active payment providers</p>
        <p className="mt-1 text-sm text-gray-500">
          Add and activate a payment provider on the Providers tab before configuring wallet payments.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium text-gray-900">Wallet Payment Configuration</h2>
          {activeProviders.length > 1 && (
            <select
              value={selectedProviderId}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="rounded-md border border-gray-300 bg-surface px-3 py-1.5 text-sm"
            >
              {activeProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <p className="text-sm text-gray-500">
        Enable Apple Pay and Google Pay for customer-facing payment surfaces (Guest Pay, Member Portal, Booking Engine).
        Wallet payments are not available on POS terminals.
      </p>

      {/* Apple Pay */}
      <div className="rounded-lg border border-gray-200 p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-900 text-white">
              <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M15.24 5.26C14.34 6.33 12.95 7.13 11.77 7.05c-.18-1.3.47-2.7 1.21-3.56.84-1 2.32-1.73 3.52-1.77.15 1.38-.38 2.74-1.26 3.54zM16.48 7.45c-1.95-.12-3.6 1.11-4.52 1.11-.93 0-2.35-1.05-3.88-1.02-2 .03-3.84 1.16-4.87 2.95-2.08 3.59-.54 8.91 1.5 11.83.99 1.44 2.17 3.06 3.72 3 1.49-.06 2.06-.96 3.87-.96s2.32.96 3.9.93c1.61-.03 2.62-1.47 3.61-2.91 1.13-1.63 1.59-3.22 1.62-3.3-.04-.02-3.11-1.19-3.14-4.73-.03-2.96 2.42-4.38 2.53-4.45-1.38-2.04-3.54-2.26-4.3-2.32l-.04-.13z" fill="currentColor"/>
              </svg>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Apple Pay</h3>
              <p className="text-sm text-gray-500">Accept payments via Apple Pay on Safari and iOS devices.</p>
            </div>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={enableApplePay}
              onChange={(e) => setEnableApplePay(e.target.checked)}
              className="peer sr-only"
            />
            <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-indigo-600 peer-checked:after:translate-x-full peer-checked:after:border-white" />
          </label>
        </div>

        {enableApplePay && (
          <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-3">
            <div className="flex gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
              <div className="text-sm text-blue-700">
                <p className="font-medium">Domain verification required</p>
                <p className="mt-1">
                  Apple Pay requires a domain association file at{' '}
                  <code className="rounded bg-blue-100 px-1 py-0.5 text-xs">
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
      <div className="rounded-lg border border-gray-200 p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white border border-gray-200">
              <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M19.17 10.23c0-.7-.06-1.37-.18-2.02H10v3.83h5.14a4.39 4.39 0 0 1-1.91 2.88v2.39h3.09c1.81-1.67 2.85-4.12 2.85-7.08z" fill="#4285F4"/>
                <path d="M10 20c2.58 0 4.74-.86 6.32-2.32l-3.09-2.39c-.85.57-1.94.91-3.23.91-2.48 0-4.58-1.68-5.33-3.93H1.48v2.47A9.99 9.99 0 0 0 10 20z" fill="#34A853"/>
                <path d="M4.67 12.27A6.01 6.01 0 0 1 4.36 10c0-.79.14-1.55.31-2.27V5.26H1.48A9.99 9.99 0 0 0 0 10c0 1.61.39 3.14 1.07 4.49l3.6-2.22z" fill="#FBBC05"/>
                <path d="M10 3.96c1.4 0 2.66.48 3.64 1.43l2.73-2.73A9.99 9.99 0 0 0 10 0 9.99 9.99 0 0 0 1.48 5.26l3.19 2.47C5.42 5.64 7.52 3.96 10 3.96z" fill="#EA4335"/>
              </svg>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Google Pay</h3>
              <p className="text-sm text-gray-500">Accept payments via Google Pay on Chrome and Android devices.</p>
            </div>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={enableGooglePay}
              onChange={(e) => setEnableGooglePay(e.target.checked)}
              className="peer sr-only"
            />
            <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-indigo-600 peer-checked:after:translate-x-full peer-checked:after:border-white" />
          </label>
        </div>

        {enableGooglePay && (
          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Google Pay Merchant ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={googlePayMerchantId}
                onChange={(e) => setGooglePayMerchantId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
                placeholder="BCR2DN4T..."
              />
              <p className="mt-1 text-xs text-gray-500">
                Your Google Pay merchant ID from the Google Pay & Wallet Console.
                Required for production. Leave empty for TEST environment.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Gateway Merchant ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={googlePayGatewayId}
                onChange={(e) => setGooglePayGatewayId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
                placeholder="Your CardPointe merchant ID"
              />
              <p className="mt-1 text-xs text-gray-500">
                The merchant ID passed to the CardConnect gateway for Google Pay transactions.
                This is typically your CardPointe MID.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={isSaving || !selectedProviderId || !googlePayValid}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Wallet Settings
        </button>
      </div>
    </div>
  );
}

// ── Surcharging Tab ─────────────────────────────────────────

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DC','DE','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','PR','RI','SC','SD','TN','TX',
  'UT','VT','VA','WA','WV','WI','WY',
];

const DEFAULT_PROHIBITED_STATES = ['CT', 'ME', 'MA', 'OK', 'PR'];

function SurchargingTab({
  providers,
  settings,
  isLoading,
  onSave,
  onDelete,
  isSaving,
}: {
  providers: ProviderSummary[];
  settings: SurchargeSettingsInfo[];
  isLoading: boolean;
  onSave: (input: {
    providerId: string;
    isEnabled: boolean;
    surchargeRate: number;
    maxSurchargeRate: number;
    applyToCreditOnly?: boolean;
    exemptDebit?: boolean;
    exemptPrepaid?: boolean;
    customerDisclosureText?: string;
    receiptDisclosureText?: string;
    prohibitedStates?: string[];
    glAccountId?: string | null;
  }) => void;
  onDelete: (id: string) => void;
  isSaving: boolean;
}) {
  const activeProviders = providers.filter((p) => p.isActive);
  const [selectedProviderId, setSelectedProviderId] = useState(activeProviders[0]?.id ?? '');

  // Find existing setting for this provider at tenant level (no location/terminal)
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

  // Sync form state when provider selection or setting changes
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
    onSave({
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
    onSave,
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
    return <div className="py-12 text-center text-gray-400">Loading surcharge settings...</div>;
  }

  if (activeProviders.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
        <CreditCard className="mx-auto h-12 w-12 text-gray-400" />
        <p className="mt-4 text-sm font-medium text-gray-900">No active payment providers</p>
        <p className="mt-1 text-sm text-gray-500">
          Add and activate a payment provider on the Providers tab before configuring surcharging.
        </p>
      </div>
    );
  }

  // Count location/terminal overrides
  const overrides = settings.filter(
    (s) => s.providerId === selectedProviderId && (s.locationId || s.terminalId),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium text-gray-900">Credit Card Surcharging</h2>
          {activeProviders.length > 1 && (
            <select
              value={selectedProviderId}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="rounded-md border border-gray-300 bg-surface px-3 py-1.5 text-sm"
            >
              {activeProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Info banner */}
      <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
        <div className="flex gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
          <div className="text-sm text-blue-700">
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
      <div className="rounded-lg border border-gray-200 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-gray-900">Enable Surcharging</h3>
            <p className="text-sm text-gray-500">
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
            <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-indigo-600 peer-checked:after:translate-x-full peer-checked:after:border-white" />
          </label>
        </div>
      </div>

      {isEnabled && (
        <>
          {/* Rate configuration */}
          <div className="rounded-lg border border-gray-200 p-5 space-y-4">
            <h3 className="font-medium text-gray-900">Rate Configuration</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Surcharge Rate (%)
                </label>
                <input
                  type="text"
                  value={surchargeRate}
                  onChange={(e) => setSurchargeRate(e.target.value)}
                  className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm bg-surface ${
                    !rateValid || rateExceedsMax
                      ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                      : 'border-gray-300'
                  }`}
                  placeholder="3.50"
                />
                {!rateValid && (
                  <p className="mt-1 text-xs text-red-600">Rate must be between 0% and 10%.</p>
                )}
                {rateExceedsMax && (
                  <p className="mt-1 text-xs text-red-600">
                    Rate cannot exceed the maximum rate ({maxRate}%).
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Maximum Rate Cap (%)
                </label>
                <input
                  type="text"
                  value={maxRate}
                  onChange={(e) => setMaxRate(e.target.value)}
                  className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm bg-surface ${
                    !maxRateValid
                      ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                      : 'border-gray-300'
                  }`}
                  placeholder="4.00"
                />
                {!maxRateValid && (
                  <p className="mt-1 text-xs text-red-600">Max rate must be between 0% and 10%.</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Card brand rules cap surcharges at 4%.
                </p>
              </div>
            </div>
          </div>

          {/* Exemptions */}
          <div className="rounded-lg border border-gray-200 p-5 space-y-4">
            <h3 className="font-medium text-gray-900">Card Type Exemptions</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={applyToCreditOnly}
                  onChange={(e) => setApplyToCreditOnly(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-gray-700">Apply to credit cards only</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={exemptDebit}
                  onChange={(e) => setExemptDebit(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-gray-700">Exempt debit cards</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={exemptPrepaid}
                  onChange={(e) => setExemptPrepaid(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-gray-700">Exempt prepaid cards</span>
              </label>
            </div>
            <p className="text-xs text-gray-500">
              Card brand rules require that surcharges not be applied to debit or prepaid cards.
              Keep these checkboxes enabled for compliance.
            </p>
          </div>

          {/* Prohibited States */}
          <div className="rounded-lg border border-gray-200 p-5 space-y-4">
            <h3 className="font-medium text-gray-900">Prohibited States</h3>
            <p className="text-sm text-gray-500">
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
                        ? 'bg-red-100 border-red-300 text-red-700'
                        : 'bg-surface border-gray-200 text-gray-500 hover:border-gray-300'
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
            <p className="text-xs text-gray-500">
              Pre-selected states (CT, ME, MA, OK, PR) are known to prohibit credit card surcharges.
              Consult legal counsel for the most current regulations.
            </p>
          </div>

          {/* Disclosure Text */}
          <div className="rounded-lg border border-gray-200 p-5 space-y-4">
            <h3 className="font-medium text-gray-900">Disclosure Text</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Customer Disclosure
              </label>
              <textarea
                value={customerDisclosure}
                onChange={(e) => setCustomerDisclosure(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
                rows={2}
                maxLength={500}
                placeholder="A surcharge of {rate}% will be applied to credit card transactions."
              />
              <p className="mt-1 text-xs text-gray-500">
                Displayed to the customer before payment. Use <code className="rounded bg-gray-100 px-1">{'{rate}'}</code> for the percentage.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Receipt Disclosure
              </label>
              <input
                type="text"
                value={receiptDisclosure}
                onChange={(e) => setReceiptDisclosure(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
                maxLength={200}
                placeholder="Credit Card Surcharge: ${amount}"
              />
              <p className="mt-1 text-xs text-gray-500">
                Printed on the receipt. Use <code className="rounded bg-gray-100 px-1">{'{amount}'}</code> for the dollar amount.
              </p>
            </div>
          </div>

          {/* Overrides summary */}
          {overrides.length > 0 && (
            <div className="rounded-lg border border-gray-200 p-5">
              <h3 className="font-medium text-gray-900">Location & Terminal Overrides</h3>
              <p className="mt-1 text-sm text-gray-500">
                {overrides.length} override{overrides.length !== 1 ? 's' : ''} configured for
                specific locations or terminals.
              </p>
              <div className="mt-3 overflow-hidden rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                        Scope
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                        Enabled
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                        Rate
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-surface">
                    {overrides.map((o) => (
                      <tr key={o.id}>
                        <td className="px-4 py-2 text-sm text-gray-900">
                          {o.terminalId
                            ? `Terminal: ${o.terminalId}`
                            : `Location: ${o.locationId}`}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {o.isEnabled ? (
                            <span className="text-green-600">Yes</span>
                          ) : (
                            <span className="text-gray-400">No</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-900">
                          {(Number(o.surchargeRate) * 100).toFixed(2)}%
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => onDelete(o.id)}
                            className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50"
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
                  <span className="text-sm text-red-600">Delete surcharge settings?</span>
                  <button
                    onClick={() => {
                      onDelete(existingSetting.id);
                      setConfirmDelete(false);
                    }}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Confirm Delete
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" /> Delete Settings
                </button>
              )}
            </>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving || !selectedProviderId || (isEnabled && (!rateValid || !maxRateValid || rateExceedsMax))}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Surcharge Settings
        </button>
      </div>
    </div>
  );
}

// ── Dialogs ──────────────────────────────────────────────────

function DialogOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        {children}
      </div>
    </div>,
    document.body,
  );
}

const PROVIDER_OPTIONS = [
  { code: 'cardconnect', displayName: 'CardConnect', providerType: 'both' as const, available: true, recommended: true },
  { code: 'clover', displayName: 'Clover', providerType: 'both' as const, available: true, recommended: true },
  { code: 'adyen', displayName: 'Adyen', providerType: 'gateway' as const, available: false, recommended: false },
  { code: 'square', displayName: 'Square', providerType: 'both' as const, available: false, recommended: false },
  { code: 'worldpay', displayName: 'Worldpay', providerType: 'gateway' as const, available: false, recommended: false },
] as const;

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
      <h3 className="text-lg font-semibold text-gray-900">Add Payment Provider</h3>
      <p className="mt-1 text-sm text-gray-500">Select a payment processor to integrate with your business.</p>
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
                  ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                  : option.available && !alreadyAdded
                    ? 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    : 'border-gray-100 bg-gray-50 opacity-60'
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{option.displayName}</span>
                  {option.recommended && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      Recommended
                    </span>
                  )}
                  {alreadyAdded && (
                    <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
                      Already added
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500">
                  {option.providerType === 'both'
                    ? 'Online + In-person'
                    : option.providerType === 'gateway'
                      ? 'Online only'
                      : 'In-person only'}
                </span>
              </div>
              {!option.available && (
                <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-500">
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
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
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

function CredentialsDialog({
  providerId: _providerId,
  providerCode,
  credentials,
  isLoading: _isLoading,
  onClose,
  onSave,
  onTest,
  saveLoading,
  testLoading,
  testResult,
}: {
  providerId: string;
  providerCode: string;
  credentials: Array<{ id: string; locationId: string | null; isSandbox: boolean; isActive: boolean }>;
  isLoading: boolean;
  onClose: () => void;
  onSave: (input: { credentials: { site: string; username: string; password: string }; isSandbox: boolean }) => void;
  onTest: (creds: { site: string; username: string; password: string }) => void;
  saveLoading: boolean;
  testLoading: boolean;
  testResult: { success: boolean; message: string } | null;
}) {
  const [site, setSite] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSandbox, setIsSandbox] = useState(false);

  const hasExisting = credentials.length > 0;

  return (
    <DialogOverlay onClose={onClose}>
      <h3 className="text-lg font-semibold text-gray-900">
        {providerCode === 'cardpointe' ? 'CardPointe' : providerCode} Credentials
      </h3>

      {hasExisting && (
        <div className="mt-3 rounded-md bg-green-50 p-3 text-sm text-green-700">
          Credentials are saved. Enter new values to update, or test the existing connection.
        </div>
      )}

      <div className="mt-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Site (Merchant ID)</label>
          <input
            type="text"
            value={site}
            onChange={(e) => setSite(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
            placeholder="fts"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">API Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
            placeholder="testing"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">API Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
            placeholder="testing123"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isSandbox}
            onChange={(e) => setIsSandbox(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-gray-700">Sandbox / Test Mode</span>
        </label>
      </div>

      {testResult && (
        <div
          className={`mt-3 rounded-md p-3 text-sm ${
            testResult.success
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {testResult.success ? 'Connection successful!' : `Connection failed: ${testResult.message}`}
        </div>
      )}

      <div className="mt-6 flex justify-between">
        <button
          onClick={() => onTest({ site, username, password })}
          disabled={testLoading || !site || !username || !password}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {testLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Test Connection
        </button>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({ credentials: { site, username, password }, isSandbox })}
            disabled={saveLoading || !site || !username || !password}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saveLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Credentials
          </button>
        </div>
      </div>
    </DialogOverlay>
  );
}

function AddMidDialog({
  providerId: _providerId,
  onClose,
  onSubmit,
  isLoading,
}: {
  providerId: string;
  onClose: () => void;
  onSubmit: (input: { merchantId: string; displayName: string; isDefault: boolean }) => void;
  isLoading: boolean;
}) {
  const [merchantId, setMerchantId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  return (
    <DialogOverlay onClose={onClose}>
      <h3 className="text-lg font-semibold text-gray-900">Add Merchant Account</h3>
      <div className="mt-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Merchant ID (MID)</label>
          <input
            type="text"
            value={merchantId}
            onChange={(e) => setMerchantId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
            placeholder="496160873888"
          />
          <p className="mt-1 text-xs text-gray-500">Your processor-assigned merchant identifier.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
            placeholder="Main Processing Account"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-gray-700">Set as default MID for this provider</span>
        </label>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={() => onSubmit({ merchantId, displayName, isDefault })}
          disabled={isLoading || !merchantId || !displayName}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Add MID
        </button>
      </div>
    </DialogOverlay>
  );
}

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
      <h3 className="text-lg font-semibold text-gray-900">Edit Merchant Account</h3>
      <p className="mt-1 text-sm text-gray-500">MID: {account.merchantId}</p>
      <div className="mt-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-gray-700">Set as default MID for this provider</span>
        </label>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={() => onSubmit({ displayName, isDefault })}
          disabled={isLoading || !displayName}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Changes
        </button>
      </div>
    </DialogOverlay>
  );
}

function AssignTerminalDialog({
  accounts: _accounts,
  providers,
  selectedProviderId,
  onSelectProvider,
  onClose,
  onSubmit,
  isLoading,
}: {
  accounts: MerchantAccountInfo[];
  providers: ProviderSummary[];
  selectedProviderId: string | null;
  onSelectProvider: (id: string) => void;
  onClose: () => void;
  onSubmit: (input: { terminalId: string; merchantAccountId: string }) => void;
  isLoading: boolean;
}) {
  const [terminalId, setTerminalId] = useState('');
  const [merchantAccountId, setMerchantAccountId] = useState('');

  // Re-query accounts for the selected provider inside the dialog
  const { accounts: dialogAccounts } = useMerchantAccounts(selectedProviderId);
  const activeAccounts = dialogAccounts.filter((a) => a.isActive);

  return (
    <DialogOverlay onClose={onClose}>
      <h3 className="text-lg font-semibold text-gray-900">Assign Terminal to MID</h3>
      <div className="mt-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Provider</label>
          <select
            value={selectedProviderId ?? ''}
            onChange={(e) => onSelectProvider(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
          >
            <option value="">Select provider...</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Terminal ID</label>
          <input
            type="text"
            value={terminalId}
            onChange={(e) => setTerminalId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
            placeholder="Enter terminal ID"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Merchant Account</label>
          <select
            value={merchantAccountId}
            onChange={(e) => setMerchantAccountId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
          >
            <option value="">Select MID...</option>
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName} ({a.merchantId}){a.isDefault ? ' — Default' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={() => onSubmit({ terminalId, merchantAccountId })}
          disabled={isLoading || !terminalId || !merchantAccountId}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Assign
        </button>
      </div>
    </DialogOverlay>
  );
}

// ── Assign Device Dialog ─────────────────────────────────────

const deviceModelOptions = Object.values(CARDPOINTE_DEVICE_MODELS);

function AssignDeviceDialog({
  providers,
  existingDevices,
  onClose,
  onSubmit,
  isLoading,
}: {
  providers: ProviderSummary[];
  existingDevices: DeviceAssignmentInfo[];
  onClose: () => void;
  onSubmit: (input: {
    terminalId: string;
    providerId: string;
    hsn: string;
    deviceModel?: string;
    deviceLabel?: string;
  }) => void;
  isLoading: boolean;
}) {
  const [terminalId, setTerminalId] = useState('');
  const [providerId, setProviderId] = useState(providers[0]?.id ?? '');
  const [hsn, setHsn] = useState('');
  const [deviceModel, setDeviceModel] = useState('');
  const [deviceLabel, setDeviceLabel] = useState('');

  // Terminals that already have a device assigned
  const assignedTerminalIds = new Set(existingDevices.map((d) => d.terminalId));

  return (
    <DialogOverlay onClose={onClose}>
      <h3 className="text-lg font-semibold text-gray-900">Assign Payment Device</h3>
      <p className="mt-1 text-sm text-gray-500">
        Map a physical card reader to a POS terminal by its Hardware Serial Number.
      </p>
      <div className="mt-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Provider</label>
          <select
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
          >
            <option value="">Select provider...</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">POS Terminal ID</label>
          <input
            type="text"
            value={terminalId}
            onChange={(e) => setTerminalId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
            placeholder="Enter terminal ID"
          />
          {terminalId && assignedTerminalIds.has(terminalId) && (
            <p className="mt-1 text-xs text-amber-600">
              This terminal already has a device assigned. It will be replaced.
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Hardware Serial Number (HSN)
          </label>
          <input
            type="text"
            value={hsn}
            onChange={(e) => setHsn(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
            placeholder="e.g. 12345678"
          />
          <p className="mt-1 text-xs text-gray-500">
            Found on the device label or in the CardPointe Terminal dashboard.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Device Model</label>
          <select
            value={deviceModel}
            onChange={(e) => setDeviceModel(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
          >
            <option value="">Select model (optional)...</option>
            {deviceModelOptions.map((m) => (
              <option key={m.code} value={m.code}>
                {m.displayName} ({m.connectionType.toUpperCase()})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Label (optional)</label>
          <input
            type="text"
            value={deviceLabel}
            onChange={(e) => setDeviceLabel(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
            placeholder="e.g. Front Register Reader"
          />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={() =>
            onSubmit({
              terminalId,
              providerId,
              hsn,
              ...(deviceModel ? { deviceModel } : {}),
              ...(deviceLabel ? { deviceLabel } : {}),
            })
          }
          disabled={isLoading || !terminalId || !providerId || !hsn}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Assign Device
        </button>
      </div>
    </DialogOverlay>
  );
}

// ── Edit Device Dialog ───────────────────────────────────────

function EditDeviceDialog({
  device,
  onClose,
  onSubmit,
  isLoading,
}: {
  device: DeviceAssignmentInfo;
  onClose: () => void;
  onSubmit: (input: {
    hsn?: string;
    deviceModel?: string | null;
    deviceLabel?: string | null;
    isActive?: boolean;
  }) => void;
  isLoading: boolean;
}) {
  const [hsn, setHsn] = useState(device.hsn);
  const [deviceModel, setDeviceModel] = useState(device.deviceModel ?? '');
  const [deviceLabel, setDeviceLabel] = useState(device.deviceLabel ?? '');
  const [isActive, setIsActive] = useState(device.isActive);

  return (
    <DialogOverlay onClose={onClose}>
      <h3 className="text-lg font-semibold text-gray-900">Edit Device Assignment</h3>
      <p className="mt-1 text-sm text-gray-500">
        Terminal: {device.terminalName || device.terminalId}
      </p>
      <div className="mt-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Hardware Serial Number (HSN)
          </label>
          <input
            type="text"
            value={hsn}
            onChange={(e) => setHsn(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Device Model</label>
          <select
            value={deviceModel}
            onChange={(e) => setDeviceModel(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
          >
            <option value="">None</option>
            {deviceModelOptions.map((m) => (
              <option key={m.code} value={m.code}>
                {m.displayName} ({m.connectionType.toUpperCase()})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Label</label>
          <input
            type="text"
            value={deviceLabel}
            onChange={(e) => setDeviceLabel(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
            placeholder="e.g. Front Register Reader"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-gray-700">Active</span>
        </label>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={() =>
            onSubmit({
              ...(hsn !== device.hsn ? { hsn } : {}),
              deviceModel: deviceModel || null,
              deviceLabel: deviceLabel || null,
              isActive,
            })
          }
          disabled={isLoading || !hsn}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Changes
        </button>
      </div>
    </DialogOverlay>
  );
}

// ── Merchant Account Setup Panel ──────────────────────────────────

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

  // ── Form state ──
  const [displayName, setDisplayName] = useState('');
  const [hsn, setHsn] = useState('');
  const [achMerchantId, setAchMerchantId] = useState('');
  const [fundingMerchantId, setFundingMerchantId] = useState('');
  const [useForCardSwipe, setUseForCardSwipe] = useState(true);
  const [readerBeep, setReaderBeep] = useState(true);
  const [isProduction, setIsProduction] = useState(false);
  const [allowManualEntry, setAllowManualEntry] = useState(false);
  const [tipOnDevice, setTipOnDevice] = useState(false);

  // ── Credential fields (empty = unchanged) ──
  const [credSite, setCredSite] = useState('');
  const [credUsername, setCredUsername] = useState('');
  const [credPassword, setCredPassword] = useState('');
  const [credAuthKey, setCredAuthKey] = useState('');
  const [credAchUsername, setCredAchUsername] = useState('');
  const [credAchPassword, setCredAchPassword] = useState('');
  const [credFundingUsername, setCredFundingUsername] = useState('');
  const [credFundingPassword, setCredFundingPassword] = useState('');

  // ── Visibility toggles ──
  const [showPasswords, setShowPasswords] = useState(false);
  const [saved, setSaved] = useState(false);

  // Populate form when data loads
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
    // Pre-fill site dropdown if credentials exist
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

    // Only send credentials if the user provided new values
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
      <div className="py-12 text-center text-gray-400">
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
        <p className="mt-2">Loading merchant account setup...</p>
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-red-600">Merchant account not found.</p>
        <button onClick={onBack} className="mt-4 text-sm text-indigo-600 hover:text-indigo-700">
          &larr; Back to Merchant Accounts
        </button>
      </div>
    );
  }

  const maskedCreds = setup.credentials;
  const hasSavedCreds = !!setup.credentialId;

  return (
    <div className="space-y-6">
      {/* Header / Back */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Merchant Account Setup
          </h2>
          <p className="text-sm text-gray-500">
            {setup.account.displayName} &mdash; MID: <code className="text-xs">{setup.account.merchantId}</code>
          </p>
        </div>
      </div>

      {/* Explanation */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">Primary Merchant Credentials</p>
            <p className="mt-1">
              This section stores the primary credentials used by your organization for CardConnect
              transactions. These values are typically provided by CardConnect or your payment processor.
              Credential fields that show masked values (****) already have saved values &mdash;
              leave them blank to keep existing credentials, or enter new values to replace them.
            </p>
          </div>
        </div>
      </div>

      {/* ── Credentials Section ── */}
      <fieldset className="rounded-lg border border-gray-200 p-5">
        <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-gray-900">
          <Shield className="h-4 w-4 text-indigo-600" />
          API Credentials
        </legend>

        <div className="mt-3 space-y-4">
          {/* Site / Environment */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              CardPointe Site
            </label>
            <select
              value={credSite}
              onChange={(e) => setCredSite(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select site...</option>
              <option value="fts-uat">fts-uat (Sandbox / UAT)</option>
              <option value="fts">fts (Production)</option>
            </select>
            <p className="mt-1 text-xs text-gray-400">
              The CardPointe site determines your API endpoint. Use &quot;fts-uat&quot; for testing,
              &quot;fts&quot; for live transactions.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {hasSavedCreds ? (
                <span className="inline-flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Credentials saved
                  {setup.isSandbox && ' (Sandbox)'}
                </span>
              ) : (
                <span className="text-amber-600">No credentials saved yet</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setShowPasswords(!showPasswords)}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              {showPasswords ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showPasswords ? 'Hide' : 'Show'} values
            </button>
          </div>

          {/* Username & Password */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                CardPointe Username <span className="text-red-500">*</span>
              </label>
              <input
                type={showPasswords ? 'text' : 'password'}
                value={credUsername}
                onChange={(e) => setCredUsername(e.target.value)}
                placeholder={maskedCreds.username ? maskedCreds.username : 'YOUR_CARDPOINTE_USERNAME'}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                CardPointe Password <span className="text-red-500">*</span>
              </label>
              <input
                type={showPasswords ? 'text' : 'password'}
                value={credPassword}
                onChange={(e) => setCredPassword(e.target.value)}
                placeholder={maskedCreds.password ? maskedCreds.password : 'YOUR_CARDPOINTE_PASSWORD'}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Authorization Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Authorization Key <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type={showPasswords ? 'text' : 'password'}
              value={credAuthKey}
              onChange={(e) => setCredAuthKey(e.target.value)}
              placeholder={maskedCreds.authorizationKey ? maskedCreds.authorizationKey : 'YOUR_AUTH_KEY'}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              Used for API gateway authorization if required by your processor configuration.
            </p>
          </div>

          {/* ACH Credentials */}
          <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
            <p className="mb-3 text-sm font-medium text-gray-700">
              ACH Credentials <span className="text-gray-400">(if ACH is enabled)</span>
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">ACH Username</label>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  value={credAchUsername}
                  onChange={(e) => setCredAchUsername(e.target.value)}
                  placeholder={maskedCreds.achUsername ? maskedCreds.achUsername : 'YOUR_ACH_USERNAME'}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">ACH Password</label>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  value={credAchPassword}
                  onChange={(e) => setCredAchPassword(e.target.value)}
                  placeholder={maskedCreds.achPassword ? maskedCreds.achPassword : 'YOUR_ACH_PASSWORD'}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Funding Credentials */}
          <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
            <p className="mb-3 text-sm font-medium text-gray-700">
              Funding Credentials <span className="text-gray-400">(optional &mdash; only if processor requires separate funding)</span>
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Funding Username</label>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  value={credFundingUsername}
                  onChange={(e) => setCredFundingUsername(e.target.value)}
                  placeholder={maskedCreds.fundingUsername ? maskedCreds.fundingUsername : 'FUNDING_USERNAME'}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Funding Password</label>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  value={credFundingPassword}
                  onChange={(e) => setCredFundingPassword(e.target.value)}
                  placeholder={maskedCreds.fundingPassword ? maskedCreds.fundingPassword : 'FUNDING_PASSWORD'}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>
        </div>
      </fieldset>

      {/* ── Account Settings Section ── */}
      <fieldset className="rounded-lg border border-gray-200 p-5">
        <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-gray-900">
          <Settings2 className="h-4 w-4 text-indigo-600" />
          Account Settings
        </legend>

        <div className="mt-3 space-y-4">
          {/* Display Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Merchant Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="YOUR_MERCHANT_NAME"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              A friendly name for this merchant account (e.g., &quot;Pro Shop MID&quot;, &quot;Restaurant MID&quot;).
            </p>
          </div>

          {/* HSN */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              HSN (Hardware Serial Number) <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={hsn}
              onChange={(e) => setHsn(e.target.value)}
              placeholder="OPTIONAL_HSN"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              The hardware serial number of the primary card reader for this account. Leave blank if no
              dedicated reader is assigned, or if readers are assigned at the device level.
            </p>
          </div>

          {/* ACH Merchant ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              ACH Merchant ID <span className="text-gray-400">(if ACH is enabled)</span>
            </label>
            <input
              type="text"
              value={achMerchantId}
              onChange={(e) => setAchMerchantId(e.target.value)}
              placeholder="YOUR_ACH_MID"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              A separate merchant ID used for ACH (eCheck) transactions, if different from the card MID.
            </p>
          </div>

          {/* Funding Merchant ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Funding Merchant ID <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={fundingMerchantId}
              onChange={(e) => setFundingMerchantId(e.target.value)}
              placeholder="FUNDING_MID"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              A separate funding merchant ID, only required if your processor uses a different MID for settlement/funding.
            </p>
          </div>
        </div>
      </fieldset>

      {/* ── Toggles Section ── */}
      <fieldset className="rounded-lg border border-gray-200 p-5">
        <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-gray-900">
          <Cpu className="h-4 w-4 text-indigo-600" />
          Terminal &amp; Processing Options
        </legend>

        <div className="mt-3 space-y-5">
          {/* Use For Card Swipe */}
          <ToggleRow
            label="Use For Card Swipe"
            description="Enable CardConnect for in-person payments (swiped, dipped, or tapped cards). Turn this off only if this MID is used exclusively for e-commerce or keyed transactions."
            checked={useForCardSwipe}
            onChange={setUseForCardSwipe}
          />

          {/* Reader Beep */}
          <ToggleRow
            label="Reader Beep Sound"
            description="When enabled, the card reader will beep to confirm a successful tap or dip. Disable for a quieter checkout experience."
            checked={readerBeep}
            onChange={setReaderBeep}
          />

          {/* Is Production */}
          <div>
            <ToggleRow
              label="Production Mode"
              description="When enabled, this account processes real transactions with real money. Keep this OFF during testing."
              checked={isProduction}
              onChange={setIsProduction}
            />
            {isProduction && (
              <div className="mt-2 ml-11 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-xs text-amber-800">
                  <strong>Warning:</strong> Production mode processes real credit card transactions and charges real money.
                  Make sure all credentials are correct before enabling this setting.
                </p>
              </div>
            )}
          </div>

          {/* Allow Manual Entry */}
          <ToggleRow
            label="Allow Manual Entry from POS"
            description={'Permit cashiers to manually type in card numbers at the POS terminal. This is sometimes called "keyed entry." Disabling this requires all cards to be swiped, dipped, or tapped.'}
            checked={allowManualEntry}
            onChange={setAllowManualEntry}
          />

          {/* Tip on Device */}
          <ToggleRow
            label="Tip on Device"
            description="Show a tip prompt on the payment terminal so the customer can add a tip before completing the transaction. Common in restaurant and service environments."
            checked={tipOnDevice}
            onChange={setTipOnDevice}
          />
        </div>
      </fieldset>

      {/* ── Save Bar ── */}
      <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <button
          onClick={handleSave}
          disabled={isSaving || !displayName}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
        <button
          onClick={() => setShowVerify(true)}
          disabled={!hasSavedCreds}
          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
          title={hasSavedCreds ? 'Test all credential types for this provider' : 'Save credentials first'}
        >
          <ShieldCheck className="h-4 w-4" /> Verify Credentials
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-sm font-medium text-green-600">
            <CheckCircle2 className="h-4 w-4" /> Saved successfully
          </span>
        )}
        {saveError && (
          <span className="text-sm text-red-600">
            {saveError instanceof Error ? saveError.message : 'Failed to save'}
          </span>
        )}
        <span className="ml-auto text-xs text-gray-400">
          Click Save to apply all changes to this merchant account.
        </span>
      </div>

      {/* Verify Credentials Report (portal) */}
      {showVerify && (
        <VerifyCredentialsReport
          providerId={providerId}
          onClose={() => setShowVerify(false)}
        />
      )}
    </div>
  );
}

/** Reusable toggle row with label + description */
function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <div className="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <div className="h-5 w-9 rounded-full bg-gray-300 peer-checked:bg-indigo-600 transition-colors" />
        <div className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </div>
      <div>
        <span className="text-sm font-medium text-gray-900">{label}</span>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
    </label>
  );
}

// ── Verify Credentials Report ────────────────────────────────

function VerifyCredentialsReport({
  providerId,
  onClose,
}: {
  providerId: string;
  onClose: () => void;
}) {
  const { verify, isVerifying, result, error, reset } = useVerifyCredentials(providerId);

  // Auto-run verify on mount
  useEffect(() => {
    verify();
    return () => reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusColor = (status: VerifyCredentialRow['status']) => {
    switch (status) {
      case 'OK':
        return 'text-green-700 bg-green-50';
      case 'Unauthorized':
        return 'text-red-700 bg-red-50';
      case 'Blank Credentials':
        return 'text-amber-700 bg-amber-50';
      case 'Timeout':
        return 'text-orange-700 bg-orange-50';
      case 'Error':
        return 'text-red-700 bg-red-50';
      default:
        return 'text-gray-700 bg-gray-50';
    }
  };

  const statusIcon = (status: VerifyCredentialRow['status']) => {
    switch (status) {
      case 'OK':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'Unauthorized':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'Blank Credentials':
        return <AlertTriangle className="h-4 w-4 text-amber-600" />;
      default:
        return <XCircle className="h-4 w-4 text-red-600" />;
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-4xl rounded-xl bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-indigo-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Verify Credentials</h2>
              <p className="text-sm text-gray-500">
                Testing connectivity for all credential types across merchant accounts
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {isVerifying ? (
            <div className="py-16 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-indigo-600" />
              <p className="mt-3 text-sm font-medium text-gray-700">Testing credentials...</p>
              <p className="mt-1 text-xs text-gray-400">
                Verifying Ecom, ACH, and Funding credentials for each merchant account
              </p>
            </div>
          ) : error ? (
            <div className="py-12 text-center">
              <XCircle className="mx-auto h-10 w-10 text-red-400" />
              <p className="mt-3 text-sm font-medium text-red-700">
                {error instanceof Error ? error.message : 'Failed to verify credentials'}
              </p>
              <button
                onClick={() => verify()}
                className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Retry
              </button>
            </div>
          ) : result ? (
            <div className="space-y-3">
              {/* Summary Banner */}
              {(() => {
                const okCount = result.rows.filter((r) => r.status === 'OK').length;
                const total = result.rows.length;
                const allOk = okCount === total;
                return (
                  <div
                    className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium ${
                      allOk
                        ? 'border-green-200 bg-green-50 text-green-800'
                        : 'border-amber-200 bg-amber-50 text-amber-800'
                    }`}
                  >
                    {allOk ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                    {okCount} of {total} credential{total !== 1 ? 's' : ''} verified successfully
                    <span className="ml-auto text-xs font-normal text-gray-500">
                      {new Date(result.testedAt).toLocaleString()}
                    </span>
                  </div>
                );
              })()}

              {/* Results Table */}
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                        Merchant Account
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                        Account Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                        MID
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                        User Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                        Password
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-surface">
                    {result.rows.map((row, idx) => (
                      <tr key={`${row.merchantAccountId}-${row.accountType}`} className="hover:bg-gray-50/50">
                        {/* Only show the merchant account name for the first row of each group */}
                        <td className="px-4 py-2.5 text-sm text-gray-900">
                          {idx === 0 || result.rows[idx - 1]!.merchantAccountId !== row.merchantAccountId
                            ? (
                              <div>
                                <span className="font-medium">{row.displayName}</span>
                                <span className="ml-2 font-mono text-xs text-gray-400">{row.merchantId}</span>
                              </div>
                            )
                            : null}
                        </td>
                        <td className="px-4 py-2.5 text-sm">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                              row.accountType === 'Ecom'
                                ? 'bg-blue-50 text-blue-700'
                                : row.accountType === 'ACH'
                                  ? 'bg-purple-50 text-purple-700'
                                  : 'bg-teal-50 text-teal-700'
                            }`}
                          >
                            {row.accountType}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-sm text-gray-700">
                          {row.mid}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-gray-700">
                          {row.username || (
                            <span className="italic text-gray-400">blank</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-sm text-gray-700">
                          {row.password || (
                            <span className="italic text-gray-400">blank</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${statusColor(row.status)}`}
                            title={row.error}
                          >
                            {statusIcon(row.status)}
                            {row.status}
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

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3">
          <p className="text-xs text-gray-400">
            Tests each credential type by calling the CardPointe inquire endpoint.
          </p>
          <div className="flex items-center gap-2">
            {result && (
              <button
                onClick={() => verify()}
                disabled={isVerifying}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <ShieldCheck className="h-4 w-4" /> Re-test
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-md bg-gray-100 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── ACH Settings Tab ──────────────────────────────────────────────

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

function AchSettingsTab({
  accounts,
  isLoading,
  selectedProviderId,
  providers,
  onSelectProvider,
}: {
  accounts: MerchantAccountInfo[];
  isLoading: boolean;
  selectedProviderId: string | null;
  providers: ProviderSummary[];
  onSelectProvider: (p: ProviderSummary) => void;
}) {
  if (!selectedProviderId && providers.length > 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Select a provider to configure ACH settings for its merchant accounts.
        </p>
        <div className="space-y-2">
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelectProvider(p)}
              className="flex w-full items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 text-left hover:bg-gray-50"
            >
              <CreditCard className="h-5 w-5 text-gray-400" />
              <div>
                <span className="text-sm font-medium text-gray-900">{p.displayName}</span>
                <span className="ml-2 text-xs text-gray-400">{p.code}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-4 w-48 animate-pulse rounded bg-gray-200" />
        <div className="h-32 animate-pulse rounded-lg bg-gray-100" />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-gray-300 py-8">
        <Landmark className="h-8 w-8 text-gray-300" />
        <p className="text-sm text-gray-500">
          No merchant accounts found. Create a Merchant Account (MID) first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <div className="text-sm text-blue-700">
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
    <div className="rounded-lg border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-emerald-600" />
          <h3 className="text-base font-semibold text-gray-900">
            {mid.displayName}
          </h3>
          <span className="text-xs text-gray-400">MID: {mid.merchantId}</span>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-sm text-gray-600">ACH Enabled</span>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Your Company Name"
              maxLength={100}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              Appears on customer bank statements. Required by NACHA.
            </p>
          </div>

          {/* Company ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company ID <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              placeholder="Originator ID"
              maxLength={50}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              NACHA originator identification number.
            </p>
          </div>

          {/* Default SEC Code */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default SEC Code
            </label>
            <div className="grid grid-cols-2 gap-2">
              {SEC_CODE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 ${
                    secCode === opt.value
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name={`secCode-${mid.id}`}
                    value={opt.value}
                    checked={secCode === opt.value}
                    onChange={() => setSecCode(opt.value)}
                    className="mt-0.5 h-4 w-4 text-indigo-600"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-900">{opt.label}</span>
                    <p className="text-xs text-gray-500">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Verification Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bank Account Verification
            </label>
            <div className="space-y-2">
              {VERIFICATION_MODE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 ${
                    verificationMode === opt.value
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name={`verify-${mid.id}`}
                    value={opt.value}
                    checked={verificationMode === opt.value}
                    onChange={() => setVerificationMode(opt.value)}
                    className="mt-0.5 h-4 w-4 text-indigo-600"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-900">{opt.label}</span>
                    <p className="text-xs text-gray-500">{opt.desc}</p>
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
          <span className="flex items-center gap-1 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            Saved
          </span>
        )}
        {error && (
          <span className="text-sm text-red-600">{error}</span>
        )}
      </div>
    </div>
  );
}
