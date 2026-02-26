'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { HostTableItem } from '@/hooks/use-fnb-host';
import { useAssignMode } from './AssignModeContext';
import { TableContextMenu } from './TableContextMenu';
import { FloorMapLegend } from './FloorMapLegend';
import { RoomTabBar } from './RoomTabBar';

interface HostFloorMapProps {
  tables: HostTableItem[];
  onSeatTable?: (tableId: string) => void;
  onClearTable?: (tableId: string) => void;
  onTableAction?: (action: string, tableId: string) => void;
  rooms?: { id: string; name: string }[];
}

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  available: {
    bg: 'var(--fnb-status-available)',
    border: 'color-mix(in srgb, var(--fnb-status-available) 50%, transparent)',
    text: '#fff',
  },
  seated: {
    bg: 'var(--fnb-status-seated)',
    border: 'color-mix(in srgb, var(--fnb-status-seated) 50%, transparent)',
    text: '#fff',
  },
  reserved: {
    bg: 'var(--fnb-status-reserved)',
    border: 'color-mix(in srgb, var(--fnb-status-reserved) 50%, transparent)',
    text: '#fff',
  },
  dirty: {
    bg: 'var(--fnb-danger)',
    border: 'color-mix(in srgb, var(--fnb-danger) 50%, transparent)',
    text: '#fff',
  },
  blocked: {
    bg: 'var(--fnb-text-disabled)',
    border: 'color-mix(in srgb, var(--fnb-text-disabled) 50%, transparent)',
    text: '#fff',
  },
};

const SHAPE_CLASS: Record<string, string> = {
  round: 'rounded-full',
  square: 'rounded-md',
  rectangle: 'rounded-md',
  oval: 'rounded-[50%]',
};

export function getShapeSize(shape: string, capacity: number) {
  const base = Math.max(48, Math.min(72, 40 + capacity * 4));
  if (shape === 'rectangle') return { width: base * 1.5, height: base };
  if (shape === 'oval') return { width: base * 1.4, height: base };
  return { width: base, height: base };
}

