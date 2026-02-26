'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  AlertCircle,
  Download,
  Filter,
  X,
} from 'lucide-react';
import {
  useTransactions,
  type TransactionFilters,
  type TransactionListItem,
} from '@/hooks/use-transactions';

// ── Status config ────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  created: 'Created',
  authorized: 'Authorized',
  capture_pending: 'Capture Pending',
  captured: 'Captured',
  voided: 'Voided',
  refund_pending: 'Refund Pending',
  refunded: 'Refunded',
  declined: 'Declined',
  error: 'Error',
  resolved: 'Resolved',
};

const STATUS_COLORS: Record<string, string> = {
  created: 'bg-muted0/10 text-muted-foreground',
  authorized: 'bg-blue-500/10 text-blue-500',
  capture_pending: 'bg-yellow-500/10 text-yellow-500',
  captured: 'bg-green-500/10 text-green-500',
  voided: 'bg-red-500/10 text-red-500',
  refund_pending: 'bg-orange-500/10 text-orange-500',
  refunded: 'bg-purple-500/10 text-purple-500',
  declined: 'bg-red-500/10 text-red-500',
  error: 'bg-red-500/20 text-red-500',
  resolved: 'bg-muted0/20 text-muted-foreground',
};

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'authorized', label: 'Authorized' },
  { key: 'captured', label: 'Captured' },
  { key: 'voided', label: 'Voided' },
  { key: 'refunded', label: 'Refunded' },
  { key: 'declined', label: 'Declined' },
  { key: 'error', label: 'Errors' },
];

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '--';
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] ?? 'bg-muted0/10 text-muted-foreground';
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors}`}>
      {label}
    </span>
  );
}

// ── Main content ─────────────────────────────────────────────

export default function TransactionsContent() {
  const router = useRouter();
  const [filters, setFilters] = useState<TransactionFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const { items, meta, isLoading, error, refetch } = useTransactions(filters);

  const setStatusFilter = useCallback(
    (status: string) => {
      const next: TransactionFilters = { ...filters, status: status || undefined, cursor: undefined };
      setFilters(next);
      setCursorStack([]);
    },
    [filters],
  );

  const applyAdvancedFilters = useCallback(() => {
    const next: TransactionFilters = { ...filters, cursor: undefined };
    if (dateFrom) next.dateFrom = dateFrom;
    else delete next.dateFrom;
    if (dateTo) next.dateTo = dateTo;
    else delete next.dateTo;
    if (amountMin) next.amountMinCents = Math.round(parseFloat(amountMin) * 100);
    else delete next.amountMinCents;
    if (amountMax) next.amountMaxCents = Math.round(parseFloat(amountMax) * 100);
    else delete next.amountMaxCents;
    if (searchTerm.length === 4 && /^\d{4}$/.test(searchTerm)) {
      next.cardLast4 = searchTerm;
    } else {
      delete next.cardLast4;
    }
    setFilters(next);
    setCursorStack([]);
  }, [filters, dateFrom, dateTo, amountMin, amountMax, searchTerm]);

  const clearFilters = useCallback(() => {
    setFilters({});
    setSearchTerm('');
    setDateFrom('');
    setDateTo('');
    setAmountMin('');
    setAmountMax('');
    setCursorStack([]);
    setShowFilters(false);
  }, []);

  const goNextPage = useCallback(() => {
    if (meta.cursor) {
      setCursorStack((prev) => [...prev, filters.cursor ?? '']);
      setFilters((prev) => ({ ...prev, cursor: meta.cursor! }));
    }
  }, [meta.cursor, filters.cursor]);

  const goPrevPage = useCallback(() => {
    if (cursorStack.length > 0) {
      const prev = [...cursorStack];
      const cursor = prev.pop()!;
      setCursorStack(prev);
      setFilters((p) => ({ ...p, cursor: cursor || undefined }));
    }
  }, [cursorStack]);

  const hasActiveFilters = !!(
    filters.dateFrom ||
    filters.dateTo ||
    filters.amountMinCents ||
    filters.amountMaxCents ||
    filters.cardLast4
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Transactions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            View and manage payment gateway transactions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            onClick={() => {
              const params = new URLSearchParams();
              if (filters.status) params.set('status', filters.status);
              if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
              if (filters.dateTo) params.set('dateTo', filters.dateTo);
              params.set('format', 'csv');
              window.open(`/api/v1/payments/transactions?${params.toString()}`, '_blank');
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              (filters.status ?? '') === tab.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pb-1">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
              hasActiveFilters
                ? 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/30'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
            {hasActiveFilters && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  clearFilters();
                }}
                className="ml-1 rounded-full p-0.5 hover:bg-indigo-500/10"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </button>
        </div>
      </div>

      {/* Advanced filters panel */}
      {showFilters && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                From Date
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="block w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                To Date
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="block w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Min Amount ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amountMin}
                onChange={(e) => setAmountMin(e.target.value)}
                className="block w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Max Amount ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amountMax}
                onChange={(e) => setAmountMax(e.target.value)}
                className="block w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Card last 4 digits..."
                maxLength={4}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyAdvancedFilters()}
                className="block w-full rounded-md border border-border bg-surface pl-9 pr-3 py-1.5 text-sm"
              />
            </div>
            <button
              onClick={applyAdvancedFilters}
              className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Apply
            </button>
            <button
              onClick={clearFilters}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-500">Failed to load transactions. Please try again.</p>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Amount
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Method
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Card
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Provider Ref
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Order
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Loading transactions...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <CreditCard className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">No transactions found</p>
                  {hasActiveFilters && (
                    <button
                      onClick={clearFilters}
                      className="mt-2 text-sm text-indigo-600 hover:text-indigo-500"
                    >
                      Clear filters
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              items.map((txn) => (
                <TransactionRow
                  key={txn.id}
                  txn={txn}
                  onClick={() => router.push(`/payments/transactions/${txn.id}`)}
                />
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {(meta.hasMore || cursorStack.length > 0) && (
          <div className="flex items-center justify-between border-t border-border bg-muted px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Page {cursorStack.length + 1}
              {items.length > 0 && ` \u00B7 ${items.length} results`}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={goPrevPage}
                disabled={cursorStack.length === 0}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <button
                onClick={goNextPage}
                disabled={!meta.hasMore}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Transaction row ──────────────────────────────────────────

function TransactionRow({
  txn,
  onClick,
}: {
  txn: TransactionListItem;
  onClick: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className="cursor-pointer hover:bg-accent transition-colors"
    >
      <td className="px-4 py-3 text-sm">
        <div className="text-foreground">{formatDate(txn.createdAt)}</div>
        <div className="text-muted-foreground text-xs">{formatTime(txn.createdAt)}</div>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={txn.status} />
      </td>
      <td className="px-4 py-3 text-sm font-medium text-foreground">
        {formatCents(txn.amountCents)}
        {txn.refundedAmountCents != null && txn.refundedAmountCents > 0 && (
          <div className="text-xs text-red-500">
            -{formatCents(txn.refundedAmountCents)} refunded
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-foreground capitalize">
        {txn.paymentMethodType}
      </td>
      <td className="px-4 py-3 text-sm text-foreground">
        {txn.cardLast4 ? (
          <span>
            {txn.cardBrand && (
              <span className="text-muted-foreground mr-1">{txn.cardBrand}</span>
            )}
            ****{txn.cardLast4}
          </span>
        ) : (
          <span className="text-muted-foreground">--</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground font-mono text-xs">
        {txn.providerRef || '--'}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground font-mono text-xs">
        {txn.orderId ? txn.orderId.slice(0, 8) + '...' : '--'}
      </td>
    </tr>
  );
}
