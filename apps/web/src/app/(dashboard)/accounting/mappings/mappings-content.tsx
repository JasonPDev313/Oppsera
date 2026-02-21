'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle, XCircle, ArrowRight } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { AccountPicker } from '@/components/accounting/account-picker';
import { AccountingEmptyState } from '@/components/accounting/accounting-empty-state';
import {
  useMappingCoverage,
  useSubDepartmentMappings,
  usePaymentTypeMappings,
  useTaxGroupMappings,
  useMappingMutations,
  useUnmappedEvents,
  useUnmappedEventMutations,
} from '@/hooks/use-mappings';
import { useToast } from '@/components/ui/toast';

type TabKey = 'departments' | 'payments' | 'taxes' | 'unmapped';

export default function MappingsContent() {
  const [activeTab, setActiveTab] = useState<TabKey>('departments');
  const { data: coverage, isLoading: coverageLoading } = useMappingCoverage();
  const { data: unmappedEvents } = useUnmappedEvents({ status: 'unresolved' });

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'departments', label: 'Departments' },
    { key: 'payments', label: 'Payment Types' },
    { key: 'taxes', label: 'Tax Groups' },
    { key: 'unmapped', label: 'Unmapped Events', count: unmappedEvents.length },
  ];

  return (
    <AccountingPageShell
      title="GL Account Mappings"
      breadcrumbs={[{ label: 'Mappings' }]}
    >
      {/* Coverage Summary */}
      {coverage && (
        <div className="rounded-lg border border-gray-200 bg-surface p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Mapping Coverage</h2>
            <span className="text-lg font-bold text-gray-900">{coverage.overallPercentage}%</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { label: 'Departments', ...coverage.departments },
              { label: 'Payment Types', ...coverage.paymentTypes },
              { label: 'Tax Groups', ...coverage.taxGroups },
            ].map(({ label, mapped, total }) => (
              <div key={label}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-600">{label}</span>
                  <span className="font-medium text-gray-900">{mapped}/{total}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className={`h-full rounded-full transition-all ${
                      total === 0 ? 'bg-gray-300' :
                      mapped === total ? 'bg-green-500' :
                      mapped > 0 ? 'bg-amber-500' : 'bg-red-400'
                    }`}
                    style={{ width: total > 0 ? `${(mapped / total) * 100}%` : '0%' }}
                  />
                </div>
              </div>
            ))}
          </div>
          {coverage.overallPercentage < 100 && (
            <div className="flex items-center gap-2 rounded bg-amber-50 p-2 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Items without GL mappings will not post to the General Ledger.
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto">
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === key
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            {label}
            {count != null && count > 0 && (
              <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-xs font-medium text-red-700">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'departments' && <DepartmentMappingsTab />}
      {activeTab === 'payments' && <PaymentTypeMappingsTab />}
      {activeTab === 'taxes' && <TaxGroupMappingsTab />}
      {activeTab === 'unmapped' && <UnmappedEventsTab />}
    </AccountingPageShell>
  );
}

// ── Department Mappings ──────────────────────────────────────

function DepartmentMappingsTab() {
  const { data: mappings, isLoading, mutate } = useSubDepartmentMappings();
  const { saveSubDepartmentDefaults } = useMappingMutations();
  const { toast } = useToast();

  const handleSave = async (mapping: typeof mappings[number]) => {
    try {
      await saveSubDepartmentDefaults.mutateAsync({
        subDepartmentId: mapping.subDepartmentId,
        revenueAccountId: mapping.revenueAccountId,
        cogsAccountId: mapping.cogsAccountId,
        inventoryAssetAccountId: mapping.inventoryAssetAccountId,
        discountAccountId: mapping.discountAccountId,
        returnsAccountId: mapping.returnsAccountId,
      });
      toast.success('Mapping saved');
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />)}</div>;
  }

  if (mappings.length === 0) {
    return <AccountingEmptyState title="No departments configured" description="Configure departments in the Catalog module first." />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Department</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Revenue</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">COGS</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Inventory</th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => {
              const isMapped = !!m.revenueAccountId;
              return (
                <tr key={m.subDepartmentId} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">{m.subDepartmentName}</div>
                    <div className="text-xs text-gray-500">{m.departmentName}</div>
                  </td>
                  <td className="px-4 py-3">
                    <AccountPicker
                      value={m.revenueAccountId}
                      onChange={(v) => handleSave({ ...m, revenueAccountId: v })}
                      className="w-48"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <AccountPicker
                      value={m.cogsAccountId}
                      onChange={(v) => handleSave({ ...m, cogsAccountId: v })}
                      className="w-48"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <AccountPicker
                      value={m.inventoryAssetAccountId}
                      onChange={(v) => handleSave({ ...m, inventoryAssetAccountId: v })}
                      className="w-48"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isMapped ? (
                      <CheckCircle className="inline h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="inline h-5 w-5 text-red-400" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Payment Type Mappings ────────────────────────────────────

function PaymentTypeMappingsTab() {
  const { data: mappings, isLoading, mutate } = usePaymentTypeMappings();
  const { savePaymentTypeDefaults } = useMappingMutations();
  const { toast } = useToast();

  const handleSave = async (mapping: typeof mappings[number]) => {
    try {
      await savePaymentTypeDefaults.mutateAsync({
        paymentType: mapping.paymentType,
        cashBankAccountId: mapping.cashBankAccountId,
        clearingAccountId: mapping.clearingAccountId,
        feeExpenseAccountId: mapping.feeExpenseAccountId,
      });
      toast.success('Mapping saved');
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />)}</div>;
  }

  if (mappings.length === 0) {
    return <AccountingEmptyState title="No payment types configured" description="Payment types are defined in the Payment module." />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Payment Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Cash/Bank Account</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Clearing Account</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Fee Expense</th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => {
              const isMapped = !!m.cashBankAccountId;
              return (
                <tr key={m.paymentType} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 capitalize">{m.paymentType.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3">
                    <AccountPicker
                      value={m.cashBankAccountId}
                      onChange={(v) => handleSave({ ...m, cashBankAccountId: v })}
                      className="w-48"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <AccountPicker
                      value={m.clearingAccountId}
                      onChange={(v) => handleSave({ ...m, clearingAccountId: v })}
                      className="w-48"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <AccountPicker
                      value={m.feeExpenseAccountId}
                      onChange={(v) => handleSave({ ...m, feeExpenseAccountId: v })}
                      className="w-48"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isMapped ? (
                      <CheckCircle className="inline h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="inline h-5 w-5 text-red-400" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tax Group Mappings ───────────────────────────────────────

function TaxGroupMappingsTab() {
  const { data: mappings, isLoading, mutate } = useTaxGroupMappings();
  const { saveTaxGroupDefaults } = useMappingMutations();
  const { toast } = useToast();

  const handleSave = async (mapping: typeof mappings[number]) => {
    try {
      await saveTaxGroupDefaults.mutateAsync({
        taxGroupId: mapping.taxGroupId,
        taxPayableAccountId: mapping.taxPayableAccountId,
      });
      toast.success('Mapping saved');
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />)}</div>;
  }

  if (mappings.length === 0) {
    return <AccountingEmptyState title="No tax groups configured" description="Tax groups are defined in the Catalog module's tax settings." />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Tax Group</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Rate</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Tax Payable Account</th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => {
              const isMapped = !!m.taxPayableAccountId;
              return (
                <tr key={m.taxGroupId} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{m.taxGroupName}</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">{m.rate}%</td>
                  <td className="px-4 py-3">
                    <AccountPicker
                      value={m.taxPayableAccountId}
                      onChange={(v) => handleSave({ ...m, taxPayableAccountId: v })}
                      className="w-56"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isMapped ? (
                      <CheckCircle className="inline h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="inline h-5 w-5 text-red-400" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Unmapped Events ──────────────────────────────────────────

function UnmappedEventsTab() {
  const [statusFilter, setStatusFilter] = useState<'unresolved' | 'resolved' | undefined>('unresolved');
  const { data: events, isLoading, mutate } = useUnmappedEvents({ status: statusFilter });
  const { resolveEvent } = useUnmappedEventMutations();
  const { toast } = useToast();

  const handleResolve = async (id: string) => {
    try {
      await resolveEvent.mutateAsync({ id, note: 'Manually resolved' });
      toast.success('Event marked as resolved');
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resolve');
    }
  };

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['unresolved', 'resolved'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              statusFilter === s
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {events.length === 0 && (
        <AccountingEmptyState
          title={statusFilter === 'unresolved' ? 'No unmapped events' : 'No resolved events'}
          description={statusFilter === 'unresolved' ? 'All POS transactions are mapping to GL accounts correctly.' : 'No events have been resolved yet.'}
        />
      )}

      {events.length > 0 && (
        <div className="space-y-2">
          {events.map((event) => (
            <div key={event.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-surface p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-gray-900">
                  {event.reason}
                </p>
                <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                  <span>{event.eventType.replace(/_/g, ' ')}</span>
                  <span>·</span>
                  <span>{event.sourceModule}</span>
                  <span>·</span>
                  <span>{new Date(event.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              {!event.resolvedAt ? (
                <div className="flex items-center gap-2">
                  <Link
                    href="/accounting/mappings"
                    className="text-sm text-indigo-600 hover:text-indigo-800"
                  >
                    Fix Mapping
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleResolve(event.id)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Resolve
                  </button>
                </div>
              ) : (
                <span className="text-xs text-green-600">Resolved</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
