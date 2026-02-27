'use client';

import { useState, useMemo } from 'react';
import {
  Download,
  Printer,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Search,
  DollarSign,
  Hash,
  Scale,
  X,
} from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { GLReadinessBanner } from '@/components/accounting/gl-readiness-banner';
import { ReportFilterBar } from '@/components/reports/report-filter-bar';
import { useReportFilters } from '@/hooks/use-report-filters';
import { useTrialBalance } from '@/hooks/use-journals';
import { formatAccountingMoney } from '@/types/accounting';
import type { AccountType, TrialBalanceRow } from '@/types/accounting';
import { buildQueryString } from '@/lib/query-string';

// ── Constants ─────────────────────────────────────────────────

const TYPE_ORDER: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];

const TYPE_LABELS: Record<AccountType, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expenses',
};

const TYPE_COLORS: Record<AccountType, string> = {
  asset: 'bg-indigo-500',
  liability: 'bg-amber-500',
  equity: 'bg-violet-500',
  revenue: 'bg-green-500',
  expense: 'bg-red-500',
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

// ── Component ─────────────────────────────────────────────────

export default function TrialBalanceContent() {
  const { locations } = useAuthContext();
  const filters = useReportFilters({ defaultPreset: 'month_to_date' });
  const [showZeroBalances, setShowZeroBalances] = useState(false);
  const [search, setSearch] = useState('');

  // Use dateTo as the as-of date for trial balance
  const { data: rows, isLoading, mutate } = useTrialBalance({
    asOfDate: filters.dateTo,
    locationId: filters.selectedLocationId,
    showZeroBalances,
  });

  // Section collapse state
  const [collapsed, setCollapsed] = useState<Set<AccountType>>(new Set());

  const toggle = (type: AccountType) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(type)) { next.delete(type); } else { next.add(type); }
      return next;
    });

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(TYPE_ORDER));

  // Filter by search
  const term = search.toLowerCase().trim();
  const filtered = useMemo(
    () =>
      term
        ? rows.filter(
            (r) =>
              r.accountName.toLowerCase().includes(term) ||
              r.accountNumber.toLowerCase().includes(term) ||
              (r.classificationName ?? '').toLowerCase().includes(term),
          )
        : rows,
    [rows, term],
  );

  // Group by type
  const grouped = useMemo(() => {
    const result: Record<string, TrialBalanceRow[]> = {};
    for (const type of TYPE_ORDER) {
      const items = filtered.filter((r) => r.accountType === type);
      if (items.length > 0 || showZeroBalances) {
        result[type] = items;
      }
    }
    return result;
  }, [filtered, showZeroBalances]);

  // Totals
  const totalDebits = rows.reduce((sum, r) => sum + r.debitBalance, 0);
  const totalCredits = rows.reduce((sum, r) => sum + r.creditBalance, 0);
  const variance = Math.abs(totalDebits - totalCredits);
  const isBalanced = variance < 0.01;
  const accountCount = rows.filter((r) => r.debitBalance > 0 || r.creditBalance > 0).length;

  // Export
  const handleExport = () => {
    const qs = buildQueryString({
      asOfDate: filters.dateTo,
      locationId: filters.selectedLocationId,
      showZeroBalances: showZeroBalances ? 'true' : undefined,
      format: 'csv',
    });
    window.open(`/api/v1/accounting/reports/trial-balance${qs}`, '_blank');
  };

  const handlePrint = () => window.print();

  // ── Render ────────────────────────────────────────────────

  return (
    <AccountingPageShell
      title="Trial Balance"
      breadcrumbs={[
        { label: 'Accounting' },
        { label: 'Reports' },
        { label: 'Trial Balance' },
      ]}
      actions={
        <div className="flex items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      }
    >
      <GLReadinessBanner />

      {/* ── Print Header ─────────────────────────────────── */}
      <div className="hidden print:block print:mb-4">
        <h1 className="text-xl font-bold text-foreground">Trial Balance</h1>
        <p className="text-sm text-muted-foreground">As of {filters.dateTo}</p>
      </div>

      {/* ── Filter Bar ───────────────────────────────────── */}
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
        className="print:hidden"
      />

      {/* ── KPI Cards ────────────────────────────────────── */}
      {!isLoading && rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 print:grid-cols-4 print:gap-2">
          <KPICard
            label="Total Debits"
            value={formatAccountingMoney(totalDebits)}
            icon={DollarSign}
            accent="text-green-500"
          />
          <KPICard
            label="Total Credits"
            value={formatAccountingMoney(totalCredits)}
            icon={DollarSign}
            accent="text-indigo-500"
          />
          <KPICard
            label="Accounts with Activity"
            value={String(accountCount)}
            icon={Hash}
          />
          <KPICard
            label="Balance Status"
            value={isBalanced ? 'Balanced' : `Variance: ${formatAccountingMoney(variance)}`}
            icon={isBalanced ? CheckCircle : AlertTriangle}
            accent={isBalanced ? 'text-green-500' : 'text-red-500'}
          />
        </div>
      )}

      {/* ── Balance Status Banner ────────────────────────── */}
      {!isLoading && rows.length > 0 && (
        <div
          className={`flex items-center gap-2 rounded-lg border p-3 ${
            isBalanced
              ? 'border-green-500/30 bg-green-500/10'
              : 'border-red-500/30 bg-red-500/10'
          }`}
        >
          {isBalanced ? (
            <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
          )}
          <span className={`text-sm font-medium ${isBalanced ? 'text-green-500' : 'text-red-500'}`}>
            {isBalanced
              ? 'Trial balance is in balance — debits equal credits'
              : `Trial balance is out of balance by ${formatAccountingMoney(variance)}`}
          </span>
        </div>
      )}

      {/* ── Search + Controls ────────────────────────────── */}
      {!isLoading && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <div className="relative flex-1 min-w-50 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search accounts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showZeroBalances}
              onChange={(e) => setShowZeroBalances(e.target.checked)}
              className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-foreground">Show zero balances</span>
          </label>

          <div className="flex-1" />

          <button type="button" onClick={expandAll} className="text-xs font-medium text-indigo-500 hover:underline">
            Expand All
          </button>
          <span className="text-muted-foreground">|</span>
          <button type="button" onClick={collapseAll} className="text-xs font-medium text-indigo-500 hover:underline">
            Collapse All
          </button>
        </div>
      )}

      {/* ── Loading Skeleton ─────────────────────────────── */}
      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
          <div className="h-10 animate-pulse rounded-lg bg-muted" />
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-muted" />
          ))}
        </div>
      )}

      {/* ── Empty State ──────────────────────────────────── */}
      {!isLoading && rows.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <Scale className="h-10 w-10" />
          <p className="text-sm">No trial balance data for the selected period.</p>
        </div>
      )}

      {/* ── Desktop Table ────────────────────────────────── */}
      {!isLoading && rows.length > 0 && (
        <div className="hidden md:block overflow-hidden rounded-lg border border-border bg-surface print:block print:border-gray-300">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted print:bg-gray-100">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Account #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Account Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Classification
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground w-36">
                  Debit
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground w-36">
                  Credit
                </th>
              </tr>
            </thead>

            {TYPE_ORDER.map((type) => {
              const items = grouped[type];
              if (!items || items.length === 0) return null;
              const isCollapsed = collapsed.has(type);
              const sectionDebits = items.reduce((s, r) => s + r.debitBalance, 0);
              const sectionCredits = items.reduce((s, r) => s + r.creditBalance, 0);

              return (
                <tbody key={type} className="print:break-inside-avoid">
                  {/* Section header */}
                  <tr
                    className="cursor-pointer border-b border-border bg-muted/50 hover:bg-accent/50 print:bg-gray-50 print:cursor-default"
                    onClick={() => toggle(type)}
                  >
                    <td colSpan={5} className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="print:hidden">
                          {isCollapsed ? (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </span>
                        <span className={`h-2.5 w-2.5 rounded-full ${TYPE_COLORS[type]} print:hidden`} />
                        <span className="text-sm font-semibold text-foreground">
                          {TYPE_LABELS[type]}
                        </span>
                        <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {items.length}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* Rows */}
                  {!isCollapsed &&
                    items.map((row) => (
                      <tr
                        key={row.accountId}
                        className="border-b border-border last:border-0 hover:bg-accent/50"
                      >
                        <td className="px-4 py-2 text-sm font-mono text-foreground">{row.accountNumber}</td>
                        <td className="px-4 py-2 text-sm text-foreground">{row.accountName}</td>
                        <td className="px-4 py-2 text-sm text-muted-foreground">
                          {row.classificationName ?? '—'}
                        </td>
                        <td className="px-4 py-2 text-right text-sm tabular-nums text-foreground">
                          {row.debitBalance > 0 ? formatAccountingMoney(row.debitBalance) : ''}
                        </td>
                        <td className="px-4 py-2 text-right text-sm tabular-nums text-foreground">
                          {row.creditBalance > 0 ? formatAccountingMoney(row.creditBalance) : ''}
                        </td>
                      </tr>
                    ))}

                  {/* Section subtotal */}
                  <tr className="border-b border-border bg-muted/30 print:bg-gray-50">
                    <td colSpan={3} className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">
                      {TYPE_LABELS[type]} Subtotal
                    </td>
                    <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-foreground">
                      {sectionDebits > 0 ? formatAccountingMoney(sectionDebits) : ''}
                    </td>
                    <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-foreground">
                      {sectionCredits > 0 ? formatAccountingMoney(sectionCredits) : ''}
                    </td>
                  </tr>
                </tbody>
              );
            })}

            {/* Grand total */}
            <tfoot>
              <tr className="border-t-2 border-border bg-muted font-bold print:bg-gray-100">
                <td colSpan={3} className="px-4 py-3 text-right text-sm text-foreground">
                  Grand Total
                </td>
                <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">
                  {formatAccountingMoney(totalDebits)}
                </td>
                <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">
                  {formatAccountingMoney(totalCredits)}
                </td>
              </tr>
              {!isBalanced && (
                <tr className="bg-red-500/10 font-semibold">
                  <td colSpan={3} className="px-4 py-2 text-right text-sm text-red-500">
                    Variance
                  </td>
                  <td colSpan={2} className="px-4 py-2 text-right text-sm tabular-nums text-red-500">
                    {formatAccountingMoney(variance)}
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Mobile Cards ─────────────────────────────────── */}
      {!isLoading && rows.length > 0 && (
        <div className="space-y-4 md:hidden print:hidden">
          {TYPE_ORDER.map((type) => {
            const items = grouped[type];
            if (!items || items.length === 0) return null;
            const isCollapsed = collapsed.has(type);

            return (
              <div key={type} className="rounded-lg border border-border bg-surface">
                <button
                  type="button"
                  onClick={() => toggle(type)}
                  className="flex w-full items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${TYPE_COLORS[type]}`} />
                    <span className="text-sm font-semibold text-foreground">{TYPE_LABELS[type]}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {items.length}
                    </span>
                  </div>
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>

                {!isCollapsed && (
                  <div className="border-t border-border px-4 py-2 space-y-1">
                    {items.map((row) => (
                      <div key={row.accountId} className="flex items-center justify-between rounded border border-border p-2">
                        <div>
                          <span className="mr-1.5 font-mono text-xs text-muted-foreground">{row.accountNumber}</span>
                          <span className="text-sm text-foreground">{row.accountName}</span>
                        </div>
                        <span className="text-sm tabular-nums text-foreground">
                          {row.debitBalance > 0
                            ? formatAccountingMoney(row.debitBalance)
                            : formatAccountingMoney(row.creditBalance)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Totals card */}
          <div className="rounded-lg border border-border bg-muted p-3 space-y-1">
            <div className="flex justify-between text-sm font-bold">
              <span>Total Debits</span>
              <span className="tabular-nums">{formatAccountingMoney(totalDebits)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold">
              <span>Total Credits</span>
              <span className="tabular-nums">{formatAccountingMoney(totalCredits)}</span>
            </div>
            {!isBalanced && (
              <div className="flex justify-between text-sm font-bold text-red-500">
                <span>Variance</span>
                <span className="tabular-nums">{formatAccountingMoney(variance)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Print footer ─────────────────────────────────── */}
      <div className="hidden print:block print:mt-4 print:text-xs print:text-muted-foreground print:italic">
        Generated {new Date().toLocaleDateString()}. {accountCount} accounts with activity.
      </div>
    </AccountingPageShell>
  );
}
