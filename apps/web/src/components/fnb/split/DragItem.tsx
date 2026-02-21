'use client';

import type { FnbTabLine } from '@/types/fnb';

interface DragItemProps {
  line: FnbTabLine;
  onDragStart: (lineId: string) => void;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function DragItem({ line, onDragStart }: DragItemProps) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(line.id)}
      className="flex items-center justify-between rounded-lg px-3 py-2 cursor-grab active:cursor-grabbing transition-colors hover:opacity-80"
      style={{
        backgroundColor: 'var(--fnb-bg-elevated)',
        border: '1px solid rgba(148, 163, 184, 0.15)',
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {line.seatNumber && (
          <span
            className="shrink-0 flex items-center justify-center rounded-full text-[9px] font-bold"
            style={{
              width: '18px',
              height: '18px',
              backgroundColor: 'var(--fnb-status-ordered)',
              color: '#fff',
            }}
          >
            {line.seatNumber}
          </span>
        )}
        <span className="text-xs truncate" style={{ color: 'var(--fnb-text-primary)' }}>
          {line.qty > 1 ? `${line.qty}x ` : ''}{line.catalogItemName ?? 'Item'}
        </span>
      </div>
      <span className="text-xs fnb-mono shrink-0 ml-2" style={{ color: 'var(--fnb-text-secondary)' }}>
        {formatMoney(line.extendedPriceCents)}
      </span>
    </div>
  );
}
