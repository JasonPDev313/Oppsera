'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Download,
  Printer,
  DollarSign,
  BookOpen,
  ArrowUpDown,
  Search,
  X,
} from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { GLReadinessBanner } from '@/components/accounting/gl-readiness-banner';
import { AccountPicker } from '@/components/accounting/account-picker';
import { ReportFilterBar } from '@/components/reports/report-filter-bar';
import { useReportFilters } from '@/hooks/use-report-filters';
import { useGLDetail } from '@/hooks/use-journals';
import { formatAccountingMoney, SOURCE_MODULE_BADGES } from '@/types/accounting';
import { buildQueryString } from '@/lib/query-string';

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

// ── Source Badge ─────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  const badge = SOURCE_MODULE_BADGES[source];
  const label = badge?.label ?? source;
  const colorMap: Record<string, string> = {
    success: 'bg-green-500/10 text-green-500',
    purple: 'bg-violet-500/10 text-violet-500',
    orange: 'bg-amber-500/10 text-amber-500',
    indigo: 'bg-indigo-500/10 text-indigo-500',
    info: 'bg-sky-500/10 text-sky-500',
    neutral: 'bg-gray-500/10 text-muted-foreground',
  };
  const colors = colorMap[badge?.variant ?? 'neutral'] ?? colorMap.neutral;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${colors}`}>
      {label}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────

export default function GLDetailContent() {
  const { locations } = useAuthContext();
  const filters = useReportFilters({ defaultPreset: 'month_to_date' });
  const [accountId, setAccountId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const { data: rows, meta, isLoading, mutate } = useGLDetail({
    accountId,
    startDate: filters.dateFrom,
    endDate: filters.dateTo,
    locationId: filters.selectedLocationId,
  });

  // Search filter
  const term = search.toLowerCase().trim();
  const filtered = useMemo(
    () =>
      term
        ? rows.filter(
            (r) =>
              (r.memo ?? '').toLowerCase().includes(term) ||
              String(r.journalNumber).includes(term) ||
              r.sourceModule.toLowerCase().includes(term),
          )
        : rows,
    [rows, term],
  );

  // Computed stats
  const totalDebits = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredits = rows.reduce((s, r) => s + r.credit, 0);
  const transactionCount = rows.length;

  // Export
  const handleExport = () => {
    if (!accountId) return;
    const qs = buildQueryString({
      accountId,
      startDate: filters.dateFrom,
      endDate: filters.dateTo,
      locationId: filters.selectedLocationId,
      format: 'csv',
    });
    window.open(`/api/v1/accounting/reports/detail${qs}`, '_blank');
  };

  const handlePrint = () => window.print();

  // ── Render ────────────────────────────────────────────────

  return (
    <AccountingPageShell
      title="General Ledger Detail"
      breadcrumbs={[
        { label: 'Accounting' },
        { label: 'Reports' },
        { label: 'GL Detail' },
      ]}
      actions={
        <div className="flex items-center gap-2 print:hidden">
          {accountId && (
            <>
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
            </>
          )}
        </div>
      }
    >
      <GLReadinessBanner />

      {/* ── Print Header ─────────────────────────────────── */}
      <div className="hidden print:block print:mb-4">
        <h1 className="text-xl font-bold text-foreground">General Ledger Detail</h1>
        <p className="text-sm text-muted-foreground">
          Period: {filters.dateFrom} to {filters.dateTo}
        </p>
      </div>

      {/* ── Account Picker ───────────────────────────────── */}
      <div className="print:hidden">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-72">
            <label className="block text-sm font-medium text-foreground mb-1">Account</label>
            <AccountPicker value={accountId} onChange={setAccountId} />
          </div>
        </div>
      </div>

      {/* ── Filter Bar ───────────────────────────────────── */}
      {accountId && (
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
      )}

      {/* ── No Account Selected ──────────────────────────── */}
      {!accountId && (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <BookOpen className="h-10 w-10" />
          <p className="text-sm">Select a GL account above to view its transaction detail.</p>
        </div>
      )}

      {/* ── KPI Cards ────────────────────────────────────── */}
      {accountId && !isLoading && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 print:grid-cols-4 print:gap-2">
          <KPICard
            label="Opening Balance"
            value={formatAccountingMoney(meta.openingBalance)}
            icon={DollarSign}
          />
          <KPICard
            label="Period Debits"
            value={formatAccountingMoney(totalDebits)}
            icon={ArrowUpDown}
            accent="text-green-500"
          />
          <KPICard
            label="Period Credits"
            value={formatAccountingMoney(totalCredits)}
            icon={ArrowUpDown}
            accent="text-indigo-500"
          />
          <KPICard
            label="Closing Balance"
            value={formatAccountingMoney(meta.closingBalance)}
            icon={DollarSign}
            accent="text-amber-500"
          />
        </div>
      )}

      {/* ── Search ───────────────────────────────────────── */}
      {accountId && !isLoading && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <div className="relative flex-1 min-w-50 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search memo, journal #, source..."
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
          <span className="text-xs text-muted-foreground">
            {transactionCount} transaction{transactionCount !== 1 ? 's' : ''}
            {term ? ` (${filtered.length} matching)` : ''}
          </span>
        </div>
      )}

      {/* ── Loading Skeleton ─────────────────────────────── */}
      {accountId && isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted" />
          ))}
        </div>
      )}

      {/* ── Desktop Table ────────────────────────────────── */}
      {accountId && !isLoading && (
        <div className="hidden md:block overflow-hidden rounded-lg border border-border bg-surface print:block print:border-gray-300">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted print:bg-gray-100">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Journal #</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Memo</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground w-32">Debit</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground w-32">Credit</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground w-36">Balance</th>
              </tr>
            </thead>
            <tbody>
              {/* Opening balance */}
              <tr className="border-b border-border bg-indigo-500/10 print:bg-gray-50">
                <td colSpan={6} className="px-4 py-2 text-sm font-medium text-foreground">
                  Opening Balance
                </td>
                <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-foreground">
                  {formatAccountingMoney(meta.openingBalance)}
                </td>
              </tr>

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {term ? 'No transactions match your search.' : 'No transactions found for this period.'}
                  </td>
                </tr>
              )}

              {filtered.map((row, i) => (
                <tr key={`${row.journalId}-${i}`} className="border-b border-border last:border-0 hover:bg-accent/50">
                  <td className="px-4 py-2.5 text-sm text-foreground whitespace-nowrap">{row.date}</td>
                  <td className="px-4 py-2.5 text-sm">
                    <Link href={`/accounting/journals/${row.journalId}`} className="text-indigo-500 hover:underline">
                      #{row.journalNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <SourceBadge source={row.sourceModule} />
                  </td>
                  <td className="px-4 py-2.5 text-sm text-muted-foreground max-w-60 truncate">
                    {row.memo ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">
                    {row.debit > 0 ? formatAccountingMoney(row.debit) : ''}
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">
                    {row.credit > 0 ? formatAccountingMoney(row.credit) : ''}
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm font-medium tabular-nums text-foreground">
                    {formatAccountingMoney(row.runningBalance)}
                  </td>
                </tr>
              ))}
            </tbody>

            {/* Closing balance footer */}
            <tfoot>
              <tr className="border-t border-border bg-muted/30 print:bg-gray-50">
                <td colSpan={4} className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">
                  Period Totals
                </td>
                <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-foreground">
                  {totalDebits > 0 ? formatAccountingMoney(totalDebits) : ''}
                </td>
                <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-foreground">
                  {totalCredits > 0 ? formatAccountingMoney(totalCredits) : ''}
                </td>
                <td className="px-4 py-2" />
              </tr>
              <tr className="border-t-2 border-border bg-indigo-500/10 print:bg-gray-100">
                <td colSpan={6} className="px-4 py-3 text-sm font-bold text-foreground">
                  Closing Balance
                </td>
                <td className="px-4 py-3 text-right text-base font-bold tabular-nums text-foreground">
                  {formatAccountingMoney(meta.closingBalance)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Mobile Cards ─────────────────────────────────── */}
      {accountId && !isLoading && (
        <div className="space-y-3 md:hidden print:hidden">
          {/* Opening */}
          <div className="flex justify-between rounded-lg bg-indigo-500/10 p-3 text-sm">
            <span className="font-medium text-foreground">Opening Balance</span>
            <span className="font-semibold tabular-nums text-foreground">{formatAccountingMoney(meta.openingBalance)}</span>
          </div>

          {filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {term ? 'No transactions match your search.' : 'No transactions found for this period.'}
            </div>
          )}

          {filtered.map((row, i) => (
            <div key={`${row.journalId}-${i}`} className="rounded-lg border border-border p-3 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link href={`/accounting/journals/${row.journalId}`} className="text-sm font-medium text-indigo-500">
                    #{row.journalNumber}
                  </Link>
                  <SourceBadge source={row.sourceModule} />
                </div>
                <span className="text-xs text-muted-foreground">{row.date}</span>
              </div>
              {row.memo && <p className="text-xs text-muted-foreground truncate">{row.memo}</p>}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {row.debit > 0 ? `DR ${formatAccountingMoney(row.debit)}` : `CR ${formatAccountingMoney(row.credit)}`}
                </span>
                <span className="font-medium tabular-nums text-foreground">{formatAccountingMoney(row.runningBalance)}</span>
              </div>
            </div>
          ))}

          {/* Closing */}
          <div className="flex justify-between rounded-lg bg-indigo-500/10 p-3 text-sm">
            <span className="font-bold text-foreground">Closing Balance</span>
            <span className="font-bold tabular-nums text-foreground">{formatAccountingMoney(meta.closingBalance)}</span>
          </div>
        </div>
      )}

      {/* ── Print footer ─────────────────────────────────── */}
      <div className="hidden print:block print:mt-4 print:text-xs print:text-muted-foreground print:italic">
        Generated {new Date().toLocaleDateString()}. {transactionCount} transactions.
      </div>
    </AccountingPageShell>
  );
}
