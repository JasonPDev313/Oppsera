'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Building,
  DollarSign,
  TrendingDown,
  Calculator,
  Search,
  ChevronDown,
  ChevronRight,
  Printer,
  Download,
  Package,
  X,
  CheckCircle,
} from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { useAssetSummary } from '@/hooks/use-fixed-assets';
import { formatAccountingMoney } from '@/types/accounting';
import type { AssetCategorySummary } from '@oppsera/module-accounting';

// ── Constants ─────────────────────────────────────────────────

const CATEGORY_ORDER = [
  'building',
  'equipment',
  'vehicle',
  'furniture',
  'technology',
  'leasehold_improvement',
  'other',
];

const CATEGORY_LABELS: Record<string, string> = {
  building: 'Buildings',
  equipment: 'Equipment',
  vehicle: 'Vehicles',
  furniture: 'Furniture & Fixtures',
  technology: 'Technology',
  leasehold_improvement: 'Leasehold Improvements',
  other: 'Other Assets',
};

const CATEGORY_COLORS: Record<string, string> = {
  building: 'bg-blue-500',
  equipment: 'bg-green-500',
  vehicle: 'bg-amber-500',
  furniture: 'bg-purple-500',
  technology: 'bg-cyan-500',
  leasehold_improvement: 'bg-rose-500',
  other: 'bg-gray-500',
};

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-500/10 text-green-500 border-green-500/30',
  fully_depreciated: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  disposed: 'bg-red-500/10 text-red-500 border-red-500/30',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  fully_depreciated: 'Fully Depreciated',
  disposed: 'Disposed',
};

// ── KPI Card ──────────────────────────────────────────────────

function KPICard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: typeof DollarSign;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 print:border-gray-300 print:p-2">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${accent ?? 'text-muted-foreground'}`} />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="mt-1.5">
        <span className="text-xl font-semibold tabular-nums text-foreground">{value}</span>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────

