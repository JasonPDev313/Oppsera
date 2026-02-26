'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, DollarSign, FileText, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { FormField } from '@/components/ui/form-field';
import { CurrencyInput } from '@/components/ui/currency-input';
import { useToast } from '@/components/ui/toast';
import { useBillingAccount, useArLedger, useAgingReport } from '@/hooks/use-customers';
import { apiFetch } from '@/lib/api-client';
import type { BillingAccountMember, ArTransaction } from '@/types/customers';

// ── Helpers ───────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const STATUS_BADGES: Record<string, { label: string; variant: string }> = {
  active: { label: 'Active', variant: 'success' },
  suspended: { label: 'Suspended', variant: 'warning' },
  closed: { label: 'Closed', variant: 'neutral' },
};

const TX_TYPE_BADGES: Record<string, { label: string; variant: string }> = {
  charge: { label: 'Charge', variant: 'error' },
  payment: { label: 'Payment', variant: 'success' },
  credit_memo: { label: 'Credit Memo', variant: 'info' },
  late_fee: { label: 'Late Fee', variant: 'orange' },
  writeoff: { label: 'Write-off', variant: 'purple' },
  adjustment: { label: 'Adjustment', variant: 'neutral' },
  refund: { label: 'Refund', variant: 'info' },
};

const ROLE_BADGES: Record<string, { label: string; variant: string }> = {
  owner: { label: 'Owner', variant: 'indigo' },
  authorized: { label: 'Authorized', variant: 'info' },
  dependent: { label: 'Dependent', variant: 'neutral' },
};

type MemberRow = BillingAccountMember & Record<string, unknown>;
type TxRow = ArTransaction & Record<string, unknown>;

// ── Add Member Dialog ─────────────────────────────────────────────

