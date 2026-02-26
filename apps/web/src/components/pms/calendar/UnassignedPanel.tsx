'use client';

import { useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import type { UnassignedReservation } from './types';
import { formatDateDisplay, STATUS_DOT_COLORS, SOURCE_ICONS } from './types';

interface UnassignedPanelProps {
  reservations: UnassignedReservation[];
  onClickReservation: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string, status: string) => void;
}

export default function UnassignedPanel({
  reservations,
  onClickReservation,
  onContextMenu,
}: UnassignedPanelProps) {
  const [expanded, setExpanded] = useState(true);

  if (reservations.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-2.5"
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-medium text-amber-500">
            Unassigned Reservations
          </span>
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-500">
            {reservations.length}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-amber-600" />
        ) : (
          <ChevronDown className="h-4 w-4 text-amber-600" />
        )}
      </button>

      {expanded && (
        <div className="divide-y divide-amber-500/20 border-t border-amber-500/30">
          {reservations.map((res) => (
            <button
              key={res.reservationId}
              onClick={() => onClickReservation(res.reservationId)}
              onContextMenu={(e) => onContextMenu(e, res.reservationId, res.status)}
              className="flex w-full items-center justify-between px-4 py-2 text-left transition-colors hover:bg-amber-500/20"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`inline-block h-2 w-2 shrink-0 rounded-full ${STATUS_DOT_COLORS[res.status] ?? 'bg-gray-400'}`}
                />
                <div>
                  <span className="text-sm font-medium text-foreground">{res.guestName}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{res.roomTypeName}</span>
                </div>
                <span className="text-[10px] text-muted-foreground" title={res.sourceType}>
                  {SOURCE_ICONS[res.sourceType] ?? ''}
                </span>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                {formatDateDisplay(res.checkInDate)} - {formatDateDisplay(res.checkOutDate)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
