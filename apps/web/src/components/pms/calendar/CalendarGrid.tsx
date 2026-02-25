'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type {
  CalendarRoom,
  CalendarSegment,
  OooBlock,
  OccupancyByDate,
  CalendarFilters,
  ViewRange,
} from './types';
import {
  STATUS_COLORS,
  ROOM_STATUS_COLORS,
  SOURCE_ICONS,
  formatDateDisplay,
  formatDate,
} from './types';
import ReservationTooltip from './ReservationTooltip';
import type { ContextMenuState } from './ReservationContextMenu';

// ── Types ────────────────────────────────────────────────────────

interface RoomTypeGroup {
  roomTypeId: string;
  roomTypeName: string;
  rooms: CalendarRoom[];
}

interface BarInfo {
  segment: CalendarSegment;
  span: number;
}

interface CalendarGridProps {
  rooms: CalendarRoom[];
  segments: CalendarSegment[];
  oooBlocks: OooBlock[];
  dates: string[];
  viewRange: ViewRange;
  occupancyByDate: Record<string, OccupancyByDate>;
  totalRooms: number;
  filters: CalendarFilters;
  onDateClick: (date: string) => void;
  onContextMenu: (state: ContextMenuState) => void;
  onMove: (input: {
    reservationId: string;
    from: { roomId: string; checkInDate: string; checkOutDate: string; version: number };
    to: { roomId: string; checkInDate: string };
  }) => void;
  onResize: (input: {
    reservationId: string;
    edge: 'LEFT' | 'RIGHT';
    from: { checkInDate: string; checkOutDate: string; roomId: string; version: number };
    to: { checkInDate?: string; checkOutDate?: string };
  }) => void;
  onEmptyCellClick?: (roomId: string, date: string, roomTypeId: string) => void;
  onEmptyCellContextMenu?: (e: React.MouseEvent, roomId: string, date: string, roomTypeId: string) => void;
}

// ── Main Grid Component ──────────────────────────────────────────

