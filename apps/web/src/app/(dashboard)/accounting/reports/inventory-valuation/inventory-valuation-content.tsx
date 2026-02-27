'use client';

import { useState, useMemo } from 'react';
import {
  Download,
  Printer,
  Search,
  Package,
  AlertTriangle,
  TrendingDown,
  BarChart3,
  X,
} from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { useInventorySummary } from '@/hooks/use-reports';

// ── KPICard ──────────────────────────────────────────────────

function KPICard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 print:border-gray-300 print:bg-gray-100">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-lg font-semibold tabular-nums text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}

// ── Threshold bar ────────────────────────────────────────────

function ThresholdBar({
  onHand,
  threshold,
}: {
  onHand: number;
  threshold: number | null;
}) {
  if (!threshold || threshold <= 0) return null;
  const pct = Math.min((onHand / threshold) * 100, 100);
  const color = pct >= 100 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" title={`${onHand} / ${threshold}`}>
      <div className={color} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────

export default function InventoryValuationContent() {
  const [searchTerm, setSearchTerm] = useState('');
  const [belowOnly, setBelowOnly] = useState(false);

  const { data: items, isLoading, mutate } = useInventorySummary({
    belowThresholdOnly: belowOnly,
    search: searchTerm || undefined,
  });

  // KPI metrics
  const totalItems = items.length;
  const belowThreshold = items.filter((i) => i.isBelowThreshold).length;
  const totalOnHand = items.reduce((s, i) => s + (Number(i.onHand) || 0), 0);
  const zeroStockItems = items.filter((i) => (Number(i.onHand) || 0) <= 0).length;

  // Filter (client-side search refinement on top of server filter)
  const filtered = useMemo(() => {
    if (!searchTerm) return items;
    const lc = searchTerm.toLowerCase();
    return items.filter((i) => (i.itemName ?? '').toLowerCase().includes(lc));
  }, [items, searchTerm]);

  return (
    <AccountingPageShell
      title="Inventory Valuation"
      breadcrumbs={[
        { label: 'Reports', href: '/accounting/reports' },
        { label: 'Inventory Valuation' },
      ]}
    >
      {/* Print header */}
      <div className="hidden print:block print:mb-4">
        <h1 className="text-xl font-bold text-foreground">Inventory Valuation Report</h1>
        <p className="text-sm text-muted-foreground">
          Generated {new Date().toLocaleDateString()}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={belowOnly}
            onChange={(e) => setBelowOnly(e.target.checked)}
            className="rounded border-border"
          />
          Below reorder point only
        </label>
        <button
          type="button"
          onClick={() => mutate()}
          className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
        >
          Refresh
        </button>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded bg-muted" />
            ))}
          </div>
        </div>
      )}

      {!isLoading && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KPICard
              icon={Package}
              label="Total Items"
              value={String(totalItems)}
              accent="bg-indigo-500/10 text-indigo-500"
            />
            <KPICard
              icon={BarChart3}
              label="Total On Hand"
              value={totalOnHand.toLocaleString()}
              accent="bg-blue-500/10 text-blue-500"
            />
            <KPICard
              icon={AlertTriangle}
              label="Below Reorder"
              value={String(belowThreshold)}
              accent="bg-amber-500/10 text-amber-500"
            />
            <KPICard
              icon={TrendingDown}
              label="Zero Stock"
              value={String(zeroStockItems)}
              accent="bg-red-500/10 text-red-500"
            />
          </div>

          {/* Status banner */}
          {belowThreshold > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-500 print:border-gray-300 print:bg-gray-100 print:text-foreground">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {belowThreshold} item{belowThreshold !== 1 ? 's' : ''} below reorder point
            </div>
          )}
          {belowThreshold === 0 && totalItems > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-500 print:border-gray-300 print:bg-gray-100 print:text-foreground">
              All items are above reorder point.
            </div>
          )}

          {/* Search + controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search item..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface py-2 pl-10 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{filtered.length} items</span>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded border border-border p-1.5 text-muted-foreground hover:bg-accent"
                title="Print"
              >
                <Printer className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  /* CSV export future */
                }}
                className="rounded border border-border p-1.5 text-muted-foreground hover:bg-accent"
                title="Export CSV"
              >
                <Download className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Empty state */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Package className="h-12 w-12 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No inventory items found.
              </p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-hidden rounded-lg border border-border print:border-gray-300">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted print:bg-gray-100 print:border-gray-300">
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Item
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        On Hand
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Reorder Point
                      </th>
                      <th className="px-3 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Status
                      </th>
                      <th className="hidden w-32 px-3 py-2.5 lg:table-cell text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Stock Level
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => {
                      const onHand = Number(item.onHand) || 0;
                      const threshold = item.lowStockThreshold != null ? Number(item.lowStockThreshold) : null;
                      return (
                        <tr
                          key={item.inventoryItemId}
                          className={`border-b border-border last:border-0 hover:bg-accent print:border-gray-200 print:break-inside-avoid ${
                            item.isBelowThreshold ? 'bg-amber-500/5' : ''
                          }`}
                        >
                          <td className="px-3 py-2.5 text-sm font-medium text-foreground">
                            {item.itemName}
                          </td>
                          <td className="px-3 py-2.5 text-right text-sm tabular-nums text-foreground">
                            {onHand.toLocaleString()}
                          </td>
                          <td className="px-3 py-2.5 text-right text-sm tabular-nums text-muted-foreground">
                            {threshold != null ? threshold.toLocaleString() : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {item.isBelowThreshold ? (
                              <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500">
                                Low
                              </span>
                            ) : onHand <= 0 ? (
                              <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500">
                                Out
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-500">
                                OK
                              </span>
                            )}
                          </td>
                          <td className="hidden px-3 py-2.5 lg:table-cell">
                            <ThresholdBar onHand={onHand} threshold={threshold} />
                          </td>
                        </tr>
                      );
                    })}
                    {/* Grand totals */}
                    <tr className="border-t-2 border-border bg-muted font-semibold print:border-gray-400 print:bg-gray-100">
                      <td className="px-3 py-3 text-sm text-foreground">
                        Total ({filtered.length} items)
                      </td>
                      <td className="px-3 py-3 text-right text-sm tabular-nums text-foreground">
                        {filtered.reduce((s, i) => s + (Number(i.onHand) || 0), 0).toLocaleString()}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="space-y-3 md:hidden">
                {filtered.map((item) => {
                  const onHand = Number(item.onHand) || 0;
                  const threshold = item.lowStockThreshold != null ? Number(item.lowStockThreshold) : null;
                  return (
                    <div
                      key={item.inventoryItemId}
                      className={`rounded-lg border border-border bg-surface p-4 print:break-inside-avoid ${
                        item.isBelowThreshold ? 'border-amber-500/30' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">{item.itemName}</span>
                        {item.isBelowThreshold ? (
                          <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500">
                            Low
                          </span>
                        ) : onHand <= 0 ? (
                          <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500">
                            Out
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-500">
                            OK
                          </span>
                        )}
                      </div>
                      <ThresholdBar onHand={onHand} threshold={threshold} />
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">On Hand</p>
                          <p className="tabular-nums font-medium text-foreground">
                            {onHand.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Reorder Point</p>
                          <p className="tabular-nums font-medium text-foreground">
                            {threshold != null ? threshold.toLocaleString() : '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Print footer */}
          <div className="hidden print:block print:mt-6 print:border-t print:border-gray-300 print:pt-2">
            <p className="text-xs text-muted-foreground">
              Generated {new Date().toLocaleDateString()} — Inventory Valuation Report
            </p>
          </div>
        </>
      )}
    </AccountingPageShell>
  );
}
