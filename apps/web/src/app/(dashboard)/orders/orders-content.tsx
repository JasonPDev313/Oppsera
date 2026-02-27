'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
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
  Building2,
  CreditCard,
  Gift,
} from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ActionMenu } from '@/components/ui/action-menu';
import type { ActionMenuItem } from '@/components/ui/action-menu';
import { useAuthContext } from '@/components/auth-provider';
import { useProfileDrawer } from '@/components/customer-profile-drawer/ProfileDrawerContext';
import { useOrders } from '@/hooks/use-orders';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { RefundDialog } from '@/components/orders/RefundDialog';
import { TipAdjustDialog } from '@/components/orders/TipAdjustDialog';
import type { Order } from '@/types/pos';

// ── Constants ───────────────────────────────────────────────────

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'open', label: 'Open' },
  { value: 'placed', label: 'Placed' },
  { value: 'paid', label: 'Paid' },
  { value: 'voided', label: 'Voided' },
];

const paymentMethodOptions = [
  { value: '', label: 'All Payment Types' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'gift_card', label: 'Gift Card' },
  { value: 'store_credit', label: 'Store Credit' },
  { value: 'house_account', label: 'House Account' },
];

const STATUS_BADGES: Record<string, { label: string; variant: string }> = {
  open: { label: 'Open', variant: 'info' },
  placed: { label: 'Placed', variant: 'warning' },
  paid: { label: 'Paid', variant: 'success' },
  voided: { label: 'Voided', variant: 'error' },
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  gift_card: 'Gift Card',
  store_credit: 'Store Credit',
  house_account: 'House Acct',
  other: 'Other',
};

// ── Helpers ────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

type OrderRow = Order & Record<string, unknown>;

// ── All Revenue types & helpers ──────────────────────────────

interface RevenueActivityItem {
  id: string;
  source: string;
  sourceId: string;
  sourceLabel: string;
  customerName: string | null;
  amountDollars: number;
  status: string;
  occurredAt: string;
  metadata: Record<string, unknown> | null;
}

function getSourceIcon(source: string) {
  switch (source) {
    case 'pos_order': return ShoppingCart;
    case 'pms_folio': return Building2;
    case 'ar_invoice': return FileText;
    case 'membership': return CreditCard;
    case 'voucher': return Gift;
    default: return DollarSign;
  }
}

function getSourceIconColor(source: string): string {
  switch (source) {
    case 'pos_order': return 'bg-blue-500/10 text-blue-500';
    case 'pms_folio': return 'bg-purple-500/10 text-purple-500';
    case 'ar_invoice': return 'bg-emerald-500/10 text-emerald-500';
    case 'membership': return 'bg-amber-500/10 text-amber-500';
    case 'voucher': return 'bg-pink-500/10 text-pink-500';
    default: return 'bg-muted text-muted-foreground';
  }
}

