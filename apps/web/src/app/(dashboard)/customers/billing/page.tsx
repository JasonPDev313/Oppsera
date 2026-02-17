'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Plus, CreditCard } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { CurrencyInput } from '@/components/ui/currency-input';
import { useToast } from '@/components/ui/toast';
import { useBillingAccounts } from '@/hooks/use-customers';
import { apiFetch } from '@/lib/api-client';
import type { BillingAccount } from '@/types/customers';

// ── Helpers ───────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const STATUS_BADGES: Record<string, { label: string; variant: string }> = {
  active: { label: 'Active', variant: 'success' },
  suspended: { label: 'Suspended', variant: 'warning' },
  closed: { label: 'Closed', variant: 'neutral' },
};

const statusFilterOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'closed', label: 'Closed' },
];

type AccountRow = BillingAccount & Record<string, unknown>;

// ── Create Account Dialog ─────────────────────────────────────────

function CreateAccountDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [primaryCustomerId, setPrimaryCustomerId] = useState('');
  const [creditLimitDollars, setCreditLimitDollars] = useState<number | null>(null);
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [dueDays, setDueDays] = useState('30');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetForm = useCallback(() => {
    setName('');
    setPrimaryCustomerId('');
    setCreditLimitDollars(null);
    setBillingCycle('monthly');
    setDueDays('30');
    setErrors({});
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Account name is required';
    if (!primaryCustomerId.trim()) newErrors.primaryCustomerId = 'Primary customer ID is required';
    const days = parseInt(dueDays, 10);
    if (isNaN(days) || days < 0) newErrors.dueDays = 'Due days must be a non-negative number';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      await apiFetch('/api/v1/billing/accounts', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          primaryCustomerId: primaryCustomerId.trim(),
          creditLimitCents: creditLimitDollars !== null ? Math.round(creditLimitDollars * 100) : null,
          billingCycle,
          dueDays: parseInt(dueDays, 10),
        }),
      });
      toast.success(`Billing account "${name.trim()}" created`);
      handleClose();
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create billing account');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900">Create Billing Account</h2>
        <p className="mt-1 text-sm text-gray-500">
          Set up a new billing account for house charge and AR tracking.
        </p>

        <div className="mt-4 space-y-4">
          <FormField label="Account Name" required error={errors.name}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Smith Family Account"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          <FormField
            label="Primary Customer ID"
            required
            error={errors.primaryCustomerId}
            helpText="Enter the customer UUID that owns this account"
          >
            <input
              type="text"
              value={primaryCustomerId}
              onChange={(e) => setPrimaryCustomerId(e.target.value)}
              placeholder="Customer UUID"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          <FormField label="Credit Limit">
            <CurrencyInput
              value={creditLimitDollars}
              onChange={(val) => setCreditLimitDollars(val)}
              placeholder="No limit"
            />
          </FormField>

          <FormField label="Billing Cycle" required>
            <select
              value={billingCycle}
              onChange={(e) => setBillingCycle(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="monthly">Monthly</option>
              <option value="biweekly">Biweekly</option>
              <option value="weekly">Weekly</option>
            </select>
          </FormField>

          <FormField label="Due Days" required error={errors.dueDays}>
            <input
              type="number"
              value={dueDays}
              onChange={(e) => setDueDays(e.target.value)}
              placeholder="30"
              min="0"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 ${
              isSubmitting ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            {isSubmitting ? 'Creating...' : 'Create Account'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Main Page ─────────────────────────────────────────────────────

export default function BillingAccountsPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const {
    data: accounts,
    isLoading,
    hasMore,
    loadMore,
    mutate: refresh,
  } = useBillingAccounts({ status: statusFilter || undefined });

  const columns = [
    {
      key: 'name',
      header: 'Account Name',
      render: (row: AccountRow) => (
        <span className="font-medium text-gray-900">{row.name}</span>
      ),
    },
    {
      key: 'primaryCustomerId',
      header: 'Primary Customer',
      render: (row: AccountRow) => (
        <span className="text-sm text-gray-600">{row.billingContactName || row.primaryCustomerId}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: AccountRow) => {
        const badge = STATUS_BADGES[row.status] || { label: row.status, variant: 'neutral' };
        return <Badge variant={badge.variant}>{badge.label}</Badge>;
      },
    },
    {
      key: 'currentBalanceCents',
      header: 'Balance',
      render: (row: AccountRow) => (
        <span className={`font-medium ${row.currentBalanceCents > 0 ? 'text-red-600' : 'text-gray-900'}`}>
          {formatMoney(row.currentBalanceCents)}
        </span>
      ),
    },
    {
      key: 'creditLimitCents',
      header: 'Credit Limit',
      render: (row: AccountRow) => (
        <span className="text-gray-600">
          {row.creditLimitCents !== null ? formatMoney(row.creditLimitCents) : '\u2014'}
        </span>
      ),
    },
    {
      key: 'billingCycle',
      header: 'Cycle',
      render: (row: AccountRow) => (
        <span className="text-sm capitalize text-gray-600">{row.billingCycle}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Billing Accounts</h1>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Create Account
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        >
          {statusFilterOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {statusFilter && (
          <button
            type="button"
            onClick={() => setStatusFilter('')}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear filter
          </button>
        )}
      </div>

      {!isLoading && accounts.length === 0 && !statusFilter ? (
        <EmptyState
          icon={CreditCard}
          title="No billing accounts"
          description="Create a billing account to enable house charges and AR tracking"
          action={{ label: 'Create Account', onClick: () => setShowCreate(true) }}
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={accounts as AccountRow[]}
            isLoading={isLoading}
            emptyMessage="No billing accounts match your filter"
            onRowClick={(row) => router.push(`/customers/billing/${row.id}`)}
          />
          {hasMore && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Load More
              </button>
            </div>
          )}
        </>
      )}

      <CreateAccountDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={refresh}
      />
    </div>
  );
}
