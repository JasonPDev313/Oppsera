'use client';

/**
 * Right-side collapsible panel showing aggregated item counts
 * across all active tickets. Includes mini bar chart visualization
 * and pending/in-progress split for prep cooks.
 */

import { useMemo } from 'react';
import { X, ChevronRight } from 'lucide-react';

interface ItemSummaryEntry {
  name: string;
  total: number;
  pending: number;
  inProgress: number;
  ready: number;
}

interface ItemSummaryPanelProps {
  /** All ticket items across active tickets */
  tickets: Array<{
    items: Array<{
      itemName: string;
      kitchenLabel?: string | null;
      quantity: number;
      itemStatus: string;
    }>;
  }>;
  onClose: () => void;
  /** Max items to show */
  maxItems?: number;
}

export function ItemSummaryPanel({ tickets, onClose, maxItems = 20 }: ItemSummaryPanelProps) {
  const summary = useMemo(() => {
    const map = new Map<string, ItemSummaryEntry>();

    for (const ticket of tickets) {
      for (const item of ticket.items) {
        if (item.itemStatus === 'voided') continue;
        const key = item.kitchenLabel || item.itemName;
        const existing = map.get(key) || { name: key, total: 0, pending: 0, inProgress: 0, ready: 0 };

        existing.total += item.quantity;
        if (item.itemStatus === 'pending') existing.pending += item.quantity;
        else if (item.itemStatus === 'in_progress') existing.inProgress += item.quantity;
        else if (item.itemStatus === 'ready' || item.itemStatus === 'bumped' || item.itemStatus === 'served') {
          existing.ready += item.quantity;
        }

        map.set(key, existing);
      }
    }

    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, maxItems);
  }, [tickets, maxItems]);

  const maxCount = Math.max(...summary.map((s) => s.total), 1);

  return (
    <div
      className="flex flex-col h-full border-l"
      style={{
        backgroundColor: 'var(--fnb-bg-surface)',
        borderColor: 'rgba(148, 163, 184, 0.15)',
        width: '260px',
        minWidth: '260px',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b shrink-0"
        style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}
      >
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--fnb-text-primary)' }}>
          Item Summary
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded transition-colors hover:opacity-80"
          style={{ color: 'var(--fnb-text-muted)' }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {summary.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: 'var(--fnb-text-muted)' }}>
            No active items
          </p>
        ) : (
          <div className="space-y-2.5">
            {summary.map((entry) => {
              const pct = (entry.total / maxCount) * 100;
              const readyPct = entry.total > 0 ? (entry.ready / entry.total) * 100 : 0;

              return (
                <div key={entry.name}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span
                      className="text-xs font-medium truncate mr-2"
                      style={{ color: 'var(--fnb-text-primary)' }}
                    >
                      {entry.name}
                    </span>
                    <span className="text-xs font-bold fnb-mono shrink-0" style={{ color: 'var(--fnb-text-primary)' }}>
                      {entry.total}
                    </span>
                  </div>
                  {/* Bar */}
                  <div
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{ backgroundColor: 'rgba(148, 163, 184, 0.1)' }}
                  >
                    <div className="h-full rounded-full relative" style={{ width: `${pct}%` }}>
                      {/* Ready portion (green) */}
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{ width: `${readyPct}%`, backgroundColor: '#22c55e' }}
                      />
                      {/* Remaining portion (blue) */}
                      <div
                        className="absolute inset-y-0 rounded-full"
                        style={{
                          left: `${readyPct}%`,
                          width: `${100 - readyPct}%`,
                          backgroundColor: '#6366f1',
                        }}
                      />
                    </div>
                  </div>
                  {/* Breakdown */}
                  <div className="flex items-center gap-2 mt-0.5">
                    {entry.pending > 0 && (
                      <span className="text-[9px]" style={{ color: 'var(--fnb-text-muted)' }}>
                        {entry.pending} pending
                      </span>
                    )}
                    {entry.inProgress > 0 && (
                      <span className="text-[9px]" style={{ color: '#6366f1' }}>
                        {entry.inProgress} cooking
                      </span>
                    )}
                    {entry.ready > 0 && (
                      <span className="text-[9px]" style={{ color: '#22c55e' }}>
                        {entry.ready} ready
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Small toggle button to show/hide the summary panel */
export function ItemSummaryToggle({ onClick, isOpen }: { onClick: () => void; isOpen: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="p-1.5 rounded transition-colors"
      style={{
        backgroundColor: isOpen ? 'rgba(99,102,241,0.2)' : 'transparent',
        color: isOpen ? 'var(--fnb-status-seated)' : 'var(--fnb-text-muted)',
      }}
      title={isOpen ? 'Hide item summary' : 'Show item summary'}
    >
      <ChevronRight
        className="h-4 w-4 transition-transform"
        style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}
      />
    </button>
  );
}
