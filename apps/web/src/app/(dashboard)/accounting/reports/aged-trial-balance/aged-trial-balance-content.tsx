'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Download,
  Printer,
  ChevronDown,
  ChevronRight,
  Search,
  DollarSign,
  Hash,
  Clock,
  AlertTriangle,
  X,
} from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { useAgedTrialBalance } from '@/hooks/use-statements';
import type { AgedTrialBalanceAccount } from '@/hooks/use-statements';
import { formatAccountingMoney } from '@/types/accounting';
import { DrillDownDrawer, DrillDownAmount } from '@/components/accounting/drill-down-drawer';

// ── Constants ─────────────────────────────────────────────────

const ACCOUNT_TYPE_ORDER = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const;

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expenses',
};

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  asset: 'bg-blue-500',
  liability: 'bg-amber-500',
  equity: 'bg-violet-500',
  revenue: 'bg-green-500',
  expense: 'bg-red-500',
};

const AGING_COLUMNS = [
  { key: 'current' as const, label: 'Current' },
  { key: 'days1to30' as const, label: '1-30' },
  { key: 'days31to60' as const, label: '31-60' },
  { key: 'days61to90' as const, label: '61-90' },
  { key: 'days90plus' as const, label: '90+' },
];

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

export default function AgedTrialBalanceContent() {
  const { locations } = useAuthContext();

  // ── Filters ──────────────────────────────────────────────
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [asOfDate, setAsOfDate] = useState(today);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');

  const { data, isLoading, mutate } = useAgedTrialBalance({
    asOfDate,
    locationId: selectedLocationId || undefined,
  });

  // ── Local state ──────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [drillDown, setDrillDown] = useState<{
    accountId: string;
    accountName: string;
  } | null>(null);

  // ── Derived data ──────────────────────────────────────────
  const filteredAccounts = useMemo(() => {
    if (!search.trim()) return data.accounts;
    const q = search.toLowerCase();
    return data.accounts.filter(
      (a) =>
        a.accountName.toLowerCase().includes(q) ||
        a.accountNumber.toLowerCase().includes(q),
    );
  }, [data.accounts, search]);

  const grouped = useMemo(() => {
    const result: Record<string, AgedTrialBalanceAccount[]> = {};
    for (const type of ACCOUNT_TYPE_ORDER) {
      const items = filteredAccounts.filter(
        (a) => a.accountType.toLowerCase() === type,
      );
      if (items.length > 0) {
        result[type] = items;
      }
    }
    return result;
  }, [filteredAccounts]);

  const activeSections = useMemo(
    () => ACCOUNT_TYPE_ORDER.filter((t) => grouped[t] && grouped[t].length > 0),
    [grouped],
  );

  const overdueTotal = useMemo(
    () =>
      Math.round(
        data.accounts.reduce(
          (s, a) => s + a.days1to30 + a.days31to60 + a.days61to90 + a.days90plus,
          0,
        ) * 100,
      ) / 100,
    [data.accounts],
  );

  const oldestBucketLabel = useMemo(() => {
    if (data.totals.days90plus !== 0) return '90+ Days';
    if (data.totals.days61to90 !== 0) return '61-90 Days';
    if (data.totals.days31to60 !== 0) return '31-60 Days';
    if (data.totals.days1to30 !== 0) return '1-30 Days';
    return 'Current';
  }, [data.totals]);

  const locationName = useMemo(() => {
    if (!selectedLocationId) return 'All Locations';
    return locations.find((l) => l.id === selectedLocationId)?.name ?? 'Unknown';
  }, [selectedLocationId, locations]);

  // ── Handlers ──────────────────────────────────────────────
  const toggleSection = useCallback((section: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => setCollapsedSections(new Set()), []);
  const collapseAll = useCallback(
    () => setCollapsedSections(new Set(activeSections)),
    [activeSections],
  );

  const handleExport = () => {
    const rows: string[][] = [
      ['Account #', 'Account Name', 'Type', 'Current', '1-30', '31-60', '61-90', '90+', 'Total'],
    ];
    for (const acct of data.accounts) {
      rows.push([
        acct.accountNumber,
        acct.accountName,
        acct.accountType,
        acct.current.toFixed(2),
        acct.days1to30.toFixed(2),
        acct.days31to60.toFixed(2),
        acct.days61to90.toFixed(2),
        acct.days90plus.toFixed(2),
        acct.total.toFixed(2),
      ]);
    }
    rows.push([
      '',
      'Grand Total',
      '',
      data.totals.current.toFixed(2),
      data.totals.days1to30.toFixed(2),
      data.totals.days31to60.toFixed(2),
      data.totals.days61to90.toFixed(2),
      data.totals.days90plus.toFixed(2),
      data.totals.total.toFixed(2),
    ]);
    const csv =
      '\uFEFF' + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aged-trial-balance-${asOfDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openDrillDown = useCallback((acct: AgedTrialBalanceAccount) => {
    setDrillDown({ accountId: acct.accountId, accountName: `${acct.accountNumber} — ${acct.accountName}` });
  }, []);

  // ── Render ────────────────────────────────────────────────
  return (
    <AccountingPageShell
      title="Aged Trial Balance"
      breadcrumbs={[
        { label: 'Reports', href: '/accounting/reports' },
        { label: 'Aged Trial Balance' },
      ]}
      actions={
        <div className="flex items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            disabled={data.accounts.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={data.accounts.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      }
    >
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label htmlFor="asOfDate" className="block text-xs font-medium text-muted-foreground mb-1">
              As of Date
            </label>
            <input
              id="asOfDate"
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          {locations.length > 1 && (
            <div>
              <label htmlFor="locationFilter" className="block text-xs font-medium text-muted-foreground mb-1">
                Location
              </label>
              <select
                id="locationFilter"
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">All Locations</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => mutate()}
              disabled={isLoading}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
            >
              {isLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block print:mb-4">
        <h2 className="text-lg font-bold">Aged Trial Balance</h2>
        <div className="mt-1 flex gap-4 text-sm text-gray-600">
          <span>As of: {asOfDate}</span>
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
      {!isLoading && data.accounts.length === 0 && (
        <div className="rounded-lg border border-border bg-surface p-12 text-center">
          <Clock className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <h3 className="mt-3 text-sm font-medium text-foreground">No Account Balances</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            No accounts with non-zero balances as of {asOfDate}.
          </p>
        </div>
      )}

      {/* Report content */}
      {!isLoading && data.accounts.length > 0 && (
        <div className="space-y-4">
          {/* KPI summary cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
            <KPICard
              label="Total Balance"
              value={formatAccountingMoney(data.totals.total)}
              icon={DollarSign}
              accent="text-indigo-500"
            />
            <KPICard
              label="Overdue Balance"
              value={formatAccountingMoney(overdueTotal)}
              icon={AlertTriangle}
              accent={overdueTotal > 0 ? 'text-amber-500' : 'text-green-500'}
            />
            <KPICard
              label="Accounts"
              value={`${data.accountCount}`}
              icon={Hash}
            />
            <KPICard
              label="Oldest Activity"
              value={oldestBucketLabel}
              icon={Clock}
              accent="text-sky-500"
            />
          </div>

          {/* Overdue banner */}
          {overdueTotal > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
              <span className="text-sm font-medium text-amber-500">
                {formatAccountingMoney(overdueTotal)} in balances are past current period
                across {data.accounts.filter(
                  (a) => a.days1to30 !== 0 || a.days31to60 !== 0 || a.days61to90 !== 0 || a.days90plus !== 0,
                ).length}{' '}
                accounts.
              </span>
            </div>
          )}

          {/* Toolbar: search + section controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter by account name or number..."
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
                  {filteredAccounts.length} of {data.accounts.length} accounts
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
            <span>{data.accountCount} accounts</span>
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
                    {AGING_COLUMNS.map((col) => (
                      <th key={col.key} className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {col.label}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Total
                    </th>
                  </tr>
                </thead>
                {activeSections.map((type) => {
                  const items = grouped[type]!;
                  const sectionTotals = {
                    current: items.reduce((s, a) => s + a.current, 0),
                    days1to30: items.reduce((s, a) => s + a.days1to30, 0),
                    days31to60: items.reduce((s, a) => s + a.days31to60, 0),
                    days61to90: items.reduce((s, a) => s + a.days61to90, 0),
                    days90plus: items.reduce((s, a) => s + a.days90plus, 0),
                    total: items.reduce((s, a) => s + a.total, 0),
                  };
                  const isCollapsed = collapsedSections.has(type);

                  return (
                    <tbody key={type} className="print:break-inside-avoid">
                      {/* Section header */}
                      <tr
                        className="cursor-pointer select-none border-b border-border bg-muted/60 transition-colors hover:bg-muted print:cursor-default print:bg-gray-50"
                        onClick={() => toggleSection(type)}
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
                            <span className={`inline-block h-2.5 w-2.5 rounded-full ${ACCOUNT_TYPE_COLORS[type] ?? 'bg-gray-500'}`} />
                            <span className="text-sm font-semibold tracking-wide text-foreground">
                              {ACCOUNT_TYPE_LABELS[type] ?? type}
                            </span>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground print:bg-gray-200">
                              {items.length}
                            </span>
                          </div>
                        </td>
                        {AGING_COLUMNS.map((col) => (
                          <td key={col.key} className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground">
                            {sectionTotals[col.key] !== 0 ? formatAccountingMoney(sectionTotals[col.key]) : ''}
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground">
                          {sectionTotals.total !== 0 ? formatAccountingMoney(sectionTotals.total) : ''}
                        </td>
                      </tr>

                      {/* Detail rows */}
                      {!isCollapsed &&
                        items.map((acct) => (
                          <tr
                            key={acct.accountId}
                            className="border-b border-border/50 transition-colors last:border-border hover:bg-accent/30"
                          >
                            <td className="print:hidden" />
                            <td className="py-2 pl-10 pr-4 text-sm text-foreground print:pl-6">
                              <span className="font-mono text-muted-foreground">{acct.accountNumber}</span>
                              <span className="ml-2">{acct.accountName}</span>
                            </td>
                            {AGING_COLUMNS.map((col) => (
                              <td key={col.key} className="px-4 py-2 text-right text-sm tabular-nums text-foreground">
                                {acct[col.key] !== 0 ? (
                                  <DrillDownAmount onClick={() => openDrillDown(acct)}>
                                    {formatAccountingMoney(acct[col.key])}
                                  </DrillDownAmount>
                                ) : (
                                  ''
                                )}
                              </td>
                            ))}
                            <td className="px-4 py-2 text-right text-sm font-medium tabular-nums text-foreground">
                              {acct.total !== 0 ? (
                                <DrillDownAmount onClick={() => openDrillDown(acct)}>
                                  {formatAccountingMoney(acct.total)}
                                </DrillDownAmount>
                              ) : (
                                ''
                              )}
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
                    <td className="px-4 py-3 text-sm text-foreground">
                      Grand Total
                    </td>
                    {AGING_COLUMNS.map((col) => (
                      <td key={col.key} className="px-4 py-3 text-right text-sm tabular-nums text-foreground">
                        {formatAccountingMoney(data.totals[col.key])}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">
                      {formatAccountingMoney(data.totals.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Mobile card layout */}
          <div className="space-y-3 md:hidden print:hidden">
            {activeSections.map((type) => {
              const items = grouped[type]!;
              const sectionTotal = items.reduce((s, a) => s + a.total, 0);
              const isCollapsed = collapsedSections.has(type);

              return (
                <div key={type} className="overflow-hidden rounded-lg border border-border bg-surface">
                  <button
                    type="button"
                    onClick={() => toggleSection(type)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2.5">
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className={`h-2.5 w-2.5 rounded-full ${ACCOUNT_TYPE_COLORS[type] ?? 'bg-gray-500'}`} />
                      <span className="text-sm font-semibold text-foreground">
                        {ACCOUNT_TYPE_LABELS[type] ?? type}
                      </span>
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                        {items.length}
                      </span>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {formatAccountingMoney(sectionTotal)}
                    </span>
                  </button>

                  {!isCollapsed && (
                    <div className="border-t border-border/50 divide-y divide-border/30">
                      {items.map((acct) => (
                        <div key={acct.accountId} className="px-4 py-2.5">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-mono text-xs text-muted-foreground">{acct.accountNumber}</span>
                              <span className="ml-2 text-sm font-medium text-foreground">{acct.accountName}</span>
                            </div>
                            <span className="text-sm font-semibold tabular-nums text-foreground">
                              {formatAccountingMoney(acct.total)}
                            </span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-muted-foreground">
                            {acct.current !== 0 && <span>Current: {formatAccountingMoney(acct.current)}</span>}
                            {acct.days1to30 !== 0 && <span>1-30: {formatAccountingMoney(acct.days1to30)}</span>}
                            {acct.days31to60 !== 0 && <span>31-60: {formatAccountingMoney(acct.days31to60)}</span>}
                            {acct.days61to90 !== 0 && <span>61-90: {formatAccountingMoney(acct.days61to90)}</span>}
                            {acct.days90plus !== 0 && <span>90+: {formatAccountingMoney(acct.days90plus)}</span>}
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
              {AGING_COLUMNS.map((col) => (
                <div key={col.key} className="flex justify-between text-sm text-foreground">
                  <span>{col.label}</span>
                  <span className="tabular-nums">{formatAccountingMoney(data.totals[col.key])}</span>
                </div>
              ))}
              <div className="border-t border-border pt-2">
                <div className="flex justify-between text-sm font-bold text-foreground">
                  <span>Total</span>
                  <span className="tabular-nums">{formatAccountingMoney(data.totals.total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Drill-down drawer */}
      {drillDown && (
        <DrillDownDrawer
          accountId={drillDown.accountId}
          accountName={drillDown.accountName}
          to={asOfDate}
          locationId={selectedLocationId || undefined}
          onClose={() => setDrillDown(null)}
        />
      )}
    </AccountingPageShell>
  );
}
