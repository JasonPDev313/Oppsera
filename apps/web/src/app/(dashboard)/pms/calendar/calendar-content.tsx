'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Loader2, Undo2 } from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { useTerminalSession } from '@/components/terminal-session-provider';
import { useProperties } from '@/hooks/use-pms';
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

const POS_TERMINAL_KEY = 'pos_terminal_id';
const PMS_RESERVATION_CATALOG_ITEM_KEY = 'pms:reservation-charge-catalog-item';
const QUICK_LOOKBACK = 7;

export default function CalendarContent() {
  const router = useRouter();
  const { locations } = useAuthContext();
  const { session: terminalSession } = useTerminalSession();

  // ── Page-level view (calendar vs list) ─────────────────────────
  const [pageView, setPageView] = useState<'quick' | 'calendar' | 'list'>('quick');

  // Read URL/localStorage after mount to avoid hydration mismatch
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('view');
    if (param === 'list') { setPageView('list'); }
    else if (param === 'calendar') { setPageView('calendar'); }
    else {
      const stored = localStorage.getItem('pms_view_mode');
      if (stored === 'list' || stored === 'calendar' || stored === 'quick') setPageView(stored);
    }
  }, []);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createPrefill, setCreatePrefill] = useState<{
    checkIn?: string; checkOut?: string; roomTypeId?: string; roomId?: string;
  }>({});
  const [listRefreshKey, setListRefreshKey] = useState(0);

  // Persist page view preference + adjust weekStart anchor
  useEffect(() => {
    localStorage.setItem('pms_view_mode', pageView);
    if (pageView === 'quick') {
      // Quick View: anchor on today
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      setWeekStart(d);
    } else if (pageView === 'calendar') {
      // Calendar grid: snap to Monday
      setWeekStart((prev) => getMonday(prev));
    }
  }, [pageView]);

  // ── Properties (shared hook) ─────────────────────────────────
  const { data: properties } = useProperties();

  // ── State ───────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [viewRange, setViewRange] = useState<ViewRange>(7);
  const [propertyId, setPropertyId] = useState('');
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
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

  // Mutation errors show as a dismissible toast — don't hide the calendar
  const [mutationError, setMutationError] = useState<string | null>(null);
  const mutationErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMutationError = useCallback((msg: string) => {
    if (mutationErrorTimer.current) clearTimeout(mutationErrorTimer.current);
    setMutationError(msg);
    mutationErrorTimer.current = setTimeout(() => setMutationError(null), 5000);
  }, []);

  // ── Optimistic move + mutation lock + undo ─────────────────────
  const [isMutating, setIsMutating] = useState(false);
  const [optimisticMove, setOptimisticMove] = useState<{
    reservationId: string; fromRoomId: string; toRoomId: string;
  } | null>(null);
  const [undoAction, setUndoAction] = useState<{
    guestName: string;
    roomNumber: string;
    reverseInput: {
      reservationId: string;
      from: { roomId: string; checkInDate: string; checkOutDate: string; version: number };
      to: { roomId: string; checkInDate: string };
    };
  } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearUndo = useCallback(() => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoAction(null);
  }, []);

  // POS config from localStorage
  const [terminalId, setTerminalId] = useState('POS-01');
  const [reservationCatalogItemId, setReservationCatalogItemId] = useState('');

  useEffect(() => {
    const t = terminalSession?.terminalId ?? localStorage.getItem(POS_TERMINAL_KEY);
    const c = localStorage.getItem(PMS_RESERVATION_CATALOG_ITEM_KEY);
    if (t) setTerminalId(t);
    if (c) setReservationCatalogItemId(c);
  }, [terminalSession?.terminalId]);

  // ── Auto-select first property ────────────────────────────────
  useEffect(() => {
    if (properties.length > 0 && !propertyId) setPropertyId(properties[0]!.id);
  }, [properties, propertyId]);

  // ── Fetch grid data (week/14/30) ───────────────────────────────
  const fetchGrid = useCallback(async (silent = false) => {
    if (!propertyId) return;
    if (!silent) { setIsLoading(true); setError(null); }
    try {
      // Quick View fetches extra lookback days for prior history
      const isQuick = pageView === 'quick';
      const fetchStart = isQuick
        ? (() => { const d = new Date(weekStart); d.setDate(d.getDate() - QUICK_LOOKBACK); return formatDate(d); })()
        : formatDate(weekStart);
      const days = isQuick ? viewRange + QUICK_LOOKBACK : viewRange;
      const qs = buildQueryString({ propertyId, start: fetchStart, days });
      const res = await apiFetch<{ data: CalendarWeekData }>(`/api/v1/pms/calendar/week${qs}`);
      setWeekData(res.data);
      lastUpdatedRef.current = res.data.meta.lastUpdatedAt;
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Failed to load calendar');
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [propertyId, weekStart, pageView, viewRange]);

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

  // ── Auto-refresh (60s, skipped when tab is hidden) ───────────
  useEffect(() => {
    if (pageView === 'list') return;
    const interval = setInterval(() => {
      if (document.hidden) return;
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
    if (pageView === 'quick') {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      setWeekStart(d);
    } else if (usesWeekNav) {
      setWeekStart(getMonday(new Date()));
    } else {
      setSelectedDate(formatDate(new Date()));
    }
  }, [pageView, usesWeekNav]);

  const handleDateJump = useCallback((dateStr: string) => {
    const d = new Date(`${dateStr}T00:00:00`);
    if (pageView === 'quick') {
      d.setHours(0, 0, 0, 0);
      setWeekStart(d);
    } else if (usesWeekNav) {
      setWeekStart(getMonday(d));
    } else {
      setSelectedDate(dateStr);
    }
  }, [pageView, usesWeekNav]);

  // ── Grid date range ────────────────────────────────────────────
  const dates = useMemo(() => {
    if (pageView === 'quick') {
      // Include lookback days for scrollable past history
      const pastStart = new Date(weekStart);
      pastStart.setDate(pastStart.getDate() - QUICK_LOOKBACK);
      return getDateRange(pastStart, viewRange + QUICK_LOOKBACK);
    }
    return getDateRange(weekStart, viewRange);
  }, [pageView, weekStart, viewRange]);

  // ── Aggregate stats for stats bar ─────────────────────────────
  const aggregateOccupancy = useMemo((): OccupancyByDate | null => {
    if (pageView === 'calendar' && viewMode === 'day') return dayData?.occupancy ?? null;
    // Quick View + Calendar grid both use weekData
    if (!weekData) return null;
    const today = formatDate(new Date());
    const todayOcc = weekData.meta.occupancyByDate[today];
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
      setIsMutating(true);
      setOptimisticMove({ reservationId: input.reservationId, fromRoomId: input.from.roomId, toRoomId: input.to.roomId });
      clearUndo();

      try {
        const result = await apiFetch<{
          data: { id: string; roomId: string; checkInDate: string; checkOutDate: string; version: number };
        }>('/api/v1/pms/calendar/move', {
          method: 'POST',
          body: JSON.stringify({
            ...input,
            idempotencyKey: `move-${input.reservationId}-${Date.now()}`,
          }),
        });
        await fetchGrid(true);

        // Build undo action
        const seg = weekData?.segments.find((s) => s.reservationId === input.reservationId);
        const toRoom = weekData?.rooms.find((r) => r.roomId === input.to.roomId);
        if (seg && toRoom) {
          setUndoAction({
            guestName: seg.guestName,
            roomNumber: toRoom.roomNumber,
            reverseInput: {
              reservationId: input.reservationId,
              from: {
                roomId: result.data.roomId,
                checkInDate: result.data.checkInDate,
                checkOutDate: result.data.checkOutDate,
                version: result.data.version,
              },
              to: { roomId: input.from.roomId, checkInDate: input.from.checkInDate },
            },
          });
          if (undoTimer.current) clearTimeout(undoTimer.current);
          undoTimer.current = setTimeout(() => setUndoAction(null), 6000);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Move failed';
        if (msg.includes('modified by another') || msg.includes('CONCURRENCY_CONFLICT')) {
          await fetchGrid(true);
          showMutationError('Reservation was updated elsewhere. Calendar refreshed — please try again.');
        } else {
          showMutationError(msg);
        }
      } finally {
        setOptimisticMove(null);
        setIsMutating(false);
      }
    },
    [fetchGrid, showMutationError, clearUndo, weekData],
  );

  const handleResize = useCallback(
    async (input: {
      reservationId: string;
      edge: 'LEFT' | 'RIGHT';
      from: { checkInDate: string; checkOutDate: string; roomId: string; version: number };
      to: { checkInDate?: string; checkOutDate?: string };
    }) => {
      if (isMutating) return;
      setIsMutating(true);
      try {
        await apiFetch('/api/v1/pms/calendar/resize', {
          method: 'POST',
          body: JSON.stringify({
            ...input,
            idempotencyKey: `resize-${input.reservationId}-${Date.now()}`,
          }),
        });
        await fetchGrid(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Resize failed';
        if (msg.includes('modified by another') || msg.includes('CONCURRENCY_CONFLICT')) {
          await fetchGrid(true);
          showMutationError('Reservation was updated elsewhere. Calendar refreshed — please try again.');
        } else {
          showMutationError(msg);
        }
      } finally {
        setIsMutating(false);
      }
    },
    [fetchGrid, showMutationError, isMutating],
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
        showMutationError(err instanceof Error ? err.message : 'Failed to check in to POS');
      } finally {
        setIsPostingToPos(false);
        setContextMenu(null);
      }
    },
    [locations, reservationCatalogItemId, terminalId, router, showMutationError],
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
        const msg = err instanceof Error ? err.message : 'Check-in failed';
        if (msg.includes('modified by another') || msg.includes('CONCURRENCY_CONFLICT')) {
          if (pageView === 'quick' || (pageView === 'calendar' && viewMode !== 'day')) await fetchGrid(true);
          else if (pageView === 'calendar' && viewMode === 'day') await fetchDay(true);
        }
        showMutationError(msg);
      } finally {
        setIsActing(false);
        setContextMenu(null);
      }
    },
    [contextMenu, pageView, viewMode, fetchGrid, fetchDay, router, showMutationError],
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
        if (pageView === 'quick' || (pageView === 'calendar' && viewMode !== 'day')) await fetchGrid(true);
        else if (pageView === 'calendar' && viewMode === 'day') await fetchDay(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Check-out failed';
        if (msg.includes('modified by another') || msg.includes('CONCURRENCY_CONFLICT')) {
          if (pageView === 'quick' || (pageView === 'calendar' && viewMode !== 'day')) await fetchGrid(true);
          else if (pageView === 'calendar' && viewMode === 'day') await fetchDay(true);
        }
        showMutationError(msg);
      } finally {
        setIsActing(false);
        setContextMenu(null);
      }
    },
    [contextMenu, pageView, viewMode, fetchGrid, fetchDay, router, showMutationError],
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
        if (pageView === 'quick' || (pageView === 'calendar' && viewMode !== 'day')) await fetchGrid(true);
        else if (pageView === 'calendar' && viewMode === 'day') await fetchDay(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Cancel failed';
        if (msg.includes('modified by another') || msg.includes('CONCURRENCY_CONFLICT')) {
          if (pageView === 'quick' || (pageView === 'calendar' && viewMode !== 'day')) await fetchGrid(true);
          else if (pageView === 'calendar' && viewMode === 'day') await fetchDay(true);
        }
        showMutationError(msg);
      } finally {
        setIsActing(false);
        setContextMenu(null);
      }
    },
    [contextMenu, pageView, viewMode, fetchGrid, fetchDay, router, showMutationError],
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
          {terminalSession ? (
            <span className="mt-1 flex items-center gap-1">
              <span className="flex-1 rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground">{terminalId}</span>
              <span className="text-xs text-green-500">(active session)</span>
            </span>
          ) : (
            <input
              value={terminalId}
              onChange={(e) => setTerminalId(e.target.value)}
              className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm text-foreground"
              placeholder="POS-01"
            />
          )}
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

          {mutationError && (
            <button
              type="button"
              onClick={() => { if (mutationErrorTimer.current) clearTimeout(mutationErrorTimer.current); setMutationError(null); }}
              className="flex w-full items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left text-sm text-amber-400 hover:bg-amber-500/15 transition-colors"
            >
              <span>{mutationError}</span>
              <span className="ml-3 shrink-0 text-xs text-amber-500/60">click to dismiss</span>
            </button>
          )}

          {undoAction && (
            <div className="flex items-center justify-between rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-400">
              <span>Moved <strong>{undoAction.guestName}</strong> to room {undoAction.roomNumber}</span>
              <button
                type="button"
                onClick={() => { clearUndo(); handleMove(undoAction.reverseInput); }}
                className="ml-3 flex shrink-0 items-center gap-1 rounded-md bg-indigo-500/20 px-2.5 py-1 text-xs font-medium text-indigo-300 hover:bg-indigo-500/30 transition-colors"
              >
                <Undo2 className="h-3 w-3" />
                Undo
              </button>
            </div>
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
              isMutating={isMutating}
              optimisticMove={optimisticMove}
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
