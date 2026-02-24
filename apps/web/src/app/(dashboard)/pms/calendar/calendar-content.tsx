'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Loader2 } from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type {
  CalendarWeekData,
  CalendarDayData,
  CalendarFilters,
  ViewRange,
  OccupancyByDate,
} from '@/components/pms/calendar/types';
import {
  EMPTY_FILTERS,
  formatDate,
  getMonday,
  getDateRange,
} from '@/components/pms/calendar/types';
import CalendarToolbar from '@/components/pms/calendar/CalendarToolbar';
import CalendarLegend from '@/components/pms/calendar/CalendarLegend';
import CalendarStatsBar from '@/components/pms/calendar/CalendarStatsBar';
import CalendarGrid from '@/components/pms/calendar/CalendarGrid';
import DayView from '@/components/pms/calendar/DayView';
import UnassignedPanel from '@/components/pms/calendar/UnassignedPanel';
import ReservationContextMenu from '@/components/pms/calendar/ReservationContextMenu';
import type { ContextMenuState } from '@/components/pms/calendar/ReservationContextMenu';

interface Property {
  id: string;
  name: string;
}

const POS_TERMINAL_KEY = 'pos_terminal_id';
const PMS_RESERVATION_CATALOG_ITEM_KEY = 'pms:reservation-charge-catalog-item';