export default function CalendarGrid({
  rooms,
  segments,
  oooBlocks,
  dates,
  viewRange,
  occupancyByDate,
  totalRooms,
  filters,
  onDateClick,
  onContextMenu,
  onMove,
  onResize: _onResize,
  onEmptyCellClick,
  onEmptyCellContextMenu,
}: CalendarGridProps) {
  const router = useRouter();
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set());
  const [activeSegment, setActiveSegment] = useState<CalendarSegment | null>(null);
  const [tooltip, setTooltip] = useState<{ segment: CalendarSegment; x: number; y: number } | null>(null);
  const tooltipTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const todayStr = formatDate(new Date());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // ── Computed data ───────────────────────────────────────────────

  const segmentsByRoomDate = useMemo(() => {
    const map = new Map<string, Map<string, CalendarSegment>>();
    for (const seg of segments) {
      if (!map.has(seg.roomId)) map.set(seg.roomId, new Map());
      map.get(seg.roomId)!.set(seg.businessDate, seg);
    }
    return map;
  }, [segments]);

  const oooByRoomDate = useMemo(() => {
    const map = new Map<string, Map<string, OooBlock>>();
    for (const block of oooBlocks) {
      if (!map.has(block.roomId)) map.set(block.roomId, new Map());
      const roomMap = map.get(block.roomId)!;
      for (const date of dates) {
        if (date >= block.startDate && date < block.endDate) {
          roomMap.set(date, block);
        }
      }
    }
    return map;
  }, [oooBlocks, dates]);

  // Compute reservation bars (multi-day spanning)
  const reservationBars = useMemo(() => {
    const bars = new Map<string, Map<string, BarInfo>>();
    const rendered = new Set<string>();

    for (const room of rooms) {
      const roomBars = new Map<string, BarInfo>();
      bars.set(room.roomId, roomBars);

      for (let i = 0; i < dates.length; i++) {
        const date = dates[i]!;
        const seg = segmentsByRoomDate.get(room.roomId)?.get(date);
        if (!seg) continue;

        const key = `${room.roomId}:${seg.reservationId}`;
        if (rendered.has(key)) continue;
        rendered.add(key);

        let span = 1;
        for (let j = i + 1; j < dates.length; j++) {
          const nextSeg = segmentsByRoomDate.get(room.roomId)?.get(dates[j]!);
          if (nextSeg?.reservationId === seg.reservationId) span++;
          else break;
        }

        roomBars.set(date, { segment: seg, span });
      }
    }
    return bars;
  }, [rooms, dates, segmentsByRoomDate]);

  // Apply filters
  const filteredRooms = useMemo(() => {
    let result = rooms;

    if (filters.roomTypes.size > 0) {
      result = result.filter((r) => filters.roomTypes.has(r.roomTypeId));
    }
    if (filters.floors.size > 0) {
      result = result.filter((r) => r.floor && filters.floors.has(r.floor));
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const matchingRoomIds = new Set<string>();
      // Include rooms matching by room number
      for (const r of result) {
        if (r.roomNumber.toLowerCase().includes(q)) matchingRoomIds.add(r.roomId);
      }
      // Include rooms with matching guest names
      for (const seg of segments) {
        if (seg.guestName.toLowerCase().includes(q)) matchingRoomIds.add(seg.roomId);
      }
      result = result.filter((r) => matchingRoomIds.has(r.roomId));
    }
    if (filters.statuses.size > 0) {
      const roomsWithStatus = new Set<string>();
      for (const seg of segments) {
        if (filters.statuses.has(seg.status)) roomsWithStatus.add(seg.roomId);
      }
      result = result.filter((r) => roomsWithStatus.has(r.roomId));
    }
    if (filters.sources.size > 0) {
      const roomsWithSource = new Set<string>();
      for (const seg of segments) {
        if (filters.sources.has(seg.sourceType)) roomsWithSource.add(seg.roomId);
      }
      result = result.filter((r) => roomsWithSource.has(r.roomId));
    }

    return result;
  }, [rooms, segments, filters]);

  // Group rooms by type
  const roomTypeGroups = useMemo(() => {
    const groups = new Map<string, RoomTypeGroup>();
    for (const room of filteredRooms) {
      if (!groups.has(room.roomTypeId)) {
        groups.set(room.roomTypeId, {
          roomTypeId: room.roomTypeId,
          roomTypeName: room.roomTypeName,
          rooms: [],
        });
      }
      groups.get(room.roomTypeId)!.rooms.push(room);
    }
    return [...groups.values()];
  }, [filteredRooms]);

  const toggleCollapse = useCallback((typeId: string) => {
    setCollapsedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(typeId)) next.delete(typeId);
      else next.add(typeId);
      return next;
    });
  }, []);

  // ── Tooltip handlers ────────────────────────────────────────────

  const showTooltip = useCallback((seg: CalendarSegment, x: number, y: number) => {
    if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
    tooltipTimeout.current = setTimeout(() => setTooltip({ segment: seg, x, y }), 300);
  }, []);

  const hideTooltip = useCallback(() => {
    if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
    setTooltip(null);
  }, []);

  // ── DnD handlers ────────────────────────────────────────────────

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const segId = String(event.active.id);
      const [roomId, resId] = segId.split(':');
      if (!roomId || !resId) return;
      const seg = segments.find((s) => s.reservationId === resId && s.roomId === roomId);
      if (seg) setActiveSegment(seg);
      hideTooltip();
    },
    [segments, hideTooltip],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveSegment(null);
      if (!event.over) return;

      const dragId = String(event.active.id);
      const [fromRoomId, resId] = dragId.split(':');
      const [toRoomId, toDate] = String(event.over.id).split(':');

      if (!fromRoomId || !resId || !toRoomId || !toDate) return;
      if (fromRoomId === toRoomId) return; // Same room, no-op for move

      const seg = segments.find((s) => s.reservationId === resId && s.roomId === fromRoomId);
      if (!seg) return;

      onMove({
        reservationId: resId,
        from: {
          roomId: fromRoomId,
          checkInDate: seg.checkInDate,
          checkOutDate: seg.checkOutDate,
          version: seg.version,
        },
        to: {
          roomId: toRoomId,
          checkInDate: toDate,
        },
      });
    },
    [segments, onMove],
  );

  // ── Column sizing ────────────────────────────────────────────

  const colWidth = viewRange <= 7 ? 'min-w-[120px]' : viewRange <= 14 ? 'min-w-[80px]' : 'min-w-[50px]';
  const textSize = viewRange <= 7 ? 'text-xs' : viewRange <= 14 ? 'text-[11px]' : 'text-[10px]';
  const barPadding = viewRange <= 7 ? 'px-2 py-1.5' : viewRange <= 14 ? 'px-1.5 py-1' : 'px-1 py-0.5';

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-surface">
              <th className="sticky left-0 z-20 w-36 min-w-[144px] border-r border-b border-gray-200 bg-surface px-3 py-2 text-left text-xs font-medium text-gray-500">
                Room
              </th>
              {dates.map((date) => (
                <th
                  key={date}
                  className={`${colWidth} border-b border-gray-200 px-1 py-2 text-center ${textSize} font-medium ${
                    date === todayStr ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500'
                  }`}
                >
                  <button onClick={() => onDateClick(date)} className="hover:underline">
                    {viewRange <= 14 ? formatDateDisplay(date) : formatDateShort(date)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roomTypeGroups.map((group) => {
              const isCollapsed = collapsedTypes.has(group.roomTypeId);
              return (
                <RoomTypeSection
                  key={group.roomTypeId}
                  group={group}
                  isCollapsed={isCollapsed}
                  onToggle={toggleCollapse}
                  dates={dates}
                  todayStr={todayStr}
                  colWidth={colWidth}
                  textSize={textSize}
                  barPadding={barPadding}
                  viewRange={viewRange}
                  reservationBars={reservationBars}
                  segmentsByRoomDate={segmentsByRoomDate}
                  oooByRoomDate={oooByRoomDate}
                  router={router}
                  onContextMenu={onContextMenu}
                  onShowTooltip={showTooltip}
                  onHideTooltip={hideTooltip}
                  onEmptyCellClick={onEmptyCellClick}
                  onEmptyCellContextMenu={onEmptyCellContextMenu}
                />
              );
            })}

            {/* Occupancy row */}
            <tr className="bg-surface">
              <td className="sticky left-0 z-20 border-r border-gray-200 bg-surface px-3 py-1.5 text-xs font-medium text-gray-500">
                Occupancy
              </td>
              {dates.map((date) => {
                const occ = occupancyByDate[date];
                const pct = occ ? (totalRooms > 0 ? Math.round((occ.occupied / totalRooms) * 100) : 0) : 0;
                const color = pct >= 90 ? 'text-red-600 font-semibold' : pct >= 70 ? 'text-amber-600 font-medium' : 'text-gray-600';
                return (
                  <td key={date} className={`px-1 py-1.5 text-center ${textSize} ${color} ${date === todayStr ? 'bg-indigo-50/50' : ''}`}>
                    {pct}%
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Tooltip */}
      {tooltip && <ReservationTooltip segment={tooltip.segment} x={tooltip.x} y={tooltip.y} />}

      {/* Drag overlay */}
      <DragOverlay>
        {activeSegment && (
          <div className={`rounded-md ${STATUS_COLORS[activeSegment.status] ?? 'bg-gray-300 text-gray-900'} px-2 py-1 text-xs font-medium opacity-80 shadow-lg`}>
            {activeSegment.guestName}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ── RoomTypeSection ──────────────────────────────────────────────

function RoomTypeSection({
  group,
  isCollapsed,
  onToggle,
  dates,
  todayStr,
  colWidth,
  textSize,
  barPadding,
  viewRange,
  reservationBars,
  segmentsByRoomDate,
  oooByRoomDate,
  router,
  onContextMenu,
  onShowTooltip,
  onHideTooltip,
  onEmptyCellClick,
  onEmptyCellContextMenu,
}: {
  group: RoomTypeGroup;
  isCollapsed: boolean;
  onToggle: (id: string) => void;
  dates: string[];
  todayStr: string;
  colWidth: string;
  textSize: string;
  barPadding: string;
  viewRange: ViewRange;
  reservationBars: Map<string, Map<string, BarInfo>>;
  segmentsByRoomDate: Map<string, Map<string, CalendarSegment>>;
  oooByRoomDate: Map<string, Map<string, OooBlock>>;
  router: ReturnType<typeof useRouter>;
  onContextMenu: (state: ContextMenuState) => void;
  onShowTooltip: (seg: CalendarSegment, x: number, y: number) => void;
  onHideTooltip: () => void;
  onEmptyCellClick?: (roomId: string, date: string, roomTypeId: string) => void;
  onEmptyCellContextMenu?: (e: React.MouseEvent, roomId: string, date: string, roomTypeId: string) => void;
}) {
  return (
    <>
      {/* Section header */}
      <tr>
        <td
          colSpan={dates.length + 1}
          className="sticky left-0 z-10 border-b border-gray-200 bg-gray-50/80 px-3 py-1.5"
        >
          <button
            onClick={() => onToggle(group.roomTypeId)}
            className="flex items-center gap-2 text-xs font-semibold text-gray-700"
          >
            {isCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            {group.roomTypeName}
            <span className="rounded-full bg-gray-200 px-1.5 text-[10px] font-medium text-gray-500">
              {group.rooms.length}
            </span>
          </button>
        </td>
      </tr>

      {/* Room rows */}
      {!isCollapsed &&
        group.rooms.map((room) => (
          <RoomRow
            key={room.roomId}
            room={room}
            roomTypeId={group.roomTypeId}
            dates={dates}
            todayStr={todayStr}
            colWidth={colWidth}
            textSize={textSize}
            barPadding={barPadding}
            viewRange={viewRange}
            bars={reservationBars.get(room.roomId)}
            segments={segmentsByRoomDate.get(room.roomId)}
            oooMap={oooByRoomDate.get(room.roomId)}
            router={router}
            onContextMenu={onContextMenu}
            onShowTooltip={onShowTooltip}
            onHideTooltip={onHideTooltip}
            onEmptyCellClick={onEmptyCellClick}
            onEmptyCellContextMenu={onEmptyCellContextMenu}
          />
        ))}
    </>
  );
}

// ── RoomRow ──────────────────────────────────────────────────────

function RoomRow({
  room,
  roomTypeId,
  dates,
  todayStr,
  colWidth,
  textSize,
  barPadding,
  viewRange,
  bars,
  segments,
  oooMap,
  router,
  onContextMenu,
  onShowTooltip,
  onHideTooltip,
  onEmptyCellClick,
  onEmptyCellContextMenu,
}: {
  room: CalendarRoom;
  roomTypeId: string;
  dates: string[];
  todayStr: string;
  colWidth: string;
  textSize: string;
  barPadding: string;
  viewRange: ViewRange;
  bars: Map<string, BarInfo> | undefined;
  segments: Map<string, CalendarSegment> | undefined;
  oooMap: Map<string, OooBlock> | undefined;
  router: ReturnType<typeof useRouter>;
  onContextMenu: (state: ContextMenuState) => void;
  onShowTooltip: (seg: CalendarSegment, x: number, y: number) => void;
  onHideTooltip: () => void;
  onEmptyCellClick?: (roomId: string, date: string, roomTypeId: string) => void;
  onEmptyCellContextMenu?: (e: React.MouseEvent, roomId: string, date: string, roomTypeId: string) => void;
}) {
  return (
    <tr className="group">
      <td className="sticky left-0 z-10 border-r border-b border-gray-200 bg-surface px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${ROOM_STATUS_COLORS[room.status] ?? 'bg-gray-300'}`} />
          <span className={`${textSize} font-medium text-gray-900`}>{room.roomNumber}</span>
        </div>
        {room.floor && <div className="text-[10px] text-gray-400 ml-3.5">Floor {room.floor}</div>}
      </td>
      {dates.map((date) => {
        const bar = bars?.get(date);
        const isOccupied = segments?.has(date);
        const oooBlock = oooMap?.get(date);

        // Skip cells that are "covered" by a multi-day bar
        if (!bar && isOccupied) return null;

        return (
          <DateCell
            key={date}
            roomId={room.roomId}
            roomTypeId={roomTypeId}
            date={date}
            bar={bar}
            oooBlock={oooBlock}
            todayStr={todayStr}
            colWidth={colWidth}
            textSize={textSize}
            barPadding={barPadding}
            viewRange={viewRange}
            router={router}
            onContextMenu={onContextMenu}
            onShowTooltip={onShowTooltip}
            onHideTooltip={onHideTooltip}
            onEmptyCellClick={onEmptyCellClick}
            onEmptyCellContextMenu={onEmptyCellContextMenu}
          />
        );
      })}
    </tr>
  );
}

// ── DateCell (droppable) ─────────────────────────────────────────

function DateCell({
  roomId,
  roomTypeId,
  date,
  bar,
  oooBlock,
  todayStr,
  colWidth,
  textSize,
  barPadding,
  viewRange,
  router,
  onContextMenu,
  onShowTooltip,
  onHideTooltip,
  onEmptyCellClick,
  onEmptyCellContextMenu,
}: {
  roomId: string;
  roomTypeId: string;
  date: string;
  bar: BarInfo | undefined;
  oooBlock: OooBlock | undefined;
  todayStr: string;
  colWidth: string;
  textSize: string;
  barPadding: string;
  viewRange: ViewRange;
  router: ReturnType<typeof useRouter>;
  onContextMenu: (state: ContextMenuState) => void;
  onShowTooltip: (seg: CalendarSegment, x: number, y: number) => void;
  onHideTooltip: () => void;
  onEmptyCellClick?: (roomId: string, date: string, roomTypeId: string) => void;
  onEmptyCellContextMenu?: (e: React.MouseEvent, roomId: string, date: string, roomTypeId: string) => void;
}) {
  const dropId = `${roomId}:${date}`;
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
  const isEmpty = !bar && !oooBlock;

  return (
    <td
      ref={setNodeRef}
      colSpan={bar ? bar.span : 1}
      className={`${colWidth} border-b border-gray-200 px-0.5 py-0.5 ${
        date === todayStr ? 'bg-indigo-50/50' : ''
      } ${isOver ? 'bg-green-100/50' : ''} ${isEmpty ? 'group/empty cursor-pointer hover:bg-gray-50/80' : ''}`}
      onClick={isEmpty ? () => onEmptyCellClick?.(roomId, date, roomTypeId) : undefined}
      onContextMenu={isEmpty ? (e) => { e.preventDefault(); onEmptyCellContextMenu?.(e, roomId, date, roomTypeId); } : undefined}
    >
      {bar ? (
        <ReservationBarCell
          segment={bar.segment}
          roomId={roomId}
          textSize={textSize}
          barPadding={barPadding}
          viewRange={viewRange}
          router={router}
          onContextMenu={onContextMenu}
          onShowTooltip={onShowTooltip}
          onHideTooltip={onHideTooltip}
        />
      ) : oooBlock ? (
        <div
          className="truncate rounded-md bg-gray-200 px-1 py-1 text-[10px] text-gray-500"
          style={{
            backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)',
          }}
          title={oooBlock.reason ?? 'Out of Order'}
        >
          {viewRange <= 14 ? 'OOO' : ''}
        </div>
      ) : (
        <div className="flex h-full min-h-[28px] items-center justify-center opacity-0 transition-opacity group-hover/empty:opacity-100">
          <Plus className="h-3.5 w-3.5 text-gray-300" />
        </div>
      )}
    </td>
  );
}

// ── ReservationBarCell (draggable) ───────────────────────────────

function ReservationBarCell({
  segment,
  roomId,
  textSize,
  barPadding,
  viewRange,
  router,
  onContextMenu,
  onShowTooltip,
  onHideTooltip,
}: {
  segment: CalendarSegment;
  roomId: string;
  textSize: string;
  barPadding: string;
  viewRange: ViewRange;
  router: ReturnType<typeof useRouter>;
  onContextMenu: (state: ContextMenuState) => void;
  onShowTooltip: (seg: CalendarSegment, x: number, y: number) => void;
  onHideTooltip: () => void;
}) {
  const dragId = `${roomId}:${segment.reservationId}`;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId });

  const isArrival = segment.businessDate === segment.checkInDate;
  const isDeparture = (() => {
    const depDate = new Date(`${segment.checkOutDate}T00:00:00`);
    depDate.setDate(depDate.getDate() - 1);
    const depStr = `${depDate.getFullYear()}-${String(depDate.getMonth() + 1).padStart(2, '0')}-${String(depDate.getDate()).padStart(2, '0')}`;
    return segment.businessDate === depStr;
  })();

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => router.push(`/pms/reservations/${segment.reservationId}`)}
      onContextMenu={(e) => {
        e.preventDefault();
        onHideTooltip();
        onContextMenu({
          x: e.clientX,
          y: e.clientY,
          reservationId: segment.reservationId,
          status: segment.status,
          confirmationNumber: segment.confirmationNumber,
          version: segment.version,
          roomId: segment.roomId,
        });
      }}
      onMouseEnter={(e) => onShowTooltip(segment, e.clientX, e.clientY)}
      onMouseLeave={onHideTooltip}
      className={`group/bar relative flex w-full cursor-grab items-center truncate rounded-md ${barPadding} ${textSize} font-medium transition-opacity hover:opacity-90 ${
        STATUS_COLORS[segment.status] ?? 'bg-gray-300 text-gray-900'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      {/* Arrival indicator */}
      {isArrival && <span className="mr-0.5 text-[8px] opacity-70">&#9654;</span>}

      {/* Guest name */}
      <span className="truncate">{segment.guestName}</span>

      {/* Source badge */}
      {viewRange <= 14 && segment.sourceType && (
        <span className="ml-auto shrink-0 text-[8px] opacity-60">
          {SOURCE_ICONS[segment.sourceType] ?? ''}
        </span>
      )}

      {/* Departure indicator */}
      {isDeparture && <span className="ml-0.5 text-[8px] opacity-70">&#9664;</span>}

      {/* Resize handles (visible on hover) */}
      <div className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize opacity-0 group-hover/bar:opacity-100" />
      <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize opacity-0 group-hover/bar:opacity-100" />
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function formatDateShort(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
