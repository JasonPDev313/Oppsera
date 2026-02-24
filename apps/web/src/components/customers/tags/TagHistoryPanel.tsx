'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Minus, Clock, Sparkles, X } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

interface TagAuditEntry {
  id: string;
  action: 'applied' | 'removed' | 'expired' | 'auto_applied' | 'auto_removed';
  tagId: string;
  tagName: string;
  tagColor: string;
  source: string;
  actorName: string | null;
  occurredAt: string;
  reason: string | null;
  evidence: unknown;
}

interface TagHistoryPanelProps {
  customerId: string;
}

const ACTION_CONFIG: Record<
  TagAuditEntry['action'],
  { Icon: typeof Plus; colorClass: string; label: string; dotColor: string }
> = {
  applied: {
    Icon: Plus,
    colorClass: 'text-green-600',
    label: 'Applied',
    dotColor: 'bg-green-500',
  },
  removed: {
    Icon: Minus,
    colorClass: 'text-red-600',
    label: 'Removed',
    dotColor: 'bg-red-500',
  },
  expired: {
    Icon: Clock,
    colorClass: 'text-amber-600',
    label: 'Expired',
    dotColor: 'bg-amber-500',
  },
  auto_applied: {
    Icon: Sparkles,
    colorClass: 'text-purple-600',
    label: 'Auto-applied',
    dotColor: 'bg-purple-500',
  },
  auto_removed: {
    Icon: X,
    colorClass: 'text-purple-600',
    label: 'Auto-removed',
    dotColor: 'bg-purple-500',
  },
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function TimelineEntry({ entry }: { entry: TagAuditEntry }) {
  const config = ACTION_CONFIG[entry.action] ?? ACTION_CONFIG.applied;
  const { Icon, colorClass, label, dotColor } = config;

  return (
    <div className="relative flex gap-3 pb-6 last:pb-0">
      {/* Vertical line */}
      <div className="flex flex-col items-center">
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${dotColor}/10`}
        >
          <Icon className={`h-3.5 w-3.5 ${colorClass}`} />
        </div>
        <div className="w-px flex-1 bg-gray-200/80" />
      </div>

      {/* Content */}
      <div className="flex-1 pt-0.5">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: entry.tagColor || '#6b7280' }}
          />
          <span className="text-sm font-medium text-gray-800">
            {entry.tagName}
          </span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${colorClass} bg-gray-100/60`}
          >
            {label}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
          <span>{formatTimestamp(entry.occurredAt)}</span>
          {entry.actorName && (
            <>
              <span className="text-gray-300">|</span>
              <span>by {entry.actorName}</span>
            </>
          )}
          {entry.source && entry.source !== 'manual' && (
            <>
              <span className="text-gray-300">|</span>
              <span className="capitalize">{entry.source.replace(/_/g, ' ')}</span>
            </>
          )}
        </div>

        {entry.reason && (
          <p className="mt-1 text-xs text-gray-500 italic">
            {entry.reason}
          </p>
        )}
      </div>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3">
          <div className="h-7 w-7 animate-pulse rounded-full bg-gray-200/60" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-4 w-32 animate-pulse rounded bg-gray-200/60" />
            <div className="h-3 w-48 animate-pulse rounded bg-gray-200/60" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TagHistoryPanel({ customerId }: TagHistoryPanelProps) {
  const [entries, setEntries] = useState<TagAuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);

  const fetchData = useCallback(
    async (loadMore = false) => {
      try {
        if (loadMore) {
          setIsLoadingMore(true);
        } else {
          setIsLoading(true);
        }
        setError(null);

        const qs = buildQueryString({
          cursor: loadMore ? cursorRef.current : undefined,
          limit: 20,
        });

        const res = await apiFetch<{
          data: TagAuditEntry[];
          meta: { cursor: string | null; hasMore: boolean };
        }>(`/api/v1/customers/${customerId}/tags/audit${qs}`);

        if (loadMore) {
          setEntries((prev) => [...prev, ...res.data]);
        } else {
          setEntries(res.data);
        }
        cursorRef.current = res.meta.cursor;
        setHasMore(res.meta.hasMore);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tag history');
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [customerId],
  );

  useEffect(() => {
    cursorRef.current = null;
    fetchData();
  }, [fetchData]);

  if (isLoading) {
    return <TimelineSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200/60 bg-red-50/40 px-4 py-3 text-sm text-red-600">
        {error}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-500">
        No tag history
      </div>
    );
  }

  return (
    <div>
      <div className="pl-1">
        {entries.map((entry) => (
          <TimelineEntry key={entry.id} entry={entry} />
        ))}
      </div>

      {hasMore && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => fetchData(true)}
            disabled={isLoadingMore}
            className="rounded-lg px-4 py-2 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50/60 disabled:opacity-50"
          >
            {isLoadingMore ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
