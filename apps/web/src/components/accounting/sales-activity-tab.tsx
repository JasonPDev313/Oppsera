'use client';

import { useState, useMemo } from 'react';
import {
  Search,
  Download,
  ChevronDown,
  ArrowUpDown,
  ShoppingCart,
  UtensilsCrossed,
  Building2,
  FileText,
  CreditCard,
  Ticket,
  CircleDot,
  Loader2,
} from 'lucide-react';
import { useSalesHistory, type SalesHistoryFilters } from '@/hooks/use-sales-history';
import { formatAccountingMoney } from '@/types/accounting';
import { buildQueryString } from '@/lib/query-string';

// Icon map for revenue sources
const SOURCE_ICONS: Record<string, typeof ShoppingCart> = {
  pos_retail: ShoppingCart,
  pos_fnb: UtensilsCrossed,
  pms_folio: Building2,
  ar_invoice: FileText,
  membership: CreditCard,
  voucher: Ticket,
};

const SOURCE_COLORS: Record<string, string> = {
  pos_retail: 'text-blue-500',
  pos_fnb: 'text-orange-500',
  pms_folio: 'text-purple-500',
  ar_invoice: 'text-emerald-500',
  membership: 'text-amber-500',
  voucher: 'text-pink-500',
};

const SOURCE_LABELS: Record<string, string> = {
  pos_retail: 'Retail POS',
  pos_fnb: 'F&B POS',
  pms_folio: 'Room Charges',
  ar_invoice: 'AR Invoices',
  membership: 'Membership',
  voucher: 'Vouchers',
  pos_order: 'POS Order',
};

const STATUS_BADGES: Record<string, { bg: string; text: string }> = {
  completed: { bg: 'bg-green-500/10', text: 'text-green-500' },
  voided: { bg: 'bg-red-500/10', text: 'text-red-500' },
  refunded: { bg: 'bg-amber-500/10', text: 'text-amber-500' },
};

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function getWeekAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

