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
  created: 'bg-gray-100 text-gray-700',
  authorized: 'bg-blue-100 text-blue-700',
  capture_pending: 'bg-yellow-100 text-yellow-700',
  captured: 'bg-green-100 text-green-700',
  voided: 'bg-red-100 text-red-700',
  refund_pending: 'bg-orange-100 text-orange-700',
  refunded: 'bg-purple-100 text-purple-700',
  declined: 'bg-red-100 text-red-700',
  error: 'bg-red-200 text-red-800',
  resolved: 'bg-gray-200 text-gray-700',
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
  const colors = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700';
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
          <h1 className="text-2xl font-semibold text-gray-900">Transactions</h1>
          <p className="mt-1 text-sm text-gray-500">
            View and manage payment gateway transactions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              (filters.status ?? '') === tab.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                : 'text-gray-500 hover:text-gray-700'
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
                className="ml-1 rounded-full p-0.5 hover:bg-indigo-100"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </button>
        </div>
      </div>

      {/* Advanced filters panel */}
      {showFilters && (
        <div className="rounded-lg border border-gray-200 bg-surface p-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                From Date
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="block w-full rounded-md border border-gray-300 bg-surface px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                To Date
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="block w-full rounded-md border border-gray-300 bg-surface px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Min Amount ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amountMin}
                onChange={(e) => setAmountMin(e.target.value)}
                className="block w-full rounded-md border border-gray-300 bg-surface px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Max Amount ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amountMax}
                onChange={(e) => setAmountMax(e.target.value)}
                className="block w-full rounded-md border border-gray-300 bg-surface px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Card last 4 digits..."
                maxLength={4}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyAdvancedFilters()}
                className="block w-full rounded-md border border-gray-300 bg-surface pl-9 pr-3 py-1.5 text-sm"
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
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Clear all
            </button>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">Failed to load transactions. Please try again.</p>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-surface">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Method
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Card
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Provider Ref
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Order
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading && items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-500">
                  Loading transactions...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <CreditCard className="mx-auto h-8 w-8 text-gray-300" />
                  <p className="mt-2 text-sm text-gray-500">No transactions found</p>
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
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-sm text-gray-500">
              Page {cursorStack.length + 1}
              {items.length > 0 && ` \u00B7 ${items.length} results`}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={goPrevPage}
                disabled={cursorStack.length === 0}
                className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-surface px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <button
                onClick={goNextPage}
                disabled={!meta.hasMore}
                className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-surface px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
      className="cursor-pointer hover:bg-gray-50 transition-colors"
    >
      <td className="px-4 py-3 text-sm">
        <div className="text-gray-900">{formatDate(txn.createdAt)}</div>
        <div className="text-gray-500 text-xs">{formatTime(txn.createdAt)}</div>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={txn.status} />
      </td>
      <td className="px-4 py-3 text-sm font-medium text-gray-900">
        {formatCents(txn.amountCents)}
        {txn.refundedAmountCents != null && txn.refundedAmountCents > 0 && (
          <div className="text-xs text-red-500">
            -{formatCents(txn.refundedAmountCents)} refunded
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 capitalize">
        {txn.paymentMethodType}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">
        {txn.cardLast4 ? (
          <span>
            {txn.cardBrand && (
              <span className="text-gray-400 mr-1">{txn.cardBrand}</span>
            )}
            ****{txn.cardLast4}
          </span>
        ) : (
          <span className="text-gray-400">--</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 font-mono text-xs">
        {txn.providerRef || '--'}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 font-mono text-xs">
        {txn.orderId ? txn.orderId.slice(0, 8) + '...' : '--'}
      </td>
    </tr>
  );
}