export default function CalendarContent() {
  const router = useRouter();
  const { locations } = useAuthContext();

  // ── State ───────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'grid' | 'day'>('grid');
  const [viewRange, setViewRange] = useState<ViewRange>(7);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [selectedDate, setSelectedDate] = useState<string>(() => formatDate(new Date()));
  const [weekData, setWeekData] = useState<CalendarWeekData | null>(null);
  const [dayData, setDayData] = useState<CalendarDayData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<CalendarFilters>(EMPTY_FILTERS);
  const [showLegend, setShowLegend] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [isPostingToPos, setIsPostingToPos] = useState(false);
  const lastUpdatedRef = useRef<string | null>(null);

  // POS config from localStorage
  const [terminalId, setTerminalId] = useState('POS-01');
  const [reservationCatalogItemId, setReservationCatalogItemId] = useState('');

  useEffect(() => {
    const t = localStorage.getItem(POS_TERMINAL_KEY);
    const c = localStorage.getItem(PMS_RESERVATION_CATALOG_ITEM_KEY);
    if (t) setTerminalId(t);
    if (c) setReservationCatalogItemId(c);
  }, []);

  // ── Fetch properties ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ data: Property[] }>('/api/v1/pms/properties')
      .then((res) => {
        if (cancelled) return;
        setProperties(res.data);
        if (res.data.length > 0 && !propertyId) setPropertyId(res.data[0]!.id);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load properties');
      });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line

  // ── Fetch grid data (week/14/30) ───────────────────────────────
  const fetchGrid = useCallback(async (silent = false) => {
    if (!propertyId) return;
    if (!silent) { setIsLoading(true); setError(null); }
    try {
      const qs = buildQueryString({ propertyId, start: formatDate(weekStart) });
      const res = await apiFetch<{ data: CalendarWeekData }>(`/api/v1/pms/calendar/week${qs}`);
      setWeekData(res.data);
      lastUpdatedRef.current = res.data.meta.lastUpdatedAt;
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Failed to load calendar');
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [propertyId, weekStart]);

  useEffect(() => {
    if (viewMode !== 'grid') return;
    fetchGrid();
  }, [fetchGrid, viewMode]);

  // ── Fetch day data ─────────────────────────────────────────────
  const fetchDay = useCallback(async (silent = false) => {
    if (!propertyId) return;
    if (!silent) { setIsLoading(true); setError(null); }
    try {
      const qs = buildQueryString({ propertyId, date: selectedDate });
      const res = await apiFetch<{ data: CalendarDayData }>(`/api/v1/pms/calendar/day${qs}`);
      setDayData(res.data);
      lastUpdatedRef.current = new Date().toISOString();
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Failed to load calendar');
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [propertyId, selectedDate]);

  useEffect(() => {
    if (viewMode !== 'day') return;
    fetchDay();
  }, [fetchDay, viewMode]);

  // ── Auto-refresh (60s) ────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      if (viewMode === 'grid') fetchGrid(true);
      else fetchDay(true);
    }, 60_000);
    return () => clearInterval(interval);
  }, [viewMode, fetchGrid, fetchDay]);

  // ── Keyboard shortcuts ────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case 't':
        case 'T':
          goToToday();
          break;
        case 'ArrowLeft':
          onPrev();
          break;
        case 'ArrowRight':
          onNext();
          break;
        case '1':
          setViewRange(7);
          break;
        case '2':
          setViewRange(14);
          break;
        case '3':
          setViewRange(30);
          break;
        case 'Escape':
          setContextMenu(null);
          setShowLegend(false);
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }); // intentionally no deps — uses latest closures

  // ── Navigation ─────────────────────────────────────────────────
  const onPrev = useCallback(() => {
    if (viewMode === 'grid') {
      setWeekStart((prev) => {
        const d = new Date(prev);
        d.setDate(d.getDate() - viewRange);
        return d;
      });
    } else {
      setSelectedDate((prev) => {
        const d = new Date(`${prev}T00:00:00`);
        d.setDate(d.getDate() - 1);
        return formatDate(d);
      });
    }
  }, [viewMode, viewRange]);

  const onNext = useCallback(() => {
    if (viewMode === 'grid') {
      setWeekStart((prev) => {
        const d = new Date(prev);
        d.setDate(d.getDate() + viewRange);
        return d;
      });
    } else {
      setSelectedDate((prev) => {
        const d = new Date(`${prev}T00:00:00`);
        d.setDate(d.getDate() + 1);
        return formatDate(d);
      });
    }
  }, [viewMode, viewRange]);

  const goToToday = useCallback(() => {
    if (viewMode === 'grid') setWeekStart(getMonday(new Date()));
    else setSelectedDate(formatDate(new Date()));
  }, [viewMode]);

  // ── Grid date range ────────────────────────────────────────────
  const dates = useMemo(() => getDateRange(weekStart, viewRange), [weekStart, viewRange]);

  // ── Aggregate stats for stats bar ─────────────────────────────
  const aggregateOccupancy = useMemo((): OccupancyByDate | null => {
    if (viewMode === 'day') return dayData?.occupancy ?? null;
    if (!weekData) return null;
    const todayStr = formatDate(new Date());
    const todayOcc = weekData.meta.occupancyByDate[todayStr];
    if (todayOcc) return todayOcc;
    // Fall back to first date in range
    const first = dates[0];
    return first ? weekData.meta.occupancyByDate[first] ?? null : null;
  }, [viewMode, weekData, dayData, dates]);

  // ── Mutations ──────────────────────────────────────────────────
  const handleMove = useCallback(
    async (input: {
      reservationId: string;
      from: { roomId: string; checkInDate: string; checkOutDate: string; version: number };
      to: { roomId: string; checkInDate: string };
    }) => {
      try {
        await apiFetch('/api/v1/pms/calendar/move', {
          method: 'POST',
          body: JSON.stringify({
            ...input,
            idempotencyKey: `move-${input.reservationId}-${Date.now()}`,
          }),
        });
        fetchGrid(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Move failed');
      }
    },
    [fetchGrid],
  );

  const handleResize = useCallback(
    async (input: {
      reservationId: string;
      edge: 'LEFT' | 'RIGHT';
      from: { checkInDate: string; checkOutDate: string; roomId: string; version: number };
      to: { checkInDate?: string; checkOutDate?: string };
    }) => {
      try {
        await apiFetch('/api/v1/pms/calendar/resize', {
          method: 'POST',
          body: JSON.stringify({
            ...input,
            idempotencyKey: `resize-${input.reservationId}-${Date.now()}`,
          }),
        });
        fetchGrid(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Resize failed');
      }
    },
    [fetchGrid],
  );

  // ── POS check-in ──────────────────────────────────────────────
  const handleCheckInToPos = useCallback(
    async (reservationId: string) => {
      const locationId = locations[0]?.id;
      if (!locationId || !reservationCatalogItemId.trim() || !terminalId.trim()) {
        setError('POS terminal ID and catalog item ID are required');
        return;
      }
      setIsPostingToPos(true);
      try {
        const result = await apiFetch<{
          data: { reservationId: string; orderId: string; tabId: string; tabNumber: number; terminalId: string };
        }>(`/api/v1/pms/reservations/${reservationId}/check-in-to-pos`, {
          method: 'POST',
          headers: { 'X-Location-Id': locationId },
          body: JSON.stringify({
            terminalId: terminalId.trim(),
            catalogItemId: reservationCatalogItemId.trim(),
          }),
        });
        localStorage.setItem(POS_TERMINAL_KEY, result.data.terminalId);
        localStorage.setItem(PMS_RESERVATION_CATALOG_ITEM_KEY, reservationCatalogItemId.trim());
        router.push(`/pos/retail?terminal=${encodeURIComponent(result.data.terminalId)}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to check in to POS');
      } finally {
        setIsPostingToPos(false);
        setContextMenu(null);
      }
    },
    [locations, reservationCatalogItemId, terminalId, router],
  );

  // ── Date click (grid header -> day view) ──────────────────────
  const handleDateClick = useCallback((date: string) => {
    setSelectedDate(date);
    setViewMode('day');
  }, []);

  const handleContextMenu = useCallback((state: ContextMenuState) => setContextMenu(state), []);

  // ── Derived data ───────────────────────────────────────────────
  const currentRooms = viewMode === 'grid' ? (weekData?.rooms ?? []) : (dayData?.rooms ?? []);
  const currentSegments = viewMode === 'grid' ? (weekData?.segments ?? []) : (dayData?.segments ?? []);
  const unassigned = viewMode === 'grid' ? (weekData?.unassigned ?? []) : (dayData?.unassigned ?? []);

  return (
    <div className="space-y-3 print:space-y-2">
      {/* Header */}
      <div className="flex items-center gap-3 print:hidden">
        <Calendar className="h-5 w-5 text-gray-500" />
        <h1 className="text-xl font-semibold text-gray-900">Calendar</h1>
      </div>

      {/* POS config row (collapsible later) */}
      <div className="grid grid-cols-1 gap-2 rounded-lg border border-gray-200 bg-surface p-3 md:grid-cols-2 print:hidden">
        <label className="text-xs text-gray-600">
          POS Terminal ID
          <input
            value={terminalId}
            onChange={(e) => setTerminalId(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm text-gray-900"
            placeholder="POS-01"
          />
        </label>
        <label className="text-xs text-gray-600">
          Reservation Charge Catalog Item ID
          <input
            value={reservationCatalogItemId}
            onChange={(e) => setReservationCatalogItemId(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm text-gray-900"
            placeholder="catalog item id"
          />
        </label>
      </div>

      {/* Toolbar */}
      <CalendarToolbar
        viewRange={viewRange}
        onViewRangeChange={setViewRange}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        weekStart={weekStart}
        selectedDate={selectedDate}
        onPrev={onPrev}
        onNext={onNext}
        onToday={goToToday}
        properties={properties}
        propertyId={propertyId}
        onPropertyChange={setPropertyId}
        filters={filters}
        onFiltersChange={setFilters}
        showLegend={showLegend}
        onToggleLegend={() => setShowLegend(!showLegend)}
        rooms={currentRooms}
        segments={currentSegments}
        lastUpdatedAt={lastUpdatedRef.current}
      />

      {/* Legend */}
      <CalendarLegend visible={showLegend} />

      {/* Stats bar */}
      <CalendarStatsBar
        totalRooms={viewMode === 'grid' ? (weekData?.meta.totalRooms ?? 0) : (dayData?.rooms.length ?? 0)}
        occupancy={aggregateOccupancy}
        lastUpdatedAt={lastUpdatedRef.current}
      />

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Grid view */}
      {!isLoading && !error && viewMode === 'grid' && weekData && (
        <CalendarGrid
          rooms={weekData.rooms}
          segments={weekData.segments}
          oooBlocks={weekData.oooBlocks}
          dates={dates}
          viewRange={viewRange}
          occupancyByDate={weekData.meta.occupancyByDate}
          totalRooms={weekData.meta.totalRooms}
          filters={filters}
          onDateClick={handleDateClick}
          onContextMenu={handleContextMenu}
          onMove={handleMove}
          onResize={handleResize}
        />
      )}

      {/* Day view */}
      {!isLoading && !error && viewMode === 'day' && dayData && (
        <DayView
          rooms={dayData.rooms}
          segments={dayData.segments}
          oooBlocks={dayData.oooBlocks}
          occupancy={dayData.occupancy}
          date={selectedDate}
          filters={filters}
          onContextMenu={handleContextMenu}
        />
      )}

      {/* Unassigned panel */}
      {!isLoading && !error && unassigned.length > 0 && (
        <UnassignedPanel
          reservations={unassigned}
          onClickReservation={(id) => router.push(`/pms/reservations/${id}`)}
          onContextMenu={(e, id, status) => {
            e.preventDefault();
            handleContextMenu({ x: e.clientX, y: e.clientY, reservationId: id, status, confirmationNumber: null });
          }}
        />
      )}

      {/* Empty states */}
      {!isLoading && !error && viewMode === 'grid' && weekData?.rooms.length === 0 && (
        <EmptyState />
      )}
      {!isLoading && !error && viewMode === 'day' && dayData?.rooms.length === 0 && (
        <EmptyState />
      )}

      {/* Context menu */}
      {contextMenu && (
        <ReservationContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onViewReservation={(id) => router.push(`/pms/reservations/${id}`)}
          onCheckInToPos={handleCheckInToPos}
          isPostingToPos={isPostingToPos}
        />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-500">
      <Calendar className="mb-2 h-10 w-10 text-gray-300" />
      <p className="text-sm">No rooms found for this property.</p>
    </div>
  );
}
