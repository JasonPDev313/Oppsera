'use client';

import { useState, useMemo } from 'react';
import {
  Download,
  Printer,
  Search,
  Building2,
  DollarSign,
  AlertTriangle,
  Clock,
  X,
} from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { useAPAging } from '@/hooks/use-ap';
import { formatAccountingMoney } from '@/types/accounting';
import { buildQueryString } from '@/lib/query-string';

// ── Types (match actual API response shape) ──────────────────

interface AgingRow {
  vendorId: string;
  vendorName: string;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
  total: number;
}

interface AgingReport {
  asOfDate: string;
  vendors: AgingRow[];
  totals: {
    current: number;
    days1to30: number;
    days31to60: number;
    days61to90: number;
    days90plus: number;
    total: number;
  };
}

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

// ── Bucket bar ───────────────────────────────────────────────

const BUCKETS = [
  { key: 'current', label: 'Current', color: 'bg-green-500' },
  { key: 'days1to30', label: '1\u201330', color: 'bg-amber-500' },
  { key: 'days31to60', label: '31\u201360', color: 'bg-orange-500' },
  { key: 'days61to90', label: '61\u201390', color: 'bg-red-400' },
  { key: 'days90plus', label: '90+', color: 'bg-red-600' },
] as const;

function AgingBar({ row }: { row: AgingRow }) {
  if (row.total <= 0) return null;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
      {BUCKETS.map((b) => {
        const val = row[b.key] as number;
        if (val <= 0) return null;
        const pct = (val / row.total) * 100;
        return (
          <div
            key={b.key}
            className={`${b.color}`}
            style={{ width: `${pct}%` }}
            title={`${b.label}: ${formatAccountingMoney(val)}`}
          />
        );
      })}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────

export default function ApAgingReportContent() {
  const [asOfDate, setAsOfDate] = useState(
    () => new Date().toISOString().split('T')[0]!,
  );
  const [searchTerm, setSearchTerm] = useState('');

  const { data: rawData, isLoading, mutate } = useAPAging({ asOfDate });

  // The hook returns the full report object cast as APAgingRow[]
  const report = useMemo<AgingReport>(() => {
    const d = rawData as unknown;
    if (d && typeof d === 'object' && 'vendors' in (d as Record<string, unknown>)) {
      return d as AgingReport;
    }
    // Fallback: if data is actually an array
    const arr = Array.isArray(d) ? (d as AgingRow[]) : [];
    const totals = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0, total: 0 };
    for (const r of arr) {
      totals.current += r.current;
      totals.days1to30 += r.days1to30;
      totals.days31to60 += r.days31to60;
      totals.days61to90 += r.days61to90;
      totals.days90plus += r.days90plus ?? 0;
      totals.total += r.total;
    }
    return { asOfDate, vendors: arr, totals };
  }, [rawData, asOfDate]);

  // Filter
  const filtered = useMemo(() => {
    if (!searchTerm) return report.vendors;
    const lc = searchTerm.toLowerCase();
    return report.vendors.filter(
      (r) =>
        (r.vendorName ?? '').toLowerCase().includes(lc) ||
        r.vendorId.toLowerCase().includes(lc),
    );
  }, [report.vendors, searchTerm]);

  const pastDueTotal = report.totals.days1to30 + report.totals.days31to60 + report.totals.days61to90 + report.totals.days90plus;
  const overdueCount = report.vendors.filter(
    (r) => r.days1to30 + r.days31to60 + r.days61to90 + r.days90plus > 0,
  ).length;

  const exportUrl = `/api/v1/ap/aging${buildQueryString({ asOfDate, format: 'csv' })}`;

  return (
    <AccountingPageShell
      title="AP Aging Report"
      breadcrumbs={[{ label: 'Reports', href: '/accounting/reports' }, { label: 'AP Aging' }]}
    >
      {/* Print header */}
      <div className="hidden print:block print:mb-4">
        <h1 className="text-xl font-bold text-foreground">Accounts Payable Aging Report</h1>
        <p className="text-sm text-muted-foreground">As of {asOfDate}</p>
      </div>

      {/* Date selector */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <label className="text-sm font-medium text-foreground">As of Date</label>
        <input
          type="date"
          value={asOfDate}
          onChange={(e) => setAsOfDate(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
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
            {Array.from({ length: 6 }).map((_, i) => (
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
              icon={DollarSign}
              label="Total Payable"
              value={formatAccountingMoney(report.totals.total)}
              accent="bg-indigo-500/10 text-indigo-500"
            />
            <KPICard
              icon={Clock}
              label="Current (Not Due)"
              value={formatAccountingMoney(report.totals.current)}
              accent="bg-green-500/10 text-green-500"
            />
            <KPICard
              icon={AlertTriangle}
              label="Past Due"
              value={formatAccountingMoney(pastDueTotal)}
              accent="bg-red-500/10 text-red-500"
            />
            <KPICard
              icon={Building2}
              label="Vendors"
              value={`${report.vendors.length} (${overdueCount} overdue)`}
              accent="bg-amber-500/10 text-amber-500"
            />
          </div>

          {/* Status banner */}
          {report.totals.total > 0 && (
            <div
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium ${
                pastDueTotal > 0
                  ? 'border-red-500/30 bg-red-500/10 text-red-500'
                  : 'border-green-500/30 bg-green-500/10 text-green-500'
              } print:border-gray-300 print:bg-gray-100 print:text-foreground`}
            >
              {pastDueTotal > 0
                ? `${formatAccountingMoney(pastDueTotal)} past due across ${overdueCount} vendor${overdueCount !== 1 ? 's' : ''}`
                : 'All payables are current \u2014 no past due amounts.'}
            </div>
          )}

          {/* Aging bucket legend */}
          <div className="flex flex-wrap gap-4 text-xs print:gap-3">
            {BUCKETS.map((b) => (
              <div key={b.key} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${b.color}`} />
                <span className="text-muted-foreground">{b.label}</span>
                <span className="tabular-nums text-foreground">
                  {formatAccountingMoney(report.totals[b.key])}
                </span>
              </div>
            ))}
          </div>

          {/* Search + controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search vendor..."
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
              <span className="text-xs text-muted-foreground">{filtered.length} vendors</span>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded border border-border p-1.5 text-muted-foreground hover:bg-accent"
                title="Print"
              >
                <Printer className="h-4 w-4" />
              </button>
              <a
                href={exportUrl}
                className="rounded border border-border p-1.5 text-muted-foreground hover:bg-accent"
                title="Export CSV"
              >
                <Download className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Empty state */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No outstanding payables as of {asOfDate}.
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
                        Vendor
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Current
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        1{'\u2013'}30
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        31{'\u2013'}60
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        61{'\u2013'}90
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        90+
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Total
                      </th>
                      <th className="hidden w-32 px-3 py-2.5 lg:table-cell" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => (
                      <tr
                        key={row.vendorId}
                        className="border-b border-border last:border-0 hover:bg-accent print:border-gray-200 print:break-inside-avoid"
                      >
                        <td className="px-3 py-2.5 text-sm font-medium text-foreground">
                          {row.vendorName ?? row.vendorId}
                        </td>
                        <td className="px-3 py-2.5 text-right text-sm tabular-nums text-foreground">
                          {row.current > 0 ? formatAccountingMoney(row.current) : '\u2014'}
                        </td>
                        <td className="px-3 py-2.5 text-right text-sm tabular-nums text-foreground">
                          {row.days1to30 > 0 ? (
                            <span className="text-amber-500">{formatAccountingMoney(row.days1to30)}</span>
                          ) : '\u2014'}
                        </td>
                        <td className="px-3 py-2.5 text-right text-sm tabular-nums text-foreground">
                          {row.days31to60 > 0 ? (
                            <span className="text-orange-500">{formatAccountingMoney(row.days31to60)}</span>
                          ) : '\u2014'}
                        </td>
                        <td className="px-3 py-2.5 text-right text-sm tabular-nums text-foreground">
                          {row.days61to90 > 0 ? (
                            <span className="text-red-400">{formatAccountingMoney(row.days61to90)}</span>
                          ) : '\u2014'}
                        </td>
                        <td className="px-3 py-2.5 text-right text-sm tabular-nums text-foreground">
                          {row.days90plus > 0 ? (
                            <span className="font-medium text-red-500">{formatAccountingMoney(row.days90plus)}</span>
                          ) : '\u2014'}
                        </td>
                        <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground">
                          {formatAccountingMoney(row.total)}
                        </td>
                        <td className="hidden px-3 py-2.5 lg:table-cell">
                          <AgingBar row={row} />
                        </td>
                      </tr>
                    ))}
                    {/* Grand totals */}
                    <tr className="border-t-2 border-border bg-muted font-semibold print:border-gray-400 print:bg-gray-100">
                      <td className="px-3 py-3 text-sm text-foreground">Total</td>
                      <td className="px-3 py-3 text-right text-sm tabular-nums text-foreground">
                        {formatAccountingMoney(report.totals.current)}
                      </td>
                      <td className="px-3 py-3 text-right text-sm tabular-nums text-amber-500">
                        {formatAccountingMoney(report.totals.days1to30)}
                      </td>
                      <td className="px-3 py-3 text-right text-sm tabular-nums text-orange-500">
                        {formatAccountingMoney(report.totals.days31to60)}
                      </td>
                      <td className="px-3 py-3 text-right text-sm tabular-nums text-red-400">
                        {formatAccountingMoney(report.totals.days61to90)}
                      </td>
                      <td className="px-3 py-3 text-right text-sm tabular-nums text-red-500">
                        {formatAccountingMoney(report.totals.days90plus)}
                      </td>
                      <td className="px-3 py-3 text-right text-sm tabular-nums text-foreground">
                        {formatAccountingMoney(report.totals.total)}
                      </td>
                      <td className="hidden lg:table-cell" />
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="space-y-3 md:hidden">
                {filtered.map((row) => (
                  <div
                    key={row.vendorId}
                    className="rounded-lg border border-border bg-surface p-4 print:break-inside-avoid"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">
                        {row.vendorName ?? row.vendorId}
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {formatAccountingMoney(row.total)}
                      </span>
                    </div>
                    <AgingBar row={row} />
                    <div className="mt-2 grid grid-cols-5 gap-1 text-center text-xs">
                      {BUCKETS.map((b) => (
                        <div key={b.key}>
                          <p className="text-muted-foreground">{b.label}</p>
                          <p className="tabular-nums text-foreground">
                            {formatAccountingMoney(row[b.key])}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Mobile total */}
                <div className="rounded-lg border-2 border-border bg-surface p-4">
                  <div className="flex justify-between text-sm font-semibold text-foreground">
                    <span>Total Payable</span>
                    <span className="tabular-nums">{formatAccountingMoney(report.totals.total)}</span>
                  </div>
                  <div className="mt-1 grid grid-cols-5 gap-1 text-center text-xs">
                    {BUCKETS.map((b) => (
                      <div key={b.key}>
                        <p className="text-muted-foreground">{b.label}</p>
                        <p className="tabular-nums text-foreground">
                          {formatAccountingMoney(report.totals[b.key])}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Print footer */}
          <div className="hidden print:block print:mt-6 print:border-t print:border-gray-300 print:pt-2">
            <p className="text-xs text-muted-foreground">
              Generated {new Date().toLocaleDateString()} — AP Aging Report — As of {asOfDate}
            </p>
          </div>
        </>
      )}
    </AccountingPageShell>
  );
}