export default function SalesActivityTab() {
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(getWeekAgo);
  const [dateTo, setDateTo] = useState(getToday);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedPayment, setSelectedPayment] = useState('');
  const [sortBy, setSortBy] = useState('occurred_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showSourceFilter, setShowSourceFilter] = useState(false);

  const filters: SalesHistoryFilters = useMemo(
    () => ({
      sources: selectedSources.length > 0 ? selectedSources : undefined,
      dateFrom,
      dateTo,
      search: search || undefined,
      status: selectedStatus || undefined,
      paymentMethod: selectedPayment || undefined,
      sortBy,
      sortDir,
    }),
    [selectedSources, dateFrom, dateTo, search, selectedStatus, selectedPayment, sortBy, sortDir],
  );

  const { items, summary, isLoading, isLoadingMore, hasMore, loadMore } = useSalesHistory(filters);

  function toggleSource(key: string) {
    setSelectedSources((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key],
    );
  }

  function toggleSort(col: string) {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
  }

  function getSourceIcon(source: string) {
    const Icon = SOURCE_ICONS[source] ?? CircleDot;
    const color = SOURCE_COLORS[source] ?? 'text-muted-foreground';
    return <Icon className={`h-4 w-4 ${color}`} />;
  }

  function getSourceLabel(source: string) {
    return SOURCE_LABELS[source] ?? source.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const exportUrl = useMemo(() => {
    const qs = buildQueryString({
      dateFrom,
      dateTo,
      search: search || undefined,
      status: selectedStatus || undefined,
      paymentMethod: selectedPayment || undefined,
      sources: selectedSources.length > 0 ? selectedSources.join(',') : undefined,
      sortBy,
      sortDir,
    });
    return `/api/v1/reports/sales-history/export${qs}`;
  }, [dateFrom, dateTo, search, selectedStatus, selectedPayment, selectedSources, sortBy, sortDir]);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-xs font-medium text-muted-foreground">Total Revenue</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
              {formatAccountingMoney(summary.totalAmount)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-xs font-medium text-muted-foreground">Transactions</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
              {summary.totalCount.toLocaleString()}
            </p>
          </div>
          {summary.bySource.slice(0, 2).map((s) => (
            <div key={s.source} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center gap-1.5">
                {getSourceIcon(s.source)}
                <p className="text-xs font-medium text-muted-foreground">{getSourceLabel(s.source)}</p>
              </div>
              <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                {formatAccountingMoney(s.totalAmount)}
              </p>
              <p className="text-xs text-muted-foreground">{s.count} transactions</p>
            </div>
          ))}
        </div>
      )}

      {/* Source breakdown pills (if more than 2 sources) */}
      {summary && summary.bySource.length > 2 && (
        <div className="flex flex-wrap gap-2">
          {summary.bySource.slice(2).map((s) => (
            <div
              key={s.source}
              className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1"
            >
              {getSourceIcon(s.source)}
              <span className="text-xs font-medium text-muted-foreground">{getSourceLabel(s.source)}</span>
              <span className="text-xs font-semibold tabular-nums text-foreground">
                {formatAccountingMoney(s.totalAmount)}
              </span>
              <span className="text-xs text-muted-foreground">({s.count})</span>
            </div>
          ))}
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Date range */}
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-md border border-input bg-surface px-2 py-1.5 text-sm text-foreground"
        />
        <span className="text-sm text-muted-foreground">to</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded-md border border-input bg-surface px-2 py-1.5 text-sm text-foreground"
        />

        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search transactions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-input bg-surface py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground"
          />
        </div>

        {/* Source filter dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowSourceFilter(!showSourceFilter)}
            className="flex items-center gap-1 rounded-md border border-input bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-accent"
          >
            Sources
            {selectedSources.length > 0 && (
              <span className="ml-1 rounded-full bg-indigo-500/10 px-1.5 text-xs font-medium text-indigo-500">
                {selectedSources.length}
              </span>
            )}
            <ChevronDown className="ml-1 h-3.5 w-3.5" />
          </button>
          {showSourceFilter && (
            <div className="absolute left-0 top-full z-10 mt-1 w-56 rounded-lg border border-border bg-surface p-1 shadow-lg">
              {Object.entries(SOURCE_LABELS).filter(([k]) => k !== 'pos_order').map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleSource(key)}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                    selectedSources.includes(key)
                      ? 'bg-indigo-500/10 text-indigo-500'
                      : 'text-foreground hover:bg-accent'
                  }`}
                >
                  {getSourceIcon(key)}
                  {label}
                </button>
              ))}
              {selectedSources.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedSources([])}
                  className="mt-1 w-full rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* Status filter */}
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="rounded-md border border-input bg-surface px-2 py-1.5 text-sm text-foreground"
        >
          <option value="">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="voided">Voided</option>
          <option value="refunded">Refunded</option>
        </select>

        {/* Payment filter */}
        <select
          value={selectedPayment}
          onChange={(e) => setSelectedPayment(e.target.value)}
          className="rounded-md border border-input bg-surface px-2 py-1.5 text-sm text-foreground"
        >
          <option value="">All Payments</option>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="house_account">House Account</option>
          <option value="split">Split</option>
        </select>

        {/* Export CSV */}
        <a
          href={exportUrl}
          className="flex items-center gap-1 rounded-md border border-input bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-accent"
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </a>
      </div>

      {/* Data table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Source</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Reference</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Customer / Employee</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Payment</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                <button
                  type="button"
                  onClick={() => toggleSort('occurred_at')}
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  Date
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Subtotal</th>
              <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Tax</th>
              <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Discount</th>
              <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                <button
                  type="button"
                  onClick={() => toggleSort('amount')}
                  className="ml-auto flex items-center gap-1 hover:text-foreground"
                >
                  Total
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={10} className="py-12 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">Loading sales data...</p>
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center">
                  <ShoppingCart className="mx-auto h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">No sales activity found</p>
                  <p className="text-xs text-muted-foreground">Try adjusting the date range or filters</p>
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const statusCfg = STATUS_BADGES[item.status] ?? {
                  bg: 'bg-muted/50',
                  text: 'text-muted-foreground',
                };
                return (
                  <tr key={item.id} className="hover:bg-accent/30">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {getSourceIcon(item.effectiveSource)}
                        <span className="text-xs text-muted-foreground">
                          {getSourceLabel(item.effectiveSource)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-foreground">{item.sourceLabel}</span>
                      {item.referenceNumber && (
                        <span className="ml-1 text-xs text-muted-foreground">#{item.referenceNumber}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {item.customerName && <div className="text-foreground">{item.customerName}</div>}
                      {item.employeeName && (
                        <div className="text-xs text-muted-foreground">{item.employeeName}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {item.paymentMethod
                        ? item.paymentMethod.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {new Date(item.occurredAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                      {formatAccountingMoney(item.subtotalDollars)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {formatAccountingMoney(item.taxDollars)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {item.discountDollars > 0
                        ? `(${formatAccountingMoney(item.discountDollars)})`
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-foreground">
                      {formatAccountingMoney(item.amountDollars)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={isLoadingMore}
            className="flex items-center gap-2 rounded-md border border-input bg-surface px-4 py-2 text-sm text-foreground hover:bg-accent disabled:opacity-50"
          >
            {isLoadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
