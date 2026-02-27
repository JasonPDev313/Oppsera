'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Download,
  Printer,
  ChevronDown,
  ChevronRight,
  Search,
  DollarSign,
  TrendingUp,
  TrendingDown,
  BarChart3,
  X,
  FileText,
} from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { GLReadinessBanner } from '@/components/accounting/gl-readiness-banner';
import { ReportFilterBar } from '@/components/reports/report-filter-bar';
import { useReportFilters } from '@/hooks/use-report-filters';
import { useProfitAndLoss } from '@/hooks/use-statements';
import { formatAccountingMoney } from '@/types/accounting';
import { buildQueryString } from '@/lib/query-string';

// ── Section colors ───────────────────────────────────────────

function getSectionColor(label: string): string {
  const l = label.toLowerCase();
  if (l.includes('revenue') || l.includes('sales') || l.includes('income')) return 'bg-green-500';
  if (l.includes('cost') || l.includes('cogs')) return 'bg-amber-500';
  if (l.includes('operating') || l.includes('expense')) return 'bg-red-500';
  if (l.includes('other')) return 'bg-sky-500';
  if (l.includes('discount') || l.includes('contra')) return 'bg-violet-500';
  return 'bg-indigo-500';
}

// ── KPI Card ─────────────────────────────────────────────────

