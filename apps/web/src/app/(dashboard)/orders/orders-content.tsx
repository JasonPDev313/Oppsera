'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ClipboardList,
  Download,
  User,
  FileText,
  RotateCcw,
  Ban,
  Copy,
  DollarSign,
  Unlock,
  Trash2,
  ShoppingCart,
  UtensilsCrossed,
  Building2,
  CreditCard,
  Ticket,
  CircleDot,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { ActionMenu } from '@/components/ui/action-menu';
import type { ActionMenuItem } from '@/components/ui/action-menu';
import { useAuthContext } from '@/components/auth-provider';
import { useProfileDrawer } from '@/components/customer-profile-drawer/ProfileDrawerContext';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { RefundDialog } from '@/components/orders/RefundDialog';
import { TipAdjustDialog } from '@/components/orders/TipAdjustDialog';
import { useSalesHistory } from '@/hooks/use-sales-history';
import { downloadCsvExport } from '@/hooks/use-reports';
import { getSourceDef, getSortedSources } from '@oppsera/shared';
import type { SalesHistoryItem } from '@oppsera/module-reporting';

// ── Constants ───────────────────────────────────────────────────

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'completed', label: 'Completed' },
  { value: 'voided', label: 'Voided' },
  { value: 'refunded', label: 'Refunded' },
];

const paymentMethodOptions = [
  { value: '', label: 'All Payment Types' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'gift_card', label: 'Gift Card' },
  { value: 'house_account', label: 'House Account' },
  { value: 'ach', label: 'ACH' },
  { value: 'split', label: 'Split Tender' },
];

const ICON_MAP: Record<string, LucideIcon> = {
  ShoppingCart,
  UtensilsCrossed,
  Building2,
  FileText,
  CreditCard,
  Ticket,
  CircleDot,
};

const DOT_COLOR: Record<string, string> = {
  blue: 'bg-blue-500',
  orange: 'bg-orange-500',
  purple: 'bg-purple-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  pink: 'bg-pink-500',
  gray: 'bg-gray-500',
};

const CHIP_ACTIVE: Record<string, string> = {
  blue: 'bg-blue-500/15 text-blue-500 border-blue-500/40',
  orange: 'bg-orange-500/15 text-orange-500 border-orange-500/40',
  purple: 'bg-purple-500/15 text-purple-500 border-purple-500/40',
  emerald: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/40',
  amber: 'bg-amber-500/15 text-amber-500 border-amber-500/40',
  pink: 'bg-pink-500/15 text-pink-500 border-pink-500/40',
  gray: 'bg-gray-500/15 text-muted-foreground border-border',
};

const STATUS_STYLES: Record<string, { label: string; classes: string }> = {
  completed: { label: 'Completed', classes: 'bg-green-500/10 text-green-500' },
  paid: { label: 'Paid', classes: 'bg-green-500/10 text-green-500' },
  voided: { label: 'Voided', classes: 'bg-red-500/10 text-red-500' },
  refunded: { label: 'Refunded', classes: 'bg-red-500/10 text-red-500' },
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  gift_card: 'Gift Card',
  house_account: 'House Acct',
  ach: 'ACH',
  split: 'Split',
  other: 'Other',
};

// ── Helpers ────────────────────────────────────────────────────

function formatDollars(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function resolveIcon(effectiveSource: string): LucideIcon {
  if (effectiveSource === 'pos_order') return ShoppingCart;
  const def = getSourceDef(effectiveSource);
  return ICON_MAP[def.icon] ?? CircleDot;
}

function resolveColor(effectiveSource: string): string {
  if (effectiveSource === 'pos_order') return 'blue';
  return getSourceDef(effectiveSource).color;
}

function resolveLabel(effectiveSource: string): string {
  if (effectiveSource === 'pos_order') return 'POS Sale';
  return getSourceDef(effectiveSource).shortLabel;
}

function isPosSource(effectiveSource: string): boolean {
  return effectiveSource.startsWith('pos_');
}

type SalesRow = SalesHistoryItem & Record<string, unknown>;

// ── Source Filter Chips ──────────────────────────────────────

function SourceChips({
  selected,
  onToggle,
  onClear,
}: {
  selected: Set<string>;
  onToggle: (key: string) => void;
  onClear: () => void;
}) {
  const sources = useMemo(() => getSortedSources(), []);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {sources.map((src) => {
        const isOn = selected.has(src.key);
        const Icon = ICON_MAP[src.icon] ?? CircleDot;
        return (
          <button
            key={src.key}
            type="button"
            onClick={() => onToggle(src.key)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              isOn
                ? CHIP_ACTIVE[src.color] || CHIP_ACTIVE.gray
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {src.label}
          </button>
        );
      })}
      {selected.size > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Clear
        </button>
      )}
    </div>
  );
}

