'use client';

import type { OccupancyByDate } from './types';

interface CalendarStatsBarProps {
  totalRooms: number;
  occupancy: OccupancyByDate | null;
  lastUpdatedAt: string | null;
}

export default function CalendarStatsBar({ totalRooms, occupancy, lastUpdatedAt }: CalendarStatsBarProps) {
  if (!occupancy) return null;

  const pct = totalRooms > 0 ? Math.round((occupancy.occupied / totalRooms) * 100) : 0;
  const pctColor = pct >= 90 ? 'text-red-600' : pct >= 70 ? 'text-amber-600' : 'text-green-600';

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg border border-border bg-surface px-4 py-2">
      <StatItem label="Total Rooms" value={totalRooms} />
      <StatItem label="Occupied" value={occupancy.occupied} />
      <StatItem label="Available" value={occupancy.available} />
      <StatItem label="Arrivals" value={occupancy.arrivals} valueClass="text-green-600" />
      <StatItem label="Departures" value={occupancy.departures} valueClass="text-amber-600" />
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Occ%</span>
        <span className={`text-sm font-semibold ${pctColor}`}>{pct}%</span>
      </div>

      {/* Occupancy bar */}
      <div className="hidden w-24 sm:block">
        <div className="h-1.5 rounded-full bg-muted">
          <div
            className={`h-1.5 rounded-full transition-all ${
              pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-green-500'
            }`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>

      {lastUpdatedAt && (
        <span className="ml-auto text-[10px] text-muted-foreground">
          Updated {formatTimeAgo(lastUpdatedAt)}
        </span>
      )}
    </div>
  );
}

function StatItem({ label, value, valueClass }: { label: string; value: number; valueClass?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold ${valueClass ?? 'text-foreground'}`}>{value}</span>
    </div>
  );
}

function formatTimeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}
