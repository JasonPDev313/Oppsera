'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Loader2 } from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type {
  CalendarWeekData,
  CalendarDayData,
  CalendarFilters,
  ViewRange,
  ViewMode,
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
import CondensedView from '@/components/pms/calendar/CondensedView';
import DayView from '@/components/pms/calendar/DayView';
import UnassignedPanel from '@/components/pms/calendar/UnassignedPanel';
import ReservationContextMenu from '@/components/pms/calendar/ReservationContextMenu';
import type { ContextMenuState } from '@/components/pms/calendar/ReservationContextMenu';
import CreateReservationDialog from '@/components/pms/CreateReservationDialog';
import ReservationListView from '@/components/pms/ReservationListView';

interface Property {
  id: string;
  name: string;
}

const POS_TERMINAL_KEY = 'pos_terminal_id';
const PMS_RESERVATION_CATALOG_ITEM_KEY = 'pms:reservation-charge-catalog-item';

export default function CalendarContent() {
  const router = useRouter();
  const { locations } = useAuthContext();

  // ── Page-level view (calendar vs list) ─────────────────────────
  const [pageView, setPageView] = useState<'quick' | 'calendar' | 'list'>(() => {
    if (typeof window !== 'undefined') {
      const param = new URLSearchParams(window.location.search).get('view');
      if (param === 'list') return 'list';
      if (param === 'calendar') return 'calendar';
      const stored = localStorage.getItem('pms_view_mode');
      if (stored === 'list' || stored === 'calendar' || stored === 'quick') return stored;
      return 'quick';
    }
    return 'quick';
  });
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createPrefill, setCreatePrefill] = useState<{
    checkIn?: string; checkOut?: string; roomTypeId?: string; roomId?: string;
  }>({});
  const [listRefreshKey, setListRefreshKey] = useState(0);

  // Persist page view preference
  useEffect(() => {
    localStorage.setItem('pms_view_mode', pageView);
  }, [pageView]);

  // ── State ───────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
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
    if (pageView === 'quick' || (pageView === 'calendar' && viewMode === 'grid')) {
      fetchGrid();
    }
  }, [fetchGrid, pageView, viewMode]);

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
    if (pageView === 'calendar' && viewMode === 'day') {
      fetchDay();
    }
  }, [fetchDay, pageView, viewMode]);

  // ── Auto-refresh (60s) ────────────────────────────────────────
  useEffect(() => {
    if (pageView === 'list') return;
    const interval = setInterval(() => {
      if (pageView === 'quick' || (pageView === 'calendar' && viewMode === 'grid')) fetchGrid(true);
      else if (pageView === 'calendar' && viewMode === 'day') fetchDay(true);
    }, 60_000);
    return () => clearInterval(interval);
  }, [pageView, viewMode, fetchGrid, fetchDay]);

  // ── Keyboard shortcuts ────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showCreateDialog) return;
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
  // Week-based nav for Quick View and Calendar grid; day-based for Calendar day
  const usesWeekNav = pageView === 'quick' || (pageView === 'calendar' && viewMode === 'grid');

  const onPrev = useCallback(() => {
    if (usesWeekNav) {
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
  }, [usesWeekNav, viewRange]);

  const onNext = useCallback(() => {
    if (usesWeekNav) {
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
  }, [usesWeekNav, viewRange]);

  const goToToday = useCallback(() => {
    if (usesWeekNav) setWeekStart(getMonday(new Date()));
    else setSelectedDate(formatDate(new Date()));
  }, [usesWeekNav]);

  const handleDateJump = useCallback((dateStr: string) => {
    const d = new Date(`${dateStr}T00:00:00`);
    if (usesWeekNav) {
      setWeekStart(getMonday(d));
    } else {
      setSelectedDate(dateStr);
    }
  }, [usesWeekNav]);

  // ── Grid date range ────────────────────────────────────────────
  const dates = useMemo(() => getDateRange(weekStart, viewRange), [weekStart, viewRange]);

  // ── Aggregate stats for stats bar ─────────────────────────────
  const aggregateOccupancy = useMemo((): OccupancyByDate | null => {
    if (pageView === 'calendar' && viewMode === 'day') return dayData?.occupancy ?? null;
    // Quick View + Calendar grid both use weekData
    if (!weekData) return null;
    const todayStr = formatDate(new Date());
    const todayOcc = weekData.meta.occupancyByDate[todayStr];
    if (todayOcc) return todayOcc;
    const first = dates[0];
    return first ? weekData.meta.occupancyByDate[first] ?? null : null;
  }, [pageView, viewMode, weekData, dayData, dates]);

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

  // ── Quick actions from context menu ───────────────────────────
  const [isActing, setIsActing] = useState(false);

  const handleCheckIn = useCallback(
    async (reservationId: string) => {
      if (!contextMenu?.version || !contextMenu?.roomId) {
        router.push(`/pms/reservations/${reservationId}`);
        return;
      }
      setIsActing(true);
      try {
        await apiFetch(`/api/v1/pms/reservations/${reservationId}/check-in`, {
          method: 'POST',
          body: JSON.stringify({ roomId: contextMenu.roomId, version: contextMenu.version }),
        });
        if (pageView === 'quick' || (pageView === 'calendar' && viewMode !== 'day')) fetchGrid(true);
        else if (pageView === 'calendar' && viewMode === 'day') fetchDay(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Check-in failed');
      } finally {
        setIsActing(false);
        setContextMenu(null);
      }
    },
    [contextMenu, pageView, viewMode, fetchGrid, fetchDay, router],
  );

  const handleCheckOut = useCallback(
    async (reservationId: string) => {
      if (!contextMenu?.version) {
        router.push(`/pms/reservations/${reservationId}`);
        return;
      }
      setIsActing(true);
      try {
        await apiFetch(`/api/v1/pms/reservations/${reservationId}/check-out`, {
          method: 'POST',
          body: JSON.stringify({ version: contextMenu.version }),
        });
        if (pageView === 'quick' || (pageView === 'calendar' && viewMode !== 'day')) fetchGrid(true);
        else if (pageView === 'calendar' && viewMode === 'day') fetchDay(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Check-out failed');
      } finally {
        setIsActing(false);
        setContextMenu(null);
      }
    },
    [contextMenu, pageView, viewMode, fetchGrid, fetchDay, router],
  );

  const handleCancel = useCallback(
    async (reservationId: string) => {
      if (!contextMenu?.version) {
        router.push(`/pms/reservations/${reservationId}`);
        return;
      }
      setIsActing(true);
      try {
        await apiFetch(`/api/v1/pms/reservations/${reservationId}/cancel`, {
          method: 'POST',
          body: JSON.stringify({ reason: 'Cancelled from calendar', version: contextMenu.version }),
        });
        if (pageView === 'quick' || (pageView === 'calendar' && viewMode !== 'day')) fetchGrid(true);
        else if (pageView === 'calendar' && viewMode === 'day') fetchDay(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Cancel failed');
      } finally {
        setIsActing(false);
        setContextMenu(null);
      }
    },
    [contextMenu, pageView, viewMode, fetchGrid, fetchDay, router],
  );

  // ── Date click (grid header -> day view) ──────────────────────
  const handleDateClick = useCallback((date: string) => {
    setSelectedDate(date);
    setPageView('calendar');
    setViewMode('day');
  }, []);

  const handleContextMenu = useCallback((state: ContextMenuState) => setContextMenu(state), []);

  // ── Empty cell handlers (create reservation from calendar) ────
  const computeCheckOut = useCallback((checkIn: string) => {
    const d = new Date(`${checkIn}T00:00:00`);
    d.setDate(d.getDate() + 1);
    return formatDate(d);
  }, []);

  const handleEmptyCellClick = useCallback(
    (roomId: string, date: string, roomTypeId: string) => {
      setCreatePrefill({ checkIn: date, checkOut: computeCheckOut(date), roomTypeId, roomId });
      setShowCreateDialog(true);
    },
    [computeCheckOut],
  );

  const handleEmptyCellContextMenu = useCallback(
    (e: React.MouseEvent, roomId: string, date: string, roomTypeId: string) => {
      e.preventDefault();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        reservationId: '',
        status: '',
        confirmationNumber: null,
        emptyCell: { roomId, date, roomTypeId },
      });
    },
    [],
  );

  const handleNewReservation = useCallback(() => {
    setCreatePrefill({});
    setShowCreateDialog(true);
  }, []);

  const handleNewReservationFromMenu = useCallback(
    (roomId: string, date: string, roomTypeId: string) => {
      setCreatePrefill({ checkIn: date, checkOut: computeCheckOut(date), roomTypeId, roomId });
      setShowCreateDialog(true);
    },
    [computeCheckOut],
  );

  const handleCreateSuccess = useCallback(() => {
    setShowCreateDialog(false);
    if (pageView === 'quick') {
      fetchGrid(true);
    } else if (pageView === 'calendar') {
      if (viewMode === 'day') fetchDay(true);
      else fetchGrid(true);
    } else {
      setListRefreshKey((k) => k + 1);
    }
  }, [pageView, viewMode, fetchGrid, fetchDay]);

  // ── Derived data ───────────────────────────────────────────────
  const usesDayData = pageView === 'calendar' && viewMode === 'day';
  const currentRooms = usesDayData ? (dayData?.rooms ?? []) : (weekData?.rooms ?? []);
  const currentSegments = usesDayData ? (dayData?.segments ?? []) : (weekData?.segments ?? []);
  const unassigned = usesDayData ? (dayData?.unassigned ?? []) : (weekData?.unassigned ?? []);

  return (
    <div className={`flex flex-col gap-3 print:gap-2${pageView === 'quick' ? ' h-full' : ''}`}>
      {/* Header */}
      <div className="flex items-center gap-3 print:hidden">
        <CalendarDays className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold text-foreground">Reservations</h1>
      </div>

      {/* POS config row (collapsible later) */}
      <div className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-surface p-3 md:grid-cols-2 print:hidden">
        <label className="text-xs text-muted-foreground">
          POS Terminal ID
          <input
            value={terminalId}
            onChange={(e) => setTerminalId(e.target.value)}
            className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm text-foreground"
            placeholder="POS-01"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Reservation Charge Catalog Item ID
          <input
            value={reservationCatalogItemId}
            onChange={(e) => setReservationCatalogItemId(e.target.value)}
            className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm text-foreground"
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
        onDateJump={handleDateJump}
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
        pageView={pageView}
        onPageViewChange={setPageView}
        onNewReservation={handleNewReservation}
      />

      {/* Shared: Legend + Stats bar + Loading/Error (Quick View + Calendar) */}
      {pageView !== 'list' && (
        <>
          <CalendarLegend visible={showLegend} />

          <CalendarStatsBar
            totalRooms={usesDayData ? (dayData?.rooms.length ?? 0) : (weekData?.meta.totalRooms ?? 0)}
            occupancy={aggregateOccupancy}
            lastUpdatedAt={lastUpdatedRef.current}
          />

          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div>
          )}
        </>
      )}

      {/* Quick View (default) — fills remaining viewport height */}
      {pageView === 'quick' && !isLoading && !error && weekData && (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <CondensedView
            rooms={weekData.rooms}
            segments={weekData.segments}
            dates={dates}
            onSelectDate={(date, roomTypeId) => {
              setCreatePrefill({ checkIn: date, checkOut: computeCheckOut(date), roomTypeId });
              setShowCreateDialog(true);
            }}
          />

          {unassigned.length > 0 && (
            <UnassignedPanel
              reservations={unassigned}
              onClickReservation={(id) => router.push(`/pms/reservations/${id}`)}
              onContextMenu={(e, id, status) => {
                e.preventDefault();
                handleContextMenu({ x: e.clientX, y: e.clientY, reservationId: id, status, confirmationNumber: null });
              }}
            />
          )}

          {weekData.rooms.length === 0 && <EmptyState />}
        </div>
      )}

      {/* Calendar view (grid + day sub-modes) */}
      {pageView === 'calendar' && !isLoading && !error && (
        <>
          {/* Grid view */}
          {viewMode === 'grid' && weekData && (
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
              onEmptyCellClick={handleEmptyCellClick}
              onEmptyCellContextMenu={handleEmptyCellContextMenu}
              onNavigatePrev={onPrev}
              onNavigateNext={onNext}
            />
          )}

          {/* Day view */}
          {viewMode === 'day' && dayData && (
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
          {unassigned.length > 0 && (
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
          {viewMode === 'grid' && weekData?.rooms.length === 0 && <EmptyState />}
          {viewMode === 'day' && dayData?.rooms.length === 0 && <EmptyState />}
        </>
      )}

      {/* List view */}
      {pageView === 'list' && propertyId && (
        <ReservationListView
          propertyId={propertyId}
          onRowClick={(id) => router.push(`/pms/reservations/${id}`)}
          refreshKey={listRefreshKey}
        />
      )}

      {/* Context menu (both views) */}
      {contextMenu && (
        <ReservationContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onViewReservation={(id) => router.push(`/pms/reservations/${id}`)}
          onCheckIn={handleCheckIn}
          onCheckOut={handleCheckOut}
          onCancel={handleCancel}
          onCheckInToPos={handleCheckInToPos}
          isPostingToPos={isPostingToPos || isActing}
          onNewReservation={handleNewReservationFromMenu}
        />
      )}

      {/* Create Reservation Dialog (shared across both views) */}
      <CreateReservationDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSuccess={handleCreateSuccess}
        propertyId={propertyId}
        prefillCheckIn={createPrefill.checkIn}
        prefillCheckOut={createPrefill.checkOut}
        prefillRoomTypeId={createPrefill.roomTypeId}
        prefillRoomId={createPrefill.roomId}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <CalendarDays className="mb-2 h-10 w-10 text-muted-foreground" />
      <p className="text-sm">No rooms found for this property.</p>
    </div>
  );
}