// ── Summary Bar ──────────────────────────────────────────────

function SummaryBar({
  summary,
}: {
  summary: {
    totalAmount: number;
    totalCount: number;
    bySource: Array<{ source: string; totalAmount: number; count: number }>;
  } | null;
}) {
  if (!summary) return null;

  const avg = summary.totalCount > 0 ? summary.totalAmount / summary.totalCount : 0;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="rounded-lg border border-border bg-surface px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">Total Revenue</p>
        <p className="mt-1 text-lg font-semibold text-foreground tabular-nums">
          {formatDollars(summary.totalAmount)}
        </p>
      </div>
      <div className="rounded-lg border border-border bg-surface px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">Transactions</p>
        <p className="mt-1 text-lg font-semibold text-foreground tabular-nums">
          {summary.totalCount.toLocaleString()}
        </p>
      </div>
      {summary.totalCount > 0 && (
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">Avg Transaction</p>
          <p className="mt-1 text-lg font-semibold text-foreground tabular-nums">
            {formatDollars(avg)}
          </p>
        </div>
      )}

      {/* Per-source breakdown pills */}
      {summary.bySource.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {summary.bySource.map((s) => {
            const color = resolveColor(s.source);
            const Icon = resolveIcon(s.source);
            return (
              <div
                key={s.source}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs"
              >
                <span
                  className={`h-2 w-2 rounded-full ${DOT_COLOR[color] ?? 'bg-gray-500'}`}
                />
                <Icon
                  className="h-3 w-3 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="text-muted-foreground">
                  {resolveLabel(s.source)}
                </span>
                <span className="font-medium text-foreground tabular-nums">
                  {formatDollars(s.totalAmount)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Page Component ─────────────────────────────────────────────

export default function OrdersPage() {
  const router = useRouter();
  const { locations } = useAuthContext();
  const { toast } = useToast();
  const profileDrawer = useProfileDrawer();

  // ── Filter state ────────────────────────────────────────────
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const actionLocationId = selectedLocationId || locations[0]?.id || '';

  const toggleSource = useCallback((key: string) => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clearSources = useCallback(() => setSelectedSources(new Set()), []);

  // ── Data ────────────────────────────────────────────────────
  const { items, summary, isLoading, isLoadingMore, hasMore, loadMore, refetch } =
    useSalesHistory({
      sources: selectedSources.size > 0 ? Array.from(selectedSources) : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      search: search || undefined,
      status: statusFilter || undefined,
      paymentMethod: paymentFilter || undefined,
      locationId: selectedLocationId || undefined,
    });

  // ── Dialog state ────────────────────────────────────────────
  const [voidOrderId, setVoidOrderId] = useState<string | null>(null);
  const [voidLabel, setVoidLabel] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);

  const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null);
  const [deleteLabel, setDeleteLabel] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const [reopenOrderId, setReopenOrderId] = useState<string | null>(null);
  const [reopenLabel, setReopenLabel] = useState('');
  const [isReopening, setIsReopening] = useState(false);

  const [refundOrder, setRefundOrder] = useState<{
    id: string;
    orderNumber: string;
  } | null>(null);
  const [tipOrder, setTipOrder] = useState<{
    id: string;
    orderNumber: string;
  } | null>(null);

  // ── Filter helpers ──────────────────────────────────────────
  const hasFilters =
    !!search ||
    !!statusFilter ||
    !!paymentFilter ||
    !!dateFrom ||
    !!dateTo ||
    !!selectedLocationId ||
    selectedSources.size > 0;

  const clearFilters = useCallback(() => {
    setSearch('');
    setStatusFilter('');
    setPaymentFilter('');
    setDateFrom('');
    setDateTo('');
    setSelectedLocationId('');
    setSelectedSources(new Set());
  }, []);

  // ── Void ────────────────────────────────────────────────────
  const handleVoidConfirm = useCallback(async () => {
    if (!voidOrderId) return;
    setIsVoiding(true);
    try {
      await apiFetch(`/api/v1/orders/${voidOrderId}/void`, {
        method: 'POST',
        headers: { 'X-Location-Id': actionLocationId },
      });
      toast.success('Order voided');
      setVoidOrderId(null);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to void');
    } finally {
      setIsVoiding(false);
    }
  }, [voidOrderId, actionLocationId, toast, refetch]);

  // ── Delete ──────────────────────────────────────────────────
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteOrderId) return;
    setIsDeleting(true);
    try {
      await apiFetch(`/api/v1/orders/${deleteOrderId}`, {
        method: 'DELETE',
        headers: { 'X-Location-Id': actionLocationId },
      });
      toast.success('Order deleted');
      setDeleteOrderId(null);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setIsDeleting(false);
    }
  }, [deleteOrderId, actionLocationId, toast, refetch]);

  // ── Re-open ─────────────────────────────────────────────────
  const handleReopenConfirm = useCallback(async () => {
    if (!reopenOrderId) return;
    setIsReopening(true);
    try {
      await apiFetch(`/api/v1/orders/${reopenOrderId}/reopen`, {
        method: 'POST',
        headers: { 'X-Location-Id': actionLocationId },
      });
      toast.success('Order reopened');
      setReopenOrderId(null);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reopen');
    } finally {
      setIsReopening(false);
    }
  }, [reopenOrderId, actionLocationId, toast, refetch]);

  // ── Clone ───────────────────────────────────────────────────
  const handleClone = useCallback(
    async (orderId: string) => {
      try {
        const res = await apiFetch<{ data: { orderId: string } }>(
          `/api/v1/orders/${orderId}/clone`,
          {
            method: 'POST',
            headers: { 'X-Location-Id': actionLocationId },
            body: JSON.stringify({ clientRequestId: crypto.randomUUID() }),
          },
        );
        toast.success('Order cloned');
        router.push(`/orders/${res.data.orderId}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to clone');
      }
    },
    [actionLocationId, toast, router],
  );

  // ── Export ──────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    try {
      const params: Record<string, string | undefined> = {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        search: search || undefined,
        status: statusFilter || undefined,
        paymentMethod: paymentFilter || undefined,
        locationId: selectedLocationId || undefined,
      };
      if (selectedSources.size > 0) {
        params.sources = Array.from(selectedSources).join(',');
      }
      await downloadCsvExport('/api/v1/reports/sales-history/export', params);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    }
  }, [dateFrom, dateTo, search, statusFilter, paymentFilter, selectedLocationId, selectedSources, toast]);

  // ── Row actions ──────────────────────────────────────────────
  const buildActions = useCallback(
    (row: SalesHistoryItem): ActionMenuItem[] => {
      const pos = isPosSource(row.effectiveSource);
      const ref = row.referenceNumber || row.sourceLabel;

      const base: ActionMenuItem[] = [
        {
          key: 'view-customer',
          label: 'View Customer',
          icon: User,
          onClick: () => {
            if (row.customerId)
              profileDrawer.open(row.customerId, { source: 'orders' });
          },
          disabled: !row.customerId,
          disabledReason: 'No customer attached',
        },
      ];

      if (!pos) return base;

      return [
        ...base,
        {
          key: 'receipt',
          label: 'View Receipt',
          icon: FileText,
          onClick: () => router.push(`/orders/${row.sourceId}`),
        },
        {
          key: 'refund',
          label: 'Refund',
          icon: RotateCcw,
          onClick: () =>
            setRefundOrder({ id: row.sourceId, orderNumber: ref }),
          disabled: row.status !== 'completed',
          disabledReason: 'Order must be completed',
        },
        {
          key: 'void',
          label: 'Void',
          icon: Ban,
          onClick: () => {
            setVoidOrderId(row.sourceId);
            setVoidLabel(ref);
          },
          disabled: row.status !== 'completed',
          disabledReason: 'Order must be completed',
        },
        {
          key: 'add-tip',
          label: 'Add Tip',
          icon: DollarSign,
          onClick: () =>
            setTipOrder({ id: row.sourceId, orderNumber: ref }),
          disabled: row.status !== 'completed',
          disabledReason: 'Order must be completed',
        },
        {
          key: 'reopen',
          label: 'Re-Open',
          icon: Unlock,
          onClick: () => {
            setReopenOrderId(row.sourceId);
            setReopenLabel(ref);
          },
          disabled: row.status !== 'voided',
          disabledReason: 'Only voided orders can be reopened',
        },
        {
          key: 'clone',
          label: 'Clone',
          icon: Copy,
          onClick: () => handleClone(row.sourceId),
        },
        {
          key: 'delete',
          label: 'Delete',
          icon: Trash2,
          destructive: true,
          dividerBefore: true,
          onClick: () => {
            setDeleteOrderId(row.sourceId);
            setDeleteLabel(ref);
          },
          disabled: row.status !== 'voided',
          disabledReason: 'Only voided orders can be deleted',
        },
      ];
    },
    [profileDrawer, router, handleClone],
  );

  // ── Columns ──────────────────────────────────────────────────
  const columns = useMemo(
    () => [
      {
        key: 'occurredAt',
        header: 'Date/Time',
        width: '130px',
        render: (row: SalesRow) => (
          <span className="text-xs text-muted-foreground">
            {formatDateTime(row.occurredAt)}
          </span>
        ),
      },
      {
        key: 'effectiveSource',
        header: 'Revenue Source',
        width: '160px',
        render: (row: SalesRow) => {
          const color = resolveColor(row.effectiveSource);
          const Icon = resolveIcon(row.effectiveSource);
          return (
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${DOT_COLOR[color] ?? 'bg-gray-500'}`}
              />
              <Icon
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="truncate text-sm text-foreground">
                {resolveLabel(row.effectiveSource)}
              </span>
            </div>
          );
        },
      },
      {
        key: 'referenceNumber',
        header: 'Reference #',
        width: '120px',
        render: (row: SalesRow) => (
          <span className="text-sm font-medium text-foreground">
            {row.referenceNumber || '\u2014'}
          </span>
        ),
      },
      {
        key: 'customerName',
        header: 'Customer',
        render: (row: SalesRow) => (
          <span className="text-sm text-foreground">
            {row.customerName || '\u2014'}
          </span>
        ),
      },
      {
        key: 'employeeName',
        header: 'Employee',
        width: '120px',
        render: (row: SalesRow) => (
          <span className="text-sm text-muted-foreground">
            {row.employeeName || '\u2014'}
          </span>
        ),
      },
      {
        key: 'subtotalDollars',
        header: 'Subtotal',
        width: '90px',
        render: (row: SalesRow) => (
          <span className="text-sm tabular-nums text-muted-foreground">
            {row.subtotalDollars > 0 ? formatDollars(row.subtotalDollars) : '\u2014'}
          </span>
        ),
      },
      {
        key: 'discountDollars',
        header: 'Discount',
        width: '90px',
        render: (row: SalesRow) =>
          row.discountDollars > 0 ? (
            <span className="text-sm tabular-nums text-red-500">
              -{formatDollars(row.discountDollars)}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">{'\u2014'}</span>
          ),
      },
      {
        key: 'taxDollars',
        header: 'Tax',
        width: '80px',
        render: (row: SalesRow) => (
          <span className="text-sm tabular-nums text-muted-foreground">
            {row.taxDollars > 0 ? formatDollars(row.taxDollars) : '\u2014'}
          </span>
        ),
      },
      {
        key: 'serviceChargeDollars',
        header: 'Svc Charge',
        width: '90px',
        render: (row: SalesRow) =>
          row.serviceChargeDollars > 0 ? (
            <span className="text-sm tabular-nums text-muted-foreground">
              {formatDollars(row.serviceChargeDollars)}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">{'\u2014'}</span>
          ),
      },
      {
        key: 'amountDollars',
        header: 'Total',
        width: '100px',
        render: (row: SalesRow) => (
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatDollars(row.amountDollars)}
          </span>
        ),
      },
      {
        key: 'tipDollars',
        header: 'Tip',
        width: '70px',
        render: (row: SalesRow) =>
          row.tipDollars > 0 ? (
            <span className="text-sm tabular-nums text-blue-500">
              {formatDollars(row.tipDollars)}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">{'\u2014'}</span>
          ),
      },
      {
        key: 'paymentMethod',
        header: 'Payment',
        width: '90px',
        render: (row: SalesRow) =>
          row.paymentMethod ? (
            <span className="text-xs text-muted-foreground">
              {PAYMENT_LABELS[row.paymentMethod] ?? row.paymentMethod}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">{'\u2014'}</span>
          ),
      },
      {
        key: 'status',
        header: 'Status',
        width: '100px',
        render: (row: SalesRow) => {
          const s = STATUS_STYLES[row.status] ?? {
            label: row.status,
            classes: 'bg-muted text-muted-foreground',
          };
          return (
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${s.classes}`}
            >
              {s.label}
            </span>
          );
        },
      },
      {
        key: 'actions',
        header: '',
        width: '48px',
        render: (row: SalesRow) => (
          <div onClick={(e) => e.stopPropagation()}>
            <ActionMenu items={buildActions(row)} />
          </div>
        ),
      },
    ],
    [buildActions],
  );

  // ── Row click ───────────────────────────────────────────────
  const handleRowClick = useCallback(
    (row: SalesRow) => {
      if (isPosSource(row.effectiveSource)) {
        router.push(`/orders/${row.sourceId}`);
      }
    },
    [router],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Sales History</h1>
        <button
          type="button"
          onClick={handleExport}
          disabled={items.length === 0}
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Export
        </button>
      </div>

      {/* Source filter chips */}
      <SourceChips
        selected={selectedSources}
        onToggle={toggleSource}
        onClear={clearSources}
      />

      {/* Summary bar */}
      <SummaryBar summary={summary} />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {locations.length > 1 && (
          <Select
            options={[
              { value: '', label: 'All Locations' },
              ...locations.map((l) => ({ value: l.id, label: l.name })),
            ]}
            value={selectedLocationId}
            onChange={(v) => setSelectedLocationId(v as string)}
            placeholder="All Locations"
            className="w-full md:w-44"
          />
        )}
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search ref #, customer, description..."
          className="w-full md:w-64"
        />
        <Select
          options={statusOptions}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as string)}
          placeholder="All Statuses"
          className="w-full md:w-40"
        />
        <Select
          options={paymentMethodOptions}
          value={paymentFilter}
          onChange={(v) => setPaymentFilter(v as string)}
          placeholder="All Payment Types"
          className="w-full md:w-44"
        />
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            placeholder="From"
          />
          <span className="text-muted-foreground">&ndash;</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            placeholder="To"
          />
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      {!isLoading && items.length === 0 && !hasFilters ? (
        <EmptyState
          icon={ClipboardList}
          title="No sales history"
          description="Revenue from POS orders, F&B, room charges, invoices, memberships, and more will appear here"
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={items as SalesRow[]}
            isLoading={isLoading}
            emptyMessage="No transactions match your filters"
            onRowClick={handleRowClick}
          />
          {(hasMore || isLoadingMore) && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={isLoadingMore}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isLoadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Void Dialog */}
      <ConfirmDialog
        open={voidOrderId !== null}
        onClose={() => setVoidOrderId(null)}
        onConfirm={handleVoidConfirm}
        title="Void Order"
        description={`Are you sure you want to void ${voidLabel}? This action cannot be undone.`}
        confirmLabel="Void Order"
        destructive
        isLoading={isVoiding}
      />

      {/* Delete Dialog */}
      <ConfirmDialog
        open={deleteOrderId !== null}
        onClose={() => setDeleteOrderId(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Order"
        description={`Are you sure you want to delete ${deleteLabel}? This will remove it from your sales history.`}
        confirmLabel="Delete Order"
        destructive
        isLoading={isDeleting}
      />

      {/* Re-open Dialog */}
      <ConfirmDialog
        open={reopenOrderId !== null}
        onClose={() => setReopenOrderId(null)}
        onConfirm={handleReopenConfirm}
        title="Re-Open Order"
        description={`Re-open voided order ${reopenLabel}? It will return to Open status.`}
        confirmLabel="Re-Open"
        isLoading={isReopening}
      />

      {/* Refund Dialog */}
      <RefundDialog
        open={refundOrder !== null}
        onClose={() => setRefundOrder(null)}
        orderId={refundOrder?.id ?? ''}
        orderNumber={refundOrder?.orderNumber ?? ''}
        locationId={actionLocationId}
        onComplete={() => refetch()}
      />

      {/* Tip Adjust Dialog */}
      <TipAdjustDialog
        open={tipOrder !== null}
        onClose={() => setTipOrder(null)}
        orderId={tipOrder?.id ?? ''}
        orderNumber={tipOrder?.orderNumber ?? ''}
        locationId={actionLocationId}
        onComplete={() => refetch()}
      />
    </div>
  );
}
