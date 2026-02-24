'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  XCircle,
  Ban,
  RotateCcw,
  CheckCircle,
  Filter,
  X,
  Loader2,
} from 'lucide-react';
import {
  useFailedPayments,
  useFailedPaymentCounts,
  useFailedPaymentActions,
  type FailedPaymentFilters,
  type FailedPaymentItem,
} from '@/hooks/use-failed-payments';

// ── Status config ────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  declined: 'bg-red-100 text-red-700',
  error: 'bg-orange-100 text-orange-700',
};

const CATEGORY_COLORS: Record<string, string> = {
  hard: 'bg-red-100 text-red-700',
  soft: 'bg-yellow-100 text-yellow-700',
  fraud: 'bg-red-200 text-red-800',
  data_fix: 'bg-blue-100 text-blue-700',
  config_error: 'bg-purple-100 text-purple-700',
  network_error: 'bg-orange-100 text-orange-700',
};

const CATEGORY_LABELS: Record<string, string> = {
  hard: 'Hard Decline',
  soft: 'Soft Decline',
  fraud: 'Fraud',
  data_fix: 'Data Fix',
  config_error: 'Config Error',
  network_error: 'Network',
};

const CATEGORY_FILTER_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'hard', label: 'Hard Decline' },
  { value: 'soft', label: 'Soft Decline' },
  { value: 'fraud', label: 'Fraud' },
  { value: 'data_fix', label: 'Data Fix Needed' },
  { value: 'config_error', label: 'Config Error' },
  { value: 'network_error', label: 'Network Error' },
];

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ── Main content ─────────────────────────────────────────────

