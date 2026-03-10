'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/components/auth-provider';
import { useExpoView, useExpoHistory, useKdsLocationCounts } from '@/hooks/use-fnb-kitchen';
import { ExpoHeader } from '@/components/fnb/kitchen/ExpoHeader';
import { ExpoTicketCard } from '@/components/fnb/kitchen/ExpoTicketCard';
import { ExpoHistoryPanel } from '@/components/fnb/kitchen/ExpoHistoryPanel';
import { ItemSummaryPanel, ItemSummaryToggle } from '@/components/fnb/kitchen/ItemSummaryPanel';
import { KitchenMetrics } from '@/components/fnb/kitchen/KitchenMetrics';
import { KitchenBehindBanner } from '@/components/fnb/kitchen/KitchenBehindBanner';
import { formatTimer } from '@/components/fnb/kitchen/TimerBar';
import { apiFetch } from '@/lib/api-client';
import {
  ArrowLeft, Search, Flame, Pause, Play,
  LayoutGrid, LayoutList, Package, Clock, History, MapPin,
} from 'lucide-react';

type ExpoViewMode = 'rail' | 'grid';
type ExpoTab = 'active' | 'history';
type ExpoFilter = 'all' | 'ready' | 'in_progress' | 'held' | 'rush';

const DEFAULT_WARNING_SECONDS = 480;
const DEFAULT_CRITICAL_SECONDS = 720;
const PAUSED_INTERVAL = 999_999_999;

