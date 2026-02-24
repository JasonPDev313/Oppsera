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
  CREATE: { label: 'Created', color: 'text-green-700 bg-green-50' },
  UPDATE: { label: 'Updated', color: 'text-blue-700 bg-blue-50' },
  DEACTIVATE: { label: 'Deactivated', color: 'text-red-700 bg-red-50' },
  REACTIVATE: { label: 'Reactivated', color: 'text-green-700 bg-green-50' },
  MERGE: { label: 'Merged', color: 'text-purple-700 bg-purple-50' },
  RENUMBER: { label: 'Renumbered', color: 'text-amber-700 bg-amber-50' },
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
      <div className="relative z-10 mx-4 w-full max-w-lg rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">
              Change History{accountLabel ? ` — ${accountLabel}` : ''}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          {entries.length === 0 && !isLoading && (
            <p className="text-center text-sm text-gray-500">No change history found.</p>
          )}

          <div className="space-y-2">
            {entries.map((entry) => {
              const actionInfo = ACTION_LABELS[entry.action] ?? { label: entry.action, color: 'text-gray-700 bg-gray-50' };
              const isExpanded = expandedIds.has(entry.id);

              return (
                <div key={entry.id} className="rounded-lg border border-gray-200 p-3">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 text-left"
                    onClick={() => toggleExpand(entry.id)}
                  >
                    {entry.fieldChanged ? (
                      isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />
                    ) : (
                      <div className="w-4" />
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${actionInfo.color}`}>
                      {actionInfo.label}
                    </span>
                    {entry.fieldChanged && (
                      <span className="text-xs text-gray-500">{entry.fieldChanged}</span>
                    )}
                    <span className="ml-auto text-xs text-gray-400">
                      {entry.changedAt ? new Date(entry.changedAt).toLocaleString() : ''}
                    </span>
                  </button>

                  {isExpanded && entry.fieldChanged && (
                    <div className="mt-2 ml-6 space-y-1">
                      {entry.oldValue != null && (
                        <p className="text-xs text-gray-500">
                          Old: <span className="font-mono text-red-600 line-through">{entry.oldValue}</span>
                        </p>
                      )}
                      {entry.newValue != null && (
                        <p className="text-xs text-gray-500">
                          New: <span className="font-mono text-green-600">{entry.newValue}</span>
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
              className="mt-3 w-full rounded-lg border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
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
