'use client';

import type { FnbTableWithStatus } from '@/types/fnb';
import { FNB_TABLE_STATUS_COLORS, FNB_TABLE_STATUS_LABELS } from '@/types/fnb';
import { Users, Clock, Plus, QrCode, DollarSign } from 'lucide-react';

export type FloorDisplayMode = 'status' | 'covers' | 'revenue' | 'time' | 'course';

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
  /** Server initials to display (e.g. "JD") */
  serverInitials?: string | null;
  /** Running check total in cents */
  checkTotalCents?: number | null;
  /** Current course label (e.g. "Apps", "Entrees", "Dessert") */
  courseLabel?: string | null;
  /** Display mode for the floor plan */
  displayMode?: FloorDisplayMode;
  /** Predicted turn time in minutes */
  predictedTurnMinutes?: number | null;
  /** Dim this table (not in server's section) */
  dimmed?: boolean;
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

/** Threshold for "neglected" table — no service in this many minutes */
const NEGLECT_THRESHOLD_MINUTES = 20;

function formatCheckTotal(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

export function FnbTableNode({
  table, isSelected, onTap, onLongPress, onAddTab, onContextMenu,
  scalePxPerFt, viewScale, guestPayActive,
  serverInitials, checkTotalCents, courseLabel, displayMode = 'status',
  predictedTurnMinutes, dimmed,
}: FnbTableNodeProps) {
  const statusColor = FNB_TABLE_STATUS_COLORS[table.status] ?? '#6b7280';
  const statusLabel = FNB_TABLE_STATUS_LABELS[table.status] ?? table.status;
  const elapsed = formatElapsed(table.seatedAt);

  // Neglect detection: table seated > 20 min with no course progress
  const elapsedMinutes = table.seatedAt
    ? Math.floor((Date.now() - new Date(table.seatedAt).getTime()) / 60000)
    : 0;
  const isNeglected = table.status === 'seated' && elapsedMinutes >= NEGLECT_THRESHOLD_MINUTES;

  // What to show in the center based on display mode
  const centerContent = (() => {
    switch (displayMode) {
      case 'covers':
        return { primary: table.partySize != null && table.partySize > 0 ? `${table.partySize}` : '—', secondary: 'covers' };
      case 'revenue':
        return { primary: checkTotalCents != null && checkTotalCents > 0 ? formatCheckTotal(checkTotalCents) : '—', secondary: 'revenue' };
      case 'time':
        return { primary: elapsed || '—', secondary: predictedTurnMinutes ? `~${predictedTurnMinutes}m` : 'time' };
      case 'course':
        return { primary: courseLabel ?? '—', secondary: statusLabel };
      default: // 'status'
        return null; // use original layout
    }
  })();

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
        ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2 scale-105' : ''}
      `}
      style={{
        left,
        top,
        width: w,
        height: h,
        borderColor: isNeglected ? 'var(--fnb-danger, #ef4444)' : statusColor,
        backgroundColor: `${statusColor}15`,
        borderRadius: shapeRadius(table.shape),
        transform: table.rotation ? `rotate(${table.rotation}deg)` : undefined,
        transformOrigin: 'center center',
        fontSize: `${Math.max(10, 14 * viewScale)}px`,
        animation: isNeglected ? 'fnb-neglect-pulse 2s ease-in-out infinite' : undefined,
        opacity: dimmed ? 0.25 : undefined,
        pointerEvents: dimmed ? 'none' : undefined,
      }}
    >
      {/* Server initials badge (top-left) */}
      {serverInitials && (
        <span
          className="absolute top-0.5 left-0.5 flex items-center justify-center rounded-full text-white font-bold"
          style={{
            width: `${Math.max(16, 20 * viewScale)}px`,
            height: `${Math.max(16, 20 * viewScale)}px`,
            fontSize: `${Math.max(7, 8 * viewScale)}px`,
            backgroundColor: 'var(--fnb-info, #3b82f6)',
          }}
          title={`Server: ${serverInitials}`}
        >
          {serverInitials}
        </span>
      )}

      {/* Center content — varies by display mode */}
      {centerContent ? (
        <>
          <span
            className="font-bold leading-none"
            style={{
              fontSize: `${Math.max(12, 18 * viewScale)}px`,
              color: displayMode === 'revenue' ? 'var(--fnb-status-available, #22c55e)' : 'var(--fnb-text-primary, #111)',
            }}
          >
            {centerContent.primary}
          </span>
          <span
            className="font-medium uppercase tracking-wider mt-0.5"
            style={{
              color: 'var(--fnb-text-muted, #9ca3af)',
              fontSize: `${Math.max(6, 8 * viewScale)}px`,
            }}
          >
            {centerContent.secondary}
          </span>
          {/* Table number small in corner for non-status modes */}
          <span
            className="absolute bottom-0.5 left-0.5 font-semibold"
            style={{
              fontSize: `${Math.max(7, 9 * viewScale)}px`,
              color: 'var(--fnb-text-muted, #9ca3af)',
            }}
          >
            {table.tableNumber}
          </span>
        </>
      ) : (
        <>
          {/* Default status mode: table number + status label */}
          <span
            className="font-bold leading-none"
            style={{ fontSize: `${Math.max(12, 18 * viewScale)}px`, color: 'var(--fnb-text-primary, #111)' }}
          >
            {table.tableNumber}
          </span>
          <span
            className="font-medium uppercase tracking-wider mt-0.5"
            style={{
              color: statusColor,
              fontSize: `${Math.max(7, 9 * viewScale)}px`,
            }}
          >
            {statusLabel}
          </span>
        </>
      )}

      {/* Check total badge (top-right, status mode only) */}
      {displayMode === 'status' && checkTotalCents != null && checkTotalCents > 0 && (
        <span
          className="absolute top-0.5 right-0.5 flex items-center gap-0.5 rounded px-1"
          style={{
            fontSize: `${Math.max(7, 9 * viewScale)}px`,
            color: 'var(--fnb-status-available, #22c55e)',
            backgroundColor: 'rgba(34, 197, 94, 0.12)',
            fontFamily: 'var(--fnb-font-mono)',
          }}
        >
          <DollarSign style={{ width: `${Math.max(7, 8 * viewScale)}px`, height: `${Math.max(7, 8 * viewScale)}px` }} />
          {(checkTotalCents / 100).toFixed(0)}
        </span>
      )}

      {/* Party size badge (status mode) */}
      {displayMode === 'status' && table.partySize != null && table.partySize > 0 && !serverInitials && (
        <span className="absolute top-1 right-1 flex items-center gap-0.5 text-[9px] text-gray-500">
          <Users className="h-2.5 w-2.5" />
          {table.partySize}
        </span>
      )}

      {/* Party size badge (when server initials are shown — push party size to after server) */}
      {displayMode === 'status' && table.partySize != null && table.partySize > 0 && serverInitials && !checkTotalCents && (
        <span className="absolute top-1 right-1 flex items-center gap-0.5 text-[9px] text-gray-500">
          <Users className="h-2.5 w-2.5" />
          {table.partySize}
        </span>
      )}

      {/* Timer badge */}
      {displayMode === 'status' && elapsed && (
        <span className="absolute bottom-1 right-1 flex items-center gap-0.5 text-[9px] text-gray-400">
          <Clock className="h-2.5 w-2.5" />
          {elapsed}
        </span>
      )}

      {/* Combined indicator */}
      {table.combineGroupId && !serverInitials && (
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
