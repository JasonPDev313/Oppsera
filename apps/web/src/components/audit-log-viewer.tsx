'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorUserId?: string;
  actorType?: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface AuditLogViewerProps {
  entityType?: string;
  entityId?: string;
  showActor?: boolean;
  pageSize?: number;
}

export function AuditLogViewer({
  entityType,
  entityId,
  showActor = true,
  pageSize = 50,
}: AuditLogViewerProps) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0]!;
  });
  const [toDate, setToDate] = useState('');

  const fetchEntries = useCallback(
    async (cursorVal?: string) => {
      const params = new URLSearchParams();
      if (entityType) params.set('entityType', entityType);
      if (entityId) params.set('entityId', entityId);
      if (actionFilter) params.set('action', actionFilter);
      if (fromDate) params.set('from', new Date(fromDate).toISOString());
      if (toDate) params.set('to', new Date(toDate + 'T23:59:59').toISOString());
      if (cursorVal) params.set('cursor', cursorVal);
      params.set('limit', String(pageSize));

      const resp = await apiFetch<{
        data: { entries: AuditLogEntry[]; cursor?: string };
      }>(`/api/v1/audit-log?${params.toString()}`);

      return resp.data;
    },
    [entityType, entityId, actionFilter, fromDate, toDate, pageSize],
  );

  const loadInitial = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await fetchEntries();
      setEntries(result.entries);
      setCursor(result.cursor);
    } catch {
      // Ignore
    } finally {
      setIsLoading(false);
    }
  }, [fetchEntries]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const loadMore = async () => {
    if (!cursor) return;
    setIsLoadingMore(true);
    try {
      const result = await fetchEntries(cursor);
      setEntries((prev) => [...prev, ...result.entries]);
      setCursor(result.cursor);
    } catch {
      // Ignore
    } finally {
      setIsLoadingMore(false);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString();
  };

  const formatAction = (action: string) => {
    return action.replace(/\./g, ' > ');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="mt-1 rounded-lg border border-input px-3 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground">To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="mt-1 rounded-lg border border-input px-3 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground">Action</label>
          <input
            type="text"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            placeholder="e.g. role.created"
            className="mt-1 rounded-lg border border-input px-3 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase">
                Date/Time
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase">
                Action
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase">
                Entity
              </th>
              {showActor && (
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  Actor
                </th>
              )}
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase">
                Changes
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                  {formatDate(entry.createdAt)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">
                  {formatAction(entry.action)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                  <span className="font-mono">{entry.entityType}</span>
                  <span className="ml-1 text-muted-foreground">{entry.entityId.slice(0, 10)}...</span>
                </td>
                {showActor && (
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {entry.actorType === 'system' ? (
                      <span className="inline-flex rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-500">
                        system
                      </span>
                    ) : (
                      <span className="font-mono">{entry.actorUserId?.slice(0, 10) ?? '—'}...</span>
                    )}
                  </td>
                )}
                <td className="px-4 py-3 text-xs">
                  {entry.changes ? (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(expandedId === entry.id ? null : entry.id)
                      }
                      className="inline-flex items-center gap-1 text-indigo-500 hover:text-indigo-400"
                    >
                      {expandedId === entry.id ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      View
                    </button>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td
                  colSpan={showActor ? 5 : 4}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  No audit log entries found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Expanded changes */}
      {expandedId && (
        <div className="mt-2 rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-3">
          <h4 className="text-xs font-medium text-indigo-500">Changes</h4>
          <div className="mt-2 space-y-1">
            {Object.entries(
              entries.find((e) => e.id === expandedId)?.changes ?? {},
            ).map(([field, diff]) => (
              <div key={field} className="flex items-baseline gap-2 text-xs">
                <span className="font-mono font-medium text-foreground">{field}:</span>
                <span className="text-red-500 line-through">
                  {JSON.stringify(diff.old)}
                </span>
                <span className="text-green-500">{JSON.stringify(diff.new)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Load more */}
      {cursor && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={isLoadingMore}
            className="inline-flex items-center gap-1.5 rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            {isLoadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
