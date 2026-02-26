'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  Grid3X3,
  X,
  Users,
  ZoomIn,
  ZoomOut,
  LayoutGrid,
  Rows3,
} from 'lucide-react';
import {
  useProperties,
  usePmsUtilization,
  usePmsUtilizationByRoom,
} from '@/hooks/use-pms';
import type {
  UtilizationCell,
  UtilizationRoomType,
  UtilizationRoomData,
  UtilizationRoomCellData,
} from '@/hooks/use-pms';
import DateJumpPicker from '@/components/pms/calendar/DateJumpPicker';

// ── Helpers ──────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]!;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.toLocaleDateString('en-US', { weekday: 'short' });
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const num = d.getDate();
  return `${day} ${month} ${num}`;
}

function formatRangeLabel(start: Date, days: number): string {
  const end = addDays(start, days - 1);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const s = start.toLocaleDateString('en-US', opts);
  const e = end.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  return `${s} \u2013 ${e}`;
}

function isToday(dateStr: string): boolean {
  return dateStr === formatDate(new Date());
}

// ── Color Palette ────────────────────────────────────────────────────
// Dark Spruce → Mint Leaf → Amber Flame → Tomato → Lavender Grey
// Darkest green = wide open (eye is drawn there). Grey = sold out (skip it).

function getAvailabilityPct(cell: UtilizationCell): number {
  if (cell.totalRooms <= 0) return 0;
  return Math.round((cell.available / cell.totalRooms) * 100);
}

/**
 * Availability gradient matched to Coolors palette:
 *   0% avail (sold out)   → #7C809B Lavender Grey  (muted, "nothing here")
 *  25% avail (scarce)     → #FE5E41 Tomato         (urgent, "almost gone")
 *  50% avail (moderate)   → #FFB627 Amber Flame    (caution, "going fast")
 *  75% avail (good)       → #63A375 Mint Leaf      (comfortable, "plenty")
 * 100% avail (wide open)  → #2A4D14 Dark Spruce    (rich, "perfect match")
 */
function availabilityColor(availPct: number): string {
  const stops: [number, number, number][] = [
    [124, 128, 155],  //   0% — #7C809B Lavender Grey (sold out)
    [254, 94, 65],    //  25% — #FE5E41 Tomato        (scarce)
    [255, 182, 39],   //  50% — #FFB627 Amber Flame   (moderate)
    [99, 163, 117],   //  75% — #63A375 Mint Leaf     (good)
    [42, 77, 20],     // 100% — #2A4D14 Dark Spruce   (wide open)
  ];

  const t = Math.max(0, Math.min(100, availPct)) / 100;
  const segment = t * (stops.length - 1);
  const i = Math.min(Math.floor(segment), stops.length - 2);
  const frac = segment - i;

  const r = Math.round(stops[i]![0] + (stops[i + 1]![0] - stops[i]![0]) * frac);
  const g = Math.round(stops[i]![1] + (stops[i + 1]![1] - stops[i]![1]) * frac);
  const b = Math.round(stops[i]![2] + (stops[i + 1]![2] - stops[i]![2]) * frac);

  return `rgb(${r}, ${g}, ${b})`;
}

function availabilityTextColor(availPct: number): string {
  // Amber mid-range (40-60%) needs dark text; everything else is dark enough for white
  return availPct >= 38 && availPct <= 62 ? '#1a1a1a' : '#fff';
}

// Room-level cell colors (binary states using same palette family)
const ROOM_COLORS = {
  available: 'rgba(42, 77, 20, 0.75)',      // Dark Spruce/75 — confident green
  occupied: 'rgba(124, 128, 155, 0.25)',     // Lavender Grey/25 — muted, taken
  blocked: 'rgba(254, 94, 65, 0.25)',        // Tomato/25 — soft warning
} as const;

const ROOM_TEXT_COLORS = {
  available: '#1a3a0a',   // darker spruce — strong legibility on green bg
  occupied: '#64748b',    // slate-500 — neutral
  blocked: '#9a2c18',     // darker tomato — urgent but readable
} as const;

// ── Zoom ────────────────────────────────────────────────────────────

type ZoomLevel = 1 | 2 | 3 | 4;

const ZOOM_SCALES: Record<ZoomLevel, number> = { 1: 0.85, 2: 1, 3: 1.2, 4: 1.45 };
const ZOOM_LABELS: Record<ZoomLevel, string> = { 1: '85%', 2: '100%', 3: '120%', 4: '145%' };

