'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Download,
  Printer,
  ChevronDown,
  ChevronRight,
  Search,
  DollarSign,
  Target,
  TrendingUp,
  Percent,
  X,
} from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { DrillDownDrawer, DrillDownAmount } from '@/components/accounting/drill-down-drawer';
import { useBudgets, useBudgetVsActual } from '@/hooks/use-budgets';
import { formatAccountingMoney } from '@/types/accounting';

// ── Constants ─────────────────────────────────────────────────

const SECTION_COLORS: Record<string, string> = {
  Revenue: 'bg-green-500',
  Expense: 'bg-red-500',
  Asset: 'bg-blue-500',
  Liability: 'bg-amber-500',
  Equity: 'bg-violet-500',
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

// ── Variance display helper ──────────────────────────────────

function varianceColor(amount: number, accountType: string): string {
  // For revenue: positive variance (actual > budget) is favorable
  // For expense: negative variance (actual < budget) is favorable
  if (amount === 0) return 'text-muted-foreground';
  const favorable =
    accountType === 'revenue' || accountType === 'Revenue'
      ? amount > 0
      : amount < 0;
  return favorable ? 'text-green-500' : 'text-red-500';
}

function formatVariancePercent(pct: number | null): string {
  if (pct === null) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

// ── Main Component ────────────────────────────────────────────

export default function BudgetVsActualContent() {
  // ── Budget selector ────────────────────────────────────────
  const { data: budgets } = useBudgets();
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>('');
  const currentYear = new Date().getFullYear();
  const [fromDate, setFromDate] = useState(`${currentYear}-01-01`);
  const [toDate, setToDate] = useState(`${currentYear}-12-31`);

  const { data: report, isLoading } = useBudgetVsActual({
    budgetId: selectedBudgetId || undefined,
    from: fromDate,
    to: toDate,
  });

  // ── Local state ────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [drillDown, setDrillDown] = useState<{ accountId: string; accountName: string } | null>(null);

  // ── Filtered sections ──────────────────────────────────────
  const filteredSections = useMemo(() => {
    if (!report) return [];
    if (!search.trim()) return report.sections;
    const q = search.toLowerCase();
    return report.sections
      .map((section) => ({
        ...section,
        accounts: section.accounts.filter(
          (a) =>
            a.accountNumber.toLowerCase().includes(q) ||
            a.accountName.toLowerCase().includes(q),
        ),
      }))
      .filter((s) => s.accounts.length > 0);
  }, [report, search]);

  // ── Toggle section ─────────────────────────────────────────
  const toggleSection = useCallback((label: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => setCollapsedSections(new Set()), []);
  const collapseAll = useCallback(() => {
    if (!report) return;
    setCollapsedSections(new Set(report.sections.map((s) => s.label)));
  }, [report]);

  // ── CSV export ─────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (!report) return;
    const bom = '\uFEFF';
    const header = 'Account Number,Account Name,Type,Budget,Actual,Variance $,Variance %\n';
    const rows = report.sections.flatMap((section) =>
      section.accounts.map((a) =>
        [
          a.accountNumber,
          `"${a.accountName}"`,
          a.accountType,
          a.budgetAmount.toFixed(2),
          a.actualAmount.toFixed(2),
          a.varianceDollar.toFixed(2),
          a.variancePercent !== null ? a.variancePercent.toFixed(2) : '',
        ].join(','),
      ),
    );
    const blob = new Blob([bom + header + rows.join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget-vs-actual-${report.budgetName.replace(/\s+/g, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report]);

  // ── Approved budgets only ──────────────────────────────────
  const approvedBudgets = useMemo(
    () => budgets.filter((b) => b.status === 'approved' || b.status === 'locked'),
    [budgets],
  );

  // Auto-select first budget
  if (!selectedBudgetId && approvedBudgets.length > 0) {
    setSelectedBudgetId(approvedBudgets[0]!.id);
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <AccountingPageShell
      title="Budget vs Actual"
      subtitle="Compare budgeted amounts to GL actuals with variance analysis"
      breadcrumbs={[
        { label: 'Reports', href: '/accounting/reports' },
        { label: 'Budget vs Actual' },
      ]}
      actions={
        <div className="flex items-center gap-2 print:hidden">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </button>
          <button
            onClick={handleExport}
            disabled={!report}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      }
    >
      {/* Print header */}
      <div className="hidden print:block print:mb-4">
        <h1 className="text-xl font-bold text-foreground">Budget vs Actual Report</h1>
        {report && (
          <p className="text-sm text-muted-foreground">
            {report.budgetName} — {report.period.from} to {report.period.to}
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div className="min-w-[200px]">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Budget</label>
          <select
            value={selectedBudgetId}
            onChange={(e) => setSelectedBudgetId(e.target.value)}
            className="w-full rounded-md border border-input bg-surface px-3 py-1.5 text-sm text-foreground"
          >
            <option value="">Select a budget...</option>
            {approvedBudgets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.fiscalYear}) — {b.status}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-md border border-input bg-surface px-3 py-1.5 text-sm text-foreground"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-md border border-input bg-surface px-3 py-1.5 text-sm text-foreground"
          />
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="mt-6 space-y-4 animate-pulse">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 rounded-lg border border-border bg-surface" />
            ))}
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-lg border border-border bg-surface" />
          ))}
        </div>
      )}

      {/* No budget selected */}
      {!selectedBudgetId && !isLoading && (
        <div className="mt-12 flex flex-col items-center gap-3 text-center">
          <Target className="h-12 w-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Select an approved budget to view variance analysis</p>
        </div>
      )}

      {/* Empty state */}
      {selectedBudgetId && !isLoading && report && report.sections.length === 0 && (
        <div className="mt-12 flex flex-col items-center gap-3 text-center">
          <Target className="h-12 w-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No budget lines found for the selected period</p>
        </div>
      )}

      {/* Report content */}
      {report && report.sections.length > 0 && (
        <div className="mt-6 space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KPICard
              label="Total Budget"
              value={formatAccountingMoney(report.totalBudget)}
              icon={Target}
              accent="text-indigo-500"
            />
            <KPICard
              label="Total Actual"
              value={formatAccountingMoney(report.totalActual)}
              icon={DollarSign}
              accent="text-blue-500"
            />
            <KPICard
              label="Total Variance"
              value={formatAccountingMoney(report.totalVarianceDollar)}
              icon={TrendingUp}
              accent={report.totalVarianceDollar >= 0 ? 'text-green-500' : 'text-red-500'}
            />
            <KPICard
              label="Variance %"
              value={formatVariancePercent(report.totalVariancePercent)}
              icon={Percent}
              accent={
                report.totalVariancePercent !== null && report.totalVariancePercent >= 0
                  ? 'text-green-500'
                  : 'text-red-500'
              }
            />
          </div>

          {/* Variance banner */}
          <div
            className={`rounded-lg border px-4 py-3 text-sm font-medium ${
              report.totalVarianceDollar >= 0
                ? 'border-green-500/30 bg-green-500/10 text-green-500'
                : 'border-red-500/30 bg-red-500/10 text-red-500'
            }`}
          >
            {report.totalVarianceDollar >= 0
              ? `Favorable variance of ${formatAccountingMoney(report.totalVarianceDollar)} — actual exceeds budget`
              : `Unfavorable variance of ${formatAccountingMoney(Math.abs(report.totalVarianceDollar))} — actual is under budget`}
          </div>

          {/* Search + controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search accounts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-input bg-surface pl-8 pr-8 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button onClick={expandAll} className="text-muted-foreground hover:text-foreground">
                Expand All
              </button>
              <span className="text-border">|</span>
              <button onClick={collapseAll} className="text-muted-foreground hover:text-foreground">
                Collapse All
              </button>
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block">
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm print:text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2 text-right">Budget</th>
                    <th className="px-3 py-2 text-right">Actual</th>
                    <th className="px-3 py-2 text-right">Variance $</th>
                    <th className="px-3 py-2 text-right">Variance %</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSections.map((section) => {
                    const isCollapsed = collapsedSections.has(section.label);
                    const dotColor = SECTION_COLORS[section.label] ?? 'bg-gray-500';
                    return (
                      <tbody key={section.label}>
                        {/* Section header */}
                        <tr
                          className="cursor-pointer border-b border-border bg-muted/30 hover:bg-accent print:break-inside-avoid"
                          onClick={() => toggleSection(section.label)}
                        >
                          <td className="px-3 py-2 font-semibold text-foreground" colSpan={1}>
                            <div className="flex items-center gap-2">
                              {isCollapsed ? (
                                <ChevronRight className="h-4 w-4 text-muted-foreground print:hidden" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground print:hidden" />
                              )}
                              <span className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
                              {section.label}
                              <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                                {section.accounts.length}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">
                            {formatAccountingMoney(section.budgetSubtotal)}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">
                            {formatAccountingMoney(section.actualSubtotal)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-semibold tabular-nums ${varianceColor(
                              section.varianceSubtotal,
                              section.label,
                            )}`}
                          >
                            {formatAccountingMoney(section.varianceSubtotal)}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-muted-foreground">
                            {section.budgetSubtotal !== 0
                              ? formatVariancePercent(
                                  ((section.actualSubtotal - section.budgetSubtotal) /
                                    Math.abs(section.budgetSubtotal)) *
                                    100,
                                )
                              : '—'}
                          </td>
                        </tr>
                        {/* Account rows */}
                        {!isCollapsed &&
                          section.accounts.map((account) => (
                            <tr
                              key={account.glAccountId}
                              className="border-b border-border/50 hover:bg-accent/50 print:break-inside-avoid"
                            >
                              <td className="px-3 py-1.5 pl-10 text-foreground">
                                <span className="tabular-nums text-muted-foreground">
                                  {account.accountNumber}
                                </span>
                                <span className="ml-2">{account.accountName}</span>
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                                {formatAccountingMoney(account.budgetAmount)}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                                <DrillDownAmount
                                  onClick={() =>
                                    setDrillDown({
                                      accountId: account.glAccountId,
                                      accountName: `${account.accountNumber} ${account.accountName}`,
                                    })
                                  }
                                >
                                  {formatAccountingMoney(account.actualAmount)}
                                </DrillDownAmount>
                              </td>
                              <td
                                className={`px-3 py-1.5 text-right tabular-nums ${varianceColor(
                                  account.varianceDollar,
                                  account.accountType,
                                )}`}
                              >
                                {formatAccountingMoney(account.varianceDollar)}
                              </td>
                              <td
                                className={`px-3 py-1.5 text-right tabular-nums ${varianceColor(
                                  account.varianceDollar,
                                  account.accountType,
                                )}`}
                              >
                                {formatVariancePercent(account.variancePercent)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    );
                  })}
                  {/* Grand total */}
                  <tr className="border-t-2 border-border bg-muted/50 font-bold print:break-inside-avoid">
                    <td className="px-3 py-2 text-foreground">Grand Total</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {formatAccountingMoney(report.totalBudget)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {formatAccountingMoney(report.totalActual)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        report.totalVarianceDollar >= 0 ? 'text-green-500' : 'text-red-500'
                      }`}
                    >
                      {formatAccountingMoney(report.totalVarianceDollar)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        report.totalVariancePercent !== null && report.totalVariancePercent >= 0
                          ? 'text-green-500'
                          : 'text-red-500'
                      }`}
                    >
                      {formatVariancePercent(report.totalVariancePercent)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile card layout */}
          <div className="space-y-4 sm:hidden">
            {filteredSections.map((section) => {
              const isCollapsed = collapsedSections.has(section.label);
              const dotColor = SECTION_COLORS[section.label] ?? 'bg-gray-500';
              return (
                <div key={section.label} className="rounded-lg border border-border bg-surface">
                  <button
                    onClick={() => toggleSection(section.label)}
                    className="flex w-full items-center justify-between px-4 py-3"
                  >
                    <div className="flex items-center gap-2">
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
                      <span className="text-sm font-semibold text-foreground">{section.label}</span>
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                        {section.accounts.length}
                      </span>
                    </div>
                    <span
                      className={`text-sm font-semibold tabular-nums ${varianceColor(
                        section.varianceSubtotal,
                        section.label,
                      )}`}
                    >
                      {formatAccountingMoney(section.varianceSubtotal)}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className="border-t border-border px-4 py-2 space-y-3">
                      {section.accounts.map((account) => (
                        <div
                          key={account.glAccountId}
                          className="rounded-md border border-border/50 p-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {account.accountNumber}
                            </span>
                            <span
                              className={`text-xs font-medium tabular-nums ${varianceColor(
                                account.varianceDollar,
                                account.accountType,
                              )}`}
                            >
                              {formatVariancePercent(account.variancePercent)}
                            </span>
                          </div>
                          <div className="text-sm font-medium text-foreground">{account.accountName}</div>
                          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">Budget</span>
                              <div className="font-medium tabular-nums text-foreground">
                                {formatAccountingMoney(account.budgetAmount)}
                              </div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Actual</span>
                              <div className="font-medium tabular-nums text-foreground">
                                <DrillDownAmount
                                  onClick={() =>
                                    setDrillDown({
                                      accountId: account.glAccountId,
                                      accountName: `${account.accountNumber} ${account.accountName}`,
                                    })
                                  }
                                >
                                  {formatAccountingMoney(account.actualAmount)}
                                </DrillDownAmount>
                              </div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Variance</span>
                              <div
                                className={`font-medium tabular-nums ${varianceColor(
                                  account.varianceDollar,
                                  account.accountType,
                                )}`}
                              >
                                {formatAccountingMoney(account.varianceDollar)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Mobile grand total */}
            <div className="rounded-lg border-2 border-border bg-muted/50 p-4">
              <div className="text-sm font-bold text-foreground">Grand Total</div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Budget</span>
                  <div className="font-bold tabular-nums text-foreground">
                    {formatAccountingMoney(report.totalBudget)}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Actual</span>
                  <div className="font-bold tabular-nums text-foreground">
                    {formatAccountingMoney(report.totalActual)}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Variance</span>
                  <div
                    className={`font-bold tabular-nums ${
                      report.totalVarianceDollar >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}
                  >
                    {formatAccountingMoney(report.totalVarianceDollar)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print footer */}
      <div className="hidden print:block print:mt-6 print:border-t print:border-gray-300 print:pt-2">
        <p className="text-xs text-muted-foreground">
          Generated {new Date().toLocaleDateString()} — Budget vs Actual Report
          {report ? ` — ${report.budgetName} (FY${report.fiscalYear})` : ''}
        </p>
      </div>
      <DrillDownDrawer
        accountId={drillDown?.accountId ?? null}
        accountName={drillDown?.accountName ?? ''}
        from={fromDate}
        to={toDate}
        onClose={() => setDrillDown(null)}
      />
    </AccountingPageShell>
  );
}
