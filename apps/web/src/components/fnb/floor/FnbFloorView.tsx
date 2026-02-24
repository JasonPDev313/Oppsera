'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { RefreshCw, Plus, Minus, Maximize2, LayoutGrid, Map, Eye } from 'lucide-react';
import type { FloorDisplayMode } from './FnbTableNode';
import { useFnbPosStore } from '@/stores/fnb-pos-store';
import { useFnbFloor, useFnbRooms, useTableActions } from '@/hooks/use-fnb-floor';
import { openTabApi } from '@/hooks/use-fnb-tab';
import type { FnbTableWithStatus } from '@/types/fnb';
import { FnbTableNode } from './FnbTableNode';
import { RoomTabs } from './RoomTabs';
import { BottomDock } from './BottomDock';
import { ContextSidebar } from './ContextSidebar';
import { SeatGuestsModal } from './SeatGuestsModal';
import { TableActionMenu } from './TableActionMenu';
import { TableGridView } from './TableGridView';

// ── Turn Time Prediction ────────────────────────────────────────
// V1: Simple heuristic based on party size and elapsed time.
// Base turn = 45 min for 2, +8 min per additional guest, +15 min per additional course.
// V2: ML-based prediction using historical turn times from rm_fnb_table_turns.

function predictTurnMinutes(table: FnbTableWithStatus): number | null {
  if (table.status !== 'seated') return null;
  const partySize = table.partySize ?? 2;
  const courseCount = table.currentCourseNumber ?? 1;
  const baseTurn = 45;
  const perGuest = 8;
  const perCourse = 15;
  return baseTurn + Math.max(0, partySize - 2) * perGuest + Math.max(0, courseCount - 1) * perCourse;
}

/** Compute average turn time from all seated tables */
function computeAvgTurnMinutes(tables: FnbTableWithStatus[]): number | null {
  const seated = tables.filter((t) => t.status === 'seated' && t.seatedAt);
  if (seated.length === 0) return null;
  const now = Date.now();
  const totalMinutes = seated.reduce((sum, t) => {
    const elapsed = (now - new Date(t.seatedAt!).getTime()) / 60_000;
    return sum + elapsed;
  }, 0);
  return Math.round(totalMinutes / seated.length);
}

interface FnbFloorViewProps {
  userId: string;
  isActive?: boolean;
}

