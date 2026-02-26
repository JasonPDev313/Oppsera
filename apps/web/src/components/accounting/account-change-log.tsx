'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, History, ChevronDown, ChevronRight } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

interface ChangeLogEntry {
  id: string;
  action: string;
  fieldChanged: string | null;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string | null;
  changedAt: string | null;
  metadata: unknown;
}

interface AccountChangeLogProps {
  open: boolean;
  onClose: () => void;
  accountId: string | null;
  accountLabel?: string;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  CREATE: { label: 'Created', color: 'text-green-500 bg-green-500/10' },
  UPDATE: { label: 'Updated', color: 'text-blue-500 bg-blue-500/10' },
  DEACTIVATE: { label: 'Deactivated', color: 'text-red-500 bg-red-500/10' },
  REACTIVATE: { label: 'Reactivated', color: 'text-green-500 bg-green-500/10' },
  MERGE: { label: 'Merged', color: 'text-purple-500 bg-purple-500/10' },
  RENUMBER: { label: 'Renumbered', color: 'text-amber-500 bg-amber-500/10' },
};

export function AccountChangeLog({ open, onClose, accountId, accountLabel }: AccountChangeLogProps) {
  const [entries, setEntries] = useState<ChangeLogEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchLog = useCallback(async (cursor?: string) => {
    if (!accountId) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      const res = await apiFetch<{ data: ChangeLogEntry[]; meta?: { hasMore?: boolean } }>(`/api/v1/accounting/accounts/${accountId}/change-log?${params}`);
      const data = res.data;
      setEntries((prev) => cursor ? [...prev, ...data] : data);
      setHasMore(res.meta?.hasMore ?? false);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    if (open && accountId) {
      setEntries([]);
      fetchLog();
    }
  }, [open, accountId, fetchLog]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!open || !accountId) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 mx-4 w-full max-w-lg rounded-xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-foreground">
              Change History{accountLabel ? ` — ${accountLabel}` : ''}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          {entries.length === 0 && !isLoading && (
            <p className="text-center text-sm text-muted-foreground">No change history found.</p>
          )}

          <div className="space-y-2">
            {entries.map((entry) => {
              const actionInfo = ACTION_LABELS[entry.action] ?? { label: entry.action, color: 'text-muted-foreground bg-muted' };
              const isExpanded = expandedIds.has(entry.id);

              return (
                <div key={entry.id} className="rounded-lg border border-border p-3">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 text-left"
                    onClick={() => toggleExpand(entry.id)}
                  >
                    {entry.fieldChanged ? (
                      isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <div className="w-4" />
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${actionInfo.color}`}>
                      {actionInfo.label}
                    </span>
                    {entry.fieldChanged && (
                      <span className="text-xs text-muted-foreground">{entry.fieldChanged}</span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {entry.changedAt ? new Date(entry.changedAt).toLocaleString() : ''}
                    </span>
                  </button>

                  {isExpanded && entry.fieldChanged && (
                    <div className="mt-2 ml-6 space-y-1">
                      {entry.oldValue != null && (
                        <p className="text-xs text-muted-foreground">
                          Old: <span className="font-mono text-red-500 line-through">{entry.oldValue}</span>
                        </p>
                      )}
                      {entry.newValue != null && (
                        <p className="text-xs text-muted-foreground">
                          New: <span className="font-mono text-green-500">{entry.newValue}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {hasMore && (
            <button
              type="button"
              onClick={() => fetchLog(entries[entries.length - 1]?.id)}
              disabled={isLoading}
              className="mt-3 w-full rounded-lg border border-border py-2 text-sm text-muted-foreground hover:bg-accent disabled:opacity-50"
            >
              {isLoading ? 'Loading...' : 'Load More'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
