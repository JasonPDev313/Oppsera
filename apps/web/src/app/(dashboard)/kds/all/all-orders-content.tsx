'use client';

/**
 * All Orders KDS view — shows ALL active tickets across ALL stations.
 * Useful for managers, small kitchens, or debugging routing.
 * Uses a single backend query instead of per-station fan-out.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/components/auth-provider';
import { apiFetch } from '@/lib/api-client';
import type { KdsTicketCard } from '@/types/fnb';
import { TicketCard } from '@/components/fnb/kitchen/TicketCard';
import { KitchenBehindBanner } from '@/components/fnb/kitchen/KitchenBehindBanner';
import { ItemSummaryPanel, ItemSummaryToggle } from '@/components/fnb/kitchen/ItemSummaryPanel';
import { formatTimer } from '@/components/fnb/kitchen/TimerBar';
import {
  ArrowLeft, LayoutGrid, LayoutList, Pause, Play, Clock,
} from 'lucide-react';

type ViewMode = 'grid' | 'rail';
type Density = 'compact' | 'standard' | 'comfortable';

interface KdsAllTicketsResponse {
  tickets: KdsTicketCard[];
  activeTicketCount: number;
  stationCount: number;
}

const POLL_INTERVAL = 10_000; // 10s for all-stations view
export default function AllOrdersContent() {
  const router = useRouter();
  const { locations } = useAuthContext();
  const locationId = locations?.[0]?.id;

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [density, _setDensity] = useState<Density>('standard');
  const [isPaused, setIsPaused] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [allTickets, setAllTickets] = useState<KdsTicketCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const fetchingRef = useRef(false);

  const fetchAll = useCallback(async (signal?: AbortSignal) => {
    if (!locationId) {
      setIsLoading(false);
      return;
    }
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local timezone
    try {
      const result = await apiFetch<{ data: KdsAllTicketsResponse }>(
        `/api/v1/fnb/kitchen/all?businessDate=${today}&locationId=${locationId}`,
        { signal },
      );

      if (signal?.aborted) return;

      const sorted = result.data.tickets.sort((a, b) => {
        if (b.priorityLevel !== a.priorityLevel) return b.priorityLevel - a.priorityLevel;
        return b.elapsedSeconds - a.elapsedSeconds;
      });

      setAllTickets(sorted);
    } catch {
      // silent — AbortError is rethrown by apiFetch without logging
    } finally {
      fetchingRef.current = false;
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [locationId]);

  // Initial fetch + polling
  useEffect(() => {
    const controller = new AbortController();
    fetchAll(controller.signal);
    if (isPaused) return () => controller.abort();
    const interval = setInterval(() => fetchAll(controller.signal), POLL_INTERVAL);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchAll, isPaused]);

  // Compute metrics
  const avgElapsed = useMemo(() => {
    if (allTickets.length === 0) return 0;
    return Math.round(allTickets.reduce((sum, t) => sum + t.elapsedSeconds, 0) / allTickets.length);
  }, [allTickets]);

  const defaultWarning = 300;
  const defaultCritical = 480;

  if (isLoading && allTickets.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
        <div className="text-center">
          <div className="h-8 w-8 border-2 rounded-full animate-spin mx-auto mb-2"
            style={{ borderColor: 'var(--fnb-text-muted)', borderTopColor: 'var(--fnb-status-seated)' }} />
          <p className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>Loading all orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ backgroundColor: 'var(--fnb-bg-surface)', borderColor: 'rgba(148, 163, 184, 0.15)' }}
      >
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => router.push('/kds')}
            className="flex items-center justify-center rounded-lg h-10 w-10 transition-colors hover:opacity-80"
            style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}>
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
            All Orders
          </h1>
          <span className="rounded-full px-2.5 py-0.5 text-xs font-bold"
            style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}>
            {allTickets.length} ticket{allTickets.length !== 1 ? 's' : ''}
          </span>
          {avgElapsed > 0 && (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" style={{ color: 'var(--fnb-text-muted)' }} />
              <span className="text-xs font-bold fnb-mono" style={{ color: 'var(--fnb-text-secondary)' }}>
                Avg: {formatTimer(avgElapsed)}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <ItemSummaryToggle onClick={() => setShowSummary(!showSummary)} isOpen={showSummary} />
          <button type="button" onClick={() => setViewMode(viewMode === 'rail' ? 'grid' : 'rail')}
            className="p-1.5 rounded transition-colors"
            style={{ color: 'var(--fnb-text-muted)' }}>
            {viewMode === 'grid' ? <LayoutList className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
          </button>
          <button type="button" onClick={() => { setIsPaused(!isPaused); if (isPaused) fetchAll(); }}
            className="p-1.5 rounded transition-colors"
            style={{ backgroundColor: isPaused ? 'rgba(239,68,68,0.2)' : 'transparent', color: isPaused ? '#ef4444' : 'var(--fnb-text-muted)' }}>
            {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Kitchen Behind banner */}
      <KitchenBehindBanner
        tickets={allTickets}
        warningThresholdSeconds={defaultWarning}
        criticalThresholdSeconds={defaultCritical}
      />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto">
          {allTickets.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-lg font-bold" style={{ color: 'var(--fnb-text-muted)' }}>All Clear</p>
                <p className="text-xs mt-1" style={{ color: 'var(--fnb-text-muted)' }}>No active tickets across any station</p>
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 p-3">
              {allTickets.map((ticket) => (
                <TicketCard key={ticket.ticketId}
                  ticket={ticket}
                  warningThresholdSeconds={defaultWarning}
                  criticalThresholdSeconds={defaultCritical}
                  onBumpItem={() => {}}
                  onBumpTicket={() => {}}
                  disabled
                  density={density}
                />
              ))}
            </div>
          ) : (
            <div className="flex gap-3 p-3 h-full items-start">
              {allTickets.map((ticket) => (
                <TicketCard key={ticket.ticketId}
                  ticket={ticket}
                  warningThresholdSeconds={defaultWarning}
                  criticalThresholdSeconds={defaultCritical}
                  onBumpItem={() => {}}
                  onBumpTicket={() => {}}
                  disabled
                  density={density}
                />
              ))}
            </div>
          )}
        </div>

        {showSummary && (
          <ItemSummaryPanel
            tickets={allTickets}
            onClose={() => setShowSummary(false)}
          />
        )}
      </div>
    </div>
  );
}