// ── View Mode ──────────────────────────────────────────────────────

type ViewMode = 'room-type' | 'room';

// ── Tooltip (Room Type View) ────────────────────────────────────────

interface TypeTooltipState {
  kind: 'type';
  date: string;
  roomTypeId: string;
  rect: DOMRect;
}

interface RoomTooltipState {
  kind: 'room';
  date: string;
  roomId: string;
  rect: DOMRect;
}

type TooltipState = TypeTooltipState | RoomTooltipState;

function TypeCellTooltip({
  tip,
  cell,
  roomType,
  onClose,
}: {
  tip: TypeTooltipState;
  cell: UtilizationCell;
  roomType: UtilizationRoomType;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const availPct = getAvailabilityPct(cell);
  const top = tip.rect.bottom + 8;
  const left = Math.max(8, Math.min(tip.rect.left, window.innerWidth - 280));

  return createPortal(
    <div
      ref={ref}
      className="fixed z-50 w-64 rounded-lg border border-border bg-surface p-4 shadow-xl"
      style={{ top, left }}
    >
      <div className="text-base font-semibold text-foreground">{roomType.name}</div>
      <div className="mt-1 text-sm text-muted-foreground">
        {formatDayLabel(tip.date)}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold" style={{ color: availabilityColor(availPct) }}>
          {cell.available}
        </span>
        <span className="text-sm text-muted-foreground">of {cell.totalRooms} available</span>
      </div>
      <div className="mt-2">
        <div className="flex items-center gap-2">
          <div className="relative h-3 flex-1 rounded-full bg-gray-200/60 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${availPct}%`,
                minWidth: availPct > 0 ? '8px' : '0px',
                backgroundColor: availabilityColor(availPct),
              }}
            />
          </div>
          <span className="text-sm font-medium text-foreground tabular-nums w-10 text-right">
            {availPct}%
          </span>
        </div>
      </div>
      <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
        {cell.occupied > 0 && <span>{cell.occupied} occupied</span>}
        {cell.blocked > 0 && <span style={{ color: '#9a2c18' }} className="font-medium">{cell.blocked} blocked</span>}
      </div>
    </div>,
    document.body,
  );
}

function RoomCellTooltip({
  tip,
  cell,
  room,
  onClose,
}: {
  tip: RoomTooltipState;
  cell: UtilizationRoomCellData;
  room: UtilizationRoomData;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const top = tip.rect.bottom + 8;
  const left = Math.max(8, Math.min(tip.rect.left, window.innerWidth - 260));

  const status = cell.isBlocked ? 'Blocked' : cell.isOccupied ? 'Occupied' : 'Available';
  const statusColor = cell.isBlocked ? '#9a2c18' : cell.isOccupied ? '#64748b' : '#1a3a0a';

  return createPortal(
    <div
      ref={ref}
      className="fixed z-50 w-60 rounded-lg border border-border bg-surface p-4 shadow-xl"
      style={{ top, left }}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-base font-semibold text-foreground">Room {room.roomNumber}</span>
        <span className="text-sm text-muted-foreground">{room.roomTypeName}</span>
      </div>
      <div className="mt-1 text-sm text-muted-foreground">{formatDayLabel(tip.date)}</div>
      <div className="mt-3 flex items-center gap-2">
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ backgroundColor: statusColor }}
        />
        <span className="text-sm font-semibold" style={{ color: statusColor }}>{status}</span>
      </div>
      {cell.guestName && (
        <div className="mt-2 text-sm text-muted-foreground">
          Guest: <span className="font-medium text-foreground">{cell.guestName}</span>
        </div>
      )}
      {room.floor != null && (
        <div className="mt-1 text-sm text-muted-foreground">Floor {room.floor}</div>
      )}
    </div>,
    document.body,
  );
}

// ── View Days Type ───────────────────────────────────────────────────

type ViewDays = 7 | 14 | 30;

// ── Main Component ───────────────────────────────────────────────────

