'use client';

import { createPortal } from 'react-dom';
import type { CalendarSegment } from './types';
import { formatDateDisplay, formatMoney, nightsBetween, SOURCE_ICONS, STATUS_DOT_COLORS } from './types';

interface ReservationTooltipProps {
  segment: CalendarSegment;
  x: number;
  y: number;
}

export default function ReservationTooltip({ segment, x, y }: ReservationTooltipProps) {
  const nights = nightsBetween(segment.checkInDate, segment.checkOutDate);

  return createPortal(
    <div
      className="pointer-events-none fixed z-50 w-64 rounded-lg border border-gray-200 bg-surface p-3 shadow-xl"
      style={{
        left: Math.min(x + 12, window.innerWidth - 280),
        top: Math.min(y + 12, window.innerHeight - 260),
      }}
    >
      <div className="mb-2 flex items-start justify-between">
        <div className="text-sm font-semibold text-gray-900">{segment.guestName}</div>
        <span className="flex items-center gap-1 text-xs font-medium">
          <span className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT_COLORS[segment.status] ?? 'bg-gray-400'}`} />
          {segment.status.replace('_', ' ')}
        </span>
      </div>

      {segment.confirmationNumber && (
        <Row label="Confirmation" value={segment.confirmationNumber} />
      )}

      <Row label="Check-in" value={formatDateDisplay(segment.checkInDate)} />
      <Row label="Check-out" value={formatDateDisplay(segment.checkOutDate)} />
      <Row label="Nights" value={String(nights)} />
      <Row label="Guests" value={`${segment.adults}A${segment.children > 0 ? ` + ${segment.children}C` : ''}`} />

      {segment.nightlyRateCents > 0 && (
        <Row label="Rate/Night" value={formatMoney(segment.nightlyRateCents)} />
      )}

      <Row
        label="Source"
        value={`${SOURCE_ICONS[segment.sourceType] ?? ''} ${segment.sourceType}`}
      />

      {segment.internalNotes && (
        <div className="mt-2 border-t border-gray-100 pt-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-400">Notes</div>
          <div className="mt-0.5 text-xs text-gray-600">{segment.internalNotes}</div>
        </div>
      )}
    </div>,
    document.body,
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-medium text-gray-800">{value}</span>
    </div>
  );
}
