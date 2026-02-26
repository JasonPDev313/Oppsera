'use client';

import { useState, useCallback } from 'react';
import { Archive, History, Loader2 } from 'lucide-react';
import { useSavedTabs } from '@/hooks/use-saved-tabs';
import type { HeldOrder } from '@/types/pos';

// ── Helpers ────────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ── Props ──────────────────────────────────────────────────────────

interface SavedTabsPanelProps {
  locationId: string;
  onRecall: (orderId: string) => void;
  isRecalling?: boolean;
}

export function SavedTabsPanel({
  locationId,
  onRecall,
  isRecalling,
}: SavedTabsPanelProps) {
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { orders, isLoading, mutate } = useSavedTabs(locationId, {
    employeeId: employeeFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const handleRecall = useCallback(
    async (orderId: string) => {
      await onRecall(orderId);
      mutate();
    },
    [onRecall, mutate],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Archive className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Saved Tabs</h3>
          {orders.length > 0 && (
            <span className="ml-auto rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-500">
              {orders.length}
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="shrink-0 border-b border-border px-4 py-2">
        <div className="flex gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs text-foreground focus:border-indigo-500 focus:outline-none"
            placeholder="From"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs text-foreground focus:border-indigo-500 focus:outline-none"
            placeholder="To"
          />
        </div>
        {(dateFrom || dateTo || employeeFilter) && (
          <button
            type="button"
            onClick={() => {
              setEmployeeFilter('');
              setDateFrom('');
              setDateTo('');
            }}
            className="mt-1.5 text-xs text-indigo-600 hover:text-indigo-500"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">Loading saved tabs...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <History className="h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">No saved tabs</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Right-click a tab and choose &ldquo;Save Tab&rdquo; to save it here
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => (
              <SavedTabRow
                key={order.id}
                order={order}
                onRecall={handleRecall}
                isRecalling={isRecalling}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Saved Tab Row ──────────────────────────────────────────────────

function SavedTabRow({
  order,
  onRecall,
  isRecalling,
}: {
  order: HeldOrder;
  onRecall: (orderId: string) => void;
  isRecalling?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3 transition-colors hover:border-indigo-500/30 hover:bg-indigo-500/10">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground">
            #{order.orderNumber}
          </p>
          {order.customerName && (
            <span className="truncate text-xs text-muted-foreground">
              {order.customerName}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'} &middot;{' '}
          {formatTime(order.heldAt)}
        </p>
      </div>
      <div className="ml-3 flex items-center gap-3">
        <p className="text-sm font-semibold text-foreground">
          {formatMoney(order.total)}
        </p>
        <button
          type="button"
          onClick={() => onRecall(order.id)}
          disabled={isRecalling}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
        >
          Recall
        </button>
      </div>
    </div>
  );
}