export default function UtilizationContent() {
  const { data: properties, isLoading: propsLoading } = useProperties();

  const [propertyId, setPropertyId] = useState<string>('');
  const [rangeStart, setRangeStart] = useState<Date>(() => new Date());
  const [viewDays, setViewDays] = useState<ViewDays>(14);
  const [guestCount, setGuestCount] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [zoom, setZoom] = useState<ZoomLevel>(2);
  const [viewMode, setViewMode] = useState<ViewMode>('room-type');

  // Auto-select first property
  useEffect(() => {
    if (!propertyId && properties.length > 0) {
      setPropertyId(properties[0]!.id);
    }
  }, [propertyId, properties]);

  // Compute date range
  const startDate = useMemo(() => formatDate(rangeStart), [rangeStart]);
  const endDate = useMemo(() => formatDate(addDays(rangeStart, viewDays)), [rangeStart, viewDays]);

  // Fetch data for both views (only active one is enabled)
  const typeResult = usePmsUtilization(
    propertyId || null, startDate, endDate, viewMode === 'room-type',
  );
  const roomResult = usePmsUtilizationByRoom(
    propertyId || null, startDate, endDate, viewMode === 'room',
  );

  const isLoading = viewMode === 'room-type' ? typeResult.isLoading : roomResult.isLoading;
  const error = viewMode === 'room-type' ? typeResult.error : roomResult.error;

  // Build cell lookup map (room-type view)
  const cellMap = useMemo(() => {
    const m = new Map<string, UtilizationCell>();
    if (typeResult.data?.cells) {
      for (const c of typeResult.data.cells) {
        m.set(`${c.date}:${c.roomTypeId}`, c);
      }
    }
    return m;
  }, [typeResult.data]);

  // Room type lookup
  const roomTypeMap = useMemo(() => {
    const m = new Map<string, UtilizationRoomType>();
    if (typeResult.data?.roomTypes) {
      for (const rt of typeResult.data.roomTypes) m.set(rt.id, rt);
    }
    return m;
  }, [typeResult.data]);

  // Build cell lookup map (room view)
  const roomCellMap = useMemo(() => {
    const m = new Map<string, UtilizationRoomCellData>();
    if (roomResult.data?.cells) {
      for (const c of roomResult.data.cells) {
        m.set(`${c.date}:${c.roomId}`, c);
      }
    }
    return m;
  }, [roomResult.data]);

  // Room lookup
  const roomMap = useMemo(() => {
    const m = new Map<string, UtilizationRoomData>();
    if (roomResult.data?.rooms) {
      for (const r of roomResult.data.rooms) m.set(r.id, r);
    }
    return m;
  }, [roomResult.data]);

  // Group rooms by room type for header rendering
  const roomsByType = useMemo(() => {
    const groups: { typeId: string; typeName: string; rooms: UtilizationRoomData[] }[] = [];
    if (!roomResult.data?.rooms) return groups;

    const map = new Map<string, { typeName: string; rooms: UtilizationRoomData[] }>();
    for (const r of roomResult.data.rooms) {
      let group = map.get(r.roomTypeId);
      if (!group) {
        group = { typeName: r.roomTypeName, rooms: [] };
        map.set(r.roomTypeId, group);
      }
      group.rooms.push(r);
    }
    for (const [typeId, g] of map) {
      groups.push({ typeId, typeName: g.typeName, rooms: g.rooms });
    }
    return groups;
  }, [roomResult.data]);

  // Flat rooms list for column iteration
  const rooms = roomResult.data?.rooms ?? [];

  // Generate date spine for rows
  const dates = useMemo(() => {
    const arr: string[] = [];
    const d = new Date(rangeStart);
    for (let i = 0; i < viewDays; i++) {
      arr.push(formatDate(d));
      d.setDate(d.getDate() + 1);
    }
    return arr;
  }, [rangeStart, viewDays]);

  // Navigation
  const handlePrev = useCallback(() => setRangeStart((s) => addDays(s, -viewDays)), [viewDays]);
  const handleNext = useCallback(() => setRangeStart((s) => addDays(s, viewDays)), [viewDays]);
  const handleToday = useCallback(() => setRangeStart(new Date()), []);
  const handleDateJump = useCallback((date: string) => {
    setRangeStart(new Date(date + 'T00:00:00'));
  }, []);

  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(4, z + 1) as ZoomLevel), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(1, z - 1) as ZoomLevel), []);

  // Clear tooltip on view mode change
  useEffect(() => { setTooltip(null); }, [viewMode]);

  const scale = ZOOM_SCALES[zoom];
  const roomTypes = typeResult.data?.roomTypes ?? [];

  const hasData = viewMode === 'room-type' ? roomTypes.length > 0 : rooms.length > 0;

  return (
    <div className="-m-4 md:-m-6 flex h-[calc(100%+2rem)] md:h-[calc(100%+3rem)] flex-col">
      {/* ── Toolbar ───────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border bg-surface px-4 py-3 md:px-6">
        {/* Top row: title + view toggle + zoom */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <Grid3X3 className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-xl font-semibold text-foreground">Utilization</h1>
          </div>

          <div className="flex items-center gap-3">
            {/* View mode toggle */}
            <div className="flex rounded-lg border border-border bg-surface">
              <button
                onClick={() => setViewMode('room-type')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-l-lg ${
                  viewMode === 'room-type'
                    ? 'bg-indigo-600 text-white'
                    : 'text-muted-foreground hover:bg-gray-200/50'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                By Type
              </button>
              <button
                onClick={() => setViewMode('room')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-r-lg ${
                  viewMode === 'room'
                    ? 'bg-indigo-600 text-white'
                    : 'text-muted-foreground hover:bg-gray-200/50'
                }`}
              >
                <Rows3 className="h-3.5 w-3.5" />
                By Room
              </button>
            </div>

            {/* Zoom controls */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface px-1.5 py-1">
              <button
                onClick={handleZoomOut}
                disabled={zoom <= 1}
                className="rounded p-1 text-muted-foreground hover:bg-gray-200/50 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="w-10 text-center text-xs font-semibold text-muted-foreground">
                {ZOOM_LABELS[zoom]}
              </span>
              <button
                onClick={handleZoomIn}
                disabled={zoom >= 4}
                className="rounded p-1 text-muted-foreground hover:bg-gray-200/50 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Bottom row: controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Property selector */}
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium"
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Date navigation */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={handlePrev}
              className="rounded-lg p-2 text-muted-foreground hover:bg-gray-200/50"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <DateJumpPicker value={startDate} onSelect={handleDateJump}>
              <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                {formatRangeLabel(rangeStart, viewDays)}
              </span>
            </DateJumpPicker>

            <button
              onClick={handleNext}
              className="rounded-lg p-2 text-muted-foreground hover:bg-gray-200/50"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Today button */}
          <button
            onClick={handleToday}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-foreground hover:bg-gray-200/50"
          >
            Today
          </button>

          {/* Range toggle */}
          <div className="flex rounded-lg border border-border bg-surface">
            {([7, 14, 30] as ViewDays[]).map((d) => (
              <button
                key={d}
                onClick={() => setViewDays(d)}
                className={`px-3.5 py-2 text-sm font-semibold first:rounded-l-lg last:rounded-r-lg ${
                  viewDays === d
                    ? 'bg-indigo-600 text-white'
                    : 'text-muted-foreground hover:bg-gray-200/50'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>

          {/* Guest count filter */}
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5">
            <Users className="h-4 w-4 text-muted-foreground" />
            <input
              type="number"
              min={1}
              max={20}
              placeholder="Guests"
              value={guestCount ?? ''}
              onChange={(e) => {
                const v = e.target.value ? parseInt(e.target.value, 10) : null;
                setGuestCount(v && v > 0 ? v : null);
              }}
              className="w-16 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
            />
            {guestCount !== null && (
              <button onClick={() => setGuestCount(null)} className="text-muted-foreground hover:text-muted-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Legend — inline with controls on wide screens */}
          <div className="hidden lg:flex items-center gap-3 ml-auto">
            <Legend viewMode={viewMode} guestCount={guestCount} />
          </div>
        </div>

        {/* Legend row — visible only on narrow screens */}
        <div className="mt-2 flex lg:hidden items-center gap-3">
          <Legend viewMode={viewMode} guestCount={guestCount} />
        </div>
      </div>

      {/* ── Grid ──────────────────────────────────────────────── */}
      {isLoading || propsLoading ? (
        <div className="flex flex-1 items-center justify-center text-base text-muted-foreground">
          Loading utilization data...
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center text-base text-red-500">
          Failed to load utilization data
        </div>
      ) : !hasData ? (
        <div className="flex flex-1 items-center justify-center text-base text-muted-foreground">
          {viewMode === 'room-type'
            ? 'No room types configured for this property'
            : 'No rooms configured for this property'}
        </div>
      ) : viewMode === 'room-type' ? (
        /* ── Room Type Grid ─────────────────────────────── */
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full border-collapse" style={{ fontSize: `${scale}rem` }}>
            <thead>
              <tr className="sticky top-0 z-20 bg-surface">
                <th
                  className="sticky left-0 z-30 bg-surface border-b border-r border-border text-left font-semibold text-muted-foreground"
                  style={{ padding: `${12 * scale}px ${16 * scale}px`, minWidth: `${130 * scale}px` }}
                >
                  Date
                </th>
                {roomTypes.map((rt) => (
                  <th
                    key={rt.id}
                    className="border-b border-border text-center font-semibold text-foreground whitespace-nowrap"
                    style={{ padding: `${12 * scale}px ${8 * scale}px`, minWidth: `${90 * scale}px` }}
                  >
                    <div>{rt.name}</div>
                    <div className="font-normal text-muted-foreground" style={{ fontSize: '0.75em' }}>
                      {rt.totalRooms} room{rt.totalRooms !== 1 ? 's' : ''}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map((date) => {
                const today = isToday(date);
                return (
                  <tr key={date} className={today ? 'bg-indigo-50/30' : ''}>
                    <td
                      className="sticky left-0 z-10 bg-surface border-r border-border whitespace-nowrap"
                      style={{ padding: `${6 * scale}px ${16 * scale}px`, minWidth: `${130 * scale}px` }}
                    >
                      <span className={`font-semibold ${today ? 'text-indigo-600' : 'text-foreground'}`}>
                        {formatDayLabel(date)}
                      </span>
                    </td>
                    {roomTypes.map((rt) => {
                      const cell = cellMap.get(`${date}:${rt.id}`);
                      if (!cell) return <td key={rt.id} style={{ padding: `${3 * scale}px` }} />;
                      const availPct = getAvailabilityPct(cell);
                      const bgColor = availabilityColor(availPct);
                      const textColor = availabilityTextColor(availPct);
                      const isExactMatch = guestCount !== null && rt.maxOccupancy >= guestCount && cell.available > 0;
                      return (
                        <td key={rt.id} style={{ padding: `${3 * scale}px` }}>
                          <button
                            onClick={(e) =>
                              setTooltip({ kind: 'type', date, roomTypeId: rt.id, rect: e.currentTarget.getBoundingClientRect() })
                            }
                            className="w-full rounded-md text-center font-bold transition-all hover:scale-105 hover:shadow-md"
                            style={{
                              backgroundColor: bgColor,
                              color: textColor,
                              padding: `${8 * scale}px ${10 * scale}px`,
                              border: isExactMatch ? '2.5px solid #6366f1' : '2.5px solid transparent',
                              boxShadow: isExactMatch ? '0 0 0 1px #6366f1' : undefined,
                            }}
                          >
                            {cell.available}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── Room Grid ──────────────────────────────────── */
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full border-collapse" style={{ fontSize: `${scale}rem` }}>
            <thead>
              {/* Row 1: Room type group headers */}
              <tr className="sticky top-0 z-20 bg-surface">
                <th
                  className="sticky left-0 z-30 bg-surface border-b border-r border-border"
                  style={{ padding: `${8 * scale}px ${16 * scale}px`, minWidth: `${130 * scale}px` }}
                  rowSpan={2}
                >
                  <span className="font-semibold text-muted-foreground">Date</span>
                </th>
                {roomsByType.map((group) => (
                  <th
                    key={group.typeId}
                    colSpan={group.rooms.length}
                    className="border-b border-l border-border text-center font-semibold text-foreground whitespace-nowrap"
                    style={{ padding: `${6 * scale}px ${4 * scale}px` }}
                  >
                    {group.typeName}
                    <span className="ml-1 font-normal text-muted-foreground" style={{ fontSize: '0.75em' }}>
                      ({group.rooms.length})
                    </span>
                  </th>
                ))}
              </tr>
              {/* Row 2: Individual room numbers */}
              <tr className="sticky z-20 bg-surface" style={{ top: `${38 * scale}px` }}>
                {rooms.map((room) => (
                  <th
                    key={room.id}
                    className="border-b border-border text-center text-muted-foreground whitespace-nowrap"
                    style={{
                      padding: `${4 * scale}px ${2 * scale}px`,
                      minWidth: `${56 * scale}px`,
                      fontSize: '0.85em',
                      fontWeight: 600,
                    }}
                  >
                    {room.roomNumber}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map((date) => {
                const today = isToday(date);
                return (
                  <tr key={date} className={today ? 'bg-indigo-50/30' : ''}>
                    <td
                      className="sticky left-0 z-10 bg-surface border-r border-border whitespace-nowrap"
                      style={{ padding: `${6 * scale}px ${16 * scale}px`, minWidth: `${130 * scale}px` }}
                    >
                      <span className={`font-semibold ${today ? 'text-indigo-600' : 'text-foreground'}`}>
                        {formatDayLabel(date)}
                      </span>
                    </td>
                    {rooms.map((room) => {
                      const cell = roomCellMap.get(`${date}:${room.id}`);
                      if (!cell) return <td key={room.id} style={{ padding: `${2 * scale}px` }} />;

                      const status = cell.isBlocked ? 'blocked' : cell.isOccupied ? 'occupied' : 'available';
                      const bgColor = ROOM_COLORS[status];
                      const textColor = ROOM_TEXT_COLORS[status];
                      const isExactMatch = guestCount !== null && cell.isAvailable;

                      // Display content
                      let content: string;
                      if (cell.isBlocked) {
                        content = '\u2715'; // × symbol
                      } else if (cell.isOccupied && cell.guestName) {
                        content = cell.guestName.charAt(0).toUpperCase();
                      } else if (cell.isOccupied) {
                        content = '\u2022'; // bullet
                      } else {
                        content = '\u2713'; // checkmark
                      }

                      return (
                        <td key={room.id} style={{ padding: `${2 * scale}px` }}>
                          <button
                            onClick={(e) =>
                              setTooltip({ kind: 'room', date, roomId: room.id, rect: e.currentTarget.getBoundingClientRect() })
                            }
                            className="w-full rounded-md text-center font-bold transition-all hover:scale-105 hover:shadow-md"
                            style={{
                              backgroundColor: bgColor,
                              color: textColor,
                              padding: `${6 * scale}px ${4 * scale}px`,
                              border: isExactMatch ? '2.5px solid #6366f1' : cell.isBlocked ? '1.5px dashed #FE5E41' : '2.5px solid transparent',
                              boxShadow: isExactMatch ? '0 0 0 1px #6366f1' : undefined,
                              fontSize: '0.9em',
                            }}
                          >
                            {content}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tooltip ───────────────────────────────────────────── */}
      {tooltip?.kind === 'type' && (() => {
        const cell = cellMap.get(`${tooltip.date}:${tooltip.roomTypeId}`);
        const rt = roomTypeMap.get(tooltip.roomTypeId);
        if (!cell || !rt) return null;
        return (
          <TypeCellTooltip tip={tooltip} cell={cell} roomType={rt} onClose={() => setTooltip(null)} />
        );
      })()}
      {tooltip?.kind === 'room' && (() => {
        const cell = roomCellMap.get(`${tooltip.date}:${tooltip.roomId}`);
        const room = roomMap.get(tooltip.roomId);
        if (!cell || !room) return null;
        return (
          <RoomCellTooltip tip={tooltip} cell={cell} room={room} onClose={() => setTooltip(null)} />
        );
      })()}
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────

function Legend({ viewMode, guestCount }: { viewMode: ViewMode; guestCount: number | null }) {
  if (viewMode === 'room') {
    return (
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-4 w-4 rounded-sm" style={{ backgroundColor: ROOM_COLORS.available }} />
          <span>Available</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-4 w-4 rounded-sm" style={{ backgroundColor: ROOM_COLORS.occupied }} />
          <span>Occupied</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-4 w-4 rounded-sm"
            style={{ backgroundColor: ROOM_COLORS.blocked, border: '1.5px dashed #FE5E41' }}
          />
          <span>Blocked</span>
        </span>
        {guestCount !== null && (
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-4 w-4 rounded-sm border-2"
              style={{ borderColor: '#6366f1', backgroundColor: 'transparent' }}
            />
            <span>Exact Match</span>
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
      <span className="font-semibold text-foreground">Availability:</span>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Sold Out</span>
        <div className="flex h-4 overflow-hidden rounded">
          {[0, 12, 25, 37, 50, 62, 75, 87, 100].map((pct) => (
            <div
              key={pct}
              className="w-5 h-full"
              style={{ backgroundColor: availabilityColor(pct) }}
            />
          ))}
        </div>
        <span className="text-xs font-medium text-muted-foreground">Open</span>
      </div>
      {guestCount !== null && (
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-4 w-4 rounded-sm border-2"
            style={{ borderColor: '#6366f1', backgroundColor: 'transparent' }}
          />
          <span className="text-sm">Exact Match</span>
        </span>
      )}
    </div>
  );
}
