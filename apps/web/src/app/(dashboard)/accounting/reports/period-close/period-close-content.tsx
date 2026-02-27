'use client';

import { useState, useMemo } from 'react';
import {
  Printer,
  CalendarCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Lock,
  X,
  Search,
} from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { useClosePeriods, useClosePeriod } from '@/hooks/use-statements';

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

// ── Status config ────────────────────────────────────────────

const PERIOD_STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; colors: string }
> = {
  open: {
    label: 'Open',
    icon: Clock,
    colors: 'bg-green-500/10 text-green-500 border-green-500/30',
  },
  in_review: {
    label: 'In Review',
    icon: AlertTriangle,
    colors: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  },
  closed: {
    label: 'Closed',
    icon: Lock,
    colors: 'bg-muted text-muted-foreground border-border',
  },
};

const CHECKLIST_STATUS_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  pass: { icon: CheckCircle2, color: 'text-green-500' },
  fail: { icon: X, color: 'text-red-500' },
  warning: { icon: AlertTriangle, color: 'text-amber-500' },
};

// ── Main ─────────────────────────────────────────────────────

export default function PeriodCloseContent() {
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const { data: periods, isLoading: periodsLoading } = useClosePeriods();

  // Fetch detail for selected period
  const { data: periodDetail, isLoading: detailLoading } = useClosePeriod(
    selectedPeriod ?? '',
  );

  const isLoading = periodsLoading;

  // KPI metrics
  const allPeriods = periods ?? [];
  const openCount = allPeriods.filter((p) => p.status === 'open').length;
  const reviewCount = allPeriods.filter((p) => p.status === 'in_review').length;
  const closedCount = allPeriods.filter((p) => p.status === 'closed').length;

  // Active period with checklist
  const activePeriod = selectedPeriod
    ? periodDetail
    : allPeriods.find((p) => p.status === 'open' || p.status === 'in_review') ?? null;

  // Filter checklist
  const checklist = activePeriod?.checklist ?? [];
  const filteredChecklist = useMemo(() => {
    if (!searchTerm) return checklist;
    const lc = searchTerm.toLowerCase();
    return checklist.filter(
      (item) =>
        item.label.toLowerCase().includes(lc) ||
        (item.detail ?? '').toLowerCase().includes(lc),
    );
  }, [checklist, searchTerm]);

  const passCount = checklist.filter((i) => i.status === 'pass').length;
  const failCount = checklist.filter((i) => i.status === 'fail').length;
  const warnCount = checklist.filter((i) => i.status === 'warning').length;

  return (
    <AccountingPageShell
      title="Period Close"
      breadcrumbs={[
        { label: 'Reports', href: '/accounting/reports' },
        { label: 'Period Close' },
      ]}
    >
      {/* Print header */}
      <div className="hidden print:block print:mb-4">
        <h1 className="text-xl font-bold text-foreground">Period Close Report</h1>
        <p className="text-sm text-muted-foreground">
          Generated {new Date().toLocaleDateString()}
          {activePeriod && ` — Period: ${activePeriod.postingPeriod}`}
        </p>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <label className="text-sm font-medium text-foreground">Period</label>
        <select
          value={selectedPeriod ?? ''}
          onChange={(e) => setSelectedPeriod(e.target.value || null)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">Current Period</option>
          {allPeriods.map((p) => (
            <option key={p.id} value={p.postingPeriod}>
              {p.postingPeriod} ({PERIOD_STATUS_CONFIG[p.status]?.label ?? p.status})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded border border-border p-1.5 text-muted-foreground hover:bg-accent"
          title="Print"
        >
          <Printer className="h-4 w-4" />
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
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-muted" />
            ))}
          </div>
        </div>
      )}

      {!isLoading && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KPICard
              icon={CalendarCheck}
              label="Total Periods"
              value={String(allPeriods.length)}
              accent="bg-indigo-500/10 text-indigo-500"
            />
            <KPICard
              icon={Clock}
              label="Open"
              value={String(openCount)}
              accent="bg-green-500/10 text-green-500"
            />
            <KPICard
              icon={AlertTriangle}
              label="In Review"
              value={String(reviewCount)}
              accent="bg-amber-500/10 text-amber-500"
            />
            <KPICard
              icon={Lock}
              label="Closed"
              value={String(closedCount)}
              accent="bg-muted text-muted-foreground"
            />
          </div>

          {/* Period list */}
          <div className="overflow-hidden rounded-lg border border-border print:border-gray-300">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted print:bg-gray-100 print:border-gray-300">
                  <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Period
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Status
                  </th>
                  <th className="hidden px-3 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground sm:table-cell">
                    Checklist
                  </th>
                  <th className="hidden px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground sm:table-cell">
                    Closed
                  </th>
                </tr>
              </thead>
              <tbody>
                {allPeriods.map((p) => {
                  const cfg = PERIOD_STATUS_CONFIG[p.status];
                  const isSelected =
                    selectedPeriod === p.postingPeriod ||
                    (!selectedPeriod && activePeriod?.id === p.id);
                  const pPass = p.checklist?.filter((i) => i.status === 'pass').length ?? 0;
                  const pTotal = p.checklist?.length ?? 0;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedPeriod(p.postingPeriod)}
                      className={`cursor-pointer border-b border-border last:border-0 hover:bg-accent print:border-gray-200 print:break-inside-avoid ${
                        isSelected ? 'bg-indigo-500/5' : ''
                      }`}
                    >
                      <td className="px-3 py-2.5 text-sm font-medium text-foreground">
                        {p.postingPeriod}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cfg?.colors ?? 'bg-muted text-muted-foreground border-border'}`}
                        >
                          {cfg?.label ?? p.status}
                        </span>
                      </td>
                      <td className="hidden px-3 py-2.5 text-center text-sm tabular-nums text-muted-foreground sm:table-cell">
                        {pTotal > 0 ? `${pPass}/${pTotal}` : '—'}
                      </td>
                      <td className="hidden px-3 py-2.5 text-sm text-muted-foreground sm:table-cell">
                        {p.closedAt ? new Date(p.closedAt).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Checklist detail for active/selected period */}
          {activePeriod && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Close Checklist — {activePeriod.postingPeriod}
                </h3>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-500" /> {passCount} pass
                  </span>
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-amber-500" /> {warnCount} warn
                  </span>
                  <span className="flex items-center gap-1">
                    <X className="h-3 w-3 text-red-500" /> {failCount} fail
                  </span>
                </div>
              </div>

              {/* Search */}
              {checklist.length > 5 && (
                <div className="relative max-w-sm print:hidden">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search checklist..."
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
              )}

              {/* Status banner */}
              {failCount > 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-500 print:border-gray-300 print:bg-gray-100 print:text-foreground">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {failCount} checklist item{failCount !== 1 ? 's' : ''} failed — resolve before closing.
                </div>
              ) : warnCount > 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-500 print:border-gray-300 print:bg-gray-100 print:text-foreground">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {warnCount} warning{warnCount !== 1 ? 's' : ''} — review before closing.
                </div>
              ) : checklist.length > 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-500 print:border-gray-300 print:bg-gray-100 print:text-foreground">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  All checklist items pass — ready to close.
                </div>
              ) : null}

              {/* Checklist items */}
              {detailLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-12 animate-pulse rounded bg-muted" />
                  ))}
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border print:border-gray-300">
                  {filteredChecklist.map((item, idx) => {
                    const cfg = CHECKLIST_STATUS_ICONS[item.status];
                    const StatusIcon = cfg?.icon ?? AlertTriangle;
                    return (
                      <div
                        key={idx}
                        className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-0 print:border-gray-200 print:break-inside-avoid"
                      >
                        <StatusIcon className={`mt-0.5 h-4 w-4 shrink-0 ${cfg?.color ?? 'text-muted-foreground'}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{item.label}</p>
                          {item.detail && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
                          )}
                        </div>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                            item.status === 'pass'
                              ? 'border-green-500/30 bg-green-500/10 text-green-500'
                              : item.status === 'fail'
                                ? 'border-red-500/30 bg-red-500/10 text-red-500'
                                : 'border-amber-500/30 bg-amber-500/10 text-amber-500'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                    );
                  })}

                  {/* Summary footer */}
                  <div className="border-t-2 border-border bg-muted px-4 py-3 print:border-gray-400 print:bg-gray-100">
                    <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                      <span>{checklist.length} checklist items</span>
                      <span
                        className={
                          failCount > 0
                            ? 'text-red-500'
                            : warnCount > 0
                              ? 'text-amber-500'
                              : 'text-green-500'
                        }
                      >
                        {passCount}/{checklist.length} passed
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {allPeriods.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <CalendarCheck className="h-12 w-12 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No close periods found. Periods are created during accounting close.
              </p>
            </div>
          )}

          {/* Print footer */}
          <div className="hidden print:block print:mt-6 print:border-t print:border-gray-300 print:pt-2">
            <p className="text-xs text-muted-foreground">
              Generated {new Date().toLocaleDateString()} — Period Close Report
            </p>
          </div>
        </>
      )}
    </AccountingPageShell>
  );
}
