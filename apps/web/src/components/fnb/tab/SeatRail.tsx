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
      className="shrink-0 flex flex-col items-center py-2 gap-1.5"
      style={{
        width: 80,
        backgroundColor: 'var(--fnb-seat-rail-bg)',
        borderRight: 'var(--fnb-border-subtle)',
      }}
    >
      {/* All seats button — fixed at top */}
      <div className="shrink-0">
        <button
          type="button"
          onClick={() => onSelectSeat(0)}
          className="flex items-center justify-center rounded-xl font-semibold transition-opacity"
          style={{
            width: 56,
            height: 56,
            fontSize: '13px',
            backgroundColor: activeSeat === 0 ? 'var(--fnb-info)' : 'var(--fnb-bg-elevated)',
            color: activeSeat === 0 ? '#fff' : 'var(--fnb-text-secondary)',
          }}
        >
          All
        </button>
      </div>

      {/* Seat buttons — scrollable */}
      <div
        className="flex-1 flex flex-col items-center gap-1.5 overflow-y-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {seats.map((seat) => {
          const isActive = activeSeat === seat;
          const unsent = unsentBySeat?.[seat] ?? 0;
          return (
            <button
              key={seat}
              type="button"
              onClick={() => onSelectSeat(seat)}
              className="relative flex items-center justify-center rounded-xl font-semibold transition-opacity shrink-0"
              style={{
                width: 56,
                height: 56,
                fontSize: '13px',
                backgroundColor: isActive ? 'var(--fnb-info)' : 'var(--fnb-bg-elevated)',
                color: isActive ? '#fff' : 'var(--fnb-text-secondary)',
              }}
            >
              S{seat}
              {unsent > 0 && (
                <span
                  className="absolute -top-1 -right-1 flex items-center justify-center rounded-full text-[9px] font-bold"
                  style={{
                    width: 18,
                    height: 18,
                    backgroundColor: 'var(--fnb-warning)',
                    color: '#fff',
                  }}
                >
                  {unsent}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Add seat — fixed at bottom */}
      <div className="shrink-0">
        <button
          type="button"
          onClick={onAddSeat}
          className="flex items-center justify-center rounded-xl transition-opacity"
          style={{
            width: 56,
            height: 56,
            backgroundColor: 'var(--fnb-bg-elevated)',
            color: 'var(--fnb-text-muted)',
          }}
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
