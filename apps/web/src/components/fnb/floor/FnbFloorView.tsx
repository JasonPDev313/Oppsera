'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { RefreshCw, Plus, Minus, Maximize2 } from 'lucide-react';
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

interface FnbFloorViewProps {
  userId: string;
}

export function FnbFloorView({ userId }: FnbFloorViewProps) {
  const store = useFnbPosStore();
  const { rooms, isLoading: roomsLoading } = useFnbRooms();

  // Select first room if none active
  const activeRoomId = store.activeRoomId ?? rooms[0]?.id ?? null;

  const { data: floorPlan, tables, isLoading, error: floorError, refresh } = useFnbFloor({
    roomId: activeRoomId,
    pollIntervalMs: 5000,
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

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !roomWidthPx || !roomHeightPx) return;

    const updateScale = () => {
      const { clientWidth, clientHeight } = el;
      const padding = 32;
      const availW = clientWidth - padding;
      const availH = clientHeight - padding;
      if (availW <= 0 || availH <= 0) return;
      setViewScale(Math.min(availW / roomWidthPx, availH / roomHeightPx, 1));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(el);
    return () => observer.disconnect();
  }, [roomWidthPx, roomHeightPx]);

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

  const handleNewTab = useCallback(() => {
    // For now, open seat modal for first available table
    const available = tables.find((t) => t.status === 'available');
    if (available) {
      setSeatTargetTable(available);
      setSeatModalOpen(true);
    }
  }, [tables]);

  // ── Loading ─────────────────────────────────────────────────

  if (roomsLoading || (isLoading && !floorPlan)) {
    return (
      <div className="flex h-full items-center justify-center" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
        <div className="text-center">
          <div className="h-8 w-8 mx-auto mb-2 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--fnb-status-seated)', borderTopColor: 'transparent' }} />
          <p className="text-sm" style={{ color: 'var(--fnb-text-muted)' }}>Loading floor plan...</p>
        </div>
      </div>
    );
  }

  if (rooms.length === 0) {
    return (
      <div className="flex h-full items-center justify-center" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
        <div className="text-center p-8 max-w-sm">
          <p className="text-lg font-semibold mb-2" style={{ color: 'var(--fnb-text-primary)' }}>
            No Rooms Configured
          </p>
          <p className="text-sm" style={{ color: 'var(--fnb-text-muted)' }}>
            Create a room layout in Settings → Room Layouts, then sync tables to start using F&B POS.
          </p>
        </div>
      </div>
    );
  }

  if (floorError) {
    return (
      <div className="flex h-full items-center justify-center" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
        <div className="text-center p-8 max-w-sm">
          <p className="text-lg font-semibold mb-2" style={{ color: 'var(--fnb-text-primary)' }}>
            Floor Plan Error
          </p>
          <p className="text-sm mb-3" style={{ color: 'var(--fnb-text-muted)' }}>
            {floorError}
          </p>
          <button
            type="button"
            onClick={refresh}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: 'var(--fnb-status-seated)' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row h-full" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
      {/* Top on handheld, left on tablet+: Room tabs */}
      <RoomTabs
        rooms={rooms}
        activeRoomId={activeRoomId}
        onSelect={handleRoomChange}
      />

      {/* Center: Table grid */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Room header */}
        <div
          className="flex items-center justify-between px-4 py-2 border-b"
          style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}
        >
          <h2 className="text-base font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
            {floorPlan?.room.name ?? 'Floor Plan'}
          </h2>
          <div className="flex items-center gap-2">
            {/* Sync feedback */}
            {syncFeedback === 'success' && (
              <span className="text-xs font-medium" style={{ color: 'var(--fnb-status-available)' }}>
                Synced
              </span>
            )}
            {syncFeedback === 'error' && (
              <span className="text-xs font-medium" style={{ color: 'var(--fnb-status-overdue)' }}>
                Sync failed
              </span>
            )}
            <button
              type="button"
              onClick={handleSync}
              disabled={actions.isActing}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1"
              style={{
                backgroundColor: 'var(--fnb-bg-elevated)',
                color: 'var(--fnb-text-secondary)',
              }}
              title="Sync tables from floor plan"
            >
              <RefreshCw className={`h-3 w-3 ${actions.isActing ? 'animate-spin' : ''}`} />
              Sync
            </button>
            <button
              type="button"
              onClick={() => store.toggleMySectionOnly()}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                backgroundColor: store.mySectionOnly ? 'var(--fnb-status-seated)' : 'var(--fnb-bg-elevated)',
                color: store.mySectionOnly ? '#fff' : 'var(--fnb-text-secondary)',
              }}
            >
              My Section
            </button>
          </div>
        </div>

        {/* Spatial floor plan area */}
        <div
          ref={viewportRef}
          className="flex-1 overflow-auto p-4 relative"
          onWheel={handleWheel}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Toast message */}
          {toastMessage && (
            <div
              className="absolute top-2 left-1/2 -translate-x-1/2 z-20 rounded-lg px-4 py-2 text-sm font-medium shadow-lg"
              style={{
                backgroundColor: toastMessage.type === 'error' ? 'var(--fnb-status-overdue)' : 'var(--fnb-status-available)',
                color: '#fff',
              }}
            >
              {toastMessage.text}
            </div>
          )}

          {/* Zoom controls */}
          {tables.length > 0 && (
            <div
              className="absolute top-2 right-2 z-10 flex flex-col gap-1 rounded-lg p-1 shadow-md"
              style={{ backgroundColor: 'var(--fnb-bg-surface)' }}
            >
              <button
                type="button"
                onClick={() => setUserZoom((z) => Math.min(3, z * 1.2))}
                className="flex items-center justify-center rounded h-8 w-8 transition-colors hover:opacity-80"
                style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-primary)' }}
                title="Zoom in"
              >
                <Plus className="h-4 w-4" />
              </button>
              <span
                className="text-[10px] text-center font-medium py-0.5"
                style={{ color: 'var(--fnb-text-muted)' }}
              >
                {Math.round(effectiveScale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setUserZoom((z) => Math.max(0.5, z / 1.2))}
                className="flex items-center justify-center rounded h-8 w-8 transition-colors hover:opacity-80"
                style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-primary)' }}
                title="Zoom out"
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setUserZoom(1)}
                className="flex items-center justify-center rounded h-8 w-8 transition-colors hover:opacity-80"
                style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-primary)' }}
                title="Fit to screen"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {tables.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="text-sm font-medium mb-1" style={{ color: 'var(--fnb-text-secondary)' }}>
                  No tables in this room
                </p>
                <p className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>
                  Sync tables from the published floor plan
                </p>
                <button
                  type="button"
                  onClick={handleSync}
                  disabled={actions.isActing}
                  className="mt-3 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 flex items-center gap-1.5 mx-auto"
                  style={{ backgroundColor: 'var(--fnb-status-seated)' }}
                >
                  {actions.isActing && <RefreshCw className="h-4 w-4 animate-spin" />}
                  Sync Tables
                </button>
              </div>
            </div>
          ) : (
            <div
              className="relative mx-auto"
              style={{
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
                  scalePxPerFt={scalePxPerFt}
                  viewScale={effectiveScale}
                />
              ))}
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
