'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Calendar, Loader2 } from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

// ── Types ────────────────────────────────────────────────────────

interface CalendarRoom {
  roomId: string;
  roomNumber: string;
  roomTypeId: string;
  roomTypeName: string;
  floor: string | null;
  status: string;
  isOutOfOrder: boolean;
}

interface CalendarSegment {
  roomId: string;
  businessDate: string;
  reservationId: string;
  status: string;
  guestName: string;
  checkInDate: string;
  checkOutDate: string;
  sourceType: string;
  colorKey: string;
}

interface OooBlock {
  roomId: string;
  startDate: string;
  endDate: string;
  reason: string | null;
}

interface OccupancyByDate {
  occupied: number;
  available: number;
  arrivals: number;
  departures: number;
}

interface CalendarWeekData {
  startDate: string;
  endDate: string;
  rooms: CalendarRoom[];
  segments: CalendarSegment[];
  oooBlocks: OooBlock[];
  meta: {
    totalRooms: number;
    occupancyByDate: Record<string, OccupancyByDate>;
    lastUpdatedAt: string;
  };
}

interface Property {
  id: string;
  name: string;
}

// ── Helpers ──────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  CONFIRMED: 'bg-indigo-500 text-white',
  CHECKED_IN: 'bg-blue-500 text-white',
  HOLD: 'bg-amber-400 text-gray-900',
  NO_SHOW: 'bg-red-500 text-white',
};

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]!;
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatWeekRange(start: Date): string {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const startStr = start.toLocaleDateString('en-US', opts);
  const endStr = end.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  return `${startStr} - ${endStr}`;
}

function getWeekDates(start: Date): string[] {
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(formatDate(d));
  }
  return dates;
}

// ── Component ────────────────────────────────────────────────────

