'use client';

import { useState, useMemo } from 'react';
import {
  DollarSign,
  CreditCard,
  AlertTriangle,
  ArrowRightLeft,
  Clock,
  Filter,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Pause,
  FileText,
  Wallet,
  BarChart3,
  History,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import {
  useFinancialAccounts,
  useUnifiedLedger,
  useAgingSummary,
  useFinancialMutations,
  useFinancialAuditTrail,
} from '@/hooks/use-customer-360';
import type {
  FinancialAccountEntry,
  LedgerTransactionEntry,
  AgingBucket,
  AuditTrailEntry,
  AdjustLedgerInput,
} from '@/types/customer-360';

// ── Helpers ─────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  const abs = Math.abs(cents);
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(abs / 100);
  if (cents < 0) return `(${formatted})`;
  return formatted;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

function accountTypeVariant(type: string): string {
  const map: Record<string, string> = {
    house: 'indigo',
    dues: 'purple',
    stored_value: 'info',
    credit: 'warning',
    prepaid: 'success',
  };
  return map[type] ?? 'neutral';
}

function accountStatusVariant(status: string): string {
  const map: Record<string, string> = {
    active: 'success',
    on_hold: 'warning',
    suspended: 'error',
    closed: 'neutral',
  };
  return map[status] ?? 'neutral';
}

function txTypeVariant(type: string): string {
  const map: Record<string, string> = {
    charge: 'error',
    payment: 'success',
    credit_memo: 'info',
    manual_charge: 'warning',
    writeoff: 'purple',
    adjustment: 'orange',
    refund: 'indigo',
    late_fee: 'error',
  };
  return map[type] ?? 'neutral';
}

function txStatusVariant(status: string): string {
  const map: Record<string, string> = {
    posted: 'success',
    pending: 'warning',
    voided: 'error',
    reversed: 'neutral',
  };
  return map[status] ?? 'neutral';
}

function collectionStatusVariant(status: string): string {
  const map: Record<string, string> = {
    normal: 'neutral',
    past_due: 'warning',
    collections: 'error',
    suspended: 'error',
    write_off: 'purple',
  };
  return map[status] ?? 'neutral';
}

function utilizationColor(pct: number): string {
  if (pct > 80) return 'bg-red-500';
  if (pct > 50) return 'bg-amber-500';
  return 'bg-green-500';
}

function utilizationTextColor(pct: number): string {
  if (pct > 80) return 'text-red-500';
  if (pct > 50) return 'text-amber-500';
  return 'text-green-500';
}

function agingBucketColor(label: string): string {
  if (label === 'Current') return 'text-green-500 bg-green-500/10';
  if (label === '1-30') return 'text-yellow-500 bg-yellow-500/10';
  if (label === '31-60') return 'text-orange-500 bg-orange-500/10';
  if (label === '61-90') return 'text-red-500 bg-red-500/10';
  return 'text-red-500 bg-red-500/20'; // 90+
}

function auditActionVariant(action: string): string {
  const map: Record<string, string> = {
    credit_memo: 'info',
    manual_charge: 'warning',
    writeoff: 'purple',
    adjustment: 'orange',
    hold_placed: 'error',
    hold_lifted: 'success',
    credit_limit_changed: 'indigo',
    payment_received: 'success',
    account_created: 'success',
  };
  return map[action] ?? 'neutral';
}

// ── Skeleton ────────────────────────────────────────────────────

function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-4 h-4 w-32 animate-pulse rounded bg-muted" />
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-3 animate-pulse rounded bg-muted"
            style={{ width: `${60 + Math.random() * 40}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SkeletonCard lines={5} />
        <SkeletonCard lines={5} />
      </div>
      <SkeletonCard lines={2} />
      <SkeletonCard lines={6} />
    </div>
  );
}

// ── Section Header ──────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  badge,
  actions,
}: {
  icon: React.ElementType;
  title: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {title}
        {badge}
      </div>
      {actions}
    </div>
  );
}

// ── Account Summary Panel ───────────────────────────────────────

function AccountCard({
  account,
  onAdjust,
  onTransfer,
  onHold,
}: {
  account: FinancialAccountEntry;
  onAdjust: (accountId: string) => void;
  onTransfer: (accountId: string) => void;
  onHold: (accountId: string) => void;
}) {
  const balanceColor =
    account.currentBalanceCents > 0 ? 'text-red-500' : 'text-green-500';
  const utilizationPct = account.creditUtilization;
  const hasCreditLimit =
    account.creditLimitCents !== null && account.creditLimitCents > 0;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      {/* Header row */}
      <div className="mb-3 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {account.name}
            </span>
            <Badge variant={accountTypeVariant(account.accountType)}>
              {account.accountType.replace(/_/g, ' ')}
            </Badge>
            <Badge variant={accountStatusVariant(account.status)}>
              {account.status.replace(/_/g, ' ')}
            </Badge>
          </div>
          {account.collectionStatus !== 'normal' && (
            <div className="mt-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-red-500" />
              <Badge variant={collectionStatusVariant(account.collectionStatus)}>
                {account.collectionStatus.replace(/_/g, ' ')}
              </Badge>
            </div>
          )}
        </div>
        <span className={`text-lg font-bold ${balanceColor}`}>
          {formatMoney(account.currentBalanceCents)}
        </span>
      </div>

      {/* Credit utilization bar */}
      {hasCreditLimit && (
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Credit Limit: {formatMoney(account.creditLimitCents!)}
            </span>
            <span
              className={`font-medium ${utilizationTextColor(utilizationPct)}`}
            >
              {utilizationPct.toFixed(0)}% used
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${utilizationColor(utilizationPct)}`}
              style={{ width: `${Math.min(utilizationPct, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Autopay indicator */}
      <div className="mb-3 flex items-center gap-2">
        <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Autopay:</span>
        {account.autopayEnabled ? (
          <Badge variant="success">{account.autopayStrategy}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">Not configured</span>
        )}
      </div>

      {/* Billing cycle */}
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <span>
          {account.billingCycle} billing, due in {account.dueDays} days
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => onAdjust(account.id)}
          className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-500/10"
        >
          <DollarSign className="h-3 w-3" />
          Adjust
        </button>
        <button
          type="button"
          onClick={() => onTransfer(account.id)}
          className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
        >
          <ArrowRightLeft className="h-3 w-3" />
          Transfer
        </button>
        <button
          type="button"
          onClick={() => onHold(account.id)}
          className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium text-amber-500 transition-colors hover:bg-amber-500/10"
        >
          <Pause className="h-3 w-3" />
          Hold
        </button>
      </div>
    </div>
  );
}

function AccountSummaryPanel({
  accounts,
  totalBalanceCents,
  onAdjust,
  onTransfer,
  onHold,
}: {
  accounts: FinancialAccountEntry[];
  totalBalanceCents: number;
  onAdjust: (accountId: string) => void;
  onTransfer: (accountId: string) => void;
  onHold: (accountId: string) => void;
}) {
  return (
    <div>
      <SectionHeader
        icon={Wallet}
        title="Accounts"
        badge={<Badge variant="neutral">{accounts.length}</Badge>}
        actions={
          <span
            className={`text-sm font-semibold ${totalBalanceCents > 0 ? 'text-red-500' : 'text-green-500'}`}
          >
            Total: {formatMoney(totalBalanceCents)}
          </span>
        }
      />
      {accounts.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-muted-foreground">
          No billing accounts on file
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {accounts.map((acct) => (
            <AccountCard
              key={acct.id}
              account={acct}
              onAdjust={onAdjust}
              onTransfer={onTransfer}
              onHold={onHold}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Aging Summary Panel ─────────────────────────────────────────

function AgingSummaryPanel({
  buckets,
  totalOutstandingCents,
  isLoading,
}: {
  buckets: AgingBucket[];
  totalOutstandingCents: number;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-surface p-5">
        <div className="mb-3 h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="flex gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 flex-1 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <SectionHeader
        icon={BarChart3}
        title="Aging Summary"
        actions={
          <span className="text-sm font-semibold text-foreground">
            Outstanding: {formatMoney(totalOutstandingCents)}
          </span>
        }
      />
      <div className="flex flex-wrap gap-2">
        {buckets.map((bucket) => (
          <div
            key={bucket.label}
            className={`flex-1 min-w-[100px] rounded-lg p-3 text-center ${agingBucketColor(bucket.label)}`}
          >
            <div className="text-xs font-medium opacity-80">{bucket.label}</div>
            <div className="mt-1 text-base font-bold">
              {formatMoney(bucket.totalCents)}
            </div>
            <div className="mt-0.5 text-xs opacity-60">
              {bucket.count} {bucket.count === 1 ? 'item' : 'items'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Ledger Grid ─────────────────────────────────────────────────

interface LedgerFiltersState {
  accountId: string;
  dateFrom: string;
  dateTo: string;
  type: string;
  status: string;
}

const TX_TYPES = [
  '', 'charge', 'payment', 'credit_memo', 'manual_charge',
  'writeoff', 'adjustment', 'refund', 'late_fee',
];
const TX_STATUSES = ['', 'posted', 'pending', 'voided', 'reversed'];

function LedgerGrid({
  customerId,
  accounts,
}: {
  customerId: string;
  accounts: FinancialAccountEntry[];
}) {
  const [filters, setFilters] = useState<LedgerFiltersState>({
    accountId: '',
    dateFrom: '',
    dateTo: '',
    type: '',
    status: '',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const hookFilters = useMemo(
    () => ({
      accountId: filters.accountId || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      type: filters.type || undefined,
      status: filters.status || undefined,
      cursor: cursorStack[cursorStack.length - 1] || undefined,
      limit: 25,
    }),
    [filters, cursorStack],
  );

  const { data, isLoading } = useUnifiedLedger(customerId, hookFilters);
  const transactions = data?.transactions ?? [];

  function handleLoadMore() {
    if (data?.cursor) {
      setCursorStack((prev) => [...prev, data.cursor!]);
    }
  }

  function handleResetFilters() {
    setFilters({ accountId: '', dateFrom: '', dateTo: '', type: '', status: '' });
    setCursorStack([]);
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      {/* Header + filter toggle */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <FileText className="h-4 w-4 text-muted-foreground" />
          Transaction Ledger
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((p) => !p)}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
          {showFilters ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="border-b border-border bg-muted/50 px-5 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Account
              <select
                value={filters.accountId}
                onChange={(e) => {
                  setFilters((p) => ({ ...p, accountId: e.target.value }));
                  setCursorStack([]);
                }}
                className="rounded border border-input bg-surface px-2 py-1.5 text-sm"
              >
                <option value="">All accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              From
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => {
                  setFilters((p) => ({ ...p, dateFrom: e.target.value }));
                  setCursorStack([]);
                }}
                className="rounded border border-input bg-surface px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              To
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => {
                  setFilters((p) => ({ ...p, dateTo: e.target.value }));
                  setCursorStack([]);
                }}
                className="rounded border border-input bg-surface px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Type
              <select
                value={filters.type}
                onChange={(e) => {
                  setFilters((p) => ({ ...p, type: e.target.value }));
                  setCursorStack([]);
                }}
                className="rounded border border-input bg-surface px-2 py-1.5 text-sm"
              >
                {TX_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t ? t.replace(/_/g, ' ') : 'All types'}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Status
              <select
                value={filters.status}
                onChange={(e) => {
                  setFilters((p) => ({ ...p, status: e.target.value }));
                  setCursorStack([]);
                }}
                className="rounded border border-input bg-surface px-2 py-1.5 text-sm"
              >
                {TX_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s ? s : 'All statuses'}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={handleResetFilters}
              className="rounded px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2.5">Date</th>
              <th className="px-3 py-2.5">Description</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5">Source</th>
              <th className="px-3 py-2.5">Account</th>
              <th className="px-3 py-2.5 text-right">Amount</th>
              <th className="px-3 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && transactions.length === 0 ? (
              <>
                {[1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td colSpan={7} className="px-5 py-3">
                      <div className="h-4 animate-pulse rounded bg-muted" />
                    </td>
                  </tr>
                ))}
              </>
            ) : transactions.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-5 py-12 text-center text-muted-foreground"
                >
                  No transactions found
                </td>
              </tr>
            ) : (
              transactions.map((tx) => (
                <LedgerRow key={tx.id} tx={tx} />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Load more */}
      {data?.hasMore && (
        <div className="border-t border-border px-5 py-3 text-center">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={isLoading}
            className="rounded bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}

function LedgerRow({ tx }: { tx: LedgerTransactionEntry }) {
  const amountColor = tx.amountCents < 0 ? 'text-red-500' : 'text-green-500';

  return (
    <tr className="border-b border-gray-50 transition-colors hover:bg-accent/50">
      <td className="whitespace-nowrap px-5 py-2.5 text-xs text-muted-foreground">
        {tx.businessDate ? formatDate(tx.businessDate) : formatDate(tx.createdAt)}
      </td>
      <td className="max-w-[200px] truncate px-3 py-2.5 text-foreground">
        {tx.notes || '\u2014'}
      </td>
      <td className="px-3 py-2.5">
        <Badge variant={txTypeVariant(tx.type)}>
          {tx.type.replace(/_/g, ' ')}
        </Badge>
      </td>
      <td className="px-3 py-2.5 text-xs text-muted-foreground">
        {tx.sourceModule?.replace(/_/g, ' ') || '\u2014'}
      </td>
      <td className="px-3 py-2.5 text-xs text-muted-foreground">
        {tx.accountName}
      </td>
      <td className={`whitespace-nowrap px-3 py-2.5 text-right font-medium ${amountColor}`}>
        {formatMoney(tx.amountCents)}
      </td>
      <td className="px-3 py-2.5">
        <Badge variant={txStatusVariant(tx.status)}>{tx.status}</Badge>
      </td>
    </tr>
  );
}

// ── Adjustment Form ─────────────────────────────────────────────

const ADJUSTMENT_TYPES: AdjustLedgerInput['type'][] = [
  'credit_memo',
  'manual_charge',
  'writeoff',
  'adjustment',
];

function AdjustmentForm({
  customerId,
  accounts,
  preselectedAccountId,
  onClose,
  onSuccess,
}: {
  customerId: string;
  accounts: FinancialAccountEntry[];
  preselectedAccountId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const mutations = useFinancialMutations();
  const [accountId, setAccountId] = useState(preselectedAccountId);
  const [type, setType] = useState<AdjustLedgerInput['type']>('credit_memo');
  const [amountStr, setAmountStr] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');

  async function handleSubmit() {
    const amountDollars = parseFloat(amountStr);
    if (!accountId || isNaN(amountDollars) || amountDollars <= 0) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (!notes.trim()) {
      toast.error('Notes are required for adjustments');
      return;
    }
    const amountCents = Math.round(amountDollars * 100);
    try {
      await mutations.adjustLedger(customerId, accountId, {
        type,
        amountCents,
        notes: notes.trim(),
        reason: reason.trim() || undefined,
      });
      toast.success('Adjustment posted successfully');
      onSuccess();
      onClose();
    } catch {
      toast.error('Failed to post adjustment');
    }
  }

  return (
    <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          New Adjustment
        </h4>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Type */}
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Type <span className="text-red-500">*</span>
            <select
              value={type}
              onChange={(e) =>
                setType(e.target.value as AdjustLedgerInput['type'])
              }
              className="rounded border border-input bg-surface px-2 py-1.5 text-sm"
            >
              {ADJUSTMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>

          {/* Account */}
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Account <span className="text-red-500">*</span>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="rounded border border-input bg-surface px-2 py-1.5 text-sm"
            >
              <option value="">Select account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          {/* Amount */}
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Amount ($) <span className="text-red-500">*</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="0.00"
              className="rounded border border-input bg-surface px-2 py-1.5 text-sm"
            />
          </label>
        </div>

        {/* Notes */}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Notes <span className="text-red-500">*</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Describe this adjustment..."
            className="rounded border border-input bg-surface px-2 py-1.5 text-sm"
          />
        </label>

        {/* Reason */}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Reason
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Optional reason code"
            className="rounded border border-input bg-surface px-2 py-1.5 text-sm"
          />
        </label>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={mutations.isLoading}
            className="rounded bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {mutations.isLoading ? 'Posting...' : 'Post Adjustment'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={mutations.isLoading}
            className="rounded border border-input px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Audit Log Section ───────────────────────────────────────────

function AuditLogSection({ customerId }: { customerId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [auditCursor, setAuditCursor] = useState<string | undefined>(undefined);
  const { data, isLoading } = useFinancialAuditTrail(
    expanded ? customerId : null,
    auditCursor,
  );

  const entries = data?.entries ?? [];

  function handleLoadMore() {
    if (data?.cursor) {
      setAuditCursor(data.cursor);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <History className="h-4 w-4 text-muted-foreground" />
          Financial Audit Log
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border px-5 py-3">
          {isLoading && entries.length === 0 ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded bg-muted"
                />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No audit entries found
            </p>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <AuditEntry key={entry.id} entry={entry} />
              ))}
              {data?.hasMore && (
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={isLoading}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-50"
                  >
                    {isLoading ? 'Loading...' : 'Show more'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AuditEntry({ entry }: { entry: AuditTrailEntry }) {
  const [showDiff, setShowDiff] = useState(false);
  const hasDiff = entry.beforeJson || entry.afterJson;

  return (
    <div className="rounded border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={auditActionVariant(entry.actionType)}>
          {entry.actionType.replace(/_/g, ' ')}
        </Badge>
        <span className="text-xs text-muted-foreground">
          by {entry.actorUserId}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatDateTime(entry.occurredAt)}
        </span>
        {hasDiff && (
          <button
            type="button"
            onClick={() => setShowDiff((p) => !p)}
            className="ml-auto text-xs text-indigo-600 hover:text-indigo-500"
          >
            {showDiff ? 'Hide diff' : 'Show diff'}
          </button>
        )}
      </div>
      {entry.reason && (
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="font-medium">Reason:</span> {entry.reason}
        </p>
      )}
      {showDiff && hasDiff && (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {entry.beforeJson && (
            <div className="rounded bg-red-500/10 p-2">
              <span className="text-xs font-medium text-red-500">Before</span>
              <pre className="mt-1 max-h-32 overflow-auto text-xs text-muted-foreground">
                {JSON.stringify(entry.beforeJson, null, 2)}
              </pre>
            </div>
          )}
          {entry.afterJson && (
            <div className="rounded bg-green-500/10 p-2">
              <span className="text-xs font-medium text-green-500">After</span>
              <pre className="mt-1 max-h-32 overflow-auto text-xs text-muted-foreground">
                {JSON.stringify(entry.afterJson, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────

export default function FinancialTab({
  customerId,
}: {
  customerId: string;
}) {
  const { toast } = useToast();
  const accountsHook = useFinancialAccounts(customerId);
  const agingHook = useAgingSummary(customerId);
  const mutations = useFinancialMutations();

  // Adjustment form state
  const [adjustFormOpen, setAdjustFormOpen] = useState(false);
  const [adjustAccountId, setAdjustAccountId] = useState('');

  // Transfer dialog state (simplified inline)
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [transferAmountStr, setTransferAmountStr] = useState('');
  const [transferReason, setTransferReason] = useState('');

  const accounts = accountsHook.data?.accounts ?? [];
  const totalBalanceCents = accountsHook.data?.totalBalanceCents ?? 0;

  // Handlers
  function handleAdjust(accountId: string) {
    setAdjustAccountId(accountId);
    setAdjustFormOpen(true);
  }

  function handleTransfer(accountId: string) {
    setTransferFrom(accountId);
    setTransferTo('');
    setTransferAmountStr('');
    setTransferReason('');
    setTransferOpen(true);
  }

  async function handleHold(accountId: string) {
    const reason = window.prompt('Reason for hold:');
    if (!reason?.trim()) return;
    try {
      await mutations.placeHold(customerId, accountId, { reason: reason.trim() });
      toast.success('Account placed on hold');
      accountsHook.mutate();
    } catch {
      toast.error('Failed to place hold on account');
    }
  }

  async function handleTransferSubmit() {
    const dollars = parseFloat(transferAmountStr);
    if (!transferFrom || !transferTo || isNaN(dollars) || dollars <= 0) {
      toast.error('Please fill in all transfer fields');
      return;
    }
    if (transferFrom === transferTo) {
      toast.error('Cannot transfer to the same account');
      return;
    }
    if (!transferReason.trim()) {
      toast.error('Reason is required for transfers');
      return;
    }
    try {
      await mutations.transferFunds(customerId, {
        fromAccountId: transferFrom,
        toAccountId: transferTo,
        amountCents: Math.round(dollars * 100),
        reason: transferReason.trim(),
      });
      toast.success('Transfer completed');
      setTransferOpen(false);
      accountsHook.mutate();
    } catch {
      toast.error('Failed to complete transfer');
    }
  }

  function handleAdjustSuccess() {
    accountsHook.mutate();
    agingHook.mutate();
  }

  // Loading state
  if (accountsHook.isLoading && !accountsHook.data) {
    return <LoadingSkeleton />;
  }

  // Error state
  if (accountsHook.error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface px-6 py-12 text-center">
        <AlertTriangle className="mb-3 h-8 w-8 text-red-400" />
        <p className="mb-4 text-sm text-muted-foreground">
          Failed to load financial data.
        </p>
        <button
          type="button"
          onClick={() => accountsHook.mutate()}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Account Summary */}
      <AccountSummaryPanel
        accounts={accounts}
        totalBalanceCents={totalBalanceCents}
        onAdjust={handleAdjust}
        onTransfer={handleTransfer}
        onHold={handleHold}
      />

      {/* Aging Summary */}
      <AgingSummaryPanel
        buckets={agingHook.data?.buckets ?? []}
        totalOutstandingCents={agingHook.data?.totalOutstandingCents ?? 0}
        isLoading={agingHook.isLoading && !agingHook.data}
      />

      {/* Adjustment Form (collapsible) */}
      {adjustFormOpen && (
        <AdjustmentForm
          customerId={customerId}
          accounts={accounts}
          preselectedAccountId={adjustAccountId}
          onClose={() => setAdjustFormOpen(false)}
          onSuccess={handleAdjustSuccess}
        />
      )}

      {/* Transfer Form (collapsible) */}
      {transferOpen && (
        <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
              Transfer Between Accounts
            </h4>
            <button
              type="button"
              onClick={() => setTransferOpen(false)}
              className="rounded p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                From Account <span className="text-red-500">*</span>
                <select
                  value={transferFrom}
                  onChange={(e) => setTransferFrom(e.target.value)}
                  className="rounded border border-input bg-surface px-2 py-1.5 text-sm"
                >
                  <option value="">Select source</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                To Account <span className="text-red-500">*</span>
                <select
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                  className="rounded border border-input bg-surface px-2 py-1.5 text-sm"
                >
                  <option value="">Select destination</option>
                  {accounts
                    .filter((a) => a.id !== transferFrom)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Amount ($) <span className="text-red-500">*</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={transferAmountStr}
                  onChange={(e) => setTransferAmountStr(e.target.value)}
                  placeholder="0.00"
                  className="rounded border border-input bg-surface px-2 py-1.5 text-sm"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Reason <span className="text-red-500">*</span>
              <input
                type="text"
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="Reason for transfer"
                className="rounded border border-input bg-surface px-2 py-1.5 text-sm"
              />
            </label>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleTransferSubmit}
                disabled={mutations.isLoading}
                className="rounded bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
              >
                {mutations.isLoading ? 'Transferring...' : 'Transfer'}
              </button>
              <button
                type="button"
                onClick={() => setTransferOpen(false)}
                disabled={mutations.isLoading}
                className="rounded border border-input px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ledger Grid */}
      <LedgerGrid customerId={customerId} accounts={accounts} />

      {/* Audit Log (collapsible section at bottom) */}
      <AuditLogSection customerId={customerId} />
    </div>
  );
}