export function HostFloorMap({
  tables,
  onSeatTable,
  onClearTable: _onClearTable,
  onTableAction,
  rooms,
}: HostFloorMapProps) {
  const { selectedParty, assignMode, cancelAssign } = useAssignMode();
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Room filter ──────────────────────────────────
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  // ── Legend filter ────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // ── Context menu state ──────────────────────────
  const [contextMenu, setContextMenu] = useState<{
    tableId: string;
    tableNumber: number | string;
    status: string;
    position: { x: number; y: number };
  } | null>(null);

  // ── Track previous table statuses for flash animation ──
  const prevStatusRef = useRef<Map<string, string>>(new Map());
  const [flashingIds, setFlashingIds] = useState<Set<string>>(new Set());

  // Status change detection for flash animation
  useEffect(() => {
    const newFlashing = new Set<string>();
    for (const table of tables) {
      const prev = prevStatusRef.current.get(table.id);
      if (prev && prev !== table.status) {
        newFlashing.add(table.id);
      }
      prevStatusRef.current.set(table.id, table.status);
    }
    if (newFlashing.size > 0) {
      setFlashingIds(newFlashing);
      const timer = setTimeout(() => setFlashingIds(new Set()), 600);
      return () => clearTimeout(timer);
    }
  }, [tables]);

  // ── Context menu handler ─────────────────────────
  const handleContextMenu = useCallback(
    (table: HostTableItem, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        tableId: table.id,
        tableNumber: table.tableNumber,
        status: table.status ?? 'available',
        position: { x: e.clientX, y: e.clientY },
      });
    },
    [],
  );

  // ── Table click handler ──────────────────────────
  const handleTableClick = useCallback(
    (table: HostTableItem) => {
      // In assign mode, clicking an available table triggers seat action
      if (assignMode && selectedParty) {
        const status = table.status ?? 'available';
        if (status === 'available' && table.capacityMax >= selectedParty.partySize) {
          onSeatTable?.(table.id);
        }
        return;
      }
    },
    [assignMode, selectedParty, onSeatTable],
  );

  const handleContextAction = useCallback(
    (action: string, tableId: string) => {
      onTableAction?.(action, tableId);
    },
    [onTableAction],
  );

  // ── Compute room data for tabs ───────────────────
  const roomData = (rooms ?? []).map((room) => {
    const roomTables = tables.filter((t) => t.sectionId === room.id);
    return {
      id: room.id,
      name: room.name,
      availableCount: roomTables.filter((t) => t.status === 'available').length,
      totalCount: roomTables.length,
    };
  });

  // ── Filter tables by room and status ─────────────
  let visibleTables = tables;
  if (activeRoomId) {
    visibleTables = visibleTables.filter((t) => t.sectionId === activeRoomId);
  }
  if (statusFilter) {
    visibleTables = visibleTables.filter((t) => (t.status ?? 'available') === statusFilter);
  }

  // ── Legend items ─────────────────────────────────
  const legendItems = [
    { status: 'available', label: 'Available', color: 'var(--fnb-status-available)', count: tables.filter((t) => t.status === 'available').length },
    { status: 'seated', label: 'Seated', color: 'var(--fnb-status-seated)', count: tables.filter((t) => t.status === 'seated').length },
    { status: 'reserved', label: 'Reserved', color: 'var(--fnb-status-reserved)', count: tables.filter((t) => t.status === 'reserved').length },
    { status: 'dirty', label: 'Dirty', color: 'var(--fnb-danger)', count: tables.filter((t) => t.status === 'dirty').length },
    { status: 'blocked', label: 'Blocked', color: 'var(--fnb-text-disabled)', count: tables.filter((t) => t.status === 'blocked').length },
  ];

  if (tables.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ color: 'var(--fnb-text-muted)' }}
      >
        <span className="text-xs">No tables to display</span>
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
            activeRoomId={activeRoomId}
            onSelectRoom={setActiveRoomId}
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
            style={{
              backgroundColor: 'var(--fnb-bg-elevated)',
              color: 'var(--fnb-text-secondary)',
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Floor map area */}
      <div ref={containerRef} className="relative flex-1 overflow-auto p-4">
        <div className="flex flex-wrap gap-3 justify-center items-center">
          {visibleTables.map((table) => {
            const shape = table.shape ?? 'square';
            const status = table.status ?? 'available';
            const colors = STATUS_COLORS[status] ?? STATUS_COLORS.available ?? { bg: '#22c55e', border: '#16a34a', text: '#fff' };
            const { width, height } = getShapeSize(shape, table.capacityMax);
            const isFlashing = flashingIds.has(table.id);

            // Assign mode: highlight eligible tables
            const isEligible =
              assignMode &&
              selectedParty &&
              status === 'available' &&
              table.capacityMax >= selectedParty.partySize;
            const isTooSmall =
              assignMode &&
              selectedParty &&
              status === 'available' &&
              table.capacityMax < selectedParty.partySize;

            return (
              <button
                key={table.id}
                type="button"
                onClick={() => handleTableClick(table)}
                onContextMenu={(e) => handleContextMenu(table, e)}
                className={`relative flex flex-col items-center justify-center shrink-0 transition-all active:scale-95 ${SHAPE_CLASS[shape] ?? 'rounded-md'}`}
                style={{
                  width,
                  height,
                  backgroundColor: colors.bg,
                  border: `2px solid ${isEligible ? 'var(--fnb-status-available)' : colors.border}`,
                  boxShadow: isEligible
                    ? '0 0 8px var(--fnb-status-available), 0 0 16px color-mix(in srgb, var(--fnb-status-available) 40%, transparent)'
                    : 'none',
                  opacity: isTooSmall ? 0.35 : status === 'blocked' ? 0.5 : 1,
                  cursor: isEligible ? 'pointer' : assignMode ? 'not-allowed' : 'pointer',
                  animation: isEligible
                    ? 'host-available-pulse 2s ease-in-out infinite'
                    : undefined,
                }}
              >
                <span
                  className="text-xs font-bold leading-none"
                  style={{ color: colors.text }}
                >
                  {table.tableNumber}
                </span>
                <span
                  className="text-[9px] font-medium leading-none mt-0.5"
                  style={{ color: 'rgba(255,255,255,0.8)' }}
                >
                  {table.capacityMax}
                </span>

                {/* Flash overlay for status change */}
                {isFlashing && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.5)',
                      borderRadius: 'inherit',
                      animation: 'host-status-flash 600ms ease-out forwards',
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <FloorMapLegend
          items={legendItems}
          activeFilter={statusFilter}
          onFilterToggle={setStatusFilter}
        />
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
        @keyframes host-status-flash {
          0% { opacity: 0.5; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
