'use client';

import { useState, useMemo } from 'react';
import {
  Search,
  Printer,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  X,
  ChevronDown,
  ChevronRight,
  Eye,
} from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { useAuditCoverage, usePaginatedAuditTrail } from '@/hooks/use-audit';

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

// ── Coverage bar ─────────────────────────────────────────────

function CoverageBar({ percent }: { percent: number }) {
  const color = percent >= 90 ? 'bg-green-500' : percent >= 70 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className={color} style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
  );
}

// ── Category colors ──────────────────────────────────────────

const CATEGORY_DOTS: Record<string, string> = {
  gl: 'bg-indigo-500',
  payments: 'bg-blue-500',
  ap: 'bg-amber-500',
  ar: 'bg-green-500',
  orders: 'bg-purple-500',
};

// ── Main ─────────────────────────────────────────────────────

export default function AuditTrailContent() {
  const today = new Date().toISOString().split('T')[0]!;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]!;

  const [from, setFrom] = useState(thirtyDaysAgo);
  const [to, setTo] = useState(today);
  const [searchTerm, setSearchTerm] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'coverage' | 'trail'>('coverage');

  // Coverage data
  const { data: coverage, isLoading: coverageLoading } = useAuditCoverage({ from, to });

  // Audit trail
  const {
    entries,
    hasMore,
    loadMore,
    isLoading: trailLoading,
  } = usePaginatedAuditTrail({ from, to, limit: 50 });

  const isLoading = tab === 'coverage' ? coverageLoading : trailLoading;

  // Coverage KPIs
  const totalTxns = coverage?.totalTransactions ?? 0;
  const totalAudit = coverage?.totalAuditEntries ?? 0;
  const totalGaps = coverage?.totalGaps ?? 0;
  const overallPct = coverage?.overallCoveragePercent ?? 0;

  // Toggle section collapse
  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Filter trail entries
  const filteredEntries = useMemo(() => {
    if (!searchTerm) return entries;
    const lc = searchTerm.toLowerCase();
    return entries.filter(
      (e) =>
        e.action.toLowerCase().includes(lc) ||
        e.entityType.toLowerCase().includes(lc) ||
        (e.entityId ?? '').toLowerCase().includes(lc),
    );
  }, [entries, searchTerm]);

  return (
    <AccountingPageShell
      title="Audit Trail"
      breadcrumbs={[
        { label: 'Reports', href: '/accounting/reports' },
        { label: 'Audit Trail' },
      ]}
    >
      {/* Print header */}
      <div className="hidden print:block print:mb-4">
        <h1 className="text-xl font-bold text-foreground">Audit Trail Report</h1>
        <p className="text-sm text-muted-foreground">
          {from} to {to}
        </p>
      </div>

      {/* Date selectors + tab */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <label className="text-sm font-medium text-foreground">From</label>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <label className="text-sm font-medium text-foreground">To</label>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <div className="flex rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setTab('coverage')}
            className={`px-3 py-2 text-sm ${
              tab === 'coverage'
                ? 'bg-indigo-600 text-white'
                : 'text-muted-foreground hover:bg-accent'
            } rounded-l-lg`}
          >
            Coverage
          </button>
          <button
            type="button"
            onClick={() => setTab('trail')}
            className={`px-3 py-2 text-sm ${
              tab === 'trail'
                ? 'bg-indigo-600 text-white'
                : 'text-muted-foreground hover:bg-accent'
            } rounded-r-lg`}
          >
            Activity Log
          </button>
        </div>
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

      {/* ── Coverage tab ── */}
      {!isLoading && tab === 'coverage' && coverage && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KPICard
              icon={ShieldCheck}
              label="Overall Coverage"
              value={`${overallPct}%`}
              accent={
                overallPct >= 90
                  ? 'bg-green-500/10 text-green-500'
                  : 'bg-amber-500/10 text-amber-500'
              }
            />
            <KPICard
              icon={Eye}
              label="Transactions"
              value={totalTxns.toLocaleString()}
              accent="bg-indigo-500/10 text-indigo-500"
            />
            <KPICard
              icon={CheckCircle2}
              label="Audit Entries"
              value={totalAudit.toLocaleString()}
              accent="bg-blue-500/10 text-blue-500"
            />
            <KPICard
              icon={AlertTriangle}
              label="Coverage Gaps"
              value={totalGaps.toLocaleString()}
              accent={
                totalGaps === 0
                  ? 'bg-green-500/10 text-green-500'
                  : 'bg-red-500/10 text-red-500'
              }
            />
          </div>

          {/* Status banner */}
          {totalGaps > 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-500 print:border-gray-300 print:bg-gray-100 print:text-foreground">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {totalGaps} transaction{totalGaps !== 1 ? 's' : ''} missing audit trail entries.
            </div>
          ) : totalTxns > 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-500 print:border-gray-300 print:bg-gray-100 print:text-foreground">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Full audit coverage — all transactions have audit trail entries.
            </div>
          ) : null}

          {/* Controls */}
          <div className="flex items-center justify-end gap-2 print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded border border-border p-1.5 text-muted-foreground hover:bg-accent"
              title="Print"
            >
              <Printer className="h-4 w-4" />
            </button>
          </div>

          {/* Category breakdown */}
          <div className="overflow-hidden rounded-lg border border-border print:border-gray-300">
            {coverage.items.map((item) => {
              const isOpen = !collapsed.has(item.category);
              return (
                <div
                  key={item.category}
                  className="border-b border-border last:border-0 print:border-gray-200 print:break-inside-avoid"
                >
                  <button
                    type="button"
                    onClick={() => toggleCollapse(item.category)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent print:hover:bg-transparent"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground print:hidden" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground print:hidden" />
                    )}
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${CATEGORY_DOTS[item.category] ?? 'bg-muted-foreground'}`}
                    />
                    <span className="flex-1 text-sm font-medium text-foreground">{item.label}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {item.transactionCount} txns
                    </span>
                    <span
                      className={`ml-2 text-sm font-semibold tabular-nums ${
                        item.coveragePercent >= 90
                          ? 'text-green-500'
                          : item.coveragePercent >= 70
                            ? 'text-amber-500'
                            : 'text-red-500'
                      }`}
                    >
                      {item.coveragePercent}%
                    </span>
                  </button>
                  {isOpen && (
                    <div className="space-y-2 px-4 pb-4 pl-12">
                      <CoverageBar percent={item.coveragePercent} />
                      <div className="grid grid-cols-3 gap-4 text-xs">
                        <div>
                          <p className="text-muted-foreground">Transactions</p>
                          <p className="tabular-nums font-medium text-foreground">
                            {item.transactionCount.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Audit Entries</p>
                          <p className="tabular-nums font-medium text-foreground">
                            {item.auditEntryCount.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Gaps</p>
                          <p
                            className={`tabular-nums font-medium ${
                              item.gapCount === 0 ? 'text-green-500' : 'text-red-500'
                            }`}
                          >
                            {item.gapCount.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {/* Grand total footer */}
            <div className="border-t-2 border-border bg-muted px-4 py-3 print:border-gray-400 print:bg-gray-100">
              <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                <span>Total</span>
                <div className="flex items-center gap-4">
                  <span className="tabular-nums text-muted-foreground">
                    {totalTxns.toLocaleString()} txns
                  </span>
                  <span
                    className={`tabular-nums ${overallPct >= 90 ? 'text-green-500' : 'text-amber-500'}`}
                  >
                    {overallPct}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Activity Log tab ── */}
      {!isLoading && tab === 'trail' && (
        <>
          {/* Search + controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search action, entity..."
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
              <span className="text-xs text-muted-foreground">{filteredEntries.length} entries</span>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded border border-border p-1.5 text-muted-foreground hover:bg-accent"
                title="Print"
              >
                <Printer className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Empty state */}
          {filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <ShieldCheck className="h-12 w-12 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No audit log entries for this period.
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
                        Timestamp
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Action
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Entity
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Actor
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((entry) => (
                      <tr
                        key={entry.id}
                        className="border-b border-border last:border-0 hover:bg-accent print:border-gray-200 print:break-inside-avoid"
                      >
                        <td className="px-3 py-2.5 text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                          {new Date(entry.createdAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-sm text-foreground">
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                            {entry.action}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-sm text-foreground">
                          <span className="text-muted-foreground">{entry.entityType}</span>
                          <span className="ml-1 font-mono text-xs text-muted-foreground">
                            {entry.entityId?.slice(0, 12)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-sm text-muted-foreground">
                          {entry.actorType === 'system' ? (
                            <span className="italic">system</span>
                          ) : (
                            entry.actorUserId?.slice(0, 12) ?? '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="space-y-3 md:hidden">
                {filteredEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-border bg-surface p-3 print:break-inside-avoid"
                  >
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                        {entry.action}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry.entityType} &middot;{' '}
                      {entry.actorType === 'system' ? 'system' : entry.actorUserId?.slice(0, 12)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="flex justify-center print:hidden">
                  <button
                    type="button"
                    onClick={() => loadMore()}
                    className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent"
                  >
                    Load more
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Coverage empty state */}
      {!isLoading && tab === 'coverage' && !coverage && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <ShieldCheck className="h-12 w-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            No audit coverage data available for this period.
          </p>
        </div>
      )}

      {/* Print footer */}
      <div className="hidden print:block print:mt-6 print:border-t print:border-gray-300 print:pt-2">
        <p className="text-xs text-muted-foreground">
          Generated {new Date().toLocaleDateString()} — Audit Trail — {from} to {to}
        </p>
      </div>
    </AccountingPageShell>
  );
}
