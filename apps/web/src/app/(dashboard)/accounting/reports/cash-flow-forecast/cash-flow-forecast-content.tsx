'use client';

import { useState, useMemo } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  ArrowUpCircle,
  Printer,
  Download,
  ChevronDown,
  ChevronRight,
  Search,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { useCashFlowForecast } from '@/hooks/use-statements';
import { useLocations } from '@/hooks/use-locations';
import { formatAccountingMoney } from '@/types/accounting';

// ── helpers ──────────────────────────────────────────────────

function formatDate(d: string): string {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShortDate(d: string): string {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── types ────────────────────────────────────────────────────

interface KPICardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}

// ── components ───────────────────────────────────────────────

function KPICard({ icon, label, value, accent }: KPICardProps) {
  return (
    <div className={`bg-surface border border-border rounded-lg p-4 flex items-center gap-3 ${accent}`}>
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-lg font-semibold text-foreground tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-surface border border-border rounded-lg p-4 h-20" />
        ))}
      </div>
      <div className="bg-surface border border-border rounded-lg p-4 h-10" />
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="bg-surface border border-border rounded-lg p-3 h-12" />
        ))}
      </div>
    </div>
  );
}

// ── main ─────────────────────────────────────────────────────

export default function CashFlowForecastContent() {
  const [forecastDays, setForecastDays] = useState(90);
  const [locationId, setLocationId] = useState('');
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { data: locations } = useLocations();
  const { data, isLoading, error, mutate } = useCashFlowForecast({
    days: forecastDays,
    locationId: locationId || undefined,
  });

  // Separate inflows and outflows
  const { inflows, outflows, totalInflows, totalOutflows, netCashFlow } = useMemo(() => {
    const inf = data.upcomingItems.filter((i) => i.type === 'ar');
    const out = data.upcomingItems.filter((i) => i.type === 'ap');
    const tIn = inf.reduce((s, i) => s + i.amount, 0);
    const tOut = out.reduce((s, i) => s + i.amount, 0);
    return { inflows: inf, outflows: out, totalInflows: tIn, totalOutflows: tOut, netCashFlow: tIn - tOut };
  }, [data.upcomingItems]);

  // Search filter
  const filtered = useMemo(() => {
    if (!search) return { inflows, outflows };
    const q = search.toLowerCase();
    return {
      inflows: inflows.filter(
        (i) =>
          i.entityName.toLowerCase().includes(q) ||
          i.referenceNumber.toLowerCase().includes(q),
      ),
      outflows: outflows.filter(
        (i) =>
          i.entityName.toLowerCase().includes(q) ||
          i.referenceNumber.toLowerCase().includes(q),
      ),
    };
  }, [inflows, outflows, search]);

  // Section toggles
  const toggleSection = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(['inflows', 'outflows', 'daily']));

  // Projected balance for status banner
  const projectedBalance =
    forecastDays <= 30 ? data.projected30 : forecastDays <= 60 ? data.projected60 : data.projected90;

  // CSV export
  const handleExport = () => {
    const bom = '\uFEFF';
    const lines: string[] = [];

    lines.push('Cash Flow Forecast Report');
    lines.push(`As Of,${data.asOfDate}`);
    lines.push(`Forecast Period,${forecastDays} Days`);
    lines.push(`Starting Cash,${data.startingCash.toFixed(2)}`);
    lines.push(`Projected 30-Day,${data.projected30.toFixed(2)}`);
    lines.push(`Projected 60-Day,${data.projected60.toFixed(2)}`);
    lines.push(`Projected 90-Day,${data.projected90.toFixed(2)}`);
    lines.push('');

    lines.push('Upcoming Items');
    lines.push('Due Date,Type,Entity,Reference,Amount');
    for (const item of data.upcomingItems) {
      const row = [
        item.date,
        item.type === 'ar' ? 'Receivable' : 'Payable',
        `"${item.entityName.replace(/"/g, '""')}"`,
        item.referenceNumber,
        item.amount.toFixed(2),
      ];
      lines.push(row.join(','));
    }
    lines.push('');

    lines.push('Daily Forecast');
    lines.push('Date,Inflows,Outflows,Net,Running Balance');
    for (const day of data.dailyForecast) {
      lines.push(
        [day.date, day.inflows.toFixed(2), day.outflows.toFixed(2), day.net.toFixed(2), day.runningBalance.toFixed(2)].join(','),
      );
    }

    const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cash-flow-forecast-${data.asOfDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => window.print();

  // ── render ──────────────────────────────────────────────────

  if (error) {
    return (
      <AccountingPageShell
        title="Cash Flow Forecast"
        breadcrumbs={[
          { label: 'Accounting', href: '/accounting' },
          { label: 'Reports', href: '/accounting/reports' },
          { label: 'Cash Flow Forecast' },
        ]}
      >
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-500">
          Failed to load forecast data. Please try again.
        </div>
      </AccountingPageShell>
    );
  }

  return (
    <AccountingPageShell
      title="Cash Flow Forecast"
      subtitle={data.asOfDate ? `As of ${formatDate(data.asOfDate)}` : undefined}
      breadcrumbs={[
        { label: 'Accounting', href: '/accounting' },
        { label: 'Reports', href: '/accounting/reports' },
        { label: 'Cash Flow Forecast' },
      ]}
      actions={
        <div className="flex items-center gap-2 print:hidden">
          <button
            onClick={handlePrint}
            className="p-2 rounded-md hover:bg-accent text-muted-foreground"
            title="Print"
          >
            <Printer className="h-4 w-4" />
          </button>
          <button
            onClick={handleExport}
            className="p-2 rounded-md hover:bg-accent text-muted-foreground"
            title="Export CSV"
            disabled={isLoading}
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      }
    >
      {/* ── Print Header ─────────────────────────────────────── */}
      <div className="hidden print:block mb-4">
        <h1 className="text-xl font-bold text-foreground">Cash Flow Forecast</h1>
        <p className="text-sm text-muted-foreground">
          As of {formatDate(data.asOfDate)} &middot; {forecastDays}-Day Forecast
          {locationId && locations?.length
            ? ` · ${locations.find((l: { id: string; name: string }) => l.id === locationId)?.name ?? ''}`
            : ''}
        </p>
      </div>

      {/* ── Filters ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-6 print:hidden">
        <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-0.5">
          {[30, 60, 90].map((d) => (
            <button
              key={d}
              onClick={() => setForecastDays(d)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                forecastDays === d
                  ? 'bg-indigo-600 text-white'
                  : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              {d} Days
            </button>
          ))}
        </div>

        {locations && locations.length > 1 && (
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="bg-surface border border-input rounded-lg px-3 py-1.5 text-sm text-foreground"
          >
            <option value="">All Locations</option>
            {locations.map((l: { id: string; name: string }) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}

        <button
          onClick={() => mutate()}
          disabled={isLoading}
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : !data.asOfDate ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Wallet className="h-12 w-12 mb-3 opacity-40" />
          <p className="text-lg font-medium">No Forecast Data</p>
          <p className="text-sm mt-1">Cash flow forecast will appear once AP/AR data is available.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── KPI Cards ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              icon={<DollarSign className="h-5 w-5 text-indigo-500" />}
              label="Current Cash"
              value={formatAccountingMoney(data.startingCash)}
              accent=""
            />
            <KPICard
              icon={<Calendar className="h-5 w-5 text-blue-500" />}
              label="30-Day Projected"
              value={formatAccountingMoney(data.projected30)}
              accent={data.projected30 < 0 ? 'border-red-500/30' : ''}
            />
            <KPICard
              icon={<Calendar className="h-5 w-5 text-amber-500" />}
              label="60-Day Projected"
              value={formatAccountingMoney(data.projected60)}
              accent={data.projected60 < 0 ? 'border-red-500/30' : ''}
            />
            <KPICard
              icon={<Calendar className="h-5 w-5 text-emerald-500" />}
              label="90-Day Projected"
              value={formatAccountingMoney(data.projected90)}
              accent={data.projected90 < 0 ? 'border-red-500/30' : ''}
            />
          </div>

          {/* ── Status Banner ──────────────────────────────────── */}
          {projectedBalance < 0 ? (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 text-sm">
              <TrendingDown className="h-4 w-4 text-red-500 shrink-0" />
              <span className="text-red-500 font-medium">
                Cash position projected negative at {formatAccountingMoney(projectedBalance)} in {forecastDays} days
              </span>
            </div>
          ) : netCashFlow < 0 ? (
            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2.5 text-sm">
              <TrendingDown className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="text-amber-500 font-medium">
                Net cash flow is negative ({formatAccountingMoney(netCashFlow)}) but balance remains positive
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-2.5 text-sm">
              <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0" />
              <span className="text-emerald-500 font-medium">
                Cash position healthy — projected {formatAccountingMoney(projectedBalance)} in {forecastDays} days
              </span>
            </div>
          )}

          {/* ── Toolbar ────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <div className="relative flex-1 min-w-50 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search entities or references..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-sm bg-surface border border-input rounded-lg text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <button onClick={expandAll} className="hover:text-foreground transition-colors">
                Expand All
              </button>
              <span>|</span>
              <button onClick={collapseAll} className="hover:text-foreground transition-colors">
                Collapse All
              </button>
            </div>
          </div>

          {/* ── Desktop Table ──────────────────────────────────── */}
          <div className="hidden md:block">
            <div className="bg-surface border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Due Date
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Entity
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Reference
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Amount
                    </th>
                  </tr>
                </thead>

                {/* ── Inflows Section ───────────────────────────── */}
                <tbody className="print:break-inside-avoid">
                  <tr
                    className="border-b border-border bg-surface hover:bg-accent cursor-pointer print:bg-transparent"
                    onClick={() => toggleSection('inflows')}
                  >
                    <td colSpan={3} className="px-4 py-2.5 font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        {collapsed.has('inflows') ? (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
                        <span>Inflows (Receivables)</span>
                        <span className="text-xs text-muted-foreground font-normal ml-1">
                          {filtered.inflows.length} items
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-emerald-500 tabular-nums">
                      {formatAccountingMoney(totalInflows)}
                    </td>
                  </tr>
                  {!collapsed.has('inflows') &&
                    filtered.inflows.map((item) => (
                      <tr
                        key={`ar-${item.entityId}-${item.referenceNumber}`}
                        className="border-b border-border/50 hover:bg-accent/50"
                      >
                        <td className="px-4 py-2 pl-10 text-muted-foreground tabular-nums">
                          {formatShortDate(item.date)}
                        </td>
                        <td className="px-4 py-2 text-foreground">{item.entityName}</td>
                        <td className="px-4 py-2 text-muted-foreground font-mono text-xs">
                          {item.referenceNumber}
                        </td>
                        <td className="px-4 py-2 text-right text-emerald-500 tabular-nums">
                          {formatAccountingMoney(item.amount)}
                        </td>
                      </tr>
                    ))}
                  {!collapsed.has('inflows') && filtered.inflows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-3 pl-10 text-sm text-muted-foreground italic">
                        No upcoming receivables
                      </td>
                    </tr>
                  )}
                </tbody>

                {/* ── Outflows Section ──────────────────────────── */}
                <tbody className="print:break-inside-avoid">
                  <tr
                    className="border-b border-border bg-surface hover:bg-accent cursor-pointer print:bg-transparent"
                    onClick={() => toggleSection('outflows')}
                  >
                    <td colSpan={3} className="px-4 py-2.5 font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        {collapsed.has('outflows') ? (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" />
                        <span>Outflows (Payables)</span>
                        <span className="text-xs text-muted-foreground font-normal ml-1">
                          {filtered.outflows.length} items
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-red-500 tabular-nums">
                      ({formatAccountingMoney(totalOutflows)})
                    </td>
                  </tr>
                  {!collapsed.has('outflows') &&
                    filtered.outflows.map((item) => (
                      <tr
                        key={`ap-${item.entityId}-${item.referenceNumber}`}
                        className="border-b border-border/50 hover:bg-accent/50"
                      >
                        <td className="px-4 py-2 pl-10 text-muted-foreground tabular-nums">
                          {formatShortDate(item.date)}
                        </td>
                        <td className="px-4 py-2 text-foreground">{item.entityName}</td>
                        <td className="px-4 py-2 text-muted-foreground font-mono text-xs">
                          {item.referenceNumber}
                        </td>
                        <td className="px-4 py-2 text-right text-red-500 tabular-nums">
                          ({formatAccountingMoney(item.amount)})
                        </td>
                      </tr>
                    ))}
                  {!collapsed.has('outflows') && filtered.outflows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-3 pl-10 text-sm text-muted-foreground italic">
                        No upcoming payables
                      </td>
                    </tr>
                  )}
                </tbody>

                {/* ── Grand Totals ──────────────────────────────── */}
                <tfoot>
                  <tr className="border-t-2 border-border">
                    <td colSpan={3} className="px-4 py-3 font-semibold text-foreground">
                      Total Inflows
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-500 tabular-nums">
                      {formatAccountingMoney(totalInflows)}
                    </td>
                  </tr>
                  <tr className="border-t border-border/50">
                    <td colSpan={3} className="px-4 py-3 font-semibold text-foreground">
                      Total Outflows
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-red-500 tabular-nums">
                      ({formatAccountingMoney(totalOutflows)})
                    </td>
                  </tr>
                  <tr className="border-t-2 border-border bg-surface">
                    <td colSpan={3} className="px-4 py-3 font-bold text-foreground text-base">
                      Net Cash Flow
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-bold text-base tabular-nums ${
                        netCashFlow >= 0 ? 'text-emerald-500' : 'text-red-500'
                      }`}
                    >
                      {netCashFlow < 0
                        ? `(${formatAccountingMoney(Math.abs(netCashFlow))})`
                        : formatAccountingMoney(netCashFlow)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ── Mobile Cards ───────────────────────────────────── */}
          <div className="md:hidden space-y-4">
            {/* Inflows */}
            <div className="bg-surface border border-border rounded-lg overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent"
                onClick={() => toggleSection('inflows')}
              >
                <div className="flex items-center gap-2">
                  {collapsed.has('inflows') ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className="font-medium text-foreground">Inflows</span>
                  <span className="text-xs text-muted-foreground">{filtered.inflows.length}</span>
                </div>
                <span className="font-semibold text-emerald-500 tabular-nums">
                  {formatAccountingMoney(totalInflows)}
                </span>
              </button>
              {!collapsed.has('inflows') &&
                filtered.inflows.map((item) => (
                  <div
                    key={`m-ar-${item.entityId}-${item.referenceNumber}`}
                    className="border-t border-border/50 px-4 py-2.5 flex items-center justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">{item.entityName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatShortDate(item.date)} &middot; {item.referenceNumber}
                      </p>
                    </div>
                    <span className="text-sm text-emerald-500 tabular-nums shrink-0 ml-3">
                      {formatAccountingMoney(item.amount)}
                    </span>
                  </div>
                ))}
            </div>

            {/* Outflows */}
            <div className="bg-surface border border-border rounded-lg overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent"
                onClick={() => toggleSection('outflows')}
              >
                <div className="flex items-center gap-2">
                  {collapsed.has('outflows') ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                  <span className="font-medium text-foreground">Outflows</span>
                  <span className="text-xs text-muted-foreground">{filtered.outflows.length}</span>
                </div>
                <span className="font-semibold text-red-500 tabular-nums">
                  ({formatAccountingMoney(totalOutflows)})
                </span>
              </button>
              {!collapsed.has('outflows') &&
                filtered.outflows.map((item) => (
                  <div
                    key={`m-ap-${item.entityId}-${item.referenceNumber}`}
                    className="border-t border-border/50 px-4 py-2.5 flex items-center justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">{item.entityName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatShortDate(item.date)} &middot; {item.referenceNumber}
                      </p>
                    </div>
                    <span className="text-sm text-red-500 tabular-nums shrink-0 ml-3">
                      ({formatAccountingMoney(item.amount)})
                    </span>
                  </div>
                ))}
            </div>

            {/* Mobile totals */}
            <div className="bg-surface border-2 border-border rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Inflows</span>
                <span className="text-emerald-500 font-semibold tabular-nums">
                  {formatAccountingMoney(totalInflows)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Outflows</span>
                <span className="text-red-500 font-semibold tabular-nums">
                  ({formatAccountingMoney(totalOutflows)})
                </span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between">
                <span className="font-bold text-foreground">Net Cash Flow</span>
                <span
                  className={`font-bold tabular-nums ${netCashFlow >= 0 ? 'text-emerald-500' : 'text-red-500'}`}
                >
                  {netCashFlow < 0
                    ? `(${formatAccountingMoney(Math.abs(netCashFlow))})`
                    : formatAccountingMoney(netCashFlow)}
                </span>
              </div>
            </div>
          </div>

          {/* ── Daily Forecast Summary ─────────────────────────── */}
          {data.dailyForecast.length > 0 && (
            <div className="hidden md:block">
              <div className="bg-surface border border-border rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent print:bg-transparent"
                  onClick={() => toggleSection('daily')}
                >
                  <div className="flex items-center gap-2">
                    {collapsed.has('daily') ? (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                    <ArrowUpCircle className="h-4 w-4 text-indigo-500" />
                    <span className="font-medium text-foreground">Daily Forecast</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      {data.dailyForecast.length} days with activity
                    </span>
                  </div>
                </button>

                {!collapsed.has('daily') && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-t border-b border-border">
                        <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Date
                        </th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Inflows
                        </th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Outflows
                        </th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Net
                        </th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Running Balance
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.dailyForecast.map((day) => (
                        <tr
                          key={day.date}
                          className="border-b border-border/50 hover:bg-accent/50"
                        >
                          <td className="px-4 py-2 text-muted-foreground tabular-nums">
                            {formatShortDate(day.date)}
                          </td>
                          <td className="px-4 py-2 text-right text-emerald-500 tabular-nums">
                            {day.inflows > 0 ? formatAccountingMoney(day.inflows) : '\u2014'}
                          </td>
                          <td className="px-4 py-2 text-right text-red-500 tabular-nums">
                            {day.outflows > 0 ? `(${formatAccountingMoney(day.outflows)})` : '\u2014'}
                          </td>
                          <td
                            className={`px-4 py-2 text-right tabular-nums font-medium ${
                              day.net >= 0 ? 'text-emerald-500' : 'text-red-500'
                            }`}
                          >
                            {day.net < 0
                              ? `(${formatAccountingMoney(Math.abs(day.net))})`
                              : formatAccountingMoney(day.net)}
                          </td>
                          <td
                            className={`px-4 py-2 text-right tabular-nums font-semibold ${
                              day.runningBalance >= 0 ? 'text-foreground' : 'text-red-500'
                            }`}
                          >
                            {day.runningBalance < 0
                              ? `(${formatAccountingMoney(Math.abs(day.runningBalance))})`
                              : formatAccountingMoney(day.runningBalance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </AccountingPageShell>
  );
}
