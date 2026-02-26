'use client';

import { useState, useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import type { CalendarRoom, CalendarSegment } from './types';
import { formatDateShort, formatDate } from './types';

interface RoomTypeGroup {
  id: string;
  name: string;
  rooms: CalendarRoom[];
  roomRange: string; // e.g. "Rooms 101–204"
}

interface DayAvailability {
  date: string;
  available: number;
  total: number;
  pct: number; // 0–1
}

interface CondensedViewProps {
  rooms: CalendarRoom[];
  segments: CalendarSegment[];
  dates: string[];
  onSelectDate: (date: string, roomTypeId: string) => void;
}

const OCCUPIED_STATUSES = new Set(['CONFIRMED', 'CHECKED_IN', 'HOLD']);

export default function CondensedView({
  rooms,
  segments,
  dates,
  onSelectDate,
}: CondensedViewProps) {
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);

  // ── Group rooms by type ──────────────────────────────────────
  const roomTypeGroups = useMemo((): RoomTypeGroup[] => {
    const map = new Map<string, CalendarRoom[]>();
    for (const r of rooms) {
      if (!map.has(r.roomTypeId)) map.set(r.roomTypeId, []);
      map.get(r.roomTypeId)!.push(r);
    }
    return Array.from(map.entries()).map(([id, typeRooms]) => {
      const sorted = typeRooms.map((r) => r.roomNumber).sort();
      const roomRange =
        sorted.length > 1 ? `Rooms ${sorted[0]}\u2013${sorted[sorted.length - 1]}` : `Room ${sorted[0]}`;
      return { id, name: typeRooms[0]!.roomTypeName, rooms: typeRooms, roomRange };
    });
  }, [rooms]);

  // Auto-select first type
  const activeTypeId = selectedTypeId ?? roomTypeGroups[0]?.id ?? null;

  // ── Rooms for active selection ───────────────────────────────
  const activeRooms = useMemo(() => {
    if (!activeTypeId) return rooms;
    if (activeTypeId === '__all__') return rooms;
    return rooms.filter((r) => r.roomTypeId === activeTypeId);
  }, [activeTypeId, rooms]);

  const activeTypeName = activeTypeId === '__all__'
    ? 'All Rooms'
    : roomTypeGroups.find((g) => g.id === activeTypeId)?.name ?? '';

  // ── Compute per-day availability ─────────────────────────────
  const dayAvailability = useMemo((): DayAvailability[] => {
    const roomIdSet = new Set(activeRooms.map((r) => r.roomId));
    const total = activeRooms.length;
    if (total === 0) return dates.map((d) => ({ date: d, available: 0, total: 0, pct: 0 }));

    return dates.map((date) => {
      const occupied = new Set<string>();
      for (const s of segments) {
        if (roomIdSet.has(s.roomId) && s.businessDate === date && OCCUPIED_STATUSES.has(s.status)) {
          occupied.add(s.roomId);
        }
      }
      const available = total - occupied.size;
      return { date, available, total, pct: available / total };
    });
  }, [activeRooms, segments, dates]);

  // ── KPI computations ─────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = activeRooms.length;
    if (dayAvailability.length === 0 || total === 0) {
      return { avgAvailable: 0, bestDate: '', bestRooms: 0, fullyBooked: 0, total };
    }
    const sumAvailable = dayAvailability.reduce((s, d) => s + d.available, 0);
    const avgAvailable = sumAvailable / dayAvailability.length;
    const fullyBooked = dayAvailability.filter((d) => d.available === 0).length;
    let bestDate = dayAvailability[0]!.date;
    let bestRooms = dayAvailability[0]!.available;
    for (const d of dayAvailability) {
      if (d.available > bestRooms) {
        bestDate = d.date;
        bestRooms = d.available;
      }
    }
    return { avgAvailable, bestDate, bestRooms, fullyBooked, total };
  }, [dayAvailability, activeRooms.length]);

  // ── Date range label ─────────────────────────────────────────
  const rangeLabel = dates.length > 0
    ? `${formatDateShort(dates[0]!)} \u2013 ${formatDateShort(dates[dates.length - 1]!)}`
    : '';

  const todayStr = formatDate(new Date());

  return (
    <div className="flex min-h-0 flex-1 gap-0 rounded-lg border border-border bg-surface">
      {/* ── Left sidebar ────────────────────────────────────── */}
      <div className="w-64 shrink-0 overflow-y-auto border-r border-border py-4">
        <div className="px-4 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Room Types
        </div>
        <div className="space-y-0.5 px-2">
          {roomTypeGroups.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedTypeId(g.id)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors ${
                activeTypeId === g.id
                  ? 'border border-amber-600/60 bg-amber-500/10'
                  : 'border border-transparent hover:bg-accent'
              }`}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">{g.name}</div>
                <div className="text-[11px] text-muted-foreground">{g.roomRange}</div>
              </div>
              <span className={`ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                activeTypeId === g.id ? 'bg-amber-700 text-white' : 'bg-muted text-muted-foreground'
              }`}>
                {g.rooms.length}
              </span>
            </button>
          ))}
        </div>

        {/* All rooms */}
        <div className="mt-3 border-t border-border px-4 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          All Rooms
        </div>
        <div className="px-2">
          <button
            onClick={() => setSelectedTypeId('__all__')}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors ${
              activeTypeId === '__all__'
                ? 'border border-amber-600/60 bg-amber-50/50'
                : 'border border-transparent hover:bg-gray-100/50'
            }`}
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-gray-900">Combined View</div>
              <div className="text-[11px] text-gray-500">{rooms.length} total rooms</div>
            </div>
            <span className={`ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
              activeTypeId === '__all__' ? 'bg-amber-700 text-white' : 'bg-gray-200/80 text-gray-600'
            }`}>
              {rooms.length}
            </span>
          </button>
        </div>
      </div>

      {/* ── Main content ────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {/* KPI cards */}
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            value={kpis.avgAvailable.toFixed(1)}
            label="Avg. rooms available / night"
            sub={`of ${kpis.total} total`}
          />
          <KpiCard
            value={kpis.bestDate ? formatDateShort(kpis.bestDate) : '\u2014'}
            label="Best availability window"
            sub={`${kpis.bestRooms} rooms open`}
          />
          <KpiCard
            value={String(kpis.fullyBooked)}
            label="Nights fully booked"
            sub={
              kpis.fullyBooked === 0
                ? 'Good availability \u2714'
                : `${kpis.fullyBooked} of ${dayAvailability.length} nights`
            }
            subColor={kpis.fullyBooked === 0 ? 'text-green-500' : 'text-amber-500'}
          />
          <KpiCard
            value={String(kpis.total)}
            label="Total rooms in type"
            sub={activeTypeName}
          />
        </div>

        {/* Legend */}
        <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <LegendDot color="bg-green-700" label="High (>60%)" />
          <LegendDot color="bg-emerald-500" label="Some (30–60%)" />
          <LegendDot color="bg-amber-500" label="Scarce (<30%)" />
          <LegendDot color="bg-gray-400" label="Full" />
        </div>

        {/* Section header */}
        <div className="mb-1">
          <h2 className="text-xl font-bold text-foreground">{activeTypeName}</h2>
          <p className="text-sm text-muted-foreground">
            {kpis.total} rooms &middot; {rangeLabel}
          </p>
        </div>

        {/* Day rows */}
        <div className="mt-3 divide-y divide-border">
          {dayAvailability.map((day) => {
            const d = new Date(`${day.date}T00:00:00`);
            const dayOfWeek = d.toLocaleDateString('en-US', { weekday: 'short' });
            const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const isToday = day.date === todayStr;
            const dotColor = availabilityDotColor(day.pct);
            const label = day.available === 0
              ? 'Full'
              : day.available === day.total
                ? 'Available'
                : `${day.available} of ${day.total} available`;

            return (
              <div
                key={day.date}
                className="flex items-center gap-4 py-3.5"
              >
                {/* Date column */}
                <div className="w-28 shrink-0">
                  <div className="text-lg font-bold text-foreground">{monthDay}</div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">{dayOfWeek}</span>
                    {isToday && (
                      <span className="rounded bg-amber-700 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                        Today
                      </span>
                    )}
                  </div>
                </div>

                {/* Availability indicator */}
                <div className="flex flex-1 items-center gap-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotColor}`} />
                  <span className="text-sm text-foreground">{label}</span>
                </div>

                {/* Select button */}
                <button
                  onClick={() => onSelectDate(day.date, activeTypeId ?? '')}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-input bg-surface px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                >
                  Select <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>

        {dayAvailability.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">No dates in range.</p>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function KpiCard({
  value,
  label,
  sub,
  subColor,
}: {
  value: string;
  label: string;
  sub: string;
  subColor?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xs ${subColor ?? 'text-green-500'}`}>{sub}</div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

function availabilityDotColor(pct: number): string {
  if (pct <= 0) return 'bg-gray-400';
  if (pct < 0.3) return 'bg-amber-500';
  if (pct < 0.6) return 'bg-emerald-500';
  return 'bg-green-700';
}