function KPICard({
  label,
  value,
  subtitle,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  subtitle?: string;
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
        <span className={`text-xl font-semibold tabular-nums ${accent ?? 'text-foreground'}`}>{value}</span>
      </div>
      {subtitle && (
        <div className="mt-0.5">
          <span className="text-xs tabular-nums text-muted-foreground">{subtitle}</span>
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────

export default function PnlContent() {
  const { locations } = useAuthContext();
  const filters = useReportFilters({ defaultPreset: 'month_to_date' });
  const [comparative, setComparative] = useState(false);

  const { data: pnl, isLoading, mutate } = useProfitAndLoss({
    startDate: filters.dateFrom,
    endDate: filters.dateTo,
    locationId: filters.selectedLocationId,
    comparative,
  });

  // ── Local state ────────────────────────────────────────────

  const [search, setSearch] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // ── Derived data ───────────────────────────────────────────

  const filteredSections = useMemo(() => {
    if (!pnl) return [];
    if (!search.trim()) return pnl.sections;
    const q = search.toLowerCase();
    return pnl.sections
      .map((section) => ({
        ...section,
        accounts: section.accounts.filter(
          (a) =>
            a.accountName.toLowerCase().includes(q) ||
            a.accountNumber.toLowerCase().includes(q),
        ),
      }))
      .filter((s) => s.accounts.length > 0);
  }, [pnl, search]);

  const totalAccounts = useMemo(
    () => (pnl ? pnl.sections.reduce((sum, s) => sum + s.accounts.length, 0) : 0),
    [pnl],
  );

  const filteredAccountCount = useMemo(
    () => filteredSections.reduce((sum, s) => sum + s.accounts.length, 0),
    [filteredSections],
  );

  const grossMarginPct = pnl && pnl.totalRevenue !== 0
    ? ((pnl.grossProfit / pnl.totalRevenue) * 100).toFixed(1)
    : '0.0';

  const netMarginPct = pnl && pnl.totalRevenue !== 0
    ? ((pnl.netIncome / pnl.totalRevenue) * 100).toFixed(1)
    : '0.0';

  // ── Handlers ───────────────────────────────────────────────

  const toggleSection = useCallback((label: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => setCollapsedSections(new Set()), []);
  const collapseAll = useCallback(
    () => setCollapsedSections(new Set(filteredSections.map((s) => s.label))),
    [filteredSections],
  );

  const handleExport = () => {
    const qs = buildQueryString({
      from: filters.dateFrom,
      to: filters.dateTo,
      locationId: filters.selectedLocationId,
      format: 'csv',
    });
    window.open(`/api/v1/accounting/statements/profit-loss${qs}`, '_blank');
  };

  const locationName = useMemo(() => {
    if (!filters.selectedLocationId) return 'All Locations';
    return locations.find((l) => l.id === filters.selectedLocationId)?.name ?? 'Unknown';
  }, [filters.selectedLocationId, locations]);

  const pctOfRevenue = useCallback(
    (amount: number) => {
      if (!pnl || pnl.totalRevenue === 0) return '';
      return `${((amount / pnl.totalRevenue) * 100).toFixed(1)}%`;
    },
    [pnl],
  );

  // ── Render ─────────────────────────────────────────────────

  return (
    <AccountingPageShell
      title="Profit & Loss Statement"
      breadcrumbs={[
        { label: 'Statements', href: '/accounting/statements/profit-loss' },
        { label: 'Profit & Loss' },
      ]}
      actions={
        <div className="flex items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!pnl}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={!pnl}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      }
    >
      <GLReadinessBanner />

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
        {/* Comparative toggle */}
        <div className="mt-2 px-1">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={comparative}
              onChange={(e) => setComparative(e.target.checked)}
              className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-muted-foreground">Show prior period comparison</span>
          </label>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block print:mb-4">
        <h2 className="text-lg font-bold">Profit & Loss Statement</h2>
        <div className="mt-1 flex gap-4 text-sm text-gray-600">
          <span>Period: {filters.dateFrom} to {filters.dateTo}</span>
          <span>Location: {locationName}</span>
          <span>Generated: {new Date().toLocaleString()}</span>
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border bg-surface p-4">
                <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                <div className="mt-3 h-6 w-28 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !pnl && (
        <div className="rounded-lg border border-border bg-surface p-12 text-center">
          <FileText className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <h3 className="mt-3 text-sm font-medium text-foreground">No P&L Data</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            No financial data found for the selected period and location.
          </p>
        </div>
      )}

      {/* Report content */}
      {!isLoading && pnl && (
        <div className="space-y-4">
          {/* KPI summary cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
            <KPICard
              label="Net Revenue"
              value={formatAccountingMoney(pnl.totalRevenue)}
              icon={DollarSign}
              accent="text-green-500"
            />
            <KPICard
              label="Gross Profit"
              value={formatAccountingMoney(pnl.grossProfit)}
              subtitle={`${grossMarginPct}% margin`}
              icon={TrendingUp}
              accent="text-indigo-500"
            />
            <KPICard
              label="Total Expenses"
              value={formatAccountingMoney(pnl.totalExpenses)}
              icon={TrendingDown}
              accent="text-red-500"
            />
            <KPICard
              label="Net Income"
              value={formatAccountingMoney(pnl.netIncome)}
              subtitle={`${netMarginPct}% margin`}
              icon={BarChart3}
              accent={pnl.netIncome >= 0 ? 'text-green-500' : 'text-red-500'}
            />
          </div>

          {/* Net income banner */}
          <div
            className={`flex items-center gap-3 rounded-lg border px-4 py-3 print:border-gray-300 print:bg-gray-50 ${
              pnl.netIncome >= 0
                ? 'border-green-500/30 bg-green-500/10'
                : 'border-red-500/30 bg-red-500/10'
            }`}
          >
            {pnl.netIncome >= 0 ? (
              <TrendingUp className="h-5 w-5 shrink-0 text-green-500 print:text-gray-600" />
            ) : (
              <TrendingDown className="h-5 w-5 shrink-0 text-red-500 print:text-gray-600" />
            )}
            <span
              className={`text-sm font-medium print:text-gray-700 ${
                pnl.netIncome >= 0 ? 'text-green-500' : 'text-red-500'
              }`}
            >
              {pnl.netIncome >= 0 ? 'Net Profit' : 'Net Loss'} of{' '}
              {formatAccountingMoney(Math.abs(pnl.netIncome))} ({netMarginPct}% of
              revenue) for {filters.dateFrom} through {filters.dateTo}.
            </span>
          </div>

          {/* Toolbar: search + section controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter by account..."
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
            <div className="flex items-center gap-2 text-sm">
              {search && (
                <span className="text-muted-foreground">
                  {filteredAccountCount} of {totalAccounts} accounts
                </span>
              )}
              <button type="button" onClick={expandAll} className="rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                Expand All
              </button>
              <span className="text-border">|</span>
              <button type="button" onClick={collapseAll} className="rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                Collapse All
              </button>
            </div>
          </div>

          {/* Print metadata */}
          <div className="hidden print:flex print:justify-between print:text-xs print:text-gray-500 print:border-b print:border-gray-300 print:pb-2">
            <span>Location: {locationName}</span>
            <span>{totalAccounts} accounts | {pnl.sections.length} sections</span>
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
                      Account
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      % of Revenue
                    </th>
                    {comparative && (
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Prior Period
                      </th>
                    )}
                  </tr>
                </thead>
                {filteredSections.map((section) => {
                  const isCollapsed = collapsedSections.has(section.label);
                  return (
                    <tbody key={section.label} className="print:break-inside-avoid">
                      {/* Section header */}
                      <tr
                        className="cursor-pointer select-none border-b border-border bg-muted/60 transition-colors hover:bg-muted print:cursor-default print:bg-gray-50"
                        onClick={() => toggleSection(section.label)}
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
                            <span className={`inline-block h-2.5 w-2.5 rounded-full ${getSectionColor(section.label)}`} />
                            <span className="text-sm font-semibold tracking-wide text-foreground">
                              {section.label}
                            </span>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground print:bg-gray-200">
                              {section.accounts.length}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground">
                          {formatAccountingMoney(section.subtotal)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm tabular-nums text-muted-foreground">
                          {pctOfRevenue(section.subtotal)}
                        </td>
                        {comparative && <td />}
                      </tr>

                      {/* Detail rows */}
                      {!isCollapsed &&
                        section.accounts.map((acct) => (
                          <tr
                            key={acct.accountId}
                            className="border-b border-border/50 transition-colors last:border-border hover:bg-accent/30"
                          >
                            <td className="print:hidden" />
                            <td className="py-2 pl-10 pr-4 text-sm text-foreground print:pl-6">
                              <span className="font-mono text-muted-foreground mr-2">{acct.accountNumber}</span>
                              {acct.accountName}
                            </td>
                            <td className="px-4 py-2 text-right text-sm tabular-nums text-foreground">
                              {formatAccountingMoney(acct.amount)}
                            </td>
                            <td className="px-4 py-2 text-right text-sm tabular-nums text-muted-foreground">
                              {pctOfRevenue(acct.amount)}
                            </td>
                            {comparative && (
                              <td className="px-4 py-2 text-right text-sm tabular-nums text-muted-foreground">
                                {acct.priorAmount != null
                                  ? formatAccountingMoney(acct.priorAmount)
                                  : '—'}
                              </td>
                            )}
                          </tr>
                        ))}
                    </tbody>
                  );
                })}

                {/* Summary rows */}
                <tfoot>
                  {/* Gross Profit */}
                  <tr className="border-t border-border bg-muted/40 print:bg-gray-50">
                    <td className="print:hidden" />
                    <td className="px-4 py-2.5 text-right text-sm font-semibold text-foreground">
                      Gross Profit
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground">
                      {formatAccountingMoney(pnl.grossProfit)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-muted-foreground">
                      {grossMarginPct}%
                    </td>
                    {comparative && <td />}
                  </tr>
                  {/* Net Income */}
                  <tr className="border-t-2 border-border bg-muted font-bold print:bg-gray-100 print:border-gray-400">
                    <td className="print:hidden" />
                    <td className="px-4 py-3 text-right text-sm text-foreground">
                      Net Income
                    </td>
                    <td
                      className={`px-4 py-3 text-right text-sm tabular-nums ${
                        pnl.netIncome >= 0 ? 'text-green-500' : 'text-red-500'
                      }`}
                    >
                      {formatAccountingMoney(pnl.netIncome)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right text-sm tabular-nums ${
                        pnl.netIncome >= 0 ? 'text-green-500' : 'text-red-500'
                      }`}
                    >
                      {netMarginPct}%
                    </td>
                    {comparative && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Mobile card layout */}
          <div className="space-y-3 md:hidden print:hidden">
            {filteredSections.map((section) => {
              const isCollapsed = collapsedSections.has(section.label);
              return (
                <div key={section.label} className="overflow-hidden rounded-lg border border-border bg-surface">
                  <button
                    type="button"
                    onClick={() => toggleSection(section.label)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2.5">
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className={`h-2.5 w-2.5 rounded-full ${getSectionColor(section.label)}`} />
                      <span className="text-sm font-semibold text-foreground">{section.label}</span>
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                        {section.accounts.length}
                      </span>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {formatAccountingMoney(section.subtotal)}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className="border-t border-border/50 divide-y divide-border/30">
                      {section.accounts.map((acct) => (
                        <div key={acct.accountId} className="px-4 py-2.5">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-mono text-xs text-muted-foreground mr-1.5">{acct.accountNumber}</span>
                              <span className="text-sm text-foreground">{acct.accountName}</span>
                            </div>
                            <span className="text-sm tabular-nums text-foreground">
                              {formatAccountingMoney(acct.amount)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Mobile summary card */}
            <div className="rounded-lg border border-border bg-muted p-4 space-y-2">
              <div className="flex justify-between text-sm font-semibold text-foreground">
                <span>Net Revenue</span>
                <span className="tabular-nums">{formatAccountingMoney(pnl.totalRevenue)}</span>
              </div>
              <div className="flex justify-between text-sm text-foreground">
                <span>Cost of Goods Sold</span>
                <span className="tabular-nums">{formatAccountingMoney(pnl.totalCogs)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-foreground border-t border-border pt-2">
                <span>Gross Profit</span>
                <span className="tabular-nums">{formatAccountingMoney(pnl.grossProfit)}</span>
              </div>
              <div className="flex justify-between text-sm text-foreground">
                <span>Total Expenses</span>
                <span className="tabular-nums">{formatAccountingMoney(pnl.totalExpenses)}</span>
              </div>
              <div className="border-t border-border pt-2">
                <div
                  className={`flex justify-between text-sm font-bold ${
                    pnl.netIncome >= 0 ? 'text-green-500' : 'text-red-500'
                  }`}
                >
                  <span>Net Income</span>
                  <span className="tabular-nums">{formatAccountingMoney(pnl.netIncome)}</span>
                </div>
                <div className="mt-0.5 text-right text-xs text-muted-foreground">
                  {netMarginPct}% margin
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AccountingPageShell>
  );
}
