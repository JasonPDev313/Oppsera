'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Calendar, Loader2 } from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

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

interface CheckInToPosResult {
  reservationId: string;
  orderId: string;
  tabId: string;
  tabNumber: number;
  terminalId: string;
  customerId: string | null;
  balanceDueCents: number;
}

interface ReservationContextMenuState {
  x: number;
  y: number;
  reservationId: string;
  status: string;
}

const STATUS_COLORS: Record<string, string> = {
  CONFIRMED: 'bg-indigo-500 text-white',
  CHECKED_IN: 'bg-blue-500 text-white',
  HOLD: 'bg-amber-400 text-gray-900',
  NO_SHOW: 'bg-red-500 text-white',
};

const POS_TERMINAL_KEY = 'pos_terminal_id';
const PMS_RESERVATION_CATALOG_ITEM_KEY = 'pms:reservation-charge-catalog-item';

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
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

export default function CalendarContent() {
  const router = useRouter();
  const { locations } = useAuthContext();

  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [data, setData] = useState<CalendarWeekData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ReservationContextMenuState | null>(null);
  const [isPostingToPos, setIsPostingToPos] = useState(false);
  const [terminalId, setTerminalId] = useState('POS-01');
  const [reservationCatalogItemId, setReservationCatalogItemId] = useState('');

  useEffect(() => {
    const storedTerminal = localStorage.getItem(POS_TERMINAL_KEY);
    const storedCatalogItemId = localStorage.getItem(PMS_RESERVATION_CATALOG_ITEM_KEY);
    if (storedTerminal) setTerminalId(storedTerminal);
    if (storedCatalogItemId) setReservationCatalogItemId(storedCatalogItemId);
  }, []);

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
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line

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

    return () => {
      cancelled = true;
    };
  }, [propertyId, weekStart]);

  useEffect(() => {
    if (!contextMenu) return undefined;

    const onWindowClick = () => setContextMenu(null);
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null);
    };

    window.addEventListener('click', onWindowClick);
    window.addEventListener('keydown', onEscape);

    return () => {
      window.removeEventListener('click', onWindowClick);
      window.removeEventListener('keydown', onEscape);
    };
  }, [contextMenu]);

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

  const handleCheckInToPos = useCallback(
    async (reservationId: string) => {
      const locationId = locations[0]?.id;
      if (!locationId) {
        setError('No active location found for POS handoff');
        return;
      }
      if (!reservationCatalogItemId.trim()) {
        setError('Reservation charge catalog item ID is required');
        return;
      }
      if (!terminalId.trim()) {
        setError('POS terminal ID is required');
        return;
      }

      setIsPostingToPos(true);
      try {
        const result = await apiFetch<{ data: CheckInToPosResult }>(
          `/api/v1/pms/reservations/${reservationId}/check-in-to-pos`,
          {
            method: 'POST',
            headers: { 'X-Location-Id': locationId },
            body: JSON.stringify({
              terminalId: terminalId.trim(),
              catalogItemId: reservationCatalogItemId.trim(),
            }),
          },
        );

        localStorage.setItem(POS_TERMINAL_KEY, result.data.terminalId);
        localStorage.setItem(PMS_RESERVATION_CATALOG_ITEM_KEY, reservationCatalogItemId.trim());
        localStorage.setItem(`oppsera:active-tab:${result.data.terminalId}`, String(result.data.tabNumber));

        router.push(`/pos/retail?terminal=${encodeURIComponent(result.data.terminalId)}`);
      } catch (err) {
        const e = err instanceof Error ? err : new Error('Failed to check in to POS');
        setError(e.message);
      } finally {
        setIsPostingToPos(false);
        setContextMenu(null);
      }
    },
    [locations, reservationCatalogItemId, terminalId, router],
  );

  const segmentsByRoomDate = useMemo(() => {
    const map = new Map<string, Map<string, CalendarSegment>>();
    if (!data) return map;
    for (const seg of data.segments) {
      if (!map.has(seg.roomId)) map.set(seg.roomId, new Map());
      map.get(seg.roomId)!.set(seg.businessDate, seg);
    }
    return map;
  }, [data]);

  const oooByRoomDate = useMemo(() => {
    const map = new Map<string, Set<string>>();
    if (!data) return map;
    for (const block of data.oooBlocks) {
      if (!map.has(block.roomId)) map.set(block.roomId, new Set());
      const blockDates = map.get(block.roomId)!;
      for (const date of weekDates) {
        if (date >= block.startDate && date < block.endDate) {
          blockDates.add(date);
        }
      }
    }
    return map;
  }, [data, weekDates]);

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

  const reservationBars = useMemo(() => {
    if (!data) return new Map<string, Map<string, { segment: CalendarSegment; span: number }>>();

    const bars = new Map<string, Map<string, { segment: CalendarSegment; span: number }>>();
    const rendered = new Set<string>();

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
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 rounded-lg border border-gray-200 bg-surface p-3 md:grid-cols-2">
        <label className="text-xs text-gray-600">
          POS Terminal ID
          <input
            value={terminalId}
            onChange={(e) => setTerminalId(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm text-gray-900"
            placeholder="POS-01"
          />
        </label>
        <label className="text-xs text-gray-600">
          Reservation Charge Catalog Item ID
          <input
            value={reservationCatalogItemId}
            onChange={(e) => setReservationCatalogItemId(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm text-gray-900"
            placeholder="catalog item id"
          />
        </label>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-surface px-4 py-2">
        <button
          onClick={prevWeek}
          className="rounded-md p-1.5 text-gray-600 hover:bg-gray-200/50"
          aria-label="Previous week"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-900">{formatWeekRange(weekStart)}</span>
          <button
            onClick={goToToday}
            className="rounded-md border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-200/50"
          >
            Today
          </button>
        </div>
        <button
          onClick={nextWeek}
          className="rounded-md p-1.5 text-gray-600 hover:bg-gray-200/50"
          aria-label="Next week"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {!isLoading && !error && data && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[800px] border-collapse">
            <thead>
              <tr className="bg-surface">
                <th className="sticky left-0 z-10 w-36 border-r border-b border-gray-200 bg-surface px-3 py-2 text-left text-xs font-medium text-gray-500">
                  Room
                </th>
                {weekDates.map((date) => (
                  <th
                    key={date}
                    className={`w-[calc((100%-9rem)/7)] border-b border-gray-200 px-2 py-2 text-center text-xs font-medium ${
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
                  <td className="sticky left-0 z-10 border-r border-b border-gray-200 bg-surface px-3 py-2">
                    <div className="text-sm font-medium text-gray-900">{room.roomNumber}</div>
                    <div className="text-xs text-gray-500">{room.roomTypeName}</div>
                  </td>
                  {weekDates.map((date) => {
                    const bar = reservationBars.get(room.roomId)?.get(date);
                    const isOoo = oooByRoomDate.get(room.roomId)?.has(date);
                    const isOccupied = segmentsByRoomDate.get(room.roomId)?.has(date);

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
                            onContextMenu={(event) => {
                              event.preventDefault();
                              setContextMenu({
                                x: event.clientX,
                                y: event.clientY,
                                reservationId: bar.segment.reservationId,
                                status: bar.segment.status,
                              });
                            }}
                            className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-xs font-medium transition-opacity hover:opacity-80 ${
                              STATUS_COLORS[bar.segment.status] ?? 'bg-gray-300 text-gray-900'
                            }`}
                            title={`${bar.segment.guestName} (${bar.segment.checkInDate} - ${bar.segment.checkOutDate})`}
                          >
                            {bar.segment.guestName}
                          </button>
                        )}
                        {isOoo && !bar && (
                          <div className="truncate rounded-md bg-gray-300 px-2 py-1.5 text-xs text-gray-600">
                            OOO
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}

              <tr className="bg-surface">
                <td className="sticky left-0 z-10 border-r border-gray-200 bg-surface px-3 py-2 text-xs font-medium text-gray-500">
                  Occupancy
                </td>
                {weekDates.map((date) => {
                  const pct = occupancyByDate[date] ?? 0;
                  const colorClass =
                    pct >= 90
                      ? 'text-red-600 font-semibold'
                      : pct >= 70
                        ? 'text-amber-600 font-medium'
                        : 'text-gray-600';
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

      {!isLoading && !error && data && data.rooms.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          <Calendar className="mb-2 h-10 w-10 text-gray-300" />
          <p className="text-sm">No rooms found for this property.</p>
        </div>
      )}

      {contextMenu && (
        <div
          className="fixed z-50 min-w-56 rounded-md border border-gray-200 bg-surface p-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            disabled={!['HOLD', 'CONFIRMED', 'CHECKED_IN'].includes(contextMenu.status) || isPostingToPos}
            onClick={() => handleCheckInToPos(contextMenu.reservationId)}
            className="w-full rounded px-3 py-2 text-left text-sm text-gray-900 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPostingToPos ? 'Sending to POS...' : 'Check In and Send to Retail POS'}
          </button>
        </div>
      )}
    </div>
  );
}
