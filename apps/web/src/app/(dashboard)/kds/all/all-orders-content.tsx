'use client';

/**
 * All Orders KDS view — shows ALL active tickets across ALL stations.
 * Useful for managers, small kitchens, or debugging routing.
 * Uses a single backend query instead of per-station fan-out.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthContext } from '@/components/auth-provider';
import { useTerminalSession } from '@/components/terminal-session-provider';
import { apiFetch } from '@/lib/api-client';
import { useKdsLocationCounts } from '@/hooks/use-fnb-kitchen';
import type { KdsTicketCard } from '@/types/fnb';
import { TicketCard } from '@/components/fnb/kitchen/TicketCard';
import { KitchenBehindBanner } from '@/components/fnb/kitchen/KitchenBehindBanner';
import { ItemSummaryPanel, ItemSummaryToggle } from '@/components/fnb/kitchen/ItemSummaryPanel';
import { formatTimer } from '@/components/fnb/kitchen/TimerBar';
import {
  ArrowLeft, LayoutGrid, LayoutList, Pause, Play, Clock, MapPin,
} from 'lucide-react';

type ViewMode = 'grid' | 'rail';
type Density = 'compact' | 'standard' | 'comfortable';

interface KdsAllTicketsResponse {
  tickets: KdsTicketCard[];
  activeTicketCount: number;
  stationCount: number;
  warningThresholdSeconds: number;
  criticalThresholdSeconds: number;
}

const POLL_INTERVAL = 10_000; // 10s for all-stations view

export default function AllOrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locations } = useAuthContext();
  const { session: terminalSession } = useTerminalSession();
  const [locationId, setLocationId] = useState(() => {
    const fromUrl = searchParams.get('locationId');
    if (fromUrl && locations?.some((l) => l.id === fromUrl)) return fromUrl;
    return terminalSession?.locationId ?? locations?.[0]?.id ?? '';
  });
  // Detect if the URL had a locationId that didn't match any known location
  const locationFellBack = (() => {
    const fromUrl = searchParams.get('locationId');
    return fromUrl !== null && !locations?.some((l) => l.id === fromUrl);
  })();
  const resolvedLocationName = locations?.find((l) => l.id === locationId)?.name;
  const changeLocation = useCallback((newId: string) => {
    setLocationId(newId);
    router.replace(`/kds/all?locationId=${newId}`, { scroll: false });
  }, [router]);
  const hasMultipleLocations = (locations?.length ?? 0) > 1;
  const locationCounts = useKdsLocationCounts(locations?.map((l) => l.id) ?? []);

  // Count tickets at OTHER locations (for persistent badge + pulse)
  const otherLocationTickets = useMemo(() => {
    let total = 0;
    for (const [id, count] of locationCounts) {
      if (id !== locationId) total += count;
    }
    return total;
  }, [locationCounts, locationId]);

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [density, _setDensity] = useState<Density>('standard');
  const [isPaused, setIsPaused] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [allTickets, setAllTickets] = useState<KdsTicketCard[]>([]);
  const [thresholds, setThresholds] = useState({ warning: 480, critical: 720 });
  const [isLoading, setIsLoading] = useState(true);
  const fetchingRef = useRef(false);
  const [isActing, setIsActing] = useState(false);

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
        {
          signal,
          headers: locationId ? { 'X-Location-Id': locationId } : undefined,
        },
      );

      if (signal?.aborted) return;

      const sorted = result.data.tickets.sort((a, b) => {
        if (b.priorityLevel !== a.priorityLevel) return b.priorityLevel - a.priorityLevel;
        return b.elapsedSeconds - a.elapsedSeconds;
      });

      setAllTickets(sorted);
      setThresholds({
        warning: result.data.warningThresholdSeconds ?? 480,
        critical: result.data.criticalThresholdSeconds ?? 720,
      });
    } catch {
      // silent — AbortError is rethrown by apiFetch without logging
    } finally {
      fetchingRef.current = false;
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [locationId]);

  const bumpItem = useCallback(async (ticketItemId: string, stationId?: string | null) => {
    if (isActing) return;
    if (!stationId) {
      fetchAll();
      return;
    }
    setIsActing(true);
    try {
      await apiFetch(`/api/v1/fnb/stations/${stationId}/bump-item`, {
        method: 'POST',
        body: JSON.stringify({ ticketItemId, stationId, clientRequestId: crypto.randomUUID() }),
        headers: locationId ? { 'X-Location-Id': locationId } : undefined,
      });
      await fetchAll();
    } catch {
      fetchAll();
    } finally {
      setIsActing(false);
    }
  }, [isActing, fetchAll, locationId]);

  const bumpTicket = useCallback(async (ticketId: string) => {
    if (isActing) return;
    setIsActing(true);
    try {
      await apiFetch('/api/v1/fnb/stations/expo', {
        method: 'POST',
        body: JSON.stringify({ ticketId, clientRequestId: crypto.randomUUID() }),
        headers: locationId ? { 'X-Location-Id': locationId } : undefined,
      });
      await fetchAll();
    } catch {
      fetchAll();
    } finally {
      setIsActing(false);
    }
  }, [isActing, fetchAll, locationId]);

  // "All Day" counts — total quantity of each item across all open tickets
  const allDayCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const ticket of allTickets) {
      for (const item of ticket.items) {
        if (item.itemStatus === 'voided') continue;
        const key = item.kitchenLabel || item.itemName;
        map.set(key, (map.get(key) ?? 0) + item.quantity);
      }
    }
    return map;
  }, [allTickets]);

  // Initial fetch + polling
  useEffect(() => {
    const controller = new AbortController();
    fetchAll(controller.signal);
    if (isPaused) return () => controller.abort();
    const interval = setInterval(() => fetchAll(controller.signal), POLL_INTERVAL);
    return () => {
      controller.abort();
      clearInterval(interval);
      fetchingRef.current = false;
    };
  }, [fetchAll, isPaused]);

  // Compute metrics
  const avgElapsed = useMemo(() => {
    if (allTickets.length === 0) return 0;
    return Math.round(allTickets.reduce((sum, t) => sum + t.elapsedSeconds, 0) / allTickets.length);
  }, [allTickets]);

  const defaultWarning = thresholds.warning;
  const defaultCritical = thresholds.critical;

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
          <button type="button" onClick={() => router.push(locationId ? `/kds?locationId=${locationId}` : '/kds')}
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

        <div className="flex items-center gap-2">
          {hasMultipleLocations && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" style={{ color: 'var(--fnb-text-muted)' }} />
              <select
                value={locationId}
                onChange={(e) => changeLocation(e.target.value)}
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

      {/* Location mismatch warning */}
      {locationFellBack && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs font-medium shrink-0"
          style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', borderBottom: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span>
            Location mismatch — URL location not found. Showing data for <strong>{resolvedLocationName}</strong>.
          </span>
        </div>
      )}

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
                  onBumpItem={bumpItem}
                  onBumpTicket={bumpTicket}
                  disabled={isActing}
                  density={density}
                  allDayCounts={allDayCounts}
                  kdsLocationId={locationId}
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
                  onBumpItem={bumpItem}
                  onBumpTicket={bumpTicket}
                  disabled={isActing}
                  density={density}
                  allDayCounts={allDayCounts}
                  kdsLocationId={locationId}
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
