'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Plus, Search, ChevronDown, MoreHorizontal, CheckCircle, XCircle } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { StatusBadge } from '@/components/accounting/status-badge';
import { AccountingEmptyState } from '@/components/accounting/accounting-empty-state';
import { useJournalEntries, type JournalFilters } from '@/hooks/use-journals';
import { formatAccountingMoney, SOURCE_MODULE_BADGES } from '@/types/accounting';
import type { JournalEntry } from '@/types/accounting';

function getDefaultDateRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    startDate: start.toISOString().split('T')[0]!,
    endDate: now.toISOString().split('T')[0]!,
  };
}

export default function JournalsContent() {
  const defaults = getDefaultDateRange();
  const [filters, setFilters] = useState<JournalFilters>({
    startDate: defaults.startDate,
    endDate: defaults.endDate,
  });
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(true);

  const queryFilters = useMemo(() => ({
    ...filters,
    search: search.trim() || undefined,
    limit: 50,
  }), [filters, search]);

  const { data: entries, isLoading, meta, mutate } = useJournalEntries(queryFilters);

  const sourceModules = ['manual', 'pos', 'ap', 'ar', 'inventory'];

  return (
    <AccountingPageShell
      title="Journal Entries"
      breadcrumbs={[{ label: 'Journals' }]}
      actions={
        <Link
          href="/accounting/journals/new"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" />
          New Entry
        </Link>
      }
    >
      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by journal # or memo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface py-2 pl-10 pr-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((f) => !f)}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground sm:hidden"
          >
            Filters <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Filter row */}
        <div className={`flex flex-wrap gap-3 ${showFilters ? '' : 'hidden sm:flex'}`}>
          <input
            type="date"
            value={filters.startDate ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          <span className="self-center text-sm text-muted-foreground">to</span>
          <input
            type="date"
            value={filters.endDate ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          <select
            value={filters.sourceModule ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, sourceModule: e.target.value || undefined }))}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="">All Sources</option>
            {sourceModules.map((m) => (
              <option key={m} value={m}>{SOURCE_MODULE_BADGES[m]?.label ?? m}</option>
            ))}
          </select>
          <select
            value={filters.status ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined }))}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="posted">Posted</option>
            <option value="voided">Voided</option>
          </select>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && entries.length === 0 && (
        <AccountingEmptyState
          title="No journal entries found"
          description="Create a manual journal entry or adjust your filters."
          actionLabel="New Entry"
          actionHref="/accounting/journals/new"
        />
      )}

      {/* Table */}
      {!isLoading && entries.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-hidden rounded-lg border border-border bg-surface">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Journal #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Memo</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Debits</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Credits</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <JournalRow key={entry.id} entry={entry} onRefresh={mutate} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {entries.map((entry) => (
              <JournalCard key={entry.id} entry={entry} />
            ))}
          </div>

          {/* Load more */}
          {meta.hasMore && (
            <div className="flex justify-center pt-4">
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, cursor: meta.cursor ?? undefined }))}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                Load More
              </button>
            </div>
          )}
        </>
      )}
    </AccountingPageShell>
  );
}

function JournalRow({ entry, onRefresh: _onRefresh }: { entry: JournalEntry; onRefresh: () => void }) {
  const [showActions, setShowActions] = useState(false);
  const lines = entry.lines ?? [];
  const totalDebits = lines.reduce((sum, l) => sum + (l.debitAmount || 0), 0);
  const totalCredits = lines.reduce((sum, l) => sum + (l.creditAmount || 0), 0);
  const badge = SOURCE_MODULE_BADGES[entry.sourceModule];

  return (
    <tr className="border-b border-border last:border-0 hover:bg-accent">
      <td className="px-4 py-3 text-sm">
        <Link href={`/accounting/journals/${entry.id}`} className="font-medium text-indigo-500 hover:text-indigo-400">
          #{entry.journalNumber}
        </Link>
      </td>
      <td className="px-4 py-3 text-sm text-foreground">{entry.businessDate}</td>
      <td className="px-4 py-3 text-sm">
        {badge && (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            badge.variant === 'success' ? 'bg-green-500/20 text-green-500' :
            badge.variant === 'info' ? 'bg-blue-500/20 text-blue-500' :
            badge.variant === 'purple' ? 'bg-purple-500/20 text-purple-500' :
            badge.variant === 'orange' ? 'bg-orange-500/20 text-orange-500' :
            badge.variant === 'indigo' ? 'bg-indigo-500/20 text-indigo-500' :
            'bg-muted text-foreground'
          }`}>
            {badge.label}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground max-w-[200px] truncate">
        {entry.memo ?? '—'}
      </td>
      <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">
        {formatAccountingMoney(totalDebits)}
      </td>
      <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">
        {formatAccountingMoney(totalCredits)}
      </td>
      <td className="px-4 py-3 text-sm">
        <StatusBadge status={entry.status} />
      </td>
      <td className="px-4 py-3 text-right">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowActions(!showActions)}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {showActions && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowActions(false)} />
              <div className="absolute right-0 z-50 mt-1 w-36 rounded-lg border border-border bg-surface py-1 shadow-lg">
                <Link
                  href={`/accounting/journals/${entry.id}`}
                  className="block w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent"
                >
                  View
                </Link>
                {entry.status === 'draft' && (
                  <button
                    type="button"
                    onClick={() => { setShowActions(false); }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-green-500 hover:bg-green-500/10"
                  >
                    <CheckCircle className="h-3.5 w-3.5" /> Post
                  </button>
                )}
                {entry.status === 'posted' && (
                  <button
                    type="button"
                    onClick={() => { setShowActions(false); }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-500 hover:bg-red-500/10"
                  >
                    <XCircle className="h-3.5 w-3.5" /> Void
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function JournalCard({ entry }: { entry: JournalEntry }) {
  const lines = entry.lines ?? [];
  const totalDebits = lines.reduce((sum, l) => sum + (l.debitAmount || 0), 0);
  const totalCredits = lines.reduce((sum, l) => sum + (l.creditAmount || 0), 0);
  const badge = SOURCE_MODULE_BADGES[entry.sourceModule];

  return (
    <Link
      href={`/accounting/journals/${entry.id}`}
      className="block rounded-lg border border-border bg-surface p-4 space-y-2 hover:border-muted-foreground"
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-indigo-500">#{entry.journalNumber}</span>
        <StatusBadge status={entry.status} />
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{entry.businessDate}</span>
        {badge && (
          <span className="text-xs text-muted-foreground">{badge.label}</span>
        )}
      </div>
      {entry.memo && (
        <p className="text-sm text-muted-foreground truncate">{entry.memo}</p>
      )}
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Debits: <span className="tabular-nums text-foreground">{formatAccountingMoney(totalDebits)}</span></span>
        <span className="text-muted-foreground">Credits: <span className="tabular-nums text-foreground">{formatAccountingMoney(totalCredits)}</span></span>
      </div>
    </Link>
  );
}