export default function FixedAssetSummaryContent() {
  const { data, isLoading } = useAssetSummary();

  // ── Local state ──────────────────────────────────────────

  const [search, setSearch] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // ── Derived data ──────────────────────────────────────────

  const filteredCategories = useMemo(() => {
    if (!data?.categories) return [];
    if (!search.trim()) return data.categories;
    const q = search.toLowerCase();
    return data.categories
      .map((cat) => ({
        ...cat,
        assets: cat.assets.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            a.assetNumber.toLowerCase().includes(q),
        ),
      }))
      .filter((cat) => cat.assets.length > 0);
  }, [data?.categories, search]);

  const orderedCategories = useMemo(() => {
    const categoryMap = new Map(filteredCategories.map((c) => [c.category, c]));
    const ordered: AssetCategorySummary[] = [];
    for (const key of CATEGORY_ORDER) {
      const cat = categoryMap.get(key);
      if (cat) ordered.push(cat);
    }
    // Include any categories not in the predefined order
    for (const cat of filteredCategories) {
      if (!CATEGORY_ORDER.includes(cat.category)) {
        ordered.push(cat);
      }
    }
    return ordered;
  }, [filteredCategories]);

  const totalFilteredAssets = useMemo(
    () => filteredCategories.reduce((sum, c) => sum + c.assets.length, 0),
    [filteredCategories],
  );

  const totalAssets = data?.totalAssets ?? 0;

  // ── Handlers ──────────────────────────────────────────────

  const toggleSection = useCallback((category: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => setCollapsedSections(new Set()), []);
  const collapseAll = useCallback(
    () => setCollapsedSections(new Set(orderedCategories.map((c) => c.category))),
    [orderedCategories],
  );

  const handleExport = useCallback(() => {
    if (!data?.categories) return;
    const headers = [
      'Category',
      'Asset #',
      'Name',
      'Cost',
      'Accum. Depreciation',
      'Net Book Value',
      'Status',
      'Depreciation Method',
    ];
    const rows: string[][] = [];
    for (const cat of orderedCategories) {
      for (const asset of cat.assets) {
        rows.push([
          CATEGORY_LABELS[cat.category] ?? cat.category,
          asset.assetNumber,
          asset.name,
          asset.cost.toFixed(2),
          asset.accumulatedDepreciation.toFixed(2),
          asset.netBookValue.toFixed(2),
          STATUS_LABELS[asset.status] ?? asset.status,
          asset.depreciationMethod,
        ]);
      }
    }
    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fixed-asset-summary-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [data?.categories, orderedCategories]);

  // ── Render ────────────────────────────────────────────────

  return (
    <AccountingPageShell
      title="Fixed Asset Summary"
      breadcrumbs={[
        { label: 'Reports', href: '/accounting/reports' },
        { label: 'Fixed Asset Summary' },
      ]}
      actions={
        <div className="flex items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            disabled={totalAssets === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={totalAssets === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      }
    >
      {/* Print header (only visible in print) */}
      <div className="hidden print:block print:mb-4">
        <h2 className="text-lg font-bold">Fixed Asset Summary</h2>
        <div className="mt-1 text-sm text-gray-600">
          <span>Generated: {new Date().toLocaleString()}</span>
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-4">
          {/* KPI skeleton */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border bg-surface p-4">
                <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                <div className="mt-3 h-6 w-28 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
          {/* Table skeleton */}
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && totalAssets === 0 && (
        <div className="rounded-lg border border-border bg-surface p-12 text-center">
          <Building className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <h3 className="mt-3 text-sm font-medium text-foreground">No Fixed Assets</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            No fixed assets have been recorded yet.
          </p>
        </div>
      )}

      {/* Report content */}
      {!isLoading && totalAssets > 0 && data && (
        <div className="space-y-4">
          {/* KPI summary cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
            <KPICard
              label="Total Assets"
              value={String(data.totalAssets)}
              icon={Building}
              accent="text-indigo-500"
            />
            <KPICard
              label="Total Cost"
              value={formatAccountingMoney(data.totalCost)}
              icon={DollarSign}
              accent="text-blue-500"
            />
            <KPICard
              label="Net Book Value"
              value={formatAccountingMoney(data.totalNetBookValue)}
              icon={TrendingDown}
              accent="text-green-500"
            />
            <KPICard
              label="Monthly Depreciation"
              value={formatAccountingMoney(data.totalMonthlyDepreciation)}
              icon={Calculator}
              accent="text-amber-500"
            />
          </div>

          {/* Status banner */}
          <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 print:border-gray-300 print:bg-gray-50">
            <CheckCircle className="h-5 w-5 shrink-0 text-green-500 print:text-gray-600" />
            <span className="text-sm font-medium text-green-500 print:text-gray-700">
              {data.totalAssets} total asset{data.totalAssets !== 1 ? 's' : ''} on record
              {data.fullyDepreciatedCount > 0 && (
                <span className="font-normal text-muted-foreground">
                  {' '}&middot; {data.fullyDepreciatedCount} fully depreciated
                </span>
              )}
              {data.disposedCount > 0 && (
                <span className="font-normal text-muted-foreground">
                  {' '}&middot; {data.disposedCount} disposed
                </span>
              )}
            </span>
          </div>

          {/* Toolbar: search + section controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
            {/* Search */}
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter by name or asset #..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Section controls */}
            <div className="flex items-center gap-2 text-sm">
              {search && (
                <span className="text-muted-foreground">
                  {totalFilteredAssets} of {totalAssets} assets
                </span>
              )}
              <button
                type="button"
                onClick={expandAll}
                className="rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Expand All
              </button>
              <span className="text-border">|</span>
              <button
                type="button"
                onClick={collapseAll}
                className="rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Collapse All
              </button>
            </div>
          </div>

          {/* Report metadata (print visible) */}
          <div className="hidden print:flex print:justify-between print:text-xs print:text-gray-500 print:border-b print:border-gray-300 print:pb-2">
            <span>{totalAssets} total assets</span>
            <span>Generated: {new Date().toLocaleString()}</span>
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border border-border bg-surface md:block print:block print:border-gray-300">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted print:bg-gray-100 print:border-gray-300">
                    <th className="w-8 px-2 py-3 print:hidden" />
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Asset # / Name
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Cost
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Accum. Depr.
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Net Book Value
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Method
                    </th>
                  </tr>
                </thead>
                {orderedCategories.map((cat) => {
                  const isCollapsed = collapsedSections.has(cat.category);
                  const categoryColor = CATEGORY_COLORS[cat.category] ?? 'bg-gray-500';
                  const categoryLabel = CATEGORY_LABELS[cat.category] ?? cat.category;

                  return (
                    <tbody key={cat.category} className="print:break-inside-avoid">
                      {/* Category header */}
                      <tr
                        className="cursor-pointer select-none border-b border-border bg-muted/60 transition-colors hover:bg-muted print:cursor-default print:bg-gray-50"
                        onClick={() => toggleSection(cat.category)}
                      >
                        <td className="w-8 px-2 py-2.5 print:hidden">
                          {isCollapsed ? (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </td>
                        <td className="px-4 py-2.5 print:pl-2">
                          <div className="flex items-center gap-2.5">
                            <span className={`inline-block h-2.5 w-2.5 rounded-full ${categoryColor}`} />
                            <span className="text-sm font-semibold tracking-wide text-foreground">
                              {categoryLabel}
                            </span>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground print:bg-gray-200">
                              {cat.assetCount}
                            </span>
                            {cat.fullyDepreciatedCount > 0 && (
                              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs tabular-nums text-amber-500">
                                {cat.fullyDepreciatedCount} fully depr.
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground">
                          {formatAccountingMoney(cat.totalCost)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground">
                          {formatAccountingMoney(cat.totalAccumulatedDepreciation)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground">
                          {formatAccountingMoney(cat.totalNetBookValue)}
                        </td>
                        <td className="px-4 py-2.5" />
                        <td className="px-4 py-2.5" />
                      </tr>

                      {/* Asset detail rows */}
                      {!isCollapsed &&
                        cat.assets.map((asset) => (
                          <tr
                            key={asset.id}
                            className="border-b border-border/50 transition-colors last:border-border hover:bg-accent/30"
                          >
                            <td className="print:hidden" />
                            <td className="py-2 pl-10 pr-4 text-sm print:pl-6">
                              <div className="text-foreground">{asset.name}</div>
                              <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                                {asset.assetNumber}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-right text-sm tabular-nums text-foreground">
                              {formatAccountingMoney(asset.cost)}
                            </td>
                            <td className="px-4 py-2 text-right text-sm tabular-nums text-foreground">
                              {formatAccountingMoney(asset.accumulatedDepreciation)}
                            </td>
                            <td className="px-4 py-2 text-right text-sm tabular-nums text-foreground">
                              {formatAccountingMoney(asset.netBookValue)}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <span
                                className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[asset.status] ?? 'bg-muted text-muted-foreground border-border'}`}
                              >
                                {STATUS_LABELS[asset.status] ?? asset.status}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-sm text-muted-foreground">
                              {asset.depreciationMethod}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  );
                })}

                {/* Grand total footer */}
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted font-bold print:bg-gray-100 print:border-gray-400">
                    <td className="print:hidden" />
                    <td className="px-4 py-3 text-sm text-foreground">Grand Total</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">
                      {formatAccountingMoney(data.totalCost)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">
                      {formatAccountingMoney(data.totalAccumulatedDepreciation)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">
                      {formatAccountingMoney(data.totalNetBookValue)}
                    </td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Mobile card layout */}
          <div className="space-y-3 md:hidden print:hidden">
            {orderedCategories.map((cat) => {
              const isCollapsed = collapsedSections.has(cat.category);
              const categoryColor = CATEGORY_COLORS[cat.category] ?? 'bg-gray-500';
              const categoryLabel = CATEGORY_LABELS[cat.category] ?? cat.category;

              return (
                <div
                  key={cat.category}
                  className="overflow-hidden rounded-lg border border-border bg-surface"
                >
                  {/* Category header -- tappable */}
                  <button
                    type="button"
                    onClick={() => toggleSection(cat.category)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2.5">
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className={`h-2.5 w-2.5 rounded-full ${categoryColor}`} />
                      <span className="text-sm font-semibold text-foreground">
                        {categoryLabel}
                      </span>
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                        {cat.assetCount}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">
                        NBV {formatAccountingMoney(cat.totalNetBookValue)}
                      </div>
                    </div>
                  </button>

                  {/* Asset detail cards */}
                  {!isCollapsed && (
                    <div className="border-t border-border/50 divide-y divide-border/30">
                      {cat.assets.map((asset) => (
                        <div key={asset.id} className="px-4 py-2.5">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium text-foreground">
                              {asset.name}
                            </div>
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[asset.status] ?? 'bg-muted text-muted-foreground border-border'}`}
                            >
                              {STATUS_LABELS[asset.status] ?? asset.status}
                            </span>
                          </div>
                          <div className="mt-1 font-mono text-xs text-muted-foreground">
                            {asset.assetNumber}
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">Cost</span>
                              <div className="mt-0.5 font-medium tabular-nums text-foreground">
                                {formatAccountingMoney(asset.cost)}
                              </div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Accum. Depr.</span>
                              <div className="mt-0.5 font-medium tabular-nums text-foreground">
                                {formatAccountingMoney(asset.accumulatedDepreciation)}
                              </div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">NBV</span>
                              <div className="mt-0.5 font-medium tabular-nums text-foreground">
                                {formatAccountingMoney(asset.netBookValue)}
                              </div>
                            </div>
                          </div>
                          <div className="mt-1.5 text-xs text-muted-foreground">
                            {asset.depreciationMethod}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Mobile grand totals */}
            <div className="rounded-lg border border-border bg-muted p-4 space-y-2">
              <div className="flex justify-between text-sm font-bold text-foreground">
                <span>Total Cost</span>
                <span className="tabular-nums">
                  {formatAccountingMoney(data.totalCost)}
                </span>
              </div>
              <div className="flex justify-between text-sm font-bold text-foreground">
                <span>Total Accum. Depreciation</span>
                <span className="tabular-nums">
                  {formatAccountingMoney(data.totalAccumulatedDepreciation)}
                </span>
              </div>
              <div className="border-t border-border pt-2">
                <div className="flex justify-between text-sm font-bold text-green-500">
                  <span className="flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5" />
                    Net Book Value
                  </span>
                  <span className="tabular-nums">
                    {formatAccountingMoney(data.totalNetBookValue)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AccountingPageShell>
  );
}
