'use client';

import type { FnbTableWithStatus } from '@/types/fnb';
import { FNB_TABLE_STATUS_COLORS, FNB_TABLE_STATUS_LABELS } from '@/types/fnb';
import { Users, Clock, Plus, QrCode } from 'lucide-react';

interface FnbTableNodeProps {
  table: FnbTableWithStatus;
  isSelected: boolean;
  onTap: (tableId: string) => void;
  onLongPress?: (tableId: string) => void;
  onAddTab?: (tableId: string) => void;
  onContextMenu?: (tableId: string) => void;
  scalePxPerFt: number;
  viewScale: number;
  guestPayActive?: boolean;
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

export function FnbTableNode({ table, isSelected, onTap, onLongPress, onAddTab, onContextMenu, scalePxPerFt, viewScale, guestPayActive }: FnbTableNodeProps) {
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
      onContextMenu={(e) => { if (onContextMenu) { e.preventDefault(); onContextMenu(table.tableId); } }}
      className={`
        group absolute flex flex-col items-center justify-center
        border-2 transition-all
        select-none
        ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-white scale-105' : ''}
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
        className="font-bold leading-none text-gray-900"
        style={{ fontSize: `${Math.max(12, 18 * viewScale)}px` }}
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
        <span className="absolute top-1 right-1 flex items-center gap-0.5 text-[9px] text-gray-500">
          <Users className="h-2.5 w-2.5" />
          {table.partySize}
        </span>
      )}

      {/* Timer badge */}
      {elapsed && (
        <span className="absolute bottom-1 right-1 flex items-center gap-0.5 text-[9px] text-gray-400">
          <Clock className="h-2.5 w-2.5" />
          {elapsed}
        </span>
      )}

      {/* Combined indicator */}
      {table.combineGroupId && (
        <span className="absolute top-1 left-1 h-2 w-2 rounded-full bg-amber-500" title="Combined" />
      )}

      {/* Guest Pay active indicator */}
      {guestPayActive && (
        <span
          className="absolute bottom-1 left-1 flex items-center justify-center"
          title="Guest paying via phone"
          style={{ color: 'var(--fnb-guest-pay-active)' }}
        >
          <QrCode style={{ width: `${Math.max(10, 12 * viewScale)}px`, height: `${Math.max(10, 12 * viewScale)}px` }} />
        </span>
      )}

      {/* Add tab "+" button — visible on hover/focus */}
      {onAddTab && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onAddTab(table.tableId); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onAddTab(table.tableId); } }}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute -bottom-2 -right-2 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shadow-md bg-green-600 text-white"
          style={{
            width: `${Math.max(20, 24 * viewScale)}px`,
            height: `${Math.max(20, 24 * viewScale)}px`,
            fontSize: `${Math.max(12, 16 * viewScale)}px`,
            lineHeight: 1,
          }}
          title="Add new tab"
        >
          <Plus className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}
