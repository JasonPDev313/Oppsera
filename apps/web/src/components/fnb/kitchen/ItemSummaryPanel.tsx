'use client';

/**
 * Right-side collapsible panel showing aggregated item counts
 * across all active tickets. Enhanced with batch prep mode showing
 * which tickets each item belongs to for efficient batch cooking.
 */

import { useMemo, useState } from 'react';
import { X, ChevronRight, Layers } from 'lucide-react';

interface TicketRef {
  ticketNumber: number;
  tableNumber: number | null;
  quantity: number;
}

interface ItemSummaryEntry {
  name: string;
  total: number;
  pending: number;
  inProgress: number;
  ready: number;
  /** Which tickets contain this item (for batch prep mode) */
  tickets: TicketRef[];
}

interface ItemSummaryPanelProps {
  /** All ticket items across active tickets */
  tickets: Array<{
    ticketNumber?: number;
    tableNumber?: number | null;
    items: Array<{
      itemId?: string;
      itemName: string;
      kitchenLabel?: string | null;
      quantity: number;
      itemStatus: string;
    }>;
  }>;
  onClose: () => void;
  onBumpAllReady?: () => void;
  /** Max items to show */
  maxItems?: number;
}

export function ItemSummaryPanel({ tickets, onClose, onBumpAllReady, maxItems = 20 }: ItemSummaryPanelProps) {
  const [batchMode, setBatchMode] = useState(false);

  const summary = useMemo(() => {
    const map = new Map<string, ItemSummaryEntry>();

    for (const ticket of tickets) {
      for (const item of ticket.items) {
        if (item.itemStatus === 'voided') continue;
        const key = item.kitchenLabel || item.itemName;
        const existing = map.get(key) || { name: key, total: 0, pending: 0, inProgress: 0, ready: 0, tickets: [] };

        existing.total += item.quantity;
        if (item.itemStatus === 'pending') existing.pending += item.quantity;
        else if (item.itemStatus === 'cooking') existing.inProgress += item.quantity;
        else if (item.itemStatus === 'ready' || item.itemStatus === 'served') {
          existing.ready += item.quantity;
        }

        // Track which tickets this item appears in
        const ticketNum = (ticket as Record<string, unknown>).ticketNumber as number | undefined;
        if (ticketNum != null) {
          existing.tickets.push({
            ticketNumber: ticketNum,
            tableNumber: (ticket as Record<string, unknown>).tableNumber as number | null ?? null,
            quantity: item.quantity,
          });
        }

        map.set(key, existing);
      }
    }

    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, maxItems);
  }, [tickets, maxItems]);

  const maxCount = Math.max(...summary.map((s) => s.total), 1);
  const totalItems = summary.reduce((sum, e) => sum + e.total, 0);
  const totalReady = summary.reduce((sum, e) => sum + e.ready, 0);

  return (
    <div
      className="flex flex-col h-full border-l"
      style={{
        backgroundColor: 'var(--fnb-bg-surface)',
        borderColor: 'rgba(148, 163, 184, 0.15)',
        width: '280px',
        minWidth: '280px',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b shrink-0"
        style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--fnb-text-primary)' }}>
            {batchMode ? 'Batch Prep' : 'Item Summary'}
          </span>
          <span className="text-[10px] fnb-mono font-bold rounded-full px-1.5 py-0.5"
            style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}>
            {totalReady}/{totalItems}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {batchMode && onBumpAllReady && totalReady > 0 && (
            <button
              type="button"
              onClick={onBumpAllReady}
              className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide transition-colors"
              style={{
                backgroundColor: 'rgba(34, 197, 94, 0.15)',
                color: '#22c55e',
                border: '1px solid rgba(34, 197, 94, 0.3)',
              }}
            >
              Bump {totalReady} Ready
            </button>
          )}
          <button
            type="button"
            onClick={() => setBatchMode(!batchMode)}
            className="p-1 rounded transition-colors hover:opacity-80"
            style={{
              color: batchMode ? '#6366f1' : 'var(--fnb-text-muted)',
              backgroundColor: batchMode ? 'rgba(99,102,241,0.15)' : 'transparent',
            }}
            title={batchMode ? 'Switch to summary view' : 'Switch to batch prep view'}
          >
            <Layers className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded transition-colors hover:opacity-80"
            style={{ color: 'var(--fnb-text-muted)' }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
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
                  {/* Batch prep: show which tickets need this item */}
                  {batchMode && entry.tickets.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {entry.tickets.map((ref, idx) => (
                        <span
                          key={idx}
                          className="text-[9px] font-medium rounded px-1.5 py-0.5"
                          style={{
                            backgroundColor: 'var(--fnb-bg-elevated)',
                            color: 'var(--fnb-text-secondary)',
                          }}
                        >
                          #{ref.ticketNumber}
                          {ref.tableNumber != null && ` T${ref.tableNumber}`}
                          {ref.quantity > 1 && ` ×${ref.quantity}`}
                        </span>
                      ))}
                    </div>
                  )}
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
