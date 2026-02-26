'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { CalendarRoom, CalendarSegment, OooBlock, OccupancyByDate, CalendarFilters } from './types';
import {
  STATUS_DOT_COLORS,
  ROOM_STATUS_COLORS,
  ROOM_STATUS_LABELS,
  SOURCE_ICONS,
  formatDateDisplay,
  formatMoney,
  nightsBetween,
} from './types';
import type { ContextMenuState } from './ReservationContextMenu';

interface DayViewProps {
  rooms: CalendarRoom[];
  segments: CalendarSegment[];
  oooBlocks: OooBlock[];
  occupancy: OccupancyByDate | null;
  date: string;
  filters: CalendarFilters;
  onContextMenu: (state: ContextMenuState) => void;
}

export default function DayView({
  rooms,
  segments,
  oooBlocks,
  occupancy,
  date,
  filters,
  onContextMenu,
}: DayViewProps) {
  const router = useRouter();

  const segmentsByRoom = useMemo(() => {
    const map = new Map<string, CalendarSegment>();
    for (const seg of segments) map.set(seg.roomId, seg);
    return map;
  }, [segments]);

  const oooRoomIds = useMemo(() => {
    const set = new Set<string>();
    for (const block of oooBlocks) set.add(block.roomId);
    return set;
  }, [oooBlocks]);

  // Apply filters
  const filteredRooms = useMemo(() => {
    let result = rooms;
    if (filters.roomTypes.size > 0) result = result.filter((r) => filters.roomTypes.has(r.roomTypeId));
    if (filters.floors.size > 0) result = result.filter((r) => r.floor && filters.floors.has(r.floor));
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const matchIds = new Set<string>();
      for (const r of result) {
        if (r.roomNumber.toLowerCase().includes(q)) matchIds.add(r.roomId);
      }
      for (const seg of segments) {
        if (seg.guestName.toLowerCase().includes(q)) matchIds.add(seg.roomId);
      }
      result = result.filter((r) => matchIds.has(r.roomId));
    }
    return result;
  }, [rooms, segments, filters]);

  return (
    <div className="space-y-4">
      {/* Occupancy stat cards */}
      {occupancy && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Occupied" value={occupancy.occupied} />
          <StatCard label="Available" value={occupancy.available} />
          <StatCard label="Arrivals" value={occupancy.arrivals} valueClass="text-green-500" />
          <StatCard label="Departures" value={occupancy.departures} valueClass="text-amber-500" />
        </div>
      )}

      {/* Room table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-surface">
              <Th>Room</Th>
              <Th>Type</Th>
              <Th>Room Status</Th>
              <Th>Reservation</Th>
              <Th>Guest</Th>
              <Th>Rate</Th>
              <Th>Source</Th>
              <Th>Check-in</Th>
              <Th>Check-out</Th>
              <Th>Nights</Th>
            </tr>
          </thead>
          <tbody>
            {filteredRooms.map((room) => {
              const seg = segmentsByRoom.get(room.roomId);
              const isOoo = oooRoomIds.has(room.roomId);
              const isArrival = seg?.checkInDate === date;
              const isDeparture = seg?.checkOutDate === date;

              return (
                <tr key={room.roomId} className="hover:bg-accent/50">
                  {/* Room number with status dot */}
                  <td className="border-b border-border px-4 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${ROOM_STATUS_COLORS[room.status] ?? 'bg-muted'}`} />
                      <span className="text-sm font-medium text-foreground">{room.roomNumber}</span>
                      {room.floor && <span className="text-[10px] text-muted-foreground">F{room.floor}</span>}
                    </div>
                  </td>

                  {/* Room type */}
                  <td className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
                    {room.roomTypeName}
                  </td>

                  {/* Room housekeeping status */}
                  <td className="border-b border-border px-4 py-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      room.status === 'VACANT_CLEAN' ? 'bg-green-500/20 text-green-500' :
                      room.status === 'VACANT_DIRTY' ? 'bg-yellow-500/20 text-yellow-500' :
                      room.status === 'OCCUPIED' ? 'bg-blue-500/20 text-blue-500' :
                      room.status === 'OUT_OF_ORDER' ? 'bg-red-500/20 text-red-500' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {ROOM_STATUS_LABELS[room.status] ?? room.status}
                    </span>
                  </td>

                  {/* Reservation status */}
                  <td className="border-b border-border px-4 py-2">
                    {seg ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                        <span className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT_COLORS[seg.status] ?? 'bg-gray-400'}`} />
                        {seg.status.replace('_', ' ')}
                        {isArrival && <span className="text-green-500">&#9654;</span>}
                        {isDeparture && <span className="text-amber-500">&#9664;</span>}
                      </span>
                    ) : isOoo ? (
                      <span className="text-xs text-muted-foreground">OOO</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Vacant</span>
                    )}
                  </td>

                  {/* Guest name */}
                  <td className="border-b border-border px-4 py-2 text-sm">
                    {seg ? (
                      <button
                        onClick={() => router.push(`/pms/reservations/${seg.reservationId}`)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          onContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            reservationId: seg.reservationId,
                            status: seg.status,
                            confirmationNumber: seg.confirmationNumber,
                            version: seg.version,
                            roomId: seg.roomId,
                          });
                        }}
                        className="font-medium text-indigo-600 hover:underline"
                      >
                        {seg.guestName}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>

                  {/* Rate */}
                  <td className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
                    {seg && seg.nightlyRateCents > 0 ? formatMoney(seg.nightlyRateCents) : '-'}
                  </td>

                  {/* Source */}
                  <td className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
                    {seg?.sourceType ? (
                      <span title={seg.sourceType}>{SOURCE_ICONS[seg.sourceType] ?? seg.sourceType}</span>
                    ) : '-'}
                  </td>

                  {/* Check-in date */}
                  <td className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
                    {seg ? formatDateDisplay(seg.checkInDate) : '-'}
                  </td>

                  {/* Check-out date */}
                  <td className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
                    {seg ? formatDateDisplay(seg.checkOutDate) : '-'}
                  </td>

                  {/* Nights */}
                  <td className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
                    {seg ? nightsBetween(seg.checkInDate, seg.checkOutDate) : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b border-border px-4 py-2 text-left text-xs font-medium text-muted-foreground">
      {children}
    </th>
  );
}

function StatCard({ label, value, valueClass }: { label: string; value: number; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${valueClass ?? 'text-foreground'}`}>{value}</div>
    </div>
  );
}
