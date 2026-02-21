'use client';

import { useState, useCallback, useMemo } from 'react';
import { useFnbPosStore } from '@/stores/fnb-pos-store';
import { useFnbFloor, useFnbRooms, useTableActions } from '@/hooks/use-fnb-floor';
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

  const selectedTable = useMemo(
    () => tables.find((t) => t.tableId === selectedTableId) ?? null,
    [tables, selectedTableId],
  );
  // Suppress unused warning — selectedTable will be wired in context sidebar
  void selectedTable;

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
    await actions.seatTable(seatTargetTable.tableId, { partySize, serverUserId: userId });
  }, [seatTargetTable, actions, userId]);

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

        {/* Table grid area */}
        <div className="flex-1 overflow-auto p-4">
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
                  onClick={() => activeRoomId && actions.syncFromFloorPlan(activeRoomId)}
                  className="mt-3 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90"
                  style={{ backgroundColor: 'var(--fnb-status-seated)' }}
                >
                  Sync Tables
                </button>
              </div>
            </div>
          ) : (
            <div
              className="grid gap-2 sm:gap-3"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(min(80px, 100%), 1fr))`,
              }}
            >
              {tables.map((table) => (
                <FnbTableNode
                  key={table.tableId}
                  table={table}
                  isSelected={table.tableId === selectedTableId}
                  onTap={handleTableTap}
                  onLongPress={handleTableLongPress}
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
