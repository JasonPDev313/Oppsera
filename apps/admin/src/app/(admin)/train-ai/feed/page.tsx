'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Filter } from 'lucide-react';
import { EvalTurnCard } from '@/components/EvalTurnCard';
import { TenantSelector } from '@/components/TenantSelector';
import { useEvalFeed } from '@/hooks/use-eval';
import type { EvalTurnSummary } from '@/types/eval';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'unreviewed', label: 'Unreviewed' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'flagged', label: 'Flagged' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'lowest_rated', label: 'Lowest rated' },
  { value: 'lowest_confidence', label: 'Lowest confidence' },
  { value: 'slowest', label: 'Slowest' },
  { value: 'most_flagged', label: 'Most flagged' },
];

export default function EvalFeedPage() {
  const [tenantId, setTenantId] = useState('');
  const [status, setStatus] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [search, setSearch] = useState('');
  const [allTurns, setAllTurns] = useState<EvalTurnSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const { data, isLoading, error, load } = useEvalFeed(tenantId || undefined);

  const fetchPage = useCallback(
    async (nextCursor?: string) => {
      const params: Record<string, string> = { sortBy };
      if (status) params.status = status;
      if (search) params.search = search;
      if (nextCursor) params.cursor = nextCursor;
      await load(params);
    },
    [load, sortBy, status, search],
  );

  useEffect(() => {
    setAllTurns([]);
    setCursor(null);
    fetchPage();
  }, [tenantId, status, sortBy, search, fetchPage]);

  useEffect(() => {
    if (!data) return;
    setAllTurns((prev) => {
      const existingIds = new Set(prev.map((t) => t.id));
      const newOnes = data.turns.filter((t) => !existingIds.has(t.id));
      return [...prev, ...newOnes];
    });
    setCursor(data.cursor);
    setHasMore(data.hasMore);
  }, [data]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Eval Feed</h1>
          <p className="text-sm text-slate-400 mt-0.5">Review AI assistant turns for quality</p>
        </div>
        <button
          onClick={() => { setAllTurns([]); setCursor(null); fetchPage(); }}
          disabled={isLoading}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
        <Filter size={14} className="text-slate-400" />

        <TenantSelector value={tenantId} onChange={(v) => setTenantId(v)} />

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <input
          type="search"
          placeholder="Search messages…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-40 bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-1.5 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {allTurns.map((turn) => (
          <EvalTurnCard key={turn.id} turn={turn} />
        ))}

        {isLoading && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && allTurns.length === 0 && (
          <div className="text-center py-16 text-slate-500">
            No turns found matching the current filters.
          </div>
        )}

        {hasMore && !isLoading && (
          <button
            onClick={() => fetchPage(cursor ?? undefined)}
            className="w-full py-3 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-xl hover:border-slate-600 transition-colors"
          >
            Load more
          </button>
        )}
      </div>
    </div>
  );
}
