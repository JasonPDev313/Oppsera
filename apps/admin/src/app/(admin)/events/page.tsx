'use client';

import { useState } from 'react';
import {
  RefreshCw,
  RotateCcw,
  CheckCircle,
  XCircle,
  Trash2,
  ChevronRight,
  Filter,
} from 'lucide-react';
import Link from 'next/link';
import {
  useDeadLetters,
  useDeadLetterStats,
  useDeadLetterActions,
} from '@/hooks/use-dead-letters';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'failed', label: 'Failed' },
  { value: 'retrying', label: 'Retrying' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'discarded', label: 'Discarded' },
];

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    failed: 'bg-red-100 text-red-700',
    retrying: 'bg-yellow-100 text-yellow-700',
    resolved: 'bg-green-100 text-green-700',
    discarded: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

function StatsCards({ stats }: { stats: { totalFailed: number; totalRetrying: number; totalResolved: number; totalDiscarded: number } | null }) {
  if (!stats) return null;
  const cards = [
    { label: 'Failed', value: stats.totalFailed, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Retrying', value: stats.totalRetrying, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { label: 'Resolved', value: stats.totalResolved, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Discarded', value: stats.totalDiscarded, color: 'text-gray-600', bg: 'bg-gray-50' },
  ];
  return (
    <div className="grid grid-cols-4 gap-4 mb-6">
      {cards.map((c) => (
        <div key={c.label} className={`${c.bg} rounded-lg p-4`}>
          <p className="text-xs font-medium text-gray-500">{c.label}</p>
          <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

export default function EventsPage() {
  const [statusFilter, setStatusFilter] = useState('failed');
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');
  const [resolveAction, setResolveAction] = useState<'resolve' | 'discard'>('resolve');

  const filters = {
    status: statusFilter || undefined,
    eventType: eventTypeFilter || undefined,
  };

  const { items, isLoading, hasMore, loadMore, refresh } = useDeadLetters(filters);
  const { stats, refresh: refreshStats } = useDeadLetterStats();
  const { retry, resolve, discard, isActing } = useDeadLetterActions();

  const handleRetry = async (id: string) => {
    const ok = await retry(id);
    if (ok) {
      refresh();
      refreshStats();
    }
  };

  const handleResolveSubmit = async () => {
    if (!resolveId) return;
    const ok = resolveAction === 'resolve'
      ? await resolve(resolveId, resolveNotes)
      : await discard(resolveId, resolveNotes);
    if (ok) {
      setResolveId(null);
      setResolveNotes('');
      refresh();
      refreshStats();
    }
  };

  const uniqueEventTypes = [...new Set(items.map((e) => e.eventType))];

  return (
    <div className="p-6 max-w-[1400px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Failed Events</h1>
          <p className="text-sm text-slate-400 mt-1">
            Events that exhausted retries. Inspect, retry, or resolve.
          </p>
        </div>
        <button
          onClick={() => { refresh(); refreshStats(); }}
          className="flex items-center gap-2 px-3 py-2 bg-slate-700 text-slate-200 rounded-lg text-sm hover:bg-slate-600 transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      <StatsCards stats={stats} />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <Filter size={14} className="text-slate-400" />
        <div className="flex gap-1">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === opt.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {uniqueEventTypes.length > 1 && (
          <select
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            className="bg-slate-700 text-slate-200 rounded-lg px-3 py-1.5 text-xs border-0"
          >
            <option value="">All Event Types</option>
            {uniqueEventTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
      </div>

      {/* Table */}
      {isLoading && items.length === 0 ? (
        <div className="text-center py-12 text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12">
          <CheckCircle className="mx-auto h-8 w-8 text-green-500 mb-3" />
          <p className="text-slate-300 font-medium">No failed events</p>
          <p className="text-sm text-slate-500 mt-1">All events are processing normally.</p>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className="text-left px-4 py-3 font-medium text-slate-400">Event Type</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Consumer</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Error</th>
                <th className="text-center px-4 py-3 font-medium text-slate-400">Attempts</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Status</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Failed At</th>
                <th className="text-right px-4 py-3 font-medium text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {items.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-700/50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/events/${entry.id}`}
                      className="text-indigo-400 hover:text-indigo-300 font-mono text-xs"
                    >
                      {entry.eventType}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-xs font-mono">{entry.consumerName}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs max-w-[300px] truncate">
                    {entry.errorMessage ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-300 text-xs">
                    {entry.attemptCount}/{entry.maxRetries}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={entry.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {new Date(entry.lastFailedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {entry.status === 'failed' && (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleRetry(entry.id)}
                          disabled={isActing}
                          className="p-1.5 rounded hover:bg-slate-600 text-blue-400 hover:text-blue-300 transition-colors"
                          title="Retry"
                        >
                          <RotateCcw size={14} />
                        </button>
                        <button
                          onClick={() => { setResolveId(entry.id); setResolveAction('resolve'); }}
                          disabled={isActing}
                          className="p-1.5 rounded hover:bg-slate-600 text-green-400 hover:text-green-300 transition-colors"
                          title="Resolve"
                        >
                          <CheckCircle size={14} />
                        </button>
                        <button
                          onClick={() => { setResolveId(entry.id); setResolveAction('discard'); }}
                          disabled={isActing}
                          className="p-1.5 rounded hover:bg-slate-600 text-red-400 hover:text-red-300 transition-colors"
                          title="Discard"
                        >
                          <Trash2 size={14} />
                        </button>
                        <Link
                          href={`/events/${entry.id}`}
                          className="p-1.5 rounded hover:bg-slate-600 text-slate-400 hover:text-slate-200 transition-colors"
                          title="View Details"
                        >
                          <ChevronRight size={14} />
                        </Link>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasMore && (
            <div className="px-4 py-3 border-t border-slate-700 text-center">
              <button
                onClick={loadMore}
                className="text-sm text-indigo-400 hover:text-indigo-300"
              >
                Load more
              </button>
            </div>
          )}
        </div>
      )}

      {/* Breakdowns */}
      {stats && (stats.byEventType.length > 0 || stats.byConsumer.length > 0) && (
        <div className="grid grid-cols-2 gap-6 mt-6">
          {stats.byEventType.length > 0 && (
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
              <h3 className="text-sm font-medium text-slate-300 mb-3">Failures by Event Type</h3>
              <div className="space-y-2">
                {stats.byEventType.map((r) => (
                  <div key={r.eventType} className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-mono">{r.eventType}</span>
                    <span className="text-red-400 font-medium">{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {stats.byConsumer.length > 0 && (
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
              <h3 className="text-sm font-medium text-slate-300 mb-3">Failures by Consumer</h3>
              <div className="space-y-2">
                {stats.byConsumer.map((r) => (
                  <div key={r.consumerName} className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-mono">{r.consumerName}</span>
                    <span className="text-red-400 font-medium">{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Resolve/Discard Dialog */}
      {resolveId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-md border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
              {resolveAction === 'resolve' ? (
                <><CheckCircle size={18} className="text-green-400" /> Resolve Event</>
              ) : (
                <><XCircle size={18} className="text-red-400" /> Discard Event</>
              )}
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              {resolveAction === 'resolve'
                ? 'Mark this event as manually resolved. Add notes about what was done.'
                : 'Discard this event permanently. It will not be retried.'}
            </p>
            <textarea
              value={resolveNotes}
              onChange={(e) => setResolveNotes(e.target.value)}
              placeholder="Resolution notes (optional)..."
              rows={3}
              className="w-full bg-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm border border-slate-600 placeholder:text-slate-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setResolveId(null); setResolveNotes(''); }}
                className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleResolveSubmit}
                disabled={isActing}
                className={`px-4 py-2 text-sm rounded-lg font-medium text-white transition-colors ${
                  resolveAction === 'resolve'
                    ? 'bg-green-600 hover:bg-green-500'
                    : 'bg-red-600 hover:bg-red-500'
                }`}
              >
                {isActing ? 'Processing...' : resolveAction === 'resolve' ? 'Resolve' : 'Discard'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
