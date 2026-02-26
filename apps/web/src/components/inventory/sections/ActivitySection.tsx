'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, ArrowRight } from 'lucide-react';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { Badge } from '@/components/ui/badge';
import { useItemChangeLog } from '@/hooks/use-item-change-log';
import type { ChangeLogEntry, FieldChange } from '@/hooks/use-item-change-log';

const ACTION_BADGES: Record<string, { label: string; variant: string }> = {
  created: { label: 'Created', variant: 'success' },
  updated: { label: 'Updated', variant: 'info' },
  archived: { label: 'Archived', variant: 'error' },
  restored: { label: 'Restored', variant: 'purple' },
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  return String(value);
}

function ChangeEntry({ entry }: { entry: ChangeLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const badge = ACTION_BADGES[entry.actionType] ?? { label: entry.actionType, variant: 'neutral' };
  const fields = Object.entries(entry.fieldChanges ?? {});

  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <Badge variant={badge.variant} className="shrink-0 text-[10px]">{badge.label}</Badge>
        <span className="min-w-0 flex-1 truncate text-xs text-foreground">
          {entry.summary || `${fields.length} field${fields.length !== 1 ? 's' : ''} changed`}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {formatRelativeTime(entry.changedAt)}
        </span>
      </button>

      {expanded && fields.length > 0 && (
        <div className="space-y-1 bg-muted px-8 py-2">
          {fields.map(([field, change]: [string, FieldChange]) => (
            <div key={field} className="flex items-center gap-2 text-xs">
              <span className="font-medium text-muted-foreground">{field}:</span>
              <span className="text-muted-foreground">
                {change.oldDisplay ?? formatFieldValue(change.old)}
              </span>
              <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="font-medium text-foreground">
                {change.newDisplay ?? formatFieldValue(change.new)}
              </span>
            </div>
          ))}
          {entry.changedByName && (
            <div className="mt-1 text-[10px] text-muted-foreground">
              by {entry.changedByName}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ActivitySectionProps {
  itemId: string;
  /** Increment to trigger a refetch (e.g. after save) */
  refreshKey?: number;
}

export function ActivitySection({ itemId, refreshKey }: ActivitySectionProps) {
  // Lazy fetch: only load change log when the section is first expanded
  const [enabled, setEnabled] = useState(false);
  const { entries, isLoading, hasMore, loadMore, isLoadingMore, refresh } = useItemChangeLog(
    enabled ? itemId : null,
  );

  // Refetch when refreshKey changes (after a save)
  const prevKeyRef = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey !== undefined && refreshKey !== prevKeyRef.current && enabled) {
      prevKeyRef.current = refreshKey;
      refresh();
    }
  }, [refreshKey, enabled, refresh]);

  return (
    <CollapsibleSection
      id="activity"
      title="Activity History"
      defaultOpen={false}
      onFirstExpand={() => setEnabled(true)}
    >
      <div className="rounded-lg border border-border bg-surface">
        {isLoading || !enabled ? (
          <div className="space-y-2 p-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 w-full animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            No history yet
          </div>
        ) : (
          <>
            {entries.map((entry) => (
              <ChangeEntry key={entry.id} entry={entry} />
            ))}
            {hasMore && (
              <button
                type="button"
                onClick={loadMore}
                disabled={isLoadingMore}
                className="w-full border-t border-border px-3 py-2 text-center text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-500/10 disabled:opacity-50"
              >
                {isLoadingMore ? 'Loading...' : 'Load More'}
              </button>
            )}
          </>
        )}
      </div>
    </CollapsibleSection>
  );
}