export default function ExpoContent() {
  const router = useRouter();
  const { locations } = useAuthContext();
  const [locationId, setLocationId] = useState(() => locations?.[0]?.id ?? '');
  const hasMultipleLocations = (locations?.length ?? 0) > 1;
  const locationCounts = useKdsLocationCounts(locations?.map((l) => l.id) ?? []);
  const autoSelectedRef = useRef(false);

  // Auto-select the location with the most active tickets on first load
  useEffect(() => {
    if (autoSelectedRef.current || locationCounts.size === 0) return;
    autoSelectedRef.current = true;
    let bestId = '';
    let bestCount = 0;
    for (const [id, count] of locationCounts) {
      if (count > bestCount) { bestId = id; bestCount = count; }
    }
    if (bestId && bestCount > 0) setLocationId(bestId);
  }, [locationCounts]);

  // Count tickets at OTHER locations (for persistent badge + pulse)
  const otherLocationTickets = useMemo(() => {
    let total = 0;
    for (const [id, count] of locationCounts) {
      if (id !== locationId) total += count;
    }
    return total;
  }, [locationCounts, locationId]);
  const [activeTab, setActiveTab] = useState<ExpoTab>('active');
  const [viewMode, setViewMode] = useState<ExpoViewMode>('rail');
  const [filter, setFilter] = useState<ExpoFilter>('all');
  const [search, setSearch] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [isFiring, setIsFiring] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(true); // Default open for expo

  const {
    expoView,
    isLoading,
    error,
    bumpTicket,
    isActing,
    refresh,
  } = useExpoView({ locationId, pollIntervalMs: isPaused ? PAUSED_INTERVAL : 5000 });

  const {
    history: expoHistory,
    isLoading: historyLoading,
    refresh: refreshHistory,
  } = useExpoHistory({ locationId, enabled: activeTab === 'history' });

  const handleTabChange = useCallback((tab: ExpoTab) => {
    setActiveTab(tab);
    if (tab === 'history') refreshHistory();
  }, [refreshHistory]);

  const fireTicket = useCallback(async (ticketId: string) => {
    setIsFiring(true);
    setActionError(null);
    try {
      await apiFetch(`/api/v1/fnb/kitchen/tickets/${ticketId}/fire`, {
        method: 'POST',
        body: JSON.stringify({ clientRequestId: `fire-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }),
      });
      refresh();
    } catch (err: unknown) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setActionError(err instanceof Error ? err.message : 'Fire failed');
      }
    } finally {
      setIsFiring(false);
    }
  }, [refresh]);

  const recallTicket = useCallback(async (ticketId: string) => {
    setIsFiring(true);
    setActionError(null);
    try {
      await apiFetch(`/api/v1/fnb/kitchen/tickets/${ticketId}/recall`, {
        method: 'POST',
        body: JSON.stringify({ clientRequestId: `recall-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }),
      });
      refresh();
    } catch (err: unknown) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setActionError(err instanceof Error ? err.message : 'Recall failed');
      }
    } finally {
      setIsFiring(false);
    }
  }, [refresh]);

  // Filter and sort tickets
  const filteredTickets = useMemo(() => {
    if (!expoView?.tickets) return [];
    let tickets = [...expoView.tickets];

    if (search.trim()) {
      const q = search.toLowerCase();
      tickets = tickets.filter((t) => {
        const tableStr = t.tableNumber != null ? String(t.tableNumber) : '';
        const customer = t.customerName?.toLowerCase() ?? '';
        const server = t.serverName?.toLowerCase() ?? '';
        return tableStr.includes(q) || customer.includes(q) || server.includes(q);
      });
    }

    if (filter === 'ready') {
      tickets = tickets.filter((t) => t.allItemsReady);
    } else if (filter === 'in_progress') {
      tickets = tickets.filter((t) => !t.allItemsReady && t.status !== 'pending');
    } else if (filter === 'held') {
      tickets = tickets.filter((t) => t.status === 'pending');
    } else if (filter === 'rush') {
      tickets = tickets.filter((t) => t.priorityLevel >= 5);
    }

    // Ready first, then priority, then elapsed
    return tickets.sort((a, b) => {
      if (a.allItemsReady && !b.allItemsReady) return -1;
      if (!a.allItemsReady && b.allItemsReady) return 1;
      if (b.priorityLevel !== a.priorityLevel) return b.priorityLevel - a.priorityLevel;
      return b.elapsedSeconds - a.elapsedSeconds;
    });
  }, [expoView?.tickets, search, filter]);

  // Compute metrics
  const { avgElapsed, overdueCount } = useMemo(() => {
    if (!expoView?.tickets?.length) return { avgElapsed: 0, overdueCount: 0 };
    const total = expoView.tickets.reduce((sum, t) => sum + t.elapsedSeconds, 0);
    const avg = Math.round(total / expoView.tickets.length);
    const overdue = expoView.tickets.filter((t) => t.elapsedSeconds >= DEFAULT_CRITICAL_SECONDS).length;
    return { avgElapsed: avg, overdueCount: overdue };
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

        {/* Location selector */}
        {hasMultipleLocations && (
          <div className="flex items-center gap-1.5 px-2" style={{ backgroundColor: 'var(--fnb-bg-surface)' }}>
            <MapPin className="h-3.5 w-3.5" style={{ color: 'var(--fnb-text-muted)' }} />
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="rounded-md border px-2 py-1 text-xs font-medium"
              style={{
                backgroundColor: 'var(--fnb-bg-elevated)',
                borderColor: 'rgba(148, 163, 184, 0.15)',
                color: 'var(--fnb-text-primary)',
              }}
            >
              {locations?.map((loc) => {
                const cnt = locationCounts.get(loc.id) ?? 0;
                return (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}{cnt > 0 ? ` (${cnt})` : ''}
                  </option>
                );
              })}
            </select>
            {otherLocationTickets > 0 && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-bold animate-pulse"
                style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
              >
                {otherLocationTickets} elsewhere
              </span>
            )}
          </div>
        )}

        {/* Metrics bar */}
        <div className="flex items-center gap-3 px-3" style={{ backgroundColor: 'var(--fnb-bg-surface)' }}>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md"
            style={{ backgroundColor: readyCount > 0 ? 'rgba(34,197,94,0.15)' : 'transparent' }}>
            <Package className="h-3.5 w-3.5" style={{ color: readyCount > 0 ? '#22c55e' : 'var(--fnb-text-muted)' }} />
            <span className="text-xs font-bold" style={{ color: readyCount > 0 ? '#22c55e' : 'var(--fnb-text-muted)' }}>
              {readyCount}/{totalCount} Ready
            </span>
          </div>
          {avgElapsed > 0 && (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" style={{ color: 'var(--fnb-text-muted)' }} />
              <span className="text-xs font-bold fnb-mono"
                style={{ color: avgElapsed > DEFAULT_CRITICAL_SECONDS ? '#ef4444' : avgElapsed > DEFAULT_WARNING_SECONDS ? '#f97316' : 'var(--fnb-text-secondary)' }}>
                Avg: {formatTimer(avgElapsed)}
              </span>
            </div>
          )}
          {overdueCount > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full animate-pulse"
              style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
              {overdueCount} Overdue
            </span>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-2" style={{ backgroundColor: 'var(--fnb-bg-surface)' }}>
          <button type="button" onClick={() => handleTabChange(activeTab === 'history' ? 'active' : 'history')}
            className="p-1.5 rounded transition-colors"
            title={activeTab === 'history' ? 'Back to active' : 'Order history'}
            style={{
              backgroundColor: activeTab === 'history' ? 'rgba(99,102,241,0.2)' : 'transparent',
              color: activeTab === 'history' ? 'var(--fnb-status-seated)' : 'var(--fnb-text-muted)',
            }}>
            <History className="h-4 w-4" />
          </button>
          <ItemSummaryToggle onClick={() => setShowSummary(!showSummary)} isOpen={showSummary} />
          <button type="button" onClick={() => setViewMode(viewMode === 'rail' ? 'grid' : 'rail')}
            className="p-1.5 rounded transition-colors"
            style={{ color: 'var(--fnb-text-muted)' }}>
            {viewMode === 'grid' ? <LayoutList className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
          </button>
          <button type="button" onClick={() => setIsPaused(!isPaused)}
            className="p-1.5 rounded transition-colors"
            style={{ backgroundColor: isPaused ? 'rgba(239,68,68,0.2)' : 'transparent', color: isPaused ? '#ef4444' : 'var(--fnb-text-muted)' }}>
            {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Kitchen Behind banner */}
      <KitchenBehindBanner
        tickets={expoView.tickets}
        warningThresholdSeconds={DEFAULT_WARNING_SECONDS}
        criticalThresholdSeconds={DEFAULT_CRITICAL_SECONDS}
      />

      {/* Action error toast */}
      {actionError && (
        <div className="flex items-center justify-between px-3 py-1.5 text-xs font-medium shrink-0"
          style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Search + filter bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 shrink-0" style={{ backgroundColor: 'var(--fnb-bg-surface)', borderBottom: '1px solid rgba(148, 163, 184, 0.15)' }}>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--fnb-text-muted)' }} />
          <input
            type="text"
            placeholder="Search table, server, or customer..."
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
            { key: 'all' as const, label: 'All', count: totalCount },
            { key: 'ready' as const, label: 'Ready', count: readyCount },
            { key: 'in_progress' as const, label: 'In Progress', count: totalCount - readyCount },
            { key: 'held' as const, label: 'Held', count: null },
            { key: 'rush' as const, label: 'Rush', count: null },
          ]).map(({ key, label, count }) => (
            <button key={key} type="button"
              onClick={() => setFilter(key)}
              className="px-2 py-0.5 text-[10px] font-medium rounded-full transition-colors"
              style={{
                backgroundColor: filter === key ? 'rgba(99,102,241,0.2)' : 'transparent',
                color: filter === key ? 'var(--fnb-status-seated)' : 'var(--fnb-text-muted)',
                border: `1px solid ${filter === key ? 'rgba(99,102,241,0.3)' : 'rgba(148, 163, 184, 0.15)'}`,
              }}>
              {label}
              {count != null && <span className="ml-1 fnb-mono">{count}</span>}
              {key === 'rush' && <Flame className="h-2.5 w-2.5 inline ml-0.5" />}
            </button>
          ))}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {activeTab === 'history' ? (
          <ExpoHistoryPanel
            history={expoHistory}
            isLoading={historyLoading}
            onRefresh={refreshHistory}
          />
        ) : (
          <>
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
                      onBumpTicket={bumpTicket} onFireTicket={fireTicket} onRecallTicket={recallTicket}
                      disabled={isActing || isFiring} />
                  ))}
                </div>
              ) : (
                <div className="flex gap-3 p-3 h-full items-start overflow-x-auto">
                  {filteredTickets.map((ticket) => (
                    <ExpoTicketCard key={ticket.ticketId} ticket={ticket}
                      warningThresholdSeconds={DEFAULT_WARNING_SECONDS} criticalThresholdSeconds={DEFAULT_CRITICAL_SECONDS}
                      onBumpTicket={bumpTicket} onFireTicket={fireTicket} onRecallTicket={recallTicket}
                      disabled={isActing || isFiring} />
                  ))}
                </div>
              )}
            </div>

            {/* Right panel: item summary + metrics */}
            {showSummary && (
              <div className="flex flex-col">
                <ItemSummaryPanel
                  tickets={expoView.tickets}
                  onClose={() => setShowSummary(false)}
                />
                <KitchenMetrics
                  tickets={expoView.tickets}
                  warningThresholdSeconds={DEFAULT_WARNING_SECONDS}
                  criticalThresholdSeconds={DEFAULT_CRITICAL_SECONDS}
                  totalServedToday={expoHistory?.totalServed ?? 0}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
