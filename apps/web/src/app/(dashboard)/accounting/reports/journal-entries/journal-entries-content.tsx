'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Download,
  Printer,
  ChevronDown,
  ChevronRight,
  Search,
  BookOpen,
  Hash,
  DollarSign,
  FileText,
  X,
} from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { ReportFilterBar } from '@/components/reports/report-filter-bar';
import { useReportFilters } from '@/hooks/use-report-filters';
import { useJournalEntries } from '@/hooks/use-journals';
import {
  formatAccountingMoney,
  SOURCE_MODULE_BADGES,
  ACCOUNTING_STATUS_CONFIG,
} from '@/types/accounting';
import type { JournalEntry } from '@/types/accounting';
import { buildQueryString } from '@/lib/query-string';

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

// ── SourceBadge ──────────────────────────────────────────────

const BADGE_COLORS: Record<string, string> = {
  success: 'bg-green-500/20 text-green-500',
  info: 'bg-blue-500/20 text-blue-500',
  purple: 'bg-purple-500/20 text-purple-500',
  orange: 'bg-orange-500/20 text-orange-500',
  indigo: 'bg-indigo-500/20 text-indigo-500',
  neutral: 'bg-muted text-muted-foreground',
};

function SourceBadge({ source }: { source: string }) {
  const badge = SOURCE_MODULE_BADGES[source];
  if (!badge) return <span className="text-xs text-muted-foreground">{source}</span>;
  const cls = BADGE_COLORS[badge.variant] ?? BADGE_COLORS.neutral;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {badge.label}
    </span>
  );
}

// ── StatusBadge ──────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  neutral: 'bg-muted text-muted-foreground',
  success: 'bg-green-500/10 text-green-500',
  warning: 'bg-amber-500/10 text-amber-500',
  error: 'bg-red-500/10 text-red-500',
  info: 'bg-blue-500/10 text-blue-500',
};

function StatusBadgeInline({ status }: { status: string }) {
  const cfg = ACCOUNTING_STATUS_CONFIG[status];
  if (!cfg) return <span className="text-xs text-muted-foreground">{status}</span>;
  const cls = STATUS_COLORS[cfg.variant] ?? STATUS_COLORS.neutral;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {cfg.label}
    </span>
  );
}

// ── Section config ───────────────────────────────────────────

const SECTION_CONFIG: Record<string, { label: string; color: string; dotColor: string }> = {
  manual: { label: 'Manual Entries', color: 'text-blue-500', dotColor: 'bg-blue-500' },
  pos: { label: 'POS Transactions', color: 'text-green-500', dotColor: 'bg-green-500' },
  ap: { label: 'Accounts Payable', color: 'text-purple-500', dotColor: 'bg-purple-500' },
  ar: { label: 'Accounts Receivable', color: 'text-orange-500', dotColor: 'bg-orange-500' },
  inventory: { label: 'Inventory', color: 'text-indigo-500', dotColor: 'bg-indigo-500' },
  pos_legacy: { label: 'Legacy POS', color: 'text-muted-foreground', dotColor: 'bg-muted-foreground' },
  recurring: { label: 'Recurring', color: 'text-cyan-500', dotColor: 'bg-cyan-500' },
  chargeback: { label: 'Chargebacks', color: 'text-red-500', dotColor: 'bg-red-500' },
  other: { label: 'Other', color: 'text-muted-foreground', dotColor: 'bg-muted-foreground' },
};

function getEntryTotals(entry: JournalEntry) {
  const lines = entry.lines ?? [];
  const debits = lines.reduce((s, l) => s + (l.debitAmount || 0), 0);
  const credits = lines.reduce((s, l) => s + (l.creditAmount || 0), 0);
  return { debits, credits, lineCount: lines.length };
}

// ── Main Component ───────────────────────────────────────────

