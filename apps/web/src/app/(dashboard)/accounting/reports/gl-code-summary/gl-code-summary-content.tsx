'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Download,
  Printer,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Search,
  DollarSign,
  Hash,
  X,
} from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { DrillDownDrawer, DrillDownAmount } from '@/components/accounting/drill-down-drawer';
import { ReportFilterBar } from '@/components/reports/report-filter-bar';
import { useReportFilters } from '@/hooks/use-report-filters';
import { useGlCodeSummary } from '@/hooks/use-gl-code-summary';
import type { GlCodeSummaryLine } from '@/hooks/use-gl-code-summary';
import { formatAccountingMoney } from '@/types/accounting';
import { buildQueryString } from '@/lib/query-string';

// ── Constants ─────────────────────────────────────────────────

const SECTION_ORDER: GlCodeSummaryLine['section'][] = [
  'revenue',
  'discount',
  'tender',
  'tax',
  'tip',
  'expense',
  'other',
];

const SECTION_LABELS: Record<GlCodeSummaryLine['section'], string> = {
  revenue: 'Revenue',
  discount: 'Discounts',
  tender: 'Tenders',
  tax: 'Tax',
  tip: 'Tips',
  expense: 'Expenses',
  other: 'Other',
};

const SECTION_COLORS: Record<GlCodeSummaryLine['section'], string> = {
  revenue: 'bg-green-500',
  discount: 'bg-amber-500',
  tender: 'bg-indigo-500',
  tax: 'bg-sky-500',
  tip: 'bg-violet-500',
  expense: 'bg-red-500',
  other: 'bg-gray-500',
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

export default function GlCodeSummaryContent() {
  const { locations } = useAuthContext();
  const filters = useReportFilters({ defaultPreset: 'today' });

  const { data, isLoading, mutate } = useGlCodeSummary({
    startDate: filters.dateFrom,
    endDate: filters.dateTo,
    locationId: filters.selectedLocationId,
  });

  // ── Local state ──────────────────────────────────────────

  const [search, setSearch] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [drillDown, setDrillDown] = useState<{ accountId: string; accountName: string } | null>(null);

  // ── Derived data ──────────────────────────────────────────

  const filteredLines = useMemo(() => {
    if (!search.trim()) return data.lines;
    const q = search.toLowerCase();
    return data.lines.filter(
      (l) =>
        l.memo.toLowerCase().includes(q) ||
        l.accountNumber.toLowerCase().includes(q) ||
        l.accountName.toLowerCase().includes(q),
    );
  }, [data.lines, search]);

  const grouped = useMemo(() => {
    const result: Record<string, GlCodeSummaryLine[]> = {};
    for (const section of SECTION_ORDER) {
      const items = filteredLines.filter((l) => l.section === section);
      if (items.length > 0) {
        result[section] = items;
      }
    }
    return result;
  }, [filteredLines]);

  const activeSections = useMemo(
    () => SECTION_ORDER.filter((s) => grouped[s] && grouped[s].length > 0),
    [grouped],
  );

  const variance = Math.abs(data.grandTotalDebit - data.grandTotalCredit);
  const isBalanced = variance < 0.01;
  const lineCount = data.lines.length;
  const sectionCount = activeSections.length;

  // ── Handlers ──────────────────────────────────────────────

  const toggleSection = useCallback((section: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => setCollapsedSections(new Set()), []);
  const collapseAll = useCallback(
    () => setCollapsedSections(new Set(activeSections)),
    [activeSections],
  );

  const handleExport = () => {
    const qs = buildQueryString({
      startDate: filters.dateFrom,
      endDate: filters.dateTo,
      locationId: filters.selectedLocationId,
      format: 'csv',
    });
    window.open(`/api/v1/accounting/reports/gl-code-summary${qs}`, '_blank');
  };

  const locationName = useMemo(() => {
    if (!filters.selectedLocationId) return 'All Locations';
    return locations.find((l) => l.id === filters.selectedLocationId)?.name ?? 'Unknown';
  }, [filters.selectedLocationId, locations]);

  // ── Render ────────────────────────────────────────────────

  return (
    <AccountingPageShell
      title="GL Code Summary"
      breadcrumbs={[
        { label: 'Reports', href: '/accounting/reports/gl-code-summary' },
        { label: 'GL Code Summary' },
      ]}
      actions={
        <div className="flex items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            disabled={data.lines.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={data.lines.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      }
    >
      {/* Filters */}
      <div className="print:hidden">
        <ReportFilterBar
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          preset={filters.preset}
          onDateChange={filters.setDateRange}
          locationId={filters.locationId}
          onLocationChange={filters.setLocationId}
          locations={locations}
          isLoading={isLoading}
          onRefresh={() => mutate()}
          onReset={filters.reset}
        />
      </div>

      {/* Print header (only visible in print) */}
      <div className="hidden print:block print:mb-4">
        <h2 className="text-lg font-bold">GL Code Summary</h2>
        <div className="mt-1 flex gap-4 text-sm text-gray-600">
          <span>Period: {filters.dateFrom} to {filters.dateTo}</span>
          <span>Location: {locationName}</span>
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
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && data.lines.length === 0 && (
        <div className="rounded-lg border border-border bg-surface p-12 text-center">
          <DollarSign className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <h3 className="mt-3 text-sm font-medium text-foreground">No GL Activity</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            No posted journal entries found for the selected date range and location.
          </p>
        </div>
      )}

      {/* Report content */}
      {!isLoading && data.lines.length > 0 && (
        <div className="space-y-4">
          {/* KPI summary cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
            <KPICard
              label="Total Debits"
              value={formatAccountingMoney(data.grandTotalDebit)}
              icon={DollarSign}
              accent="text-green-500"
            />
            <KPICard
              label="Total Credits"
              value={formatAccountingMoney(data.grandTotalCredit)}
              icon={DollarSign}
              accent="text-indigo-500"
            />
            <KPICard
              label="Line Items"
              value={`${lineCount} across ${sectionCount} sections`}
              icon={Hash}
            />
            <KPICard
              label="Balance Status"
              value={isBalanced ? 'Balanced' : `Variance: ${formatAccountingMoney(variance)}`}
              icon={isBalanced ? CheckCircle : AlertTriangle}
              accent={isBalanced ? 'text-green-500' : 'text-red-500'}
            />
          </div>

          {/* Balance status banner */}
          {!isBalanced && (
            <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
              <span className="text-sm font-medium text-red-500">
                GL Code Summary is out of balance by{' '}
                {formatAccountingMoney(variance)}. Debits and credits should
                be equal for a balanced trial.
              </span>
            </div>
          )}
          {isBalanced && (
            <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 print:border-gray-300 print:bg-gray-50">
              <CheckCircle className="h-5 w-5 shrink-0 text-green-500 print:text-gray-600" />
              <span className="text-sm font-medium text-green-500 print:text-gray-700">
                Report is balanced. Total debits equal total credits for{' '}
                {filters.dateFrom === filters.dateTo
                  ? filters.dateFrom
                  : `${filters.dateFrom} through ${filters.dateTo}`}
                .
              </span>
            </div>
          )}

          {/* Toolbar: search + section controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
            {/* Search */}
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter by memo or account..."
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
                  {filteredLines.length} of {data.lines.length} lines
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
            <span>Location: {locationName}</span>
            <span>{lineCount} line items | {sectionCount} sections</span>
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
                      Memo / Description
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Account
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Debit
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Credit
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Net
                    </th>
                  </tr>
                </thead>
                {activeSections.map((section) => {
                  const items = grouped[section]!;
                  const sectionDebits = items.reduce((s, r) => s + r.totalDebit, 0);
                  const sectionCredits = items.reduce((s, r) => s + r.totalCredit, 0);
                  const sectionNet = sectionDebits - sectionCredits;
                  const isCollapsed = collapsedSections.has(section);

                  return (
                    <tbody key={section} className="print:break-inside-avoid">
                      {/* Section header */}
                      <tr
                        className="cursor-pointer select-none border-b border-border bg-muted/60 transition-colors hover:bg-muted print:cursor-default print:bg-gray-50"
                        onClick={() => toggleSection(section)}
                      >
                        <td className="w-8 px-2 py-2.5 print:hidden">
                          {isCollapsed ? (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </td>
                        <td
                          colSpan={2}
                          className="px-4 py-2.5 print:pl-2"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className={`inline-block h-2.5 w-2.5 rounded-full ${SECTION_COLORS[section]}`} />
                            <span className="text-sm font-semibold tracking-wide text-foreground">
                              {SECTION_LABELS[section]}
                            </span>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground print:bg-gray-200">
                              {items.length}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground">
                          {sectionDebits > 0 ? formatAccountingMoney(sectionDebits) : ''}
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground">
                          {sectionCredits > 0 ? formatAccountingMoney(sectionCredits) : ''}
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground">
                          {sectionNet !== 0 ? formatAccountingMoney(sectionNet) : ''}
                        </td>
                      </tr>

                      {/* Detail rows */}
                      {!isCollapsed &&
                        items.map((line, idx) => (
                          <tr
                            key={`${section}-${idx}`}
                            className="border-b border-border/50 transition-colors last:border-border hover:bg-accent/30"
                          >
                            <td className="print:hidden" />
                            <td className="py-2 pl-10 pr-4 text-sm text-foreground print:pl-6">
                              {line.memo}
                            </td>
                            <td className="px-4 py-2 text-sm text-muted-foreground">
                              <span className="font-mono">{line.accountNumber}</span>
                              <span className="ml-2 hidden text-muted-foreground/70 lg:inline print:inline">
                                {line.accountName}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right text-sm tabular-nums text-foreground">
                              {line.totalDebit > 0 ? (
                                <DrillDownAmount
                                  onClick={() =>
                                    setDrillDown({
                                      accountId: line.accountId,
                                      accountName: `${line.accountNumber} ${line.accountName}`,
                                    })
                                  }
                                >
                                  {formatAccountingMoney(line.totalDebit)}
                                </DrillDownAmount>
                              ) : (
                                ''
                              )}
                            </td>
                            <td className="px-4 py-2 text-right text-sm tabular-nums text-foreground">
                              {line.totalCredit > 0 ? (
                                <DrillDownAmount
                                  onClick={() =>
                                    setDrillDown({
                                      accountId: line.accountId,
                                      accountName: `${line.accountNumber} ${line.accountName}`,
                                    })
                                  }
                                >
                                  {formatAccountingMoney(line.totalCredit)}
                                </DrillDownAmount>
                              ) : (
                                ''
                              )}
                            </td>
                            <td className="px-4 py-2 text-right text-sm tabular-nums text-muted-foreground">
                              {line.totalDebit - line.totalCredit !== 0
                                ? formatAccountingMoney(
                                    line.totalDebit - line.totalCredit,
                                  )
                                : ''}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  );
                })}

                {/* Grand total */}
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted font-bold print:bg-gray-100 print:border-gray-400">
                    <td className="print:hidden" />
                    <td
                      colSpan={2}
                      className="px-4 py-3 text-right text-sm text-foreground"
                    >
                      Grand Total
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">
                      {formatAccountingMoney(data.grandTotalDebit)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">
                      {formatAccountingMoney(data.grandTotalCredit)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">
                      {data.grandTotalDebit - data.grandTotalCredit !== 0
                        ? formatAccountingMoney(
                            data.grandTotalDebit - data.grandTotalCredit,
                          )
                        : '—'}
                    </td>
                  </tr>
                  {!isBalanced && (
                    <tr className="bg-red-500/10 font-semibold print:bg-red-50">
                      <td className="print:hidden" />
                      <td
                        colSpan={2}
                        className="px-4 py-2 text-right text-sm text-red-500"
                      >
                        <span className="flex items-center justify-end gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Out of Balance
                        </span>
                      </td>
                      <td
                        colSpan={3}
                        className="px-4 py-2 text-right text-sm tabular-nums text-red-500"
                      >
                        {formatAccountingMoney(variance)}
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          </div>

          {/* Mobile card layout */}
          <div className="space-y-3 md:hidden print:hidden">
            {activeSections.map((section) => {
              const items = grouped[section]!;
              const sectionDebits = items.reduce((s, r) => s + r.totalDebit, 0);
              const sectionCredits = items.reduce((s, r) => s + r.totalCredit, 0);
              const isCollapsed = collapsedSections.has(section);

              return (
                <div
                  key={section}
                  className="overflow-hidden rounded-lg border border-border bg-surface"
                >
                  {/* Section header — tappable */}
                  <button
                    type="button"
                    onClick={() => toggleSection(section)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2.5">
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className={`h-2.5 w-2.5 rounded-full ${SECTION_COLORS[section]}`} />
                      <span className="text-sm font-semibold text-foreground">
                        {SECTION_LABELS[section]}
                      </span>
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                        {items.length}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">
                        {sectionDebits > 0 && (
                          <span>
                            DR {formatAccountingMoney(sectionDebits)}
                          </span>
                        )}
                        {sectionDebits > 0 && sectionCredits > 0 && ' / '}
                        {sectionCredits > 0 && (
                          <span>
                            CR {formatAccountingMoney(sectionCredits)}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Detail cards */}
                  {!isCollapsed && (
                    <div className="border-t border-border/50 divide-y divide-border/30">
                      {items.map((line, idx) => (
                        <div key={`${section}-${idx}`} className="px-4 py-2.5">
                          <div className="text-sm font-medium text-foreground">
                            {line.memo}
                          </div>
                          <div className="mt-1 flex items-center justify-between">
                            <span className="font-mono text-xs text-muted-foreground">
                              {line.accountNumber}
                            </span>
                            <div className="flex gap-3 text-sm tabular-nums">
                              {line.totalDebit > 0 && (
                                <DrillDownAmount
                                  onClick={() =>
                                    setDrillDown({
                                      accountId: line.accountId,
                                      accountName: `${line.accountNumber} ${line.accountName}`,
                                    })
                                  }
                                  className="text-foreground"
                                >
                                  <span className="mr-1 text-xs text-muted-foreground">
                                    DR
                                  </span>
                                  {formatAccountingMoney(line.totalDebit)}
                                </DrillDownAmount>
                              )}
                              {line.totalCredit > 0 && (
                                <DrillDownAmount
                                  onClick={() =>
                                    setDrillDown({
                                      accountId: line.accountId,
                                      accountName: `${line.accountNumber} ${line.accountName}`,
                                    })
                                  }
                                  className="text-foreground"
                                >
                                  <span className="mr-1 text-xs text-muted-foreground">
                                    CR
                                  </span>
                                  {formatAccountingMoney(line.totalCredit)}
                                </DrillDownAmount>
                              )}
                            </div>
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
                <span>Total Debits</span>
                <span className="tabular-nums">
                  {formatAccountingMoney(data.grandTotalDebit)}
                </span>
              </div>
              <div className="flex justify-between text-sm font-bold text-foreground">
                <span>Total Credits</span>
                <span className="tabular-nums">
                  {formatAccountingMoney(data.grandTotalCredit)}
                </span>
              </div>
              <div className="border-t border-border pt-2">
                <div
                  className={`flex justify-between text-sm font-bold ${isBalanced ? 'text-green-500' : 'text-red-500'}`}
                >
                  <span className="flex items-center gap-1.5">
                    {isBalanced ? (
                      <CheckCircle className="h-3.5 w-3.5" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    )}
                    {isBalanced ? 'Balanced' : 'Variance'}
                  </span>
                  <span className="tabular-nums">
                    {isBalanced
                      ? '$0.00'
                      : formatAccountingMoney(variance)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <DrillDownDrawer
        accountId={drillDown?.accountId ?? null}
        accountName={drillDown?.accountName ?? ''}
        from={filters.dateFrom}
        to={filters.dateTo}
        locationId={filters.selectedLocationId}
        onClose={() => setDrillDown(null)}
      />
    </AccountingPageShell>
  );
}
