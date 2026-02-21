'use client';

import type { FnbTableWithStatus } from '@/types/fnb';
import { FNB_TABLE_STATUS_COLORS, FNB_TABLE_STATUS_LABELS } from '@/types/fnb';
import { Users, Clock } from 'lucide-react';

interface FnbTableNodeProps {
  table: FnbTableWithStatus;
  isSelected: boolean;
  onTap: (tableId: string) => void;
  onLongPress?: (tableId: string) => void;
  scalePxPerFt: number;
  viewScale: number;
}

function formatElapsed(seatedAt: string | null): string {
  if (!seatedAt) return '';
  const minutes = Math.floor((Date.now() - new Date(seatedAt).getTime()) / 60000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h${minutes % 60}m`;
}

/** Map table shape to CSS border-radius */
function shapeRadius(shape: string): string {
  switch (shape) {
    case 'round':
    case 'circle':
    case 'oval':
    case 'ellipse':
      return '50%';
    default:
      return '8px';
  }
}

const MIN_TABLE_SIZE = 60;

export function FnbTableNode({ table, isSelected, onTap, onLongPress, scalePxPerFt, viewScale }: FnbTableNodeProps) {
  const statusColor = FNB_TABLE_STATUS_COLORS[table.status] ?? '#6b7280';
  const statusLabel = FNB_TABLE_STATUS_LABELS[table.status] ?? table.status;
  const elapsed = formatElapsed(table.seatedAt);

  // Position: x/y are in feet → multiply by scalePxPerFt then viewScale for final pixels
  const left = table.positionX * scalePxPerFt * viewScale;
  const top = table.positionY * scalePxPerFt * viewScale;
  // Dimensions: width/height are already in pixels from the editor → multiply by viewScale
  const w = Math.max(table.width || MIN_TABLE_SIZE, MIN_TABLE_SIZE) * viewScale;
  const h = Math.max(table.height || MIN_TABLE_SIZE, MIN_TABLE_SIZE) * viewScale;

  const handlePointerDown = () => {
    if (!onLongPress) return;
    const timer = setTimeout(() => onLongPress(table.tableId), 500);
    const up = () => { clearTimeout(timer); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointerup', up);
  };

  return (
    <button
      type="button"
      onClick={() => onTap(table.tableId)}
      onPointerDown={handlePointerDown}
      className={`
        absolute flex flex-col items-center justify-center
        border-2 transition-all overflow-hidden
        select-none
        ${isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-[var(--fnb-bg-primary)] scale-105' : ''}
      `}
      style={{
        left,
        top,
        width: w,
        height: h,
        borderColor: statusColor,
        backgroundColor: `${statusColor}15`,
        borderRadius: shapeRadius(table.shape),
        transform: table.rotation ? `rotate(${table.rotation}deg)` : undefined,
        transformOrigin: 'center center',
        fontSize: `${Math.max(10, 14 * viewScale)}px`,
      }}
    >
      {/* Table number */}
      <span
        className="font-bold leading-none"
        style={{
          color: 'var(--fnb-text-primary)',
          fontFamily: 'var(--fnb-font-sans)',
          fontSize: `${Math.max(12, 18 * viewScale)}px`,
        }}
      >
        {table.tableNumber}
      </span>

      {/* Status label */}
      <span
        className="font-medium uppercase tracking-wider mt-0.5"
        style={{
          color: statusColor,
          fontSize: `${Math.max(7, 9 * viewScale)}px`,
        }}
      >
        {statusLabel}
      </span>

      {/* Party size badge */}
      {table.partySize != null && table.partySize > 0 && (
        <span className="absolute top-1 right-1 flex items-center gap-0.5 text-[9px]" style={{ color: 'var(--fnb-text-secondary)' }}>
          <Users className="h-2.5 w-2.5" />
          {table.partySize}
        </span>
      )}

      {/* Timer badge */}
      {elapsed && (
        <span className="absolute bottom-1 right-1 flex items-center gap-0.5 text-[9px] fnb-mono" style={{ color: 'var(--fnb-text-muted)' }}>
          <Clock className="h-2.5 w-2.5" />
          {elapsed}
        </span>
      )}

      {/* Combined indicator */}
      {table.combineGroupId && (
        <span className="absolute top-1 left-1 h-2 w-2 rounded-full bg-amber-500" title="Combined" />
      )}
    </button>
  );
}
