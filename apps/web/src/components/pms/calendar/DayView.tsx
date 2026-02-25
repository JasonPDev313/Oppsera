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
          <StatCard label="Arrivals" value={occupancy.arrivals} valueClass="text-green-600" />
          <StatCard label="Departures" value={occupancy.departures} valueClass="text-amber-600" />
        </div>
      )}

      {/* Room table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
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
                <tr key={room.roomId} className="hover:bg-gray-50/50">
                  {/* Room number with status dot */}
                  <td className="border-b border-gray-200 px-4 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${ROOM_STATUS_COLORS[room.status] ?? 'bg-gray-300'}`} />
                      <span className="text-sm font-medium text-gray-900">{room.roomNumber}</span>
                      {room.floor && <span className="text-[10px] text-gray-400">F{room.floor}</span>}
                    </div>
                  </td>

                  {/* Room type */}
                  <td className="border-b border-gray-200 px-4 py-2 text-xs text-gray-500">
                    {room.roomTypeName}
                  </td>

                  {/* Room housekeeping status */}
                  <td className="border-b border-gray-200 px-4 py-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      room.status === 'VACANT_CLEAN' ? 'bg-green-100 text-green-700' :
                      room.status === 'VACANT_DIRTY' ? 'bg-yellow-100 text-yellow-700' :
                      room.status === 'OCCUPIED' ? 'bg-blue-100 text-blue-700' :
                      room.status === 'OUT_OF_ORDER' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {ROOM_STATUS_LABELS[room.status] ?? room.status}
                    </span>
                  </td>

                  {/* Reservation status */}
                  <td className="border-b border-gray-200 px-4 py-2">
                    {seg ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                        <span className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT_COLORS[seg.status] ?? 'bg-gray-400'}`} />
                        {seg.status.replace('_', ' ')}
                        {isArrival && <span className="text-green-600">&#9654;</span>}
                        {isDeparture && <span className="text-amber-600">&#9664;</span>}
                      </span>
                    ) : isOoo ? (
                      <span className="text-xs text-gray-500">OOO</span>
                    ) : (
                      <span className="text-xs text-gray-400">Vacant</span>
                    )}
                  </td>

                  {/* Guest name */}
                  <td className="border-b border-gray-200 px-4 py-2 text-sm">
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
                      <span className="text-gray-400">-</span>
                    )}
                  </td>

                  {/* Rate */}
                  <td className="border-b border-gray-200 px-4 py-2 text-xs text-gray-500">
                    {seg && seg.nightlyRateCents > 0 ? formatMoney(seg.nightlyRateCents) : '-'}
                  </td>

                  {/* Source */}
                  <td className="border-b border-gray-200 px-4 py-2 text-xs text-gray-400">
                    {seg?.sourceType ? (
                      <span title={seg.sourceType}>{SOURCE_ICONS[seg.sourceType] ?? seg.sourceType}</span>
                    ) : '-'}
                  </td>

                  {/* Check-in date */}
                  <td className="border-b border-gray-200 px-4 py-2 text-xs text-gray-500">
                    {seg ? formatDateDisplay(seg.checkInDate) : '-'}
                  </td>

                  {/* Check-out date */}
                  <td className="border-b border-gray-200 px-4 py-2 text-xs text-gray-500">
                    {seg ? formatDateDisplay(seg.checkOutDate) : '-'}
                  </td>

                  {/* Nights */}
                  <td className="border-b border-gray-200 px-4 py-2 text-xs text-gray-500">
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
    <th className="border-b border-gray-200 px-4 py-2 text-left text-xs font-medium text-gray-500">
      {children}
    </th>
  );
}

function StatCard({ label, value, valueClass }: { label: string; value: number; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-surface p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-semibold ${valueClass ?? 'text-gray-900'}`}>{value}</div>
    </div>
  );
}
