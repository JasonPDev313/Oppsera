'use client';

import { Plus } from 'lucide-react';

interface SeatRailProps {
  seatCount: number;
  activeSeat: number;
  onSelectSeat: (seatNumber: number) => void;
  onAddSeat: () => void;
  /** Number of unsent items per seat */
  unsentBySeat?: Record<number, number>;
}

export function SeatRail({ seatCount, activeSeat, onSelectSeat, onAddSeat, unsentBySeat }: SeatRailProps) {
  const seats = Array.from({ length: Math.max(seatCount, 1) }, (_, i) => i + 1);

  return (
    <div
      className="flex flex-row sm:flex-col gap-1 p-1 border-b sm:border-b-0 sm:border-r shrink-0 overflow-x-auto sm:overflow-x-visible sm:overflow-y-auto"
      style={{
        minWidth: 'auto',
        backgroundColor: 'var(--fnb-bg-surface)',
        borderColor: 'rgba(148, 163, 184, 0.15)',
      }}
    >
      {/* All seats button */}
      <button
        type="button"
        onClick={() => onSelectSeat(0)}
        className={`rounded-lg py-2.5 text-xs font-semibold text-center transition-colors fnb-touch-min ${
          activeSeat === 0 ? 'text-white' : 'hover:opacity-80'
        }`}
        style={{
          backgroundColor: activeSeat === 0 ? 'var(--fnb-status-seated)' : 'var(--fnb-bg-elevated)',
          color: activeSeat === 0 ? '#fff' : 'var(--fnb-text-secondary)',
        }}
      >
        All
      </button>

      {/* Individual seats */}
      {seats.map((seat) => {
        const isActive = activeSeat === seat;
        const unsent = unsentBySeat?.[seat] ?? 0;
        return (
          <button
            key={seat}
            type="button"
            onClick={() => onSelectSeat(seat)}
            className={`relative rounded-lg py-2.5 text-xs font-semibold text-center transition-colors fnb-touch-min ${
              isActive ? 'text-white' : 'hover:opacity-80'
            }`}
            style={{
              backgroundColor: isActive ? 'var(--fnb-status-seated)' : 'var(--fnb-bg-elevated)',
              color: isActive ? '#fff' : 'var(--fnb-text-secondary)',
            }}
          >
            S{seat}
            {unsent > 0 && (
              <span
                className="absolute -top-1 -right-1 flex items-center justify-center rounded-full text-[9px] font-bold text-white"
                style={{
                  width: '16px',
                  height: '16px',
                  backgroundColor: 'var(--fnb-status-ordered)',
                }}
              >
                {unsent}
              </span>
            )}
          </button>
        );
      })}

      {/* Add seat */}
      <button
        type="button"
        onClick={onAddSeat}
        className="rounded-lg py-2.5 flex items-center justify-center transition-colors hover:opacity-80 fnb-touch-min"
        style={{
          backgroundColor: 'var(--fnb-bg-elevated)',
          color: 'var(--fnb-text-muted)',
        }}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