function formatDollars(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const SOURCE_LABELS: Record<string, string> = {
  pos_order: 'POS Order',
  pms_folio: 'PMS Folio',
  ar_invoice: 'AR Invoice',
  membership: 'Membership',
  voucher: 'Voucher',
};

const sourceFilterOptions = [
  { value: '', label: 'All Sources' },
  { value: 'pos_order', label: 'POS Orders' },
  { value: 'pms_folio', label: 'PMS Folios' },
  { value: 'ar_invoice', label: 'AR Invoices' },
  { value: 'membership', label: 'Membership' },
  { value: 'voucher', label: 'Vouchers' },
];

// ── Summary Bar ────────────────────────────────────────────────

function SummaryBar({ orders }: { orders: Order[] }) {
  const stats = useMemo(() => {
    let revenue = 0;
    let discounts = 0;
    let tax = 0;
    let tips = 0;
    let paidCount = 0;

    for (const o of orders) {
      if (o.status === 'voided') continue;
      revenue += o.total;
      discounts += o.discountTotal;
      tax += o.taxTotal;
      tips += o.tipTotal ?? 0;
      if (o.status === 'paid') paidCount++;
    }

    return { count: orders.length, paidCount, revenue, discounts, tax, tips };
  }, [orders]);

  const items = [
    { label: 'Orders', value: String(stats.count) },
    { label: 'Revenue', value: formatMoney(stats.revenue) },
    { label: 'Discounts', value: formatMoney(stats.discounts) },
    { label: 'Tax', value: formatMoney(stats.tax) },
    { label: 'Tips', value: formatMoney(stats.tips) },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-border bg-surface px-4 py-3"
        >
          <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
          <p className="mt-1 text-lg font-semibold text-foreground">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── CSV Export ──────────────────────────────────────────────────

function exportCSV(orders: Order[]) {
  const headers = [
    'Order #',
    'Date',
    'Status',
    'Customer',
    'Subtotal',
    'Discount',
    'Tax',
    'Service Charge',
    'Total',
    'Tip',
    'Payment Type',
    'Paid At',
  ];
  const rows = orders.map((o) => [
    o.orderNumber,
    o.businessDate,
    o.status,
    o.customerName ?? '',
    (o.subtotal / 100).toFixed(2),
    (o.discountTotal / 100).toFixed(2),
    (o.taxTotal / 100).toFixed(2),
    (o.serviceChargeTotal / 100).toFixed(2),
    (o.total / 100).toFixed(2),
    ((o.tipTotal ?? 0) / 100).toFixed(2),
    o.paymentType ?? '',
    o.paidAt ?? '',
  ]);

  const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sales-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Page Component ─────────────────────────────────────────────

export default function OrdersPage() {
  const router = useRouter();
  const { locations } = useAuthContext();
  const { toast } = useToast();
  const profileDrawer = useProfileDrawer();

  // Tab toggle: POS Orders vs All Revenue
  const [activeTab, setActiveTab] = useState<'pos' | 'all'>('pos');

  // Location selector — default to "All" (empty = no location filter)
  const [selectedLocationId, setSelectedLocationId] = useState('');
  // For actions that require a locationId header, fall back to first location
  const actionLocationId = selectedLocationId || locations[0]?.id || '';

  // All Revenue tab source filter
  const [sourceFilter, setSourceFilter] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Void dialog
  const [voidOrderId, setVoidOrderId] = useState<string | null>(null);
  const [voidOrderNumber, setVoidOrderNumber] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);

  // Delete dialog
  const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null);
  const [deleteOrderNumber, setDeleteOrderNumber] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Re-open dialog
  const [reopenOrderId, setReopenOrderId] = useState<string | null>(null);
  const [reopenOrderNumber, setReopenOrderNumber] = useState('');
  const [isReopening, setIsReopening] = useState(false);

  // Refund dialog
  const [refundOrder, setRefundOrder] = useState<{ id: string; orderNumber: string } | null>(null);

  // Tip adjust dialog
  const [tipOrder, setTipOrder] = useState<{ id: string; orderNumber: string } | null>(null);

  const { data: orders, isLoading, hasMore, loadMore, mutate } = useOrders({
    status: statusFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    search: search || undefined,
    paymentMethod: paymentFilter || undefined,
    locationId: selectedLocationId || undefined,
  });

  // ── All Revenue query ─────────────────────────────────────────
  const locationHeaders = selectedLocationId ? { 'X-Location-Id': selectedLocationId } : undefined;
  const activityParams = new URLSearchParams();
  activityParams.set('limit', '50');
  if (sourceFilter) activityParams.set('source', sourceFilter);

  const {
    data: activityData,
    isLoading: activityLoading,
  } = useQuery({
    queryKey: ['orders', 'all-revenue', sourceFilter, selectedLocationId],
    queryFn: ({ signal }) =>
      apiFetch<{ data: RevenueActivityItem[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/reports/recent-activity?${activityParams.toString()}`,
        { signal, headers: locationHeaders },
      ),
    enabled: activeTab === 'all',
    staleTime: 60_000,
  });

  const activityItems = activityData?.data ?? [];

  type ActivityRow = RevenueActivityItem & Record<string, unknown>;

  const activityColumns = useMemo(
    () => [
      {
        key: 'source',
        header: 'Source',
        width: '200px',
        render: (row: ActivityRow) => {
          const Icon = getSourceIcon(row.source);
          const color = getSourceIconColor(row.source);
          return (
            <div className="flex items-center gap-2">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full ${color}`}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="text-sm font-medium text-foreground">{row.sourceLabel}</span>
            </div>
          );
        },
      },
      {
        key: 'sourceType',
        header: 'Type',
        width: '100px',
        render: (row: ActivityRow) => (
          <span className="text-xs text-muted-foreground">
            {SOURCE_LABELS[row.source] ?? row.source}
          </span>
        ),
      },
      {
        key: 'customerName',
        header: 'Customer',
        render: (row: ActivityRow) => (
          <span className="text-sm text-foreground">
            {row.customerName || '\u2014'}
          </span>
        ),
      },
      {
        key: 'amountDollars',
        header: 'Amount',
        width: '100px',
        render: (row: ActivityRow) => (
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {formatDollars(row.amountDollars)}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        width: '100px',
        render: (row: ActivityRow) => {
          const cfg: Record<string, { label: string; classes: string }> = {
            completed: { label: 'Completed', classes: 'bg-green-500/20 text-green-500' },
            paid: { label: 'Paid', classes: 'bg-green-500/20 text-green-500' },
            placed: { label: 'Placed', classes: 'bg-amber-500/20 text-amber-500' },
            voided: { label: 'Voided', classes: 'bg-red-500/20 text-red-500' },
            refunded: { label: 'Refunded', classes: 'bg-red-500/20 text-red-500' },
          };
          const c = cfg[row.status] ?? { label: row.status, classes: 'bg-muted text-muted-foreground' };
          return (
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${c.classes}`}>
              {c.label}
            </span>
          );
        },
      },
      {
        key: 'occurredAt',
        header: 'Date',
        width: '130px',
        render: (row: ActivityRow) => (
          <span className="text-xs text-muted-foreground">
            {formatDateTime(row.occurredAt)}
          </span>
        ),
      },
    ],
    [],
  );

  const hasFilters = !!search || !!statusFilter || !!paymentFilter || !!dateFrom || !!dateTo || !!selectedLocationId;

  const clearFilters = useCallback(() => {
    setSearch('');
    setStatusFilter('');
    setPaymentFilter('');
    setDateFrom('');
    setDateTo('');
    setSelectedLocationId('');
  }, []);

  // ── Void handler ──────────────────────────────────────────────

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
      mutate();
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to void');
      toast.error(e.message);
    } finally {
      setIsVoiding(false);
    }
  }, [voidOrderId, actionLocationId, toast, mutate]);

  // ── Delete handler ─────────────────────────────────────────────

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
      mutate();
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to delete');
      toast.error(e.message);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteOrderId, actionLocationId, toast, mutate]);

  // ── Re-open handler ───────────────────────────────────────────

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
      mutate();
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to reopen');
      toast.error(e.message);
    } finally {
      setIsReopening(false);
    }
  }, [reopenOrderId, actionLocationId, toast, mutate]);

  // ── Clone handler ─────────────────────────────────────────────

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
        const e = err instanceof Error ? err : new Error('Failed to clone');
        toast.error(e.message);
      }
    },
    [actionLocationId, toast, router],
  );

  // ── Build action menu items for a row ─────────────────────────

  const buildActions = useCallback(
    (row: Order): ActionMenuItem[] => {
      const s = row.status;
      return [
        {
          key: 'view-customer',
          label: 'View Customer',
          icon: User,
          onClick: () => {
            if (row.customerId) profileDrawer.open(row.customerId, { source: 'orders' });
          },
          disabled: !row.customerId,
          disabledReason: 'No customer attached',
        },
        {
          key: 'receipt',
          label: 'Receipt',
          icon: FileText,
          onClick: () => router.push(`/orders/${row.id}`),
        },
        {
          key: 'refund',
          label: 'Refund',
          icon: RotateCcw,
          onClick: () => setRefundOrder({ id: row.id, orderNumber: row.orderNumber }),
          disabled: s !== 'paid',
          disabledReason: 'Order must be paid',
        },
        {
          key: 'void',
          label: 'Void',
          icon: Ban,
          onClick: () => {
            setVoidOrderId(row.id);
            setVoidOrderNumber(row.orderNumber);
          },
          disabled: s !== 'open' && s !== 'placed',
          disabledReason: 'Only open/placed orders can be voided',
        },
        {
          key: 'add-tip',
          label: 'Add Tip',
          icon: DollarSign,
          onClick: () => setTipOrder({ id: row.id, orderNumber: row.orderNumber }),
          disabled: s !== 'paid',
          disabledReason: 'Order must be paid',
        },
        {
          key: 'reopen',
          label: 'Re-Open',
          icon: Unlock,
          onClick: () => {
            setReopenOrderId(row.id);
            setReopenOrderNumber(row.orderNumber);
          },
          disabled: s !== 'voided',
          disabledReason: 'Only voided orders can be reopened',
        },
        {
          key: 'clone',
          label: 'Clone',
          icon: Copy,
          onClick: () => handleClone(row.id),
        },
        {
          key: 'delete',
          label: 'Delete',
          icon: Trash2,
          destructive: true,
          dividerBefore: true,
          onClick: () => {
            setDeleteOrderId(row.id);
            setDeleteOrderNumber(row.orderNumber);
          },
          disabled: s !== 'open' && s !== 'voided',
          disabledReason: 'Only open/voided orders can be deleted',
        },
      ];
    },
    [profileDrawer, router, handleClone],
  );

  // ── Columns ───────────────────────────────────────────────────

  const columns = useMemo(
    () => [
      {
        key: 'orderNumber',
        header: 'Order #',
        width: '100px',
        render: (row: OrderRow) => (
          <span className="font-semibold text-foreground">{row.orderNumber}</span>
        ),
      },
      {
        key: 'createdAt',
        header: 'Created',
        width: '130px',
        render: (row: OrderRow) => (
          <span className="text-xs text-muted-foreground">
            {formatDateTime(row.createdAt)}
          </span>
        ),
      },
      {
        key: 'customerName',
        header: 'Customer',
        render: (row: OrderRow) => (
          <span className="text-sm text-foreground">
            {(row as Order).customerName || '\u2014'}
          </span>
        ),
      },
      {
        key: 'subtotal',
        header: 'Subtotal',
        width: '90px',
        render: (row: OrderRow) => (
          <span className="text-sm text-muted-foreground">{formatMoney(row.subtotal)}</span>
        ),
      },
      {
        key: 'discountTotal',
        header: 'Discount',
        width: '90px',
        render: (row: OrderRow) =>
          row.discountTotal > 0 ? (
            <span className="text-sm text-red-500">-{formatMoney(row.discountTotal)}</span>
          ) : (
            <span className="text-sm text-muted-foreground">{'\u2014'}</span>
          ),
      },
      {
        key: 'taxTotal',
        header: 'Tax',
        width: '80px',
        render: (row: OrderRow) => (
          <span className="text-sm text-muted-foreground">{formatMoney(row.taxTotal)}</span>
        ),
      },
      {
        key: 'serviceChargeTotal',
        header: 'Svc Charge',
        width: '90px',
        render: (row: OrderRow) =>
          row.serviceChargeTotal > 0 ? (
            <span className="text-sm text-muted-foreground">
              {formatMoney(row.serviceChargeTotal)}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">{'\u2014'}</span>
          ),
      },
      {
        key: 'total',
        header: 'Total',
        width: '90px',
        render: (row: OrderRow) => (
          <span className="text-sm font-semibold text-foreground">
            {formatMoney(row.total)}
          </span>
        ),
      },
      {
        key: 'tipTotal',
        header: 'Tip',
        width: '70px',
        render: (row: OrderRow) => {
          const tip = (row as Order).tipTotal ?? 0;
          return tip > 0 ? (
            <span className="text-sm text-blue-500">{formatMoney(tip)}</span>
          ) : (
            <span className="text-sm text-muted-foreground">{'\u2014'}</span>
          );
        },
      },
      {
        key: 'paymentType',
        header: 'Payment',
        width: '90px',
        render: (row: OrderRow) => {
          const pt = (row as Order).paymentType;
          return pt ? (
            <span className="text-xs text-muted-foreground">
              {PAYMENT_TYPE_LABELS[pt] ?? pt}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">{'\u2014'}</span>
          );
        },
      },
      {
        key: 'paidAt',
        header: 'Paid At',
        width: '120px',
        render: (row: OrderRow) => {
          const pa = (row as Order).paidAt;
          return pa ? (
            <span className="text-xs text-muted-foreground">{formatDateTime(pa)}</span>
          ) : (
            <span className="text-sm text-muted-foreground">{'\u2014'}</span>
          );
        },
      },
      {
        key: 'status',
        header: 'Status',
        width: '80px',
        render: (row: OrderRow) => {
          const badge = STATUS_BADGES[row.status] || {
            label: row.status,
            variant: 'neutral',
          };
          return <Badge variant={badge.variant}>{badge.label}</Badge>;
        },
      },
      {
        key: 'actions',
        header: '',
        width: '48px',
        render: (row: OrderRow) => (
          <div onClick={(e) => e.stopPropagation()}>
            <ActionMenu items={buildActions(row as Order)} />
          </div>
        ),
      },
    ],
    [buildActions],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Sales History</h1>
        {activeTab === 'pos' && (
          <button
            type="button"
            onClick={() => exportCSV(orders)}
            disabled={orders.length === 0}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export
          </button>
        )}
      </div>

      {/* Tab toggle */}
      <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
        <button
          type="button"
          onClick={() => setActiveTab('pos')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'pos'
              ? 'bg-indigo-600 text-white'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
        >
          POS Orders
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'all'
              ? 'bg-indigo-600 text-white'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
        >
          All Revenue
        </button>
      </div>

      {/* ── POS Orders Tab ─────────────────────────────────────────── */}
      {activeTab === 'pos' && (
        <>
          {/* Summary bar */}
          {orders.length > 0 && <SummaryBar orders={orders} />}

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
              placeholder="Search order #, customer..."
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
                className="rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                placeholder="From"
              />
              <span className="text-muted-foreground">&ndash;</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
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
          {!isLoading && orders.length === 0 && !hasFilters ? (
            <EmptyState
              icon={ClipboardList}
              title="No orders yet"
              description="Orders will appear here once they are created"
            />
          ) : (
            <>
              <DataTable
                columns={columns}
                data={orders as OrderRow[]}
                isLoading={isLoading}
                emptyMessage="No orders match your filters"
                onRowClick={(row) => router.push(`/orders/${row.id}`)}
              />
              {hasMore && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={loadMore}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    Load More
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── All Revenue Tab ────────────────────────────────────────── */}
      {activeTab === 'all' && (
        <>
          {/* Source filter */}
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
            <Select
              options={sourceFilterOptions}
              value={sourceFilter}
              onChange={(v) => setSourceFilter(v as string)}
              placeholder="All Sources"
              className="w-full md:w-44"
            />
          </div>

          {/* All Revenue table */}
          {!activityLoading && activityItems.length === 0 ? (
            <EmptyState
              icon={DollarSign}
              title="No revenue activity"
              description="Revenue from POS orders, PMS folios, AR invoices, memberships, and vouchers will appear here"
            />
          ) : (
            <DataTable
              columns={activityColumns}
              data={activityItems as ActivityRow[]}
              isLoading={activityLoading}
              emptyMessage="No activity matches your filters"
              onRowClick={(row) => {
                if (row.source === 'pos_order') {
                  router.push(`/orders/${(row as RevenueActivityItem).sourceId}`);
                }
              }}
            />
          )}
        </>
      )}

      {/* Void Confirm Dialog */}
      <ConfirmDialog
        open={voidOrderId !== null}
        onClose={() => setVoidOrderId(null)}
        onConfirm={handleVoidConfirm}
        title="Void Order"
        description={`Are you sure you want to void order ${voidOrderNumber}? This action cannot be undone.`}
        confirmLabel="Void Order"
        destructive
        isLoading={isVoiding}
      />

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={deleteOrderId !== null}
        onClose={() => setDeleteOrderId(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Order"
        description={`Are you sure you want to delete order ${deleteOrderNumber}? This will remove it from your sales history.`}
        confirmLabel="Delete Order"
        destructive
        isLoading={isDeleting}
      />

      {/* Re-open Confirm Dialog */}
      <ConfirmDialog
        open={reopenOrderId !== null}
        onClose={() => setReopenOrderId(null)}
        onConfirm={handleReopenConfirm}
        title="Re-Open Order"
        description={`Re-open voided order ${reopenOrderNumber}? It will return to Open status.`}
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
        onComplete={() => mutate()}
      />

      {/* Tip Adjust Dialog */}
      <TipAdjustDialog
        open={tipOrder !== null}
        onClose={() => setTipOrder(null)}
        orderId={tipOrder?.id ?? ''}
        orderNumber={tipOrder?.orderNumber ?? ''}
        locationId={actionLocationId}
        onComplete={() => mutate()}
      />
    </div>
  );
}
