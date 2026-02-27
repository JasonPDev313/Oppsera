'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useExpoView } from '@/hooks/use-fnb-kitchen';
import { ExpoHeader } from '@/components/fnb/kitchen/ExpoHeader';
import { ExpoTicketCard } from '@/components/fnb/kitchen/ExpoTicketCard';
import { apiFetch } from '@/lib/api-client';
import {
  ArrowLeft, Search, Flame, Pause, Play,
  LayoutGrid, LayoutList, Package, Clock,
} from 'lucide-react';

type ExpoViewMode = 'rail' | 'grid';
type ExpoFilter = 'all' | 'ready' | 'in_progress' | 'rush';

// Default thresholds for expo (can be overridden per-station)
const DEFAULT_WARNING_SECONDS = 480;
const DEFAULT_CRITICAL_SECONDS = 720;

// Effectively infinite interval to stop polling when paused
const PAUSED_INTERVAL = 999_999_999;

export default function ExpoContent() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ExpoViewMode>('rail');
  const [filter, setFilter] = useState<ExpoFilter>('all');
  const [search, setSearch] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [isFiring, setIsFiring] = useState(false);

  const {
    expoView,
    isLoading,
    error,
    bumpTicket,
    isActing,
    refresh,
  } = useExpoView({ pollIntervalMs: isPaused ? PAUSED_INTERVAL : 5000 });

  // Fire a held ticket (send to kitchen)
  const _fireTicket = useCallback(async (ticketId: string) => {
    setIsFiring(true);
    try {
      await apiFetch(`/api/v1/fnb/kitchen/tickets/${ticketId}/fire`, {
        method: 'POST',
        body: JSON.stringify({ clientRequestId: `fire-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }),
      });
      refresh();
    } catch {
      // silent
    } finally {
      setIsFiring(false);
    }
  }, [refresh]);

  // Filter and sort tickets
  const filteredTickets = useMemo(() => {
    if (!expoView?.tickets) return [];
    let tickets = [...expoView.tickets];

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      tickets = tickets.filter((t) => {
        const tableStr = t.tableNumber != null ? String(t.tableNumber) : '';
        const customer = t.customerName?.toLowerCase() ?? '';
        const server = t.serverName?.toLowerCase() ?? '';
        return tableStr.includes(q) || customer.includes(q) || server.includes(q);
      });
    }

    // Status filter
    if (filter === 'ready') {
      tickets = tickets.filter((t) => t.allItemsReady);
    } else if (filter === 'in_progress') {
      tickets = tickets.filter((t) => !t.allItemsReady);
    } else if (filter === 'rush') {
      tickets = tickets.filter((t) => t.priorityLevel >= 5);
    }

    // Sort: ready first, then by priority (high to low), then by elapsed (long to short)
    return tickets.sort((a, b) => {
      if (a.allItemsReady && !b.allItemsReady) return -1;
      if (!a.allItemsReady && b.allItemsReady) return 1;
      if (b.priorityLevel !== a.priorityLevel) return b.priorityLevel - a.priorityLevel;
      return b.elapsedSeconds - a.elapsedSeconds;
    });
  }, [expoView?.tickets, search, filter]);

  // All-day summary: count items across all visible tickets
  const allDaySummary = useMemo(() => {
    if (!expoView?.tickets) return [];
    const itemCounts = new Map<string, { name: string; total: number; ready: number }>();
    for (const ticket of expoView.tickets) {
      for (const item of ticket.items) {
        const key = item.kitchenLabel || item.itemName;
        const existing = itemCounts.get(key) || { name: key, total: 0, ready: 0 };
        existing.total += 1;
        if (item.itemStatus === 'ready' || item.itemStatus === 'served') existing.ready += 1;
        itemCounts.set(key, existing);
      }
    }
    return Array.from(itemCounts.values()).sort((a, b) => b.total - a.total).slice(0, 20);
  }, [expoView?.tickets]);

  if (isLoading && !expoView) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
        <div className="text-center">
          <div className="h-8 w-8 border-2 rounded-full animate-spin mx-auto mb-2"
            style={{ borderColor: 'var(--fnb-text-muted)', borderTopColor: 'var(--fnb-status-seated)' }} />
          <p className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>Loading Expo...</p>
        </div>
      </div>
    );
  }

  if (error && !expoView) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
        <div className="text-center">
          <p className="text-sm mb-2" style={{ color: 'var(--fnb-status-dirty)' }}>{error}</p>
          <button type="button" onClick={() => router.push('/pos/fnb')}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: 'var(--fnb-status-seated)' }}>
            Back to Floor
          </button>
        </div>
      </div>
    );
  }

  if (!expoView) return null;

  const readyCount = expoView.tickets.filter((t) => t.allItemsReady).length;
  const totalCount = expoView.tickets.length;

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
      {/* Header */}
      <div className="flex items-center shrink-0">
        <button type="button" onClick={() => router.push('/pos/fnb')}
          className="flex items-center justify-center h-full px-3 border-r transition-colors hover:opacity-80"
          style={{ backgroundColor: 'var(--fnb-bg-surface)', borderColor: 'rgba(148, 163, 184, 0.15)', color: 'var(--fnb-text-secondary)' }}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <ExpoHeader expoView={expoView} />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-2" style={{ backgroundColor: 'var(--fnb-bg-surface)' }}>
          {/* Ready count badge */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md mr-1"
            style={{ backgroundColor: readyCount > 0 ? 'rgba(34,197,94,0.15)' : 'transparent' }}>
            <Package className="h-3.5 w-3.5" style={{ color: readyCount > 0 ? '#22c55e' : 'var(--fnb-text-muted)' }} />
            <span className="text-xs font-bold" style={{ color: readyCount > 0 ? '#22c55e' : 'var(--fnb-text-muted)' }}>
              {readyCount}/{totalCount}
            </span>
          </div>

          {/* View mode */}
          <button type="button" onClick={() => setViewMode(viewMode === 'rail' ? 'grid' : 'rail')}
            className="p-1.5 rounded transition-colors"
            style={{ color: 'var(--fnb-text-muted)' }}>
            {viewMode === 'grid' ? <LayoutList className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
          </button>

          {/* Pause */}
          <button type="button" onClick={() => setIsPaused(!isPaused)}
            className="p-1.5 rounded transition-colors"
            style={{ backgroundColor: isPaused ? 'rgba(239,68,68,0.2)' : 'transparent', color: isPaused ? '#ef4444' : 'var(--fnb-text-muted)' }}>
            {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Search + filter bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 shrink-0" style={{ backgroundColor: 'var(--fnb-bg-surface)', borderBottom: '1px solid rgba(148, 163, 184, 0.15)' }}>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--fnb-text-muted)' }} />
          <input
            type="text"
            placeholder="Search order# or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-7 pr-2 py-1 text-xs rounded-md border"
            style={{
              backgroundColor: 'var(--fnb-bg-primary)',
              borderColor: 'rgba(148, 163, 184, 0.15)',
              color: 'var(--fnb-text-primary)',
            }}
          />
        </div>
        <div className="flex gap-1">
          {([
            { key: 'all' as const, label: 'All' },
            { key: 'ready' as const, label: 'Ready' },
            { key: 'in_progress' as const, label: 'In Progress' },
            { key: 'rush' as const, label: 'Rush' },
          ]).map(({ key, label }) => (
            <button key={key} type="button"
              onClick={() => setFilter(key)}
              className="px-2 py-0.5 text-[10px] font-medium rounded-full transition-colors"
              style={{
                backgroundColor: filter === key ? 'rgba(99,102,241,0.2)' : 'transparent',
                color: filter === key ? 'var(--fnb-status-seated)' : 'var(--fnb-text-muted)',
                border: `1px solid ${filter === key ? 'rgba(99,102,241,0.3)' : 'rgba(148, 163, 184, 0.15)'}`,
              }}>
              {label}
              {key === 'rush' && <Flame className="h-2.5 w-2.5 inline ml-0.5" />}
            </button>
          ))}
        </div>
      </div>

      {/* Ticket area */}
      <div className="flex-1 overflow-auto">
        {filteredTickets.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-lg font-bold" style={{ color: 'var(--fnb-text-muted)' }}>
                {search || filter !== 'all' ? 'No Matching Tickets' : 'All Clear'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--fnb-text-muted)' }}>
                {search || filter !== 'all' ? 'Try adjusting your filters' : 'No tickets in the pass'}
              </p>
            </div>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 p-3">
            {filteredTickets.map((ticket) => (
              <ExpoTicketCard key={ticket.ticketId} ticket={ticket}
                warningThresholdSeconds={DEFAULT_WARNING_SECONDS} criticalThresholdSeconds={DEFAULT_CRITICAL_SECONDS}
                onBumpTicket={bumpTicket} disabled={isActing || isFiring} />
            ))}
          </div>
        ) : (
          <div className="flex gap-3 p-3 h-full items-start flex-wrap content-start">
            {filteredTickets.map((ticket) => (
              <ExpoTicketCard key={ticket.ticketId} ticket={ticket}
                warningThresholdSeconds={DEFAULT_WARNING_SECONDS} criticalThresholdSeconds={DEFAULT_CRITICAL_SECONDS}
                onBumpTicket={bumpTicket} disabled={isActing || isFiring} />
            ))}
          </div>
        )}
      </div>

      {/* All-day summary bar */}
      {allDaySummary.length > 0 && (
        <div className="shrink-0 border-t overflow-x-auto" style={{ backgroundColor: 'var(--fnb-bg-surface)', borderColor: 'rgba(148, 163, 184, 0.15)' }}>
          <div className="flex items-center gap-1 px-3 py-1.5">
            <Clock className="h-3 w-3 shrink-0" style={{ color: 'var(--fnb-text-muted)' }} />
            <span className="text-[9px] font-semibold uppercase tracking-wider shrink-0 mr-2"
              style={{ color: 'var(--fnb-text-muted)' }}>All Day</span>
            {allDaySummary.map((item) => (
              <div key={item.name} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] shrink-0"
                style={{
                  backgroundColor: item.ready === item.total ? 'rgba(34,197,94,0.1)' : 'rgba(148, 163, 184, 0.08)',
                  color: item.ready === item.total ? '#22c55e' : 'var(--fnb-text-secondary)',
                }}>
                <span className="font-medium truncate max-w-20">{item.name}</span>
                <span className="font-mono">{item.ready}/{item.total}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