export function FnbFloorView({ userId, isActive = true }: FnbFloorViewProps) {
  const store = useFnbPosStore();
  const { rooms, isLoading: roomsLoading } = useFnbRooms();

  // Select first room if none active, or if stored room was archived (no longer in active list).
  // While rooms are still loading, trust the stored roomId so the floor plan fetch can start
  // in parallel — avoids sequential room-then-floor-plan round trips on every mount.
  const storedRoomExists = store.activeRoomId ? rooms.some((r) => r.id === store.activeRoomId) : false;
  const activeRoomId = (roomsLoading && store.activeRoomId)
    ? store.activeRoomId
    : (storedRoomExists ? store.activeRoomId : rooms[0]?.id) ?? null;

  // Clear stale activeRoomId from store when the stored room is no longer available
  useEffect(() => {
    if (!roomsLoading && rooms.length > 0 && store.activeRoomId && !storedRoomExists) {
      store.setActiveRoom(rooms[0]!.id);
    }
  }, [roomsLoading, rooms, store, storedRoomExists]);

  const { data: floorPlan, tables, isLoading, isFetching, error: floorError, refresh } = useFnbFloor({
    roomId: activeRoomId,
  });

  const actions = useTableActions(refresh);

  // ── Local UI State ──────────────────────────────────────────

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [seatModalOpen, setSeatModalOpen] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [seatTargetTable, setSeatTargetTable] = useState<FnbTableWithStatus | null>(null);
  const [actionMenuTable, setActionMenuTable] = useState<FnbTableWithStatus | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<'success' | 'error' | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Close portal dialogs when this view becomes inactive (gotcha #109)
  useEffect(() => {
    if (!isActive) {
      setSeatModalOpen(false);
      setActionMenuOpen(false);
      setSeatTargetTable(null);
      setActionMenuTable(null);
    }
  }, [isActive]);

  // Derive locationId from the active room (needed for API calls)
  const activeRoom = rooms.find((r) => r.id === activeRoomId);
  const locationId = activeRoom?.locationId ?? null;

  const selectedTable = useMemo(
    () => tables.find((t) => t.tableId === selectedTableId) ?? null,
    [tables, selectedTableId],
  );
  // Suppress unused warning — selectedTable will be wired in context sidebar
  void selectedTable;

  // ── Spatial viewport scaling ──────────────────────────────

  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewScale, setViewScale] = useState(1);

  const room = floorPlan?.room ?? null;
  const scalePxPerFt = room?.scalePxPerFt ?? 20;
  const roomWidthPx = room ? room.widthFt * scalePxPerFt : 0;
  const roomHeightPx = room ? room.heightFt * scalePxPerFt : 0;

  const [userZoom, setUserZoom] = useState(1);

  // Compute bounding box of all tables in raw pixels (pre-viewScale)
  const tableBounds = useMemo(() => {
    if (tables.length === 0 || !scalePxPerFt) return null;
    const MIN_SIZE = 60;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of tables) {
      const x = t.positionX * scalePxPerFt;
      const y = t.positionY * scalePxPerFt;
      const w = Math.max(t.width || MIN_SIZE, MIN_SIZE);
      const h = Math.max(t.height || MIN_SIZE, MIN_SIZE);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w;
      if (y + h > maxY) maxY = y + h;
    }
    const pad = 40;
    return {
      minX: minX - pad,
      minY: minY - pad,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2,
    };
  }, [tables, scalePxPerFt]);

  // Auto-fit: zoom to fit table bounding box (not the whole room)
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const contentW = tableBounds?.width ?? roomWidthPx;
    const contentH = tableBounds?.height ?? roomHeightPx;
    if (!contentW || !contentH) return;

    const updateScale = () => {
      const { clientWidth, clientHeight } = el;
      const padding = 32;
      const availW = clientWidth - padding;
      const availH = clientHeight - padding;
      if (availW <= 0 || availH <= 0) return;
      // No cap at 1.0 — zoom in when tables occupy a small portion of the room
      setViewScale(Math.min(availW / contentW, availH / contentH));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(el);
    return () => observer.disconnect();
  }, [tableBounds, roomWidthPx, roomHeightPx]);

  const effectiveScale = viewScale * userZoom;

  // Reset userZoom on room change
  useEffect(() => { setUserZoom(1); }, [activeRoomId]);

  // ── Zoom handlers ────────────────────────────────────────────

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setUserZoom((z) => Math.min(3, Math.max(0.5, z * factor)));
    }
  }, []);

  const lastPinchDist = useRef<number | null>(null);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 2) { lastPinchDist.current = null; return; }
    const dx = e.touches[0]!.clientX - e.touches[1]!.clientX;
    const dy = e.touches[0]!.clientY - e.touches[1]!.clientY;
    const dist = Math.hypot(dx, dy);
    if (lastPinchDist.current !== null) {
      const scale = dist / lastPinchDist.current;
      setUserZoom((z) => Math.min(3, Math.max(0.5, z * scale)));
    }
    lastPinchDist.current = dist;
  }, []);

  const handleTouchEnd = useCallback(() => { lastPinchDist.current = null; }, []);

  // ── Stats ───────────────────────────────────────────────────

  const totalCovers = useMemo(
    () => tables.reduce((sum, t) => sum + (t.partySize ?? 0), 0),
    [tables],
  );
  const availableCount = useMemo(
    () => tables.filter((t) => t.status === 'available').length,
    [tables],
  );
  const seatedCount = useMemo(
    () => tables.filter((t) => !['available', 'dirty', 'blocked'].includes(t.status)).length,
    [tables],
  );

  // ── Sync with feedback ─────────────────────────────────────

  const handleSync = useCallback(async () => {
    if (!activeRoomId) return;
    setSyncFeedback(null);
    try {
      await actions.syncFromFloorPlan(activeRoomId);
      setSyncFeedback('success');
      setTimeout(() => setSyncFeedback(null), 2000);
    } catch {
      setSyncFeedback('error');
      setTimeout(() => setSyncFeedback(null), 3000);
    }
  }, [activeRoomId, actions]);

  // ── Handlers ────────────────────────────────────────────────

  const handleTableTap = useCallback((tableId: string) => {
    const table = tables.find((t) => t.tableId === tableId);
    if (!table) return;

    setSelectedTableId(tableId);

    if (table.status === 'available') {
      // Tap available → seat modal
      setSeatTargetTable(table);
      setSeatModalOpen(true);
    } else if (table.currentTabId) {
      // Tap occupied with tab → navigate to tab view
      store.navigateTo('tab', { tabId: table.currentTabId });
    }
  }, [tables, store]);

  const handleTableLongPress = useCallback((tableId: string) => {
    const table = tables.find((t) => t.tableId === tableId);
    if (!table) return;
    setSelectedTableId(tableId);
    setActionMenuTable(table);
    setActionMenuOpen(true);
  }, [tables]);

  const handleSeatConfirm = useCallback(async (partySize: number) => {
    if (!seatTargetTable) return;
    try {
      const tab = await openTabApi({
        serverUserId: userId,
        businessDate: new Date().toISOString().slice(0, 10),
        tableId: seatTargetTable.tableId,
        tabType: 'dine_in',
        partySize,
        serviceType: 'dine_in',
        locationId: locationId ?? undefined,
      });
      setSeatModalOpen(false);
      store.navigateTo('tab', { tabId: tab.id });
    } catch (err) {
      setSeatModalOpen(false);
      const message = err instanceof Error ? err.message : 'Failed to seat guests';
      setToastMessage({ type: 'error', text: message });
      setTimeout(() => setToastMessage(null), 4000);
    }
  }, [seatTargetTable, userId, store, locationId]);

  const handleRoomChange = useCallback((roomId: string) => {
    store.setActiveRoom(roomId);
    setSelectedTableId(null);
  }, [store]);

  const handleAddTab = useCallback((tableId: string) => {
    const table = tables.find((t) => t.tableId === tableId);
    if (!table) return;
    setSeatTargetTable(table);
    setSeatModalOpen(true);
  }, [tables]);

  const handleTableContextMenu = useCallback((tableId: string) => {
    const table = tables.find((t) => t.tableId === tableId);
    if (!table) return;
    setSelectedTableId(tableId);
    setActionMenuTable(table);
    setActionMenuOpen(true);
  }, [tables]);

  const handleNewTab = useCallback(() => {
    // For now, open seat modal for first available table
    const available = tables.find((t) => t.status === 'available');
    if (available) {
      setSeatTargetTable(available);
      setSeatModalOpen(true);
    }
  }, [tables]);

  // ── Loading ─────────────────────────────────────────────────

  // Full-screen spinner ONLY on true first load (no cached/snapshot data at all).
  // If we have stale data from cache or snapshot, render the floor plan immediately
  // and let the background refetch update it silently.
  const hasNoData = !floorPlan && tables.length === 0;
  const isFirstLoad = hasNoData && (isLoading || (roomsLoading && !store.activeRoomId));

  if (isFirstLoad) {
    return (
      <div className="flex h-full items-center justify-center bg-surface">
        <div className="text-center">
          <div className="h-8 w-8 mx-auto mb-2 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <p className="text-sm text-gray-400">Loading floor plan...</p>
        </div>
      </div>
    );
  }

  if (rooms.length === 0 && !roomsLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface">
        <div className="text-center p-8 max-w-sm">
          <p className="text-lg font-semibold mb-2 text-gray-900">
            No Rooms Configured
          </p>
          <p className="text-sm text-gray-400">
            Create a room layout in Settings → Room Layouts, then sync tables to start using F&B POS.
          </p>
        </div>
      </div>
    );
  }

  if (floorError) {
    return (
      <div className="flex h-full items-center justify-center bg-surface">
        <div className="text-center p-8 max-w-sm">
          <p className="text-lg font-semibold mb-2 text-gray-900">
            Floor Plan Error
          </p>
          <p className="text-sm mb-3 text-gray-400">
            {floorError}
          </p>
          <button
            type="button"
            onClick={refresh}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors bg-indigo-600 hover:bg-indigo-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row h-full bg-surface">
      {/* Top on handheld, left on tablet+: Room tabs */}
      <RoomTabs
        rooms={rooms}
        activeRoomId={activeRoomId}
        onSelect={handleRoomChange}
      />

      {/* Center: Table grid */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Room header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-gray-900">
              {floorPlan?.room.name ?? 'Floor Plan'}
            </h2>
            {isFetching && !isLoading && (
              <div className="h-3 w-3 animate-spin rounded-full border border-indigo-400 border-t-transparent" />
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Sync feedback */}
            {syncFeedback === 'success' && (
              <span className="text-xs font-medium text-green-600">Synced</span>
            )}
            {syncFeedback === 'error' && (
              <span className="text-xs font-medium text-red-500">Sync failed</span>
            )}
            <button
              type="button"
              onClick={handleSync}
              disabled={actions.isActing}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 bg-gray-100 text-gray-600 hover:bg-gray-200"
              title="Sync tables from floor plan"
            >
              <RefreshCw className={`h-3 w-3 ${actions.isActing ? 'animate-spin' : ''}`} />
              Sync
            </button>
            {/* View mode toggle */}
            <div className="flex rounded-lg overflow-hidden border border-gray-200">
              <button
                type="button"
                onClick={() => store.setFloorViewMode('layout')}
                className={`flex items-center justify-center h-7 w-8 transition-colors ${
                  store.floorViewMode === 'layout'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                }`}
                title="Layout view"
              >
                <Map className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => store.setFloorViewMode('grid')}
                className={`flex items-center justify-center h-7 w-8 transition-colors ${
                  store.floorViewMode === 'grid'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                }`}
                title="Grid view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => store.toggleMySectionOnly()}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                store.mySectionOnly
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              My Section
            </button>
            {/* Display mode selector */}
            <div className="relative group">
              <button
                type="button"
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                <Eye className="h-3 w-3" />
                {store.floorDisplayMode === 'status' ? 'Status' :
                 store.floorDisplayMode === 'covers' ? 'Covers' :
                 store.floorDisplayMode === 'revenue' ? 'Revenue' :
                 store.floorDisplayMode === 'time' ? 'Time' : 'Course'}
              </button>
              <div className="absolute right-0 top-full mt-1 hidden group-hover:flex flex-col rounded-lg overflow-hidden shadow-lg border border-gray-200 bg-white z-20">
                {(['status', 'covers', 'revenue', 'time', 'course'] as FloorDisplayMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => store.setFloorDisplayMode(mode)}
                    className={`px-4 py-2 text-xs font-medium text-left transition-colors whitespace-nowrap ${
                      store.floorDisplayMode === mode
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Floor plan / grid area */}
        <div
          ref={viewportRef}
          className="flex-1 overflow-auto relative"
          onWheel={store.floorViewMode === 'layout' ? handleWheel : undefined}
          onTouchMove={store.floorViewMode === 'layout' ? handleTouchMove : undefined}
          onTouchEnd={store.floorViewMode === 'layout' ? handleTouchEnd : undefined}
        >
          {/* Toast message */}
          {toastMessage && (
            <div
              className={`absolute top-2 left-1/2 -translate-x-1/2 z-20 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-lg ${
                toastMessage.type === 'error' ? 'bg-red-500' : 'bg-green-600'
              }`}
            >
              {toastMessage.text}
            </div>
          )}

          {tables.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="text-sm font-medium mb-1 text-gray-600">
                  No tables in this room
                </p>
                <p className="text-xs text-gray-400">
                  Sync tables from the published floor plan
                </p>
                <button
                  type="button"
                  onClick={handleSync}
                  disabled={actions.isActing}
                  className="mt-3 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1.5 mx-auto"
                >
                  {actions.isActing && <RefreshCw className="h-4 w-4 animate-spin" />}
                  Sync Tables
                </button>
              </div>
            </div>
          ) : store.floorViewMode === 'grid' ? (
            <TableGridView
              tables={tables}
              selectedTableId={selectedTableId}
              onTap={handleTableTap}
              onLongPress={handleTableLongPress}
              onAddTab={handleAddTab}
              onContextMenu={handleTableContextMenu}
            />
          ) : (
            <div className="p-4 relative h-full">
              {/* Zoom controls */}
              <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 rounded-lg p-1 shadow-md bg-surface border border-gray-200">
                <button
                  type="button"
                  onClick={() => setUserZoom((z) => Math.min(3, z * 1.2))}
                  className="flex items-center justify-center rounded h-8 w-8 transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200"
                  title="Zoom in"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <span className="text-[10px] text-center font-medium py-0.5 text-gray-400">
                  {Math.round(effectiveScale * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setUserZoom((z) => Math.max(0.5, z / 1.2))}
                  className="flex items-center justify-center rounded h-8 w-8 transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200"
                  title="Zoom out"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setUserZoom(1)}
                  className="flex items-center justify-center rounded h-8 w-8 transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200"
                  title="Fit to screen"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div
                className="relative mx-auto overflow-hidden"
                style={{
                  width: (tableBounds?.width ?? roomWidthPx) * effectiveScale,
                  height: (tableBounds?.height ?? roomHeightPx) * effectiveScale,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: -(tableBounds?.minX ?? 0) * effectiveScale,
                    top: -(tableBounds?.minY ?? 0) * effectiveScale,
                    width: roomWidthPx * effectiveScale,
                    height: roomHeightPx * effectiveScale,
                  }}
                >
                  {tables.map((table) => (
                    <FnbTableNode
                      key={table.tableId}
                      table={table}
                      isSelected={table.tableId === selectedTableId}
                      onTap={handleTableTap}
                      onLongPress={handleTableLongPress}
                      onAddTab={handleAddTab}
                      onContextMenu={handleTableContextMenu}
                      scalePxPerFt={scalePxPerFt}
                      viewScale={effectiveScale}
                      guestPayActive={table.guestPayActive}
                      displayMode={store.floorDisplayMode}
                      predictedTurnMinutes={predictTurnMinutes(table)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom dock */}
        <BottomDock
          totalCovers={totalCovers}
          availableCount={availableCount}
          seatedCount={seatedCount}
          onNewTab={handleNewTab}
          onRefresh={refresh}
          openRevenueCents={tables.reduce((sum, t) => sum + (t.checkTotalCents ?? 0), 0)}
          avgTurnMinutes={computeAvgTurnMinutes(tables)}
        />
      </div>

      {/* Right: Context sidebar */}
      {store.sidebarOpen && (
        <ContextSidebar
          mode={store.sidebarMode}
          onModeChange={store.setSidebarMode}
          tables={tables}
          mySectionOnly={store.mySectionOnly}
          currentUserId={userId}
          onTableTap={handleTableTap}
        />
      )}

      {/* Modals */}
      <SeatGuestsModal
        open={seatModalOpen}
        onClose={() => setSeatModalOpen(false)}
        tableNumber={seatTargetTable?.tableNumber ?? 0}
        tableCapacity={seatTargetTable?.capacityMax ?? 4}
        onConfirm={handleSeatConfirm}
      />

      <TableActionMenu
        open={actionMenuOpen}
        onClose={() => setActionMenuOpen(false)}
        table={actionMenuTable}
        onSeat={() => {
          if (actionMenuTable) {
            setSeatTargetTable(actionMenuTable);
            setSeatModalOpen(true);
          }
        }}
        onAddTab={() => {
          if (actionMenuTable) {
            setSeatTargetTable(actionMenuTable);
            setSeatModalOpen(true);
          }
        }}
        onClear={() => actionMenuTable && actions.clearTable(actionMenuTable.tableId)}
        onTransfer={() => {/* Phase 3 */}}
        onCombine={() => {/* Phase 2 extension */}}
        onUncombine={() => actionMenuTable?.combineGroupId && actions.uncombineTables(actionMenuTable.combineGroupId)}
        onViewTab={() => {
          if (actionMenuTable?.currentTabId) {
            store.navigateTo('tab', { tabId: actionMenuTable.currentTabId });
          }
        }}
      />
    </div>
  );
}