export default function FailedPaymentsContent() {
  const [filters, setFilters] = useState<FailedPaymentFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<FailedPaymentItem | null>(null);
  const [actionMode, setActionMode] = useState<'retry' | 'resolve' | 'dismiss' | null>(null);

  const { items, meta, isLoading, error, refetch } = useFailedPayments(filters);
  const { counts } = useFailedPaymentCounts();
  const { retryPayment, resolvePayment } = useFailedPaymentActions();

  const applyFilters = useCallback(() => {
    const next: FailedPaymentFilters = { ...filters, cursor: undefined };
    if (dateFrom) next.dateFrom = dateFrom;
    else delete next.dateFrom;
    if (dateTo) next.dateTo = dateTo;
    else delete next.dateTo;
    if (categoryFilter) next.declineCategory = categoryFilter;
    else delete next.declineCategory;
    setFilters(next);
    setCursorStack([]);
  }, [filters, dateFrom, dateTo, categoryFilter]);

  const clearFilters = useCallback(() => {
    setFilters({});
    setDateFrom('');
    setDateTo('');
    setCategoryFilter('');
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

  const openAction = (item: FailedPaymentItem, mode: 'retry' | 'resolve' | 'dismiss') => {
    setSelectedItem(item);
    setActionMode(mode);
  };

  const closeAction = () => {
    setSelectedItem(null);
    setActionMode(null);
  };

  const hasActiveFilters = !!(filters.dateFrom || filters.dateTo || filters.declineCategory);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Failed Payments</h1>
          <p className="mt-1 text-sm text-gray-500">
            Review and resolve declined or errored payment attempts
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard
          label="Total Failed"
          value={counts.total}
          icon={AlertTriangle}
          color="text-red-500"
        />
        <SummaryCard
          label="Declined"
          value={counts.declined}
          icon={XCircle}
          color="text-red-500"
        />
        <SummaryCard
          label="Errors"
          value={counts.error}
          icon={Ban}
          color="text-orange-500"
        />
      </div>

      {/* Filter bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Showing failed payments from the last 30 days
        </p>
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

      {showFilters && (
        <div className="rounded-lg border border-gray-200 bg-surface p-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">From Date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="block w-full rounded-md border border-gray-300 bg-surface px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">To Date</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="block w-full rounded-md border border-gray-300 bg-surface px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Decline Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="block w-full rounded-md border border-gray-300 bg-surface px-3 py-1.5 text-sm"
              >
                {CATEGORY_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={applyFilters}
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
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">Failed to load data. Please try again.</p>
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
                Card
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reason
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Attempts
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading && items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-500">
                  Loading failed payments...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <CheckCircle className="mx-auto h-8 w-8 text-green-300" />
                  <p className="mt-2 text-sm text-gray-500">No failed payments</p>
                  <p className="text-xs text-gray-400">All payment attempts are healthy</p>
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <FailedPaymentRow
                  key={item.id}
                  item={item}
                  onRetry={() => openAction(item, 'retry')}
                  onResolve={() => openAction(item, 'resolve')}
                  onDismiss={() => openAction(item, 'dismiss')}
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

      {/* Action dialogs */}
      {selectedItem && actionMode === 'retry' &&
        createPortal(
          <RetryDialog
            item={selectedItem}
            onConfirm={(input) => {
              retryPayment.mutate(
                { id: selectedItem.id, ...input },
                { onSuccess: closeAction },
              );
            }}
            onClose={closeAction}
            isPending={retryPayment.isPending}
          />,
          document.body,
        )}

      {selectedItem && (actionMode === 'resolve' || actionMode === 'dismiss') &&
        createPortal(
          <ResolveDialog
            item={selectedItem}
            mode={actionMode}
            onConfirm={(input) => {
              resolvePayment.mutate(
                { id: selectedItem.id, ...input },
                { onSuccess: closeAction },
              );
            }}
            onClose={closeAction}
            isPending={resolvePayment.isPending}
          />,
          document.body,
        )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: typeof AlertTriangle;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-surface p-4 flex items-center gap-3">
      <Icon className={`h-5 w-5 ${color}`} />
      <div>
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="text-xl font-semibold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function FailedPaymentRow({
  item,
  onRetry,
  onResolve,
  onDismiss,
}: {
  item: FailedPaymentItem;
  onRetry: () => void;
  onResolve: () => void;
  onDismiss: () => void;
}) {
  const statusColors = STATUS_COLORS[item.status] ?? 'bg-gray-100 text-gray-700';

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-sm">
        <div className="text-gray-900">{formatDate(item.createdAt)}</div>
        <div className="text-gray-500 text-xs">{formatTime(item.createdAt)}</div>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors}`}>
          {item.status === 'declined' ? 'Declined' : 'Error'}
        </span>
      </td>
      <td className="px-4 py-3 text-sm font-medium text-gray-900">
        {formatCents(item.amountCents)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">
        {item.cardLast4 ? (
          <span>
            {item.cardBrand && <span className="text-gray-400 mr-1">{item.cardBrand}</span>}
            ****{item.cardLast4}
          </span>
        ) : (
          <span className="text-gray-400 capitalize">{item.paymentMethodType}</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 max-w-xs">
        <div className="flex items-center gap-1.5">
          {item.declineCategory && (
            <span
              className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                CATEGORY_COLORS[item.declineCategory] ?? 'bg-gray-100 text-gray-600'
              }`}
            >
              {CATEGORY_LABELS[item.declineCategory] ?? item.declineCategory}
            </span>
          )}
          <span className="truncate">
            {item.userMessage || item.latestResponseText || item.errorMessage || '--'}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {item.attemptCount}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
            title="Retry payment"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </button>
          <button
            onClick={onResolve}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50"
            title="Mark as resolved"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Resolve
          </button>
          <button
            onClick={onDismiss}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Dialogs ──────────────────────────────────────────────────

