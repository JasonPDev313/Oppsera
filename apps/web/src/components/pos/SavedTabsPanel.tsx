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
      <div className="shrink-0 border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Archive className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Saved Tabs</h3>
          {orders.length > 0 && (
            <span className="ml-auto rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
              {orders.length}
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="shrink-0 border-b border-gray-100 px-4 py-2">
        <div className="flex gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-700 focus:border-indigo-500 focus:outline-none"
            placeholder="From"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-700 focus:border-indigo-500 focus:outline-none"
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
            className="mt-1.5 text-xs text-indigo-600 hover:text-indigo-800"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            <p className="mt-2 text-sm text-gray-400">Loading saved tabs...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <History className="h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">No saved tabs</p>
            <p className="mt-1 text-xs text-gray-400">
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
    <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 transition-colors hover:border-indigo-200 hover:bg-indigo-50/50">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">
            #{order.orderNumber}
          </p>
          {order.customerName && (
            <span className="truncate text-xs text-gray-500">
              {order.customerName}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-gray-500">
          {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'} &middot;{' '}
          {formatTime(order.heldAt)}
        </p>
      </div>
      <div className="ml-3 flex items-center gap-3">
        <p className="text-sm font-semibold text-gray-900">
          {formatMoney(order.total)}
        </p>
        <button
          type="button"
          onClick={() => onRecall(order.id)}
          disabled={isRecalling}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          Recall
        </button>
      </div>
    </div>
  );
}