function AddMemberDialog({
  open,
  onClose,
  accountId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  accountId: string;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [customerId, setCustomerId] = useState('');
  const [role, setRole] = useState('authorized');
  const [chargeAllowed, setChargeAllowed] = useState(true);
  const [spendingLimitDollars, setSpendingLimitDollars] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetForm = useCallback(() => {
    setCustomerId('');
    setRole('authorized');
    setChargeAllowed(true);
    setSpendingLimitDollars(null);
    setErrors({});
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!customerId.trim()) newErrors.customerId = 'Customer ID is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      await apiFetch(`/api/v1/billing/accounts/${accountId}/members`, {
        method: 'POST',
        body: JSON.stringify({
          customerId: customerId.trim(),
          role,
          chargeAllowed,
          spendingLimitCents: spendingLimitDollars !== null ? Math.round(spendingLimitDollars * 100) : null,
        }),
      });
      toast.success('Member added to billing account');
      handleClose();
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative w-full max-w-lg rounded-xl bg-surface p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">Add Member</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add an authorized member to this billing account.
        </p>

        <div className="mt-4 space-y-4">
          <FormField
            label="Customer ID"
            required
            error={errors.customerId}
            helpText="Enter the customer UUID to add"
          >
            <input
              type="text"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="Customer UUID"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          <FormField label="Role" required>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="owner">Owner</option>
              <option value="authorized">Authorized</option>
              <option value="dependent">Dependent</option>
            </select>
          </FormField>

          <FormField label="Charge Allowed">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={chargeAllowed}
                onChange={(e) => setChargeAllowed(e.target.checked)}
                className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
              />
              Allow this member to make charges to the account
            </label>
          </FormField>

          <FormField label="Spending Limit" helpText="Leave empty for no limit">
            <CurrencyInput
              value={spendingLimitDollars}
              onChange={(val) => setSpendingLimitDollars(val)}
              placeholder="No limit"
            />
          </FormField>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 ${
              isSubmitting ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            {isSubmitting ? 'Adding...' : 'Add Member'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Record Payment Dialog ─────────────────────────────────────────

function RecordPaymentDialog({
  open,
  onClose,
  accountId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  accountId: string;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [amountDollars, setAmountDollars] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetForm = useCallback(() => {
    setAmountDollars(null);
    setNotes('');
    setErrors({});
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (amountDollars === null || amountDollars <= 0) newErrors.amount = 'Amount must be greater than zero';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      await apiFetch(`/api/v1/billing/accounts/${accountId}/transactions`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'payment',
          amountCents: Math.round((amountDollars ?? 0) * 100),
          notes: notes.trim() || null,
        }),
      });
      toast.success('Payment recorded successfully');
      handleClose();
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative w-full max-w-lg rounded-xl bg-surface p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">Record Payment</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Record a payment against this billing account.
        </p>

        <div className="mt-4 space-y-4">
          <FormField label="Amount" required error={errors.amount}>
            <CurrencyInput
              value={amountDollars}
              onChange={(val) => setAmountDollars(val)}
              placeholder="0.00"
            />
          </FormField>

          <FormField label="Notes">
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Check #1234, Cash payment"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 ${
              isSubmitting ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            {isSubmitting ? 'Recording...' : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Generate Statement Dialog ─────────────────────────────────────

function GenerateStatementDialog({
  open,
  onClose,
  accountId,
}: {
  open: boolean;
  onClose: () => void;
  accountId: string;
}) {
  const { toast } = useToast();
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetForm = useCallback(() => {
    setPeriodStart('');
    setPeriodEnd('');
    setErrors({});
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!periodStart) newErrors.periodStart = 'Start date is required';
    if (!periodEnd) newErrors.periodEnd = 'End date is required';
    if (periodStart && periodEnd && periodStart > periodEnd) {
      newErrors.periodEnd = 'End date must be after start date';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      await apiFetch(`/api/v1/billing/accounts/${accountId}/statements`, {
        method: 'POST',
        body: JSON.stringify({
          periodStart,
          periodEnd,
        }),
      });
      toast.success('Statement generated successfully');
      handleClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate statement');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative w-full max-w-lg rounded-xl bg-surface p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">Generate Statement</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate a billing statement for a specific period.
        </p>

        <div className="mt-4 space-y-4">
          <FormField label="Period Start" required error={errors.periodStart}>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          <FormField label="Period End" required error={errors.periodEnd}>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 ${
              isSubmitting ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            {isSubmitting ? 'Generating...' : 'Generate Statement'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Members Section ───────────────────────────────────────────────

function MembersSection({
  members,
  accountId,
  onRefresh,
}: {
  members: BillingAccountMember[];
  accountId: string;
  onRefresh: () => void;
}) {
  const [showAddMember, setShowAddMember] = useState(false);

  const memberColumns = [
    {
      key: 'displayName',
      header: 'Name',
      render: (row: MemberRow) => (
        <span className="font-medium text-foreground">{row.displayName}</span>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (row: MemberRow) => {
        const badge = ROLE_BADGES[row.role] || { label: row.role, variant: 'neutral' };
        return <Badge variant={badge.variant}>{badge.label}</Badge>;
      },
    },
    {
      key: 'chargeAllowed',
      header: 'Charge Allowed',
      render: (row: MemberRow) => (
        <Badge variant={row.chargeAllowed ? 'success' : 'neutral'}>
          {row.chargeAllowed ? 'Yes' : 'No'}
        </Badge>
      ),
    },
    {
      key: 'spendingLimitCents',
      header: 'Spending Limit',
      render: (row: MemberRow) => (
        <span className="text-muted-foreground">
          {row.spendingLimitCents !== null ? formatMoney(row.spendingLimitCents) : 'No limit'}
        </span>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (row: MemberRow) => (
        <Badge variant={row.isActive ? 'success' : 'neutral'}>
          {row.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
  ];

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-base font-semibold text-foreground">Members</h2>
        <button
          type="button"
          onClick={() => setShowAddMember(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Member
        </button>
      </div>
      <div className="p-6">
        <DataTable
          columns={memberColumns}
          data={members as MemberRow[]}
          emptyMessage="No members on this account"
          emptyAction={{ label: 'Add Member', onClick: () => setShowAddMember(true) }}
        />
      </div>
      <AddMemberDialog
        open={showAddMember}
        onClose={() => setShowAddMember(false)}
        accountId={accountId}
        onSuccess={onRefresh}
      />
    </div>
  );
}

// ── Aging Section ─────────────────────────────────────────────────

function AgingSection({ accountId }: { accountId: string }) {
  const { data: aging, isLoading } = useAgingReport(accountId);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-foreground">Aging Report</h2>
        </div>
        <div className="flex justify-center p-6">
          <LoadingSpinner label="Loading aging report..." />
        </div>
      </div>
    );
  }

  if (!aging) {
    return (
      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-foreground">Aging Report</h2>
        </div>
        <div className="p-6">
          <p className="text-sm text-muted-foreground">No aging data available</p>
        </div>
      </div>
    );
  }

  const buckets = [
    { label: 'Current', value: aging.current },
    { label: '30 Days', value: aging.thirtyDay },
    { label: '60 Days', value: aging.sixtyDay },
    { label: '90 Days', value: aging.ninetyDay },
    { label: '120+ Days', value: aging.overHundredTwenty },
  ];

  const maxBucket = Math.max(...buckets.map((b) => b.value), 1);

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-base font-semibold text-foreground">Aging Report</h2>
        <div className="text-sm text-muted-foreground">
          Total Outstanding: <span className="font-semibold text-foreground">{formatMoney(aging.total)}</span>
        </div>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-5 gap-4">
          {buckets.map((bucket) => (
            <div key={bucket.label} className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">{bucket.label}</div>
              <div className={`text-lg font-semibold ${bucket.value > 0 ? 'text-red-500' : 'text-foreground'}`}>
                {formatMoney(bucket.value)}
              </div>
              {/* Bar visualization */}
              <div className="mt-2 h-2 w-full rounded-full bg-muted">
                <div
                  className={`h-2 rounded-full transition-all ${
                    bucket.value > 0 ? 'bg-red-400' : 'bg-muted'
                  }`}
                  style={{ width: `${(bucket.value / maxBucket) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Transactions Section ──────────────────────────────────────────

function TransactionsSection({
  accountId,
  onPaymentRecorded,
}: {
  accountId: string;
  onPaymentRecorded: () => void;
}) {
  const {
    data: transactions,
    isLoading,
    hasMore,
    loadMore,
    mutate: refreshTx,
  } = useArLedger(accountId);
  const [showPayment, setShowPayment] = useState(false);

  const handlePaymentSuccess = useCallback(() => {
    refreshTx();
    onPaymentRecorded();
  }, [refreshTx, onPaymentRecorded]);

  const txColumns = [
    {
      key: 'createdAt',
      header: 'Date',
      render: (row: TxRow) => (
        <span className="text-sm text-muted-foreground">{formatDateTime(row.createdAt)}</span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row: TxRow) => {
        const badge = TX_TYPE_BADGES[row.type] || { label: row.type, variant: 'neutral' };
        return <Badge variant={badge.variant}>{badge.label}</Badge>;
      },
    },
    {
      key: 'amountCents',
      header: 'Amount',
      render: (row: TxRow) => {
        const isCredit = ['payment', 'credit_memo', 'refund'].includes(row.type);
        return (
          <span className={`font-medium ${isCredit ? 'text-green-500' : 'text-red-500'}`}>
            {isCredit ? '-' : '+'}{formatMoney(row.amountCents)}
          </span>
        );
      },
    },
    {
      key: 'referenceType',
      header: 'Reference',
      render: (row: TxRow) => (
        <span className="text-sm text-muted-foreground">
          {row.referenceType ? `${row.referenceType}${row.referenceId ? `: ${row.referenceId}` : ''}` : '\u2014'}
        </span>
      ),
    },
    {
      key: 'notes',
      header: 'Notes',
      render: (row: TxRow) => (
        <span className="text-sm text-muted-foreground">{row.notes || '\u2014'}</span>
      ),
    },
  ];

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-base font-semibold text-foreground">Transactions</h2>
        <button
          type="button"
          onClick={() => setShowPayment(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
        >
          <DollarSign className="h-3.5 w-3.5" />
          Record Payment
        </button>
      </div>
      <div className="p-6">
        <DataTable
          columns={txColumns}
          data={transactions as TxRow[]}
          isLoading={isLoading}
          emptyMessage="No transactions recorded yet"
        />
        {hasMore && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={loadMore}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Load More
            </button>
          </div>
        )}
      </div>
      <RecordPaymentDialog
        open={showPayment}
        onClose={() => setShowPayment(false)}
        accountId={accountId}
        onSuccess={handlePaymentSuccess}
      />
    </div>
  );
}

// ── Statements Section ────────────────────────────────────────────

function StatementsSection({ accountId }: { accountId: string }) {
  const [showGenerate, setShowGenerate] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-base font-semibold text-foreground">Statements</h2>
        <button
          type="button"
          onClick={() => setShowGenerate(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <FileText className="h-3.5 w-3.5" />
          Generate Statement
        </button>
      </div>
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          Generate a statement to view all transactions for a specific billing period.
        </p>
      </div>
      <GenerateStatementDialog
        open={showGenerate}
        onClose={() => setShowGenerate(false)}
        accountId={accountId}
      />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────

export default function BillingAccountDetailPage() {
  const params = useParams();
  const router = useRouter();
  const accountId = params.id as string;

  const { data: account, isLoading, mutate: refreshAccount } = useBillingAccount(accountId);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <LoadingSpinner size="lg" label="Loading billing account..." />
      </div>
    );
  }

  // Not found state
  if (!account) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">Billing account not found</p>
        <button
          type="button"
          onClick={() => router.push('/customers/billing')}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Back to Billing Accounts
        </button>
      </div>
    );
  }

  const statusBadge = STATUS_BADGES[account.status] || { label: account.status, variant: 'neutral' };
  const creditLimit = account.creditLimitCents;
  const availableCredit = creditLimit !== null ? creditLimit - account.currentBalanceCents : null;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <button
        type="button"
        onClick={() => router.push('/customers/billing')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Billing Accounts
      </button>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">{account.name}</h1>
          <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
        </div>
        <button
          type="button"
          onClick={() => {
            /* Edit functionality placeholder */
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Pencil className="h-4 w-4" />
          Edit
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current Balance</p>
          <p className={`mt-1 text-2xl font-bold ${account.currentBalanceCents > 0 ? 'text-red-500' : 'text-green-500'}`}>
            {formatMoney(account.currentBalanceCents)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Credit Limit</p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {creditLimit !== null ? formatMoney(creditLimit) : '\u2014'}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Available Credit</p>
          <p className={`mt-1 text-2xl font-bold ${
            availableCredit !== null && availableCredit < 0 ? 'text-red-500' : 'text-foreground'
          }`}>
            {availableCredit !== null ? formatMoney(availableCredit) : '\u2014'}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Due Days</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{account.dueDays}</p>
          <p className="mt-0.5 text-xs capitalize text-muted-foreground">{account.billingCycle} cycle</p>
        </div>
      </div>

      {/* Members */}
      <MembersSection
        members={account.members}
        accountId={accountId}
        onRefresh={refreshAccount}
      />

      {/* Aging */}
      <AgingSection accountId={accountId} />

      {/* Transactions */}
      <TransactionsSection
        accountId={accountId}
        onPaymentRecorded={refreshAccount}
      />

      {/* Statements */}
      <StatementsSection accountId={accountId} />
    </div>
  );
}
