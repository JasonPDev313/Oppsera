'use client';

import type { FnbTableWithStatus } from '@/types/fnb';
import { FNB_TABLE_STATUS_COLORS, FNB_TABLE_STATUS_LABELS } from '@/types/fnb';
import { Users, Clock } from 'lucide-react';

interface FnbTableNodeProps {
  table: FnbTableWithStatus;
  isSelected: boolean;
  onTap: (tableId: string) => void;
  onLongPress?: (tableId: string) => void;
}

function formatElapsed(seatedAt: string | null): string {
  if (!seatedAt) return '';
  const minutes = Math.floor((Date.now() - new Date(seatedAt).getTime()) / 60000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h${minutes % 60}m`;
}

export function FnbTableNode({ table, isSelected, onTap, onLongPress }: FnbTableNodeProps) {
  const statusColor = FNB_TABLE_STATUS_COLORS[table.status] ?? '#6b7280';
  const statusLabel = FNB_TABLE_STATUS_LABELS[table.status] ?? table.status;
  const elapsed = formatElapsed(table.seatedAt);

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
        relative flex flex-col items-center justify-center
        rounded-lg border-2 transition-all
        fnb-touch-min select-none
        ${isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-[var(--fnb-bg-primary)] scale-105' : ''}
      `}
      style={{
        borderColor: statusColor,
        backgroundColor: `${statusColor}15`,
        minWidth: '88px',
        minHeight: '80px',
      }}
    >
      {/* Table number */}
      <span
        className="text-xl font-bold"
        style={{ color: 'var(--fnb-text-primary)', fontFamily: 'var(--fnb-font-sans)' }}
      >
        {table.tableNumber}
      </span>

      {/* Status label */}
      <span
        className="text-[10px] font-medium uppercase tracking-wider mt-0.5"
        style={{ color: statusColor }}
      >
        {statusLabel}
      </span>

      {/* Party size badge */}
      {table.partySize && (
        <span className="absolute top-1 right-1 flex items-center gap-0.5 text-[10px]" style={{ color: 'var(--fnb-text-secondary)' }}>
          <Users className="h-2.5 w-2.5" />
          {table.partySize}
        </span>
      )}

      {/* Timer badge */}
      {elapsed && (
        <span className="absolute bottom-1 right-1 flex items-center gap-0.5 text-[10px] fnb-mono" style={{ color: 'var(--fnb-text-muted)' }}>
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