function RetryDialog({
  item,
  onConfirm,
  onClose,
  isPending,
}: {
  item: FailedPaymentItem;
  onConfirm: (input: { token?: string; paymentMethodId?: string }) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [retryMode, setRetryMode] = useState<'same' | 'stored'>(item.retryable ? 'same' : 'stored');
  const [paymentMethodId, setPaymentMethodId] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative rounded-lg bg-surface shadow-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-gray-900">Retry Payment</h3>
        <p className="mt-2 text-sm text-gray-600">
          Retry the failed payment for{' '}
          <span className="font-semibold">{formatCents(item.amountCents)}</span>
        </p>

        {(item.userMessage || item.errorMessage) && (
          <div className="mt-3 rounded-md bg-red-50 p-3">
            <p className="text-xs text-red-700">
              <span className="font-medium">Previous error:</span>{' '}
              {item.userMessage || item.errorMessage}
            </p>
            {item.suggestedAction && item.suggestedAction !== 'none' && (
              <p className="mt-1 text-xs text-red-600">
                <span className="font-medium">Suggested:</span>{' '}
                {item.suggestedAction === 'try_different_card'
                  ? 'Try a different card'
                  : item.suggestedAction === 'retry_later'
                    ? 'Retry later'
                    : item.suggestedAction === 'fix_and_retry'
                      ? 'Fix data and retry'
                      : item.suggestedAction === 'contact_issuer'
                        ? 'Contact card issuer'
                        : item.suggestedAction === 'contact_support'
                          ? 'Contact support'
                          : item.suggestedAction === 'try_again'
                            ? 'Try again'
                            : item.suggestedAction}
              </p>
            )}
          </div>
        )}

        {!item.retryable && (
          <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs text-amber-700">
              This payment is not retryable with the same card. Use a different payment method or resolve manually.
            </p>
          </div>
        )}

        <div className="mt-4 space-y-3">
          <label className={`flex items-center gap-2 ${!item.retryable ? 'opacity-50' : ''}`}>
            <input
              type="radio"
              checked={retryMode === 'same'}
              onChange={() => setRetryMode('same')}
              disabled={!item.retryable}
              className="text-indigo-600"
            />
            <span className="text-sm text-gray-700">
              Retry with same card
              {item.cardLast4 && (
                <span className="text-gray-400 ml-1">(****{item.cardLast4})</span>
              )}
              {!item.retryable && (
                <span className="text-red-500 ml-1 text-xs">(not retryable)</span>
              )}
            </span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={retryMode === 'stored'}
              onChange={() => setRetryMode('stored')}
              className="text-indigo-600"
            />
            <span className="text-sm text-gray-700">Use stored payment method</span>
          </label>
          {retryMode === 'stored' && (
            <div className="ml-6">
              <input
                type="text"
                placeholder="Payment method ID"
                value={paymentMethodId}
                onChange={(e) => setPaymentMethodId(e.target.value)}
                className="block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
              />
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isPending}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (retryMode === 'stored' && paymentMethodId) {
                onConfirm({ paymentMethodId });
              } else {
                onConfirm({});
              }
            }}
            disabled={isPending || (retryMode === 'stored' && !paymentMethodId)}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Retry Payment
          </button>
        </div>
      </div>
    </div>
  );
}

function ResolveDialog({
  item,
  mode,
  onConfirm,
  onClose,
  isPending,
}: {
  item: FailedPaymentItem;
  mode: 'resolve' | 'dismiss';
  onConfirm: (input: {
    resolution: 'resolved' | 'dismissed';
    reason: string;
    paidByOtherMeans?: boolean;
    otherMeansType?: string;
  }) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [reason, setReason] = useState('');
  const [paidByOther, setPaidByOther] = useState(false);
  const [otherMeansType, setOtherMeansType] = useState('cash');
  const isResolve = mode === 'resolve';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative rounded-lg bg-surface shadow-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-gray-900">
          {isResolve ? 'Resolve Payment' : 'Dismiss Payment'}
        </h3>
        <p className="mt-2 text-sm text-gray-600">
          {isResolve
            ? `Mark this ${formatCents(item.amountCents)} payment as resolved.`
            : `Dismiss this ${formatCents(item.amountCents)} failed payment.`}
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={
                isResolve
                  ? 'e.g., Customer paid with cash instead'
                  : 'e.g., Customer cancelled order, no payment needed'
              }
              className="block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
            />
          </div>

          {isResolve && (
            <>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={paidByOther}
                  onChange={(e) => setPaidByOther(e.target.checked)}
                  className="rounded text-indigo-600"
                />
                <span className="text-sm text-gray-700">
                  Customer paid by other means
                </span>
              </label>

              {paidByOther && (
                <div className="ml-6">
                  <select
                    value={otherMeansType}
                    onChange={(e) => setOtherMeansType(e.target.value)}
                    className="block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
                  >
                    <option value="cash">Cash</option>
                    <option value="check">Check</option>
                    <option value="wire">Wire Transfer</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isPending}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm({
                resolution: isResolve ? 'resolved' : 'dismissed',
                reason,
                paidByOtherMeans: paidByOther,
                otherMeansType: paidByOther ? otherMeansType : undefined,
              });
            }}
            disabled={isPending || !reason.trim()}
            className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
              isResolve
                ? 'bg-green-600 hover:bg-green-500'
                : 'bg-gray-600 hover:bg-gray-500'
            }`}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isResolve ? 'Mark Resolved' : 'Dismiss'}
          </button>
        </div>
      </div>
    </div>
  );
}