export default function JournalEntriesReportContent() {
  const { locations } = useAuthContext();
  const { dateFrom, dateTo, preset, locationId, setDateRange, setLocationId } =
    useReportFilters();

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());

  const { data: entries, isLoading, mutate } = useJournalEntries({
    startDate: dateFrom,
    endDate: dateTo,
    status: statusFilter || undefined,
    sourceModule: sourceFilter || undefined,
    limit: 500,
  });

  // Compute totals and group by source
  const { filtered, groups, totals, statusCounts } = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    const filtered = entries.filter((e) => {
      if (!lowerSearch) return true;
      const jn = `#${e.journalNumber}`;
      return (
        jn.toLowerCase().includes(lowerSearch) ||
        (e.memo ?? '').toLowerCase().includes(lowerSearch) ||
        e.sourceModule.toLowerCase().includes(lowerSearch) ||
        (e.lines ?? []).some(
          (l) =>
            (l.accountName ?? '').toLowerCase().includes(lowerSearch) ||
            (l.accountNumber ?? '').toLowerCase().includes(lowerSearch),
        )
      );
    });

    let totalDebits = 0;
    let totalCredits = 0;
    const statusCounts: Record<string, number> = { draft: 0, posted: 0, voided: 0 };
    const groupMap: Record<string, JournalEntry[]> = {};

    for (const entry of filtered) {
      const { debits, credits } = getEntryTotals(entry);
      totalDebits += debits;
      totalCredits += credits;
      statusCounts[entry.status] = (statusCounts[entry.status] ?? 0) + 1;

      const key = SECTION_CONFIG[entry.sourceModule] ? entry.sourceModule : 'other';
      if (!groupMap[key]) groupMap[key] = [];
      groupMap[key]!.push(entry);
    }

    // Sort groups by defined order
    const sectionOrder = Object.keys(SECTION_CONFIG);
    const groups = sectionOrder
      .filter((k) => groupMap[k] && groupMap[k]!.length > 0)
      .map((k) => ({ key: k, entries: groupMap[k]! }));

    return {
      filtered,
      groups,
      totals: { debits: totalDebits, credits: totalCredits },
      statusCounts,
    };
  }, [entries, searchTerm]);

  const toggleSection = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleEntry = useCallback((id: string) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(groups.map((g) => g.key)));

  const statusSummary = [
    statusCounts.posted && `${statusCounts.posted} Posted`,
    statusCounts.draft && `${statusCounts.draft} Draft`,
    statusCounts.voided && `${statusCounts.voided} Voided`,
  ]
    .filter(Boolean)
    .join(', ');

  // Export URL
  const exportUrl = `/api/v1/accounting/journals${buildQueryString({
    startDate: dateFrom,
    endDate: dateTo,
    status: statusFilter || undefined,
    sourceModule: sourceFilter || undefined,
    format: 'csv',
  })}`;

  const isBalanced = Math.abs(totals.debits - totals.credits) < 0.01;

  return (
    <AccountingPageShell
      title="Journal Entry Report"
      breadcrumbs={[{ label: 'Reports', href: '/accounting/reports' }, { label: 'Journal Entries' }]}
    >
      {/* Print header */}
      <div className="hidden print:block print:mb-4">
        <h1 className="text-xl font-bold text-foreground">Journal Entry Report</h1>
        <p className="text-sm text-muted-foreground">
          Period: {dateFrom} to {dateTo}
          {statusFilter && ` | Status: ${statusFilter}`}
          {sourceFilter && ` | Source: ${SOURCE_MODULE_BADGES[sourceFilter]?.label ?? sourceFilter}`}
        </p>
      </div>

      {/* Filter bar */}
      <div className="print:hidden">
        <ReportFilterBar
          dateFrom={dateFrom}
          dateTo={dateTo}
          preset={preset}
          onDateChange={setDateRange}
          locationId={locationId}
          onLocationChange={setLocationId}
          locations={locations}
          isLoading={isLoading}
          onRefresh={mutate}
          hideLocation
        />
      </div>

      {/* Additional filters */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          aria-label="Source module filter"
        >
          <option value="">All Sources</option>
          {Object.entries(SECTION_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.label}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          aria-label="Status filter"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="posted">Posted</option>
          <option value="voided">Voided</option>
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
          <div className="h-10 animate-pulse rounded bg-muted" />
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded bg-muted" />
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      {!isLoading && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KPICard
              icon={Hash}
              label="Total Entries"
              value={filtered.length.toLocaleString()}
              accent="bg-indigo-500/10 text-indigo-500"
            />
            <KPICard
              icon={DollarSign}
              label="Total Debits"
              value={formatAccountingMoney(totals.debits)}
              accent="bg-green-500/10 text-green-500"
            />
            <KPICard
              icon={DollarSign}
              label="Total Credits"
              value={formatAccountingMoney(totals.credits)}
              accent="bg-blue-500/10 text-blue-500"
            />
            <KPICard
              icon={FileText}
              label="Status Summary"
              value={statusSummary || 'No entries'}
              accent="bg-amber-500/10 text-amber-500"
            />
          </div>

          {/* Balance status */}
          <div
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium ${
              isBalanced
                ? 'border-green-500/30 bg-green-500/10 text-green-500'
                : 'border-red-500/30 bg-red-500/10 text-red-500'
            } print:border-gray-300 print:bg-gray-100 print:text-foreground`}
          >
            {isBalanced
              ? 'All journal entries balance — total debits equal total credits.'
              : `Variance detected: ${formatAccountingMoney(Math.abs(totals.debits - totals.credits))}`}
          </div>

          {/* Search + controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search journal #, memo, account..."
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
              <span className="text-xs text-muted-foreground">{filtered.length} entries</span>
              <button
                type="button"
                onClick={expandAll}
                className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
              >
                Expand All
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
              >
                Collapse All
              </button>
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
              <BookOpen className="h-12 w-12 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No journal entries found for this period.
              </p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-hidden rounded-lg border border-border print:border-gray-300">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted print:bg-gray-100 print:border-gray-300">
                      <th className="w-8 px-3 py-2.5" />
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Journal #
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Date
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Source
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Memo
                      </th>
                      <th className="px-3 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Lines
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Debits
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Credits
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((group) => {
                      const cfg = SECTION_CONFIG[group.key] ?? SECTION_CONFIG.other!;
                      const isCollapsed = collapsed.has(group.key);
                      const groupDebits = group.entries.reduce(
                        (s, e) => s + getEntryTotals(e).debits,
                        0,
                      );
                      const groupCredits = group.entries.reduce(
                        (s, e) => s + getEntryTotals(e).credits,
                        0,
                      );

                      return (
                        <SectionGroup
                          key={group.key}
                          sectionKey={group.key}
                          cfg={cfg}
                          entries={group.entries}
                          groupDebits={groupDebits}
                          groupCredits={groupCredits}
                          isCollapsed={isCollapsed}
                          onToggle={toggleSection}
                          expandedEntries={expandedEntries}
                          onToggleEntry={toggleEntry}
                        />
                      );
                    })}
                    {/* Grand totals */}
                    <tr className="border-t-2 border-border bg-muted font-semibold print:border-gray-400 print:bg-gray-100">
                      <td colSpan={6} className="px-3 py-3 text-sm text-foreground">
                        Grand Total ({filtered.length} entries)
                      </td>
                      <td className="px-3 py-3 text-right text-sm tabular-nums text-foreground">
                        {formatAccountingMoney(totals.debits)}
                      </td>
                      <td className="px-3 py-3 text-right text-sm tabular-nums text-foreground">
                        {formatAccountingMoney(totals.credits)}
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="space-y-4 md:hidden">
                {groups.map((group) => {
                  const cfg = SECTION_CONFIG[group.key] ?? SECTION_CONFIG.other!;
                  const isCollapsed = collapsed.has(group.key);
                  const groupDebits = group.entries.reduce(
                    (s, e) => s + getEntryTotals(e).debits,
                    0,
                  );
                  const groupCredits = group.entries.reduce(
                    (s, e) => s + getEntryTotals(e).credits,
                    0,
                  );

                  return (
                    <div key={group.key} className="rounded-lg border border-border bg-surface">
                      <button
                        type="button"
                        onClick={() => toggleSection(group.key)}
                        className="flex w-full items-center gap-2 px-4 py-3"
                      >
                        <span className={`h-2.5 w-2.5 rounded-full ${cfg.dotColor}`} />
                        <span className={`flex-1 text-left text-sm font-semibold ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                          {group.entries.length}
                        </span>
                        {isCollapsed ? (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                      {!isCollapsed && (
                        <div className="space-y-2 px-4 pb-4">
                          {group.entries.map((entry) => {
                            const { debits, credits, lineCount } = getEntryTotals(entry);
                            return (
                              <Link
                                key={entry.id}
                                href={`/accounting/journals/${entry.id}`}
                                className="block rounded-lg border border-border p-3 hover:border-muted-foreground print:break-inside-avoid"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-indigo-500">
                                    #{entry.journalNumber}
                                  </span>
                                  <StatusBadgeInline status={entry.status} />
                                </div>
                                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                                  <span>{entry.businessDate}</span>
                                  <span>{lineCount} lines</span>
                                </div>
                                {entry.memo && (
                                  <p className="mt-1 truncate text-xs text-muted-foreground">
                                    {entry.memo}
                                  </p>
                                )}
                                <div className="mt-2 flex justify-between text-xs">
                                  <span className="text-muted-foreground">
                                    Dr{' '}
                                    <span className="tabular-nums text-foreground">
                                      {formatAccountingMoney(debits)}
                                    </span>
                                  </span>
                                  <span className="text-muted-foreground">
                                    Cr{' '}
                                    <span className="tabular-nums text-foreground">
                                      {formatAccountingMoney(credits)}
                                    </span>
                                  </span>
                                </div>
                              </Link>
                            );
                          })}
                          {/* Section subtotals */}
                          <div className="flex justify-between border-t border-border pt-2 text-xs font-medium text-muted-foreground">
                            <span>{cfg.label} Subtotal</span>
                            <span className="tabular-nums">
                              Dr {formatAccountingMoney(groupDebits)} / Cr{' '}
                              {formatAccountingMoney(groupCredits)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Mobile grand total */}
                <div className="rounded-lg border-2 border-border bg-surface p-4">
                  <div className="flex justify-between text-sm font-semibold text-foreground">
                    <span>Grand Total</span>
                    <span className="tabular-nums">
                      {formatAccountingMoney(totals.debits)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{filtered.length} entries</span>
                    <span className="tabular-nums">
                      Cr {formatAccountingMoney(totals.credits)}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Print footer */}
          <div className="hidden print:block print:mt-6 print:border-t print:border-gray-300 print:pt-2">
            <p className="text-xs text-muted-foreground">
              Generated {new Date().toLocaleDateString()} — Journal Entry Report — {dateFrom} to{' '}
              {dateTo}
            </p>
          </div>
        </>
      )}
    </AccountingPageShell>
  );
}

// ── Desktop Section Group ────────────────────────────────────

function SectionGroup({
  sectionKey,
  cfg,
  entries,
  groupDebits,
  groupCredits,
  isCollapsed,
  onToggle,
  expandedEntries,
  onToggleEntry,
}: {
  sectionKey: string;
  cfg: { label: string; color: string; dotColor: string };
  entries: JournalEntry[];
  groupDebits: number;
  groupCredits: number;
  isCollapsed: boolean;
  onToggle: (key: string) => void;
  expandedEntries: Set<string>;
  onToggleEntry: (id: string) => void;
}) {
  return (
    <>
      {/* Section header */}
      <tr
        className="cursor-pointer border-b border-border bg-muted/50 hover:bg-accent print:bg-gray-50 print:border-gray-300"
        onClick={() => onToggle(sectionKey)}
      >
        <td className="px-3 py-2.5">
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </td>
        <td colSpan={5} className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${cfg.dotColor}`} />
            <span className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
              {entries.length}
            </span>
          </div>
        </td>
        <td className="px-3 py-2.5 text-right text-sm font-medium tabular-nums text-foreground">
          {formatAccountingMoney(groupDebits)}
        </td>
        <td className="px-3 py-2.5 text-right text-sm font-medium tabular-nums text-foreground">
          {formatAccountingMoney(groupCredits)}
        </td>
        <td />
      </tr>
      {/* Rows */}
      {!isCollapsed &&
        entries.map((entry) => {
          const { debits, credits, lineCount } = getEntryTotals(entry);
          const isExpanded = expandedEntries.has(entry.id);

          return (
            <EntryRow
              key={entry.id}
              entry={entry}
              debits={debits}
              credits={credits}
              lineCount={lineCount}
              isExpanded={isExpanded}
              onToggle={() => onToggleEntry(entry.id)}
            />
          );
        })}
    </>
  );
}

// ── Entry Row with expandable lines ──────────────────────────

function EntryRow({
  entry,
  debits,
  credits,
  lineCount,
  isExpanded,
  onToggle,
}: {
  entry: JournalEntry;
  debits: number;
  credits: number;
  lineCount: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="cursor-pointer border-b border-border last:border-0 hover:bg-accent print:border-gray-200 print:break-inside-avoid"
        onClick={onToggle}
      >
        <td className="px-3 py-2.5">
          {lineCount > 0 && (
            isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )
          )}
        </td>
        <td className="px-3 py-2.5 text-sm">
          <Link
            href={`/accounting/journals/${entry.id}`}
            className="font-medium text-indigo-500 hover:text-indigo-400"
            onClick={(e) => e.stopPropagation()}
          >
            #{entry.journalNumber}
          </Link>
        </td>
        <td className="px-3 py-2.5 text-sm text-foreground">{entry.businessDate}</td>
        <td className="px-3 py-2.5 text-sm">
          <SourceBadge source={entry.sourceModule} />
        </td>
        <td className="max-w-48 truncate px-3 py-2.5 text-sm text-muted-foreground">
          {entry.memo ?? '—'}
        </td>
        <td className="px-3 py-2.5 text-center text-sm tabular-nums text-muted-foreground">
          {lineCount}
        </td>
        <td className="px-3 py-2.5 text-right text-sm tabular-nums text-foreground">
          {formatAccountingMoney(debits)}
        </td>
        <td className="px-3 py-2.5 text-right text-sm tabular-nums text-foreground">
          {formatAccountingMoney(credits)}
        </td>
        <td className="px-3 py-2.5 text-sm">
          <StatusBadgeInline status={entry.status} />
        </td>
      </tr>
      {/* Expanded journal lines */}
      {isExpanded &&
        (entry.lines ?? []).map((line, idx) => (
          <tr
            key={line.id ?? idx}
            className="border-b border-border/50 bg-muted/30 print:bg-gray-50 print:border-gray-200"
          >
            <td />
            <td />
            <td className="py-1.5 pl-3 text-xs text-muted-foreground">
              {line.accountNumber ?? ''}
            </td>
            <td colSpan={2} className="py-1.5 pl-3 text-xs text-foreground">
              {line.accountName ?? 'Unknown Account'}
              {line.memo && (
                <span className="ml-2 text-muted-foreground">— {line.memo}</span>
              )}
            </td>
            <td />
            <td className="py-1.5 pr-3 text-right text-xs tabular-nums text-foreground">
              {line.debitAmount ? formatAccountingMoney(line.debitAmount) : ''}
            </td>
            <td className="py-1.5 pr-3 text-right text-xs tabular-nums text-foreground">
              {line.creditAmount ? formatAccountingMoney(line.creditAmount) : ''}
            </td>
            <td />
          </tr>
        ))}
    </>
  );
}
