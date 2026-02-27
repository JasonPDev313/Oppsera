'use client';

import { useState, useMemo } from 'react';
import {
  Download,
  Printer,
  Search,
  Landmark,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  X,
  Clock,
} from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { useBankReconciliations } from '@/hooks/use-bank-reconciliation';
import { formatAccountingMoney, BANK_REC_STATUS_CONFIG } from '@/types/accounting';

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

// ── Status badge ─────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-500/10 text-green-500 border-green-500/30',
  in_progress: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
};

function StatusBadge({ status }: { status: string }) {
  const config = BANK_REC_STATUS_CONFIG[status as keyof typeof BANK_REC_STATUS_CONFIG];
  const colors = STATUS_COLORS[status] ?? 'bg-muted text-muted-foreground border-border';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colors}`}>
      {config?.label ?? status}
    </span>
  );
}

// ── Main ─────────────────────────────────────────────────────

export default function BankReconciliationSummaryContent() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  const { data: items, isLoading } = useBankReconciliations({
    status: statusFilter || undefined,
  });

  const reconciliations = items ?? [];

  // Filter
  const filtered = useMemo(() => {
    if (!searchTerm) return reconciliations;
    const lc = searchTerm.toLowerCase();
    return reconciliations.filter(
      (r) =>
        (r.bankAccountName ?? '').toLowerCase().includes(lc) ||
        (r.glAccountNumber ?? '').toLowerCase().includes(lc),
    );
  }, [reconciliations, searchTerm]);

  // KPI metrics
  const totalReconciliations = reconciliations.length;
  const completedCount = reconciliations.filter((r) => r.status === 'completed').length;
  const inProgressCount = reconciliations.filter((r) => r.status === 'in_progress').length;
  const totalStatementBalance = reconciliations.reduce(
    (sum, r) => sum + (Number(r.statementEndingBalance) || 0),
    0,
  );
  const unreconciledDifference = reconciliations
    .filter((r) => r.status === 'in_progress')
    .reduce((sum, r) => sum + Math.abs(Number(r.difference) || 0), 0);

  return (
    <AccountingPageShell
      title="Bank Reconciliation Summary"
      breadcrumbs={[
        { label: 'Reports', href: '/accounting/reports' },
        { label: 'Bank Reconciliation' },
      ]}
    >
      {/* Print header */}
      <div className="hidden print:block print:mb-4">
        <h1 className="text-xl font-bold text-foreground">Bank Reconciliation Summary</h1>
        <p className="text-sm text-muted-foreground">
          Generated {new Date().toLocaleDateString()}
        </p>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <label className="text-sm font-medium text-foreground">Status</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">All</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
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
              icon={Landmark}
              label="Total Reconciliations"
              value={String(totalReconciliations)}
              accent="bg-indigo-500/10 text-indigo-500"
            />
            <KPICard
              icon={CheckCircle2}
              label="Completed"
              value={String(completedCount)}
              accent="bg-green-500/10 text-green-500"
            />
            <KPICard
              icon={Clock}
              label="In Progress"
              value={String(inProgressCount)}
              accent="bg-amber-500/10 text-amber-500"
            />
            <KPICard
              icon={DollarSign}
              label="Total Statement Balance"
              value={formatAccountingMoney(totalStatementBalance)}
              accent="bg-blue-500/10 text-blue-500"
            />
          </div>

          {/* Status banner */}
          {inProgressCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-500 print:border-gray-300 print:bg-gray-100 print:text-foreground">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {inProgressCount} reconciliation{inProgressCount !== 1 ? 's' : ''} in progress
              {unreconciledDifference > 0 &&
                ` — ${formatAccountingMoney(unreconciledDifference)} unreconciled difference`}
            </div>
          )}
          {inProgressCount === 0 && totalReconciliations > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-500 print:border-gray-300 print:bg-gray-100 print:text-foreground">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              All bank reconciliations are complete.
            </div>
          )}

          {/* Search + controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search bank account..."
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
              <span className="text-xs text-muted-foreground">{filtered.length} records</span>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded border border-border p-1.5 text-muted-foreground hover:bg-accent"
                title="Print"
              >
                <Printer className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  /* CSV export future */
                }}
                className="rounded border border-border p-1.5 text-muted-foreground hover:bg-accent"
                title="Export CSV"
              >
                <Download className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Empty state */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Landmark className="h-12 w-12 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No bank reconciliations found.
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
                        Bank Account
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        GL Account
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Statement Date
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Statement Balance
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Difference
                      </th>
                      <th className="px-3 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Items
                      </th>
                      <th className="px-3 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((rec) => {
                      const diff = Number(rec.difference) || 0;
                      return (
                        <tr
                          key={rec.id}
                          className="border-b border-border last:border-0 hover:bg-accent print:border-gray-200 print:break-inside-avoid"
                        >
                          <td className="px-3 py-2.5 text-sm font-medium text-foreground">
                            {rec.bankAccountName}
                          </td>
                          <td className="px-3 py-2.5 text-sm tabular-nums text-muted-foreground">
                            {rec.glAccountNumber}
                          </td>
                          <td className="px-3 py-2.5 text-sm text-foreground">
                            {rec.statementDate}
                          </td>
                          <td className="px-3 py-2.5 text-right text-sm tabular-nums text-foreground">
                            {formatAccountingMoney(Number(rec.statementEndingBalance) || 0)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-sm tabular-nums">
                            {diff === 0 ? (
                              <span className="text-green-500">$0.00</span>
                            ) : (
                              <span className="font-medium text-red-500">
                                {formatAccountingMoney(diff)}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center text-sm tabular-nums text-muted-foreground">
                            {rec.clearedCount}/{rec.itemCount}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <StatusBadge status={rec.status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="space-y-3 md:hidden">
                {filtered.map((rec) => {
                  const diff = Number(rec.difference) || 0;
                  return (
                    <div
                      key={rec.id}
                      className="rounded-lg border border-border bg-surface p-4 print:break-inside-avoid"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">
                          {rec.bankAccountName}
                        </span>
                        <StatusBadge status={rec.status} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        GL: {rec.glAccountNumber} &middot; {rec.statementDate}
                      </p>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                        <div>
                          <p className="text-muted-foreground">Statement</p>
                          <p className="tabular-nums font-medium text-foreground">
                            {formatAccountingMoney(Number(rec.statementEndingBalance) || 0)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Difference</p>
                          <p
                            className={`tabular-nums font-medium ${diff === 0 ? 'text-green-500' : 'text-red-500'}`}
                          >
                            {formatAccountingMoney(diff)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Cleared</p>
                          <p className="tabular-nums font-medium text-foreground">
                            {rec.clearedCount}/{rec.itemCount}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Print footer */}
          <div className="hidden print:block print:mt-6 print:border-t print:border-gray-300 print:pt-2">
            <p className="text-xs text-muted-foreground">
              Generated {new Date().toLocaleDateString()} — Bank Reconciliation Summary
            </p>
          </div>
        </>
      )}
    </AccountingPageShell>
  );
}