export default function CalendarContent() {
  const router = useRouter();
  const { user, locations } = useAuthContext();

  // Property selection
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState('');

  // Week state
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));

  // Data
  const [data, setData] = useState<CalendarWeekData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load properties
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ data: Property[] }>('/api/v1/pms/properties')
      .then((res) => {
        if (cancelled) return;
        setProperties(res.data);
        if (res.data.length > 0 && !propertyId) {
          setPropertyId(res.data[0]!.id);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load properties');
      });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load calendar data
  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const qs = buildQueryString({
      propertyId,
      start: formatDate(weekStart),
    });

    apiFetch<{ data: CalendarWeekData }>(`/api/v1/pms/calendar/week${qs}`)
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? 'Failed to load calendar');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [propertyId, weekStart]);

  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);

  const prevWeek = useCallback(() => {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  }, []);

  const nextWeek = useCallback(() => {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  }, []);

  const goToToday = useCallback(() => {
    setWeekStart(getMonday(new Date()));
  }, []);

  // Build room-to-segments lookup: for each room, for each date, which segment
  const segmentsByRoomDate = useMemo(() => {
    const map = new Map<string, Map<string, CalendarSegment>>();
    if (!data) return map;
    for (const seg of data.segments) {
      if (!map.has(seg.roomId)) map.set(seg.roomId, new Map());
      map.get(seg.roomId)!.set(seg.businessDate, seg);
    }
    return map;
  }, [data]);

  // Build OOO blocks lookup
  const oooByRoomDate = useMemo(() => {
    const map = new Map<string, Set<string>>();
    if (!data) return map;
    for (const block of data.oooBlocks) {
      if (!map.has(block.roomId)) map.set(block.roomId, new Set());
      const blockDates = map.get(block.roomId)!;
      // Mark each date within block range that falls in our week
      for (const date of weekDates) {
        if (date >= block.startDate && date < block.endDate) {
          blockDates.add(date);
        }
      }
    }
    return map;
  }, [data, weekDates]);

  // Compute occupancy % per date
  const occupancyByDate = useMemo(() => {
    if (!data) return {};
    const result: Record<string, number> = {};
    for (const date of weekDates) {
      const occ = data.meta.occupancyByDate[date];
      if (occ) {
        const total = occ.occupied + occ.available;
        result[date] = total > 0 ? Math.round((occ.occupied / total) * 100) : 0;
      } else {
        result[date] = 0;
      }
    }
    return result;
  }, [data, weekDates]);

  // Track which cells are the "start" of a reservation bar (for rendering spans)
  const reservationBars = useMemo(() => {
    if (!data) return new Map<string, Map<string, { segment: CalendarSegment; span: number }>>();
    const bars = new Map<string, Map<string, { segment: CalendarSegment; span: number }>>();
    const rendered = new Set<string>(); // "roomId:reservationId" already laid out

    for (const room of data.rooms) {
      const roomBars = new Map<string, { segment: CalendarSegment; span: number }>();
      bars.set(room.roomId, roomBars);

      for (let i = 0; i < weekDates.length; i++) {
        const date = weekDates[i]!;
        const seg = segmentsByRoomDate.get(room.roomId)?.get(date);
        if (!seg) continue;

        const key = `${room.roomId}:${seg.reservationId}`;
        if (rendered.has(key)) continue;
        rendered.add(key);

        // Count how many consecutive days this reservation spans in this week
        let span = 1;
        for (let j = i + 1; j < weekDates.length; j++) {
          const nextSeg = segmentsByRoomDate.get(room.roomId)?.get(weekDates[j]!);
          if (nextSeg?.reservationId === seg.reservationId) {
            span++;
          } else {
            break;
          }
        }

        roomBars.set(date, { segment: seg, span });
      }
    }

    return bars;
  }, [data, weekDates, segmentsByRoomDate]);

  const todayStr = formatDate(new Date());

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Calendar className="h-5 w-5 text-gray-500" />
          <h1 className="text-xl font-semibold text-gray-900">Calendar</h1>
        </div>
        <div className="flex items-center gap-2">
          {properties.length > 1 && (
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="rounded-lg border border-gray-200 bg-surface px-3 py-1.5 text-sm text-gray-900"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-surface px-4 py-2">
        <button
          onClick={prevWeek}
          className="rounded-md p-1.5 hover:bg-gray-200/50 text-gray-600"
          aria-label="Previous week"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-900">
            {formatWeekRange(weekStart)}
          </span>
          <button
            onClick={goToToday}
            className="rounded-md border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-200/50"
          >
            Today
          </button>
        </div>
        <button
          onClick={nextWeek}
          className="rounded-md p-1.5 hover:bg-gray-200/50 text-gray-600"
          aria-label="Next week"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Loading / Error */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Calendar Grid */}
      {!isLoading && !error && data && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[800px] border-collapse">
            <thead>
              <tr className="bg-surface">
                <th className="sticky left-0 z-10 bg-surface border-b border-r border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-500 w-36">
                  Room
                </th>
                {weekDates.map((date) => (
                  <th
                    key={date}
                    className={`border-b border-gray-200 px-2 py-2 text-center text-xs font-medium w-[calc((100%-9rem)/7)] ${
                      date === todayStr ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500'
                    }`}
                  >
                    {formatDateDisplay(date)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rooms.map((room) => (
                <tr key={room.roomId} className="group">
                  <td className="sticky left-0 z-10 bg-surface border-b border-r border-gray-200 px-3 py-2">
                    <div className="text-sm font-medium text-gray-900">{room.roomNumber}</div>
                    <div className="text-xs text-gray-500">{room.roomTypeName}</div>
                  </td>
                  {weekDates.map((date) => {
                    const bar = reservationBars.get(room.roomId)?.get(date);
                    const isOoo = oooByRoomDate.get(room.roomId)?.has(date);
                    const isOccupied = segmentsByRoomDate.get(room.roomId)?.has(date);

                    // If this cell is spanned by a bar that started on a previous date, skip it
                    if (!bar && isOccupied) {
                      return null;
                    }

                    return (
                      <td
                        key={date}
                        colSpan={bar ? bar.span : 1}
                        className={`border-b border-gray-200 px-1 py-1 ${
                          date === todayStr ? 'bg-indigo-50/50' : ''
                        } ${isOoo && !bar ? 'bg-gray-100' : ''}`}
                      >
                        {bar && (
                          <button
                            onClick={() => router.push(`/pms/reservations/${bar.segment.reservationId}`)}
                            className={`block w-full rounded-md px-2 py-1.5 text-left text-xs font-medium truncate transition-opacity hover:opacity-80 ${
                              STATUS_COLORS[bar.segment.status] ?? 'bg-gray-300 text-gray-900'
                            }`}
                            title={`${bar.segment.guestName} (${bar.segment.checkInDate} - ${bar.segment.checkOutDate})`}
                          >
                            {bar.segment.guestName}
                          </button>
                        )}
                        {isOoo && !bar && (
                          <div className="rounded-md bg-gray-300 px-2 py-1.5 text-xs text-gray-600 truncate">
                            OOO
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* Occupancy summary row */}
              <tr className="bg-surface">
                <td className="sticky left-0 z-10 bg-surface border-r border-gray-200 px-3 py-2 text-xs font-medium text-gray-500">
                  Occupancy
                </td>
                {weekDates.map((date) => {
                  const pct = occupancyByDate[date] ?? 0;
                  const colorClass =
                    pct >= 90 ? 'text-red-600 font-semibold' :
                    pct >= 70 ? 'text-amber-600 font-medium' :
                    'text-gray-600';
                  return (
                    <td
                      key={date}
                      className={`px-2 py-2 text-center text-xs ${colorClass} ${
                        date === todayStr ? 'bg-indigo-50/50' : ''
                      }`}
                    >
                      {pct}%
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && data && data.rooms.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          <Calendar className="h-10 w-10 mb-2 text-gray-300" />
          <p className="text-sm">No rooms found for this property.</p>
        </div>
      )}
    </div>
  );
}
