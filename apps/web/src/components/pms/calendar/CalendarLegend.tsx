'use client';

import { STATUS_COLORS, ROOM_STATUS_COLORS, ROOM_STATUS_LABELS } from './types';

interface CalendarLegendProps {
  visible: boolean;
}

export default function CalendarLegend({ visible }: CalendarLegendProps) {
  if (!visible) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg border border-gray-200 bg-surface px-4 py-2 print:border-0 print:px-0">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Reservations</span>
      <LegendBar label="Confirmed" className={STATUS_COLORS.CONFIRMED!} />
      <LegendBar label="In-House" className={STATUS_COLORS.CHECKED_IN!} />
      <LegendBar label="Hold" className={STATUS_COLORS.HOLD!} />
      <LegendBar label="OOO" className="bg-gray-300 text-gray-600" hatched />

      <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Room Status</span>
      {Object.entries(ROOM_STATUS_LABELS).map(([status, label]) => (
        <LegendDot key={status} label={label} className={ROOM_STATUS_COLORS[status]!} />
      ))}

      <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Indicators</span>
      <div className="flex items-center gap-1">
        <span className="text-green-600">&#9654;</span>
        <span className="text-xs text-gray-600">Arrival</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-amber-600">&#9664;</span>
        <span className="text-xs text-gray-600">Departure</span>
      </div>
    </div>
  );
}

function LegendBar({ label, className, hatched }: { label: string; className: string; hatched?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`h-4 w-8 rounded text-center text-[9px] font-medium leading-4 ${className}`}
        style={
          hatched
            ? {
                backgroundImage:
                  'repeating-linear-gradient(135deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
              }
            : undefined
        }
      />
      <span className="text-xs text-gray-600">{label}</span>
    </div>
  );
}

function LegendDot({ label, className }: { label: string; className: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${className}`} />
      <span className="text-xs text-gray-600">{label}</span>
    </div>
  );
}
