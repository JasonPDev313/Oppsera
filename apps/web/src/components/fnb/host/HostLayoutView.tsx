'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { RefreshCw, AlertTriangle, Plus, Minus, Maximize2 } from 'lucide-react';
import { useFnbFloor, useFnbRooms, useTableActions } from '@/hooks/use-fnb-floor';
import type { FnbTableWithStatus } from '@/types/fnb';
import { FNB_TABLE_STATUS_COLORS } from '@/types/fnb';
import { useAssignMode } from './AssignModeContext';
import { TableContextMenu } from './TableContextMenu';
import { RoomTabBar } from './RoomTabBar';

interface HostLayoutViewProps {
  onSeatTable?: (tableId: string) => void;
  onTableAction?: (action: string, tableId: string) => void;
}

const MIN_TABLE_SIZE = 60;

function shapeRadius(shape: string): string {
  switch (shape) {
    case 'round':
    case 'circle':
    case 'oval':
    case 'ellipse':
      return '50%';
    default:
      return '8px';
  }
}

function formatElapsed(seatedAt: string | null): string {
  if (!seatedAt) return '';
  const ms = Date.now() - new Date(seatedAt).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function HostLayoutView({ onSeatTable, onTableAction }: HostLayoutViewProps) {
  const { selectedParty, assignMode, cancelAssign } = useAssignMode();
  const { rooms, isLoading: roomsLoading } = useFnbRooms();

  // ── Room selection ────────────────────────────────
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const effectiveRoomId = activeRoomId ?? rooms[0]?.id ?? null;

  // Auto-select first room once loaded
  useEffect(() => {
    if (!activeRoomId && rooms.length > 0) {
      setActiveRoomId(rooms[0]!.id);
    }
  }, [activeRoomId, rooms]);

  // ── Floor plan data ──────────────────────────────
  const { data: floorPlan, tables, isLoading, error, refresh } = useFnbFloor({
    roomId: effectiveRoomId,
  });

  const { syncFromFloorPlan, isActing: isSyncing } = useTableActions(refresh);

  // ── Context menu ──────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{
    tableId: string;
    tableNumber: number | string;
    status: string;
    position: { x: number; y: number };
  } | null>(null);

  // ── Viewport scaling ──────────────────────────────
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewScale, setViewScale] = useState(1);
  const [vpSize, setVpSize] = useState({ w: 0, h: 0 });
  const [userZoom, setUserZoom] = useState(1);

  const room = floorPlan?.room ?? null;
  const scalePxPerFt = room?.scalePxPerFt ?? 20;

  // Compute bounding box
  const tableBounds = useMemo(() => {
    if (tables.length === 0 || !scalePxPerFt) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of tables) {
      const x = t.positionX * scalePxPerFt;
      const y = t.positionY * scalePxPerFt;
      const w = Math.max(t.width || MIN_TABLE_SIZE, MIN_TABLE_SIZE);
      const h = Math.max(t.height || MIN_TABLE_SIZE, MIN_TABLE_SIZE);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w;
      if (y + h > maxY) maxY = y + h;
    }
    const pad = 40;
    return { minX: minX - pad, minY: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 };
  }, [tables, scalePxPerFt]);

  const contentW = tableBounds?.width ?? (room ? room.widthFt * scalePxPerFt : 0);
  const contentH = tableBounds?.height ?? (room ? room.heightFt * scalePxPerFt : 0);

  // Auto-fit viewport
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !contentW || !contentH) return;
    const updateScale = () => {
      const { clientWidth, clientHeight } = el;
      if (clientWidth <= 0 || clientHeight <= 0) return;
      setVpSize({ w: clientWidth, h: clientHeight });
      setViewScale(Math.min(clientWidth / contentW, clientHeight / contentH));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(el);
    return () => observer.disconnect();
  }, [contentW, contentH]);

  const effectiveScale = viewScale * userZoom;
  const canvasW = contentW * effectiveScale;
  const canvasH = contentH * effectiveScale;
  const tableOffsetX = tableBounds ? -tableBounds.minX * effectiveScale : 0;
  const tableOffsetY = tableBounds ? -tableBounds.minY * effectiveScale : 0;
  const padX = Math.max(0, (vpSize.w - canvasW) / 2);
  const padY = Math.max(0, (vpSize.h - canvasH) / 2);

  // Reset zoom on room change
  useEffect(() => { setUserZoom(1); }, [effectiveRoomId]);

  // ── Zoom handlers ────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setUserZoom((z) => Math.min(3, Math.max(0.5, z * factor)));
    }
  }, []);

  // ── Table click ──────────────────────────────────
  const handleTableClick = useCallback(
    (table: FnbTableWithStatus) => {
      if (assignMode && selectedParty) {
        if (table.status === 'available' && table.capacityMax >= selectedParty.partySize) {
          onSeatTable?.(table.tableId);
        }
        return;
      }
    },
    [assignMode, selectedParty, onSeatTable],
  );

  const handleContextMenu = useCallback(
    (table: FnbTableWithStatus, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        tableId: table.tableId,
        tableNumber: table.tableNumber,
        status: table.status ?? 'available',
        position: { x: e.clientX, y: e.clientY },
      });
    },
    [],
  );

  const handleContextAction = useCallback(
    (action: string, tableId: string) => onTableAction?.(action, tableId),
    [onTableAction],
  );

  // ── Sync handler ─────────────────────────────────
  const handleSync = useCallback(async () => {
    if (!effectiveRoomId) return;
    await syncFromFloorPlan(effectiveRoomId);
  }, [effectiveRoomId, syncFromFloorPlan]);

  // ── Room data for tabs ───────────────────────────
  const roomData = rooms.map((r) => {
    const roomTables = tables.filter((t) => t.sectionId === r.id);
    return {
      id: r.id,
      name: r.name,
      availableCount: roomTables.filter((t) => t.status === 'available').length,
      totalCount: roomTables.length,
    };
  });

  // ── Loading state ────────────────────────────────
  if (isLoading && tables.length === 0) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--fnb-text-muted)' }}>
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6" style={{ color: 'var(--fnb-text-muted)' }}>
        <AlertTriangle size={20} style={{ color: 'var(--fnb-danger)' }} />
        <span className="text-xs text-center" style={{ color: 'var(--fnb-danger)' }}>{error}</span>
        <button
          type="button"
          onClick={() => refresh()}
          className="text-[11px] font-semibold rounded-lg px-3 py-1.5 transition-all active:scale-95"
          style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (rooms.length === 0 && !roomsLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 px-6" style={{ color: 'var(--fnb-text-muted)' }}>
        <span className="text-xs text-center">No rooms configured. Create a room layout first.</span>
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6" style={{ color: 'var(--fnb-text-muted)' }}>
        <span className="text-xs text-center">No tables in this room. Sync tables from the floor plan.</span>
        <button
          type="button"
          onClick={handleSync}
          disabled={isSyncing}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all active:scale-95"
          style={{ backgroundColor: 'color-mix(in srgb, var(--fnb-info) 15%, transparent)', color: 'var(--fnb-info)' }}
        >
          <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
          {isSyncing ? 'Syncing…' : 'Sync Tables'}
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col overflow-hidden">
      {/* Room tabs */}
      {roomData.length > 1 && (
        <div className="shrink-0 px-3 pt-2">
          <RoomTabBar
            rooms={roomData}
            activeRoomId={effectiveRoomId}
            onSelectRoom={(id) => setActiveRoomId(id)}
          />
        </div>
      )}

      {/* Assign mode banner */}
      {assignMode && selectedParty && (
        <div
          className="shrink-0 mx-3 mt-2 flex items-center justify-between rounded-lg px-3 py-2"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--fnb-info) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--fnb-info) 30%, transparent)',
          }}
        >
          <span className="text-[11px] font-medium" style={{ color: 'var(--fnb-text-primary)' }}>
            Select a table for <strong>{selectedParty.guestName}</strong> (party of {selectedParty.partySize})
          </span>
          <button
            type="button"
            onClick={cancelAssign}
            className="text-[10px] font-semibold rounded px-2 py-1 transition-all active:scale-95"
            style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Canvas area */}
      <div
        ref={viewportRef}
        className="flex-1 overflow-auto relative"
        onWheel={handleWheel}
      >
        {/* Zoom controls */}
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-0.5 rounded-lg p-0.5 shadow-sm"
          style={{ backgroundColor: 'var(--fnb-bg-surface)', border: '1px solid var(--fnb-border-subtle)' }}
        >
          <button
            type="button"
            onClick={() => setUserZoom((z) => Math.min(3, z * 1.2))}
            className="flex items-center justify-center rounded h-6 w-6 transition-colors hover:bg-accent"
            style={{ color: 'var(--fnb-text-secondary)' }}
          >
            <Plus size={12} />
          </button>
          <span className="text-[8px] text-center font-medium" style={{ color: 'var(--fnb-text-muted)' }}>
            {Math.round(effectiveScale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setUserZoom((z) => Math.max(0.5, z / 1.2))}
            className="flex items-center justify-center rounded h-6 w-6 transition-colors hover:bg-accent"
            style={{ color: 'var(--fnb-text-secondary)' }}
          >
            <Minus size={12} />
          </button>
          <button
            type="button"
            onClick={() => setUserZoom(1)}
            className="flex items-center justify-center rounded h-6 w-6 transition-colors hover:bg-accent"
            style={{ color: 'var(--fnb-text-secondary)' }}
          >
            <Maximize2 size={10} />
          </button>
        </div>

        {/* Canvas */}
        <div
          className="relative"
          style={{ width: canvasW, height: canvasH, marginLeft: padX, marginTop: padY }}
        >
          <div style={{ position: 'absolute', left: tableOffsetX, top: tableOffsetY }}>
            {tables.map((table) => {
              const statusColor = FNB_TABLE_STATUS_COLORS[table.status] ?? '#6b7280';
              const left = table.positionX * scalePxPerFt * effectiveScale;
              const top = table.positionY * scalePxPerFt * effectiveScale;
              const w = Math.max(table.width || MIN_TABLE_SIZE, MIN_TABLE_SIZE) * effectiveScale;
              const h = Math.max(table.height || MIN_TABLE_SIZE, MIN_TABLE_SIZE) * effectiveScale;
              const elapsed = formatElapsed(table.seatedAt);

              const isEligible =
                assignMode &&
                selectedParty &&
                table.status === 'available' &&
                table.capacityMax >= selectedParty.partySize;
              const isTooSmall =
                assignMode &&
                selectedParty &&
                table.status === 'available' &&
                table.capacityMax < selectedParty.partySize;

              return (
                <button
                  key={table.tableId}
                  type="button"
                  onClick={() => handleTableClick(table)}
                  onContextMenu={(e) => handleContextMenu(table, e)}
                  className="absolute flex flex-col items-center justify-center border-2 transition-all select-none active:scale-95"
                  style={{
                    left,
                    top,
                    width: w,
                    height: h,
                    borderColor: isEligible ? 'var(--fnb-status-available)' : statusColor,
                    backgroundColor: `${statusColor}15`,
                    borderRadius: shapeRadius(table.shape),
                    transform: table.rotation ? `rotate(${table.rotation}deg)` : undefined,
                    transformOrigin: 'center center',
                    boxShadow: isEligible
                      ? '0 0 8px var(--fnb-status-available), 0 0 16px color-mix(in srgb, var(--fnb-status-available) 40%, transparent)'
                      : 'none',
                    opacity: isTooSmall ? 0.35 : table.status === 'blocked' ? 0.5 : 1,
                    cursor: isEligible ? 'pointer' : assignMode ? 'not-allowed' : 'pointer',
                    animation: isEligible ? 'host-available-pulse 2s ease-in-out infinite' : undefined,
                  }}
                >
                  {/* Table number */}
                  <span
                    className="font-bold leading-none"
                    style={{ fontSize: `${Math.max(10, 14 * effectiveScale)}px`, color: statusColor }}
                  >
                    {table.tableNumber}
                  </span>

                  {/* Status info */}
                  {table.status === 'seated' || table.status === 'ordered' ? (
                    <span
                      className="font-medium leading-none mt-0.5"
                      style={{ fontSize: `${Math.max(7, 9 * effectiveScale)}px`, color: 'var(--fnb-text-muted)' }}
                    >
                      {table.partySize ?? ''}p {elapsed && `· ${elapsed}`}
                    </span>
                  ) : (
                    <span
                      className="font-medium leading-none mt-0.5"
                      style={{ fontSize: `${Math.max(7, 9 * effectiveScale)}px`, color: 'var(--fnb-text-muted)' }}
                    >
                      {table.capacityMax}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <TableContextMenu
          tableId={contextMenu.tableId}
          tableNumber={contextMenu.tableNumber}
          status={contextMenu.status}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onAction={handleContextAction}
        />
      )}

      {/* CSS animations */}
      <style jsx>{`
        @keyframes host-available-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.85; transform: scale(1.03); }
        }
      `}</style>
    </div>
  );
}
