'use client';

import { useEffect, useRef } from 'react';
import { X, Users, Clock, User } from 'lucide-react';
import type { HostTableItem } from '@/hooks/use-fnb-host';

interface TablePopoverProps {
  table: HostTableItem;
  position: { x: number; y: number };
  onClose: () => void;
  onSeat?: () => void;
  onClear?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  available: 'Available',
  seated: 'Seated',
  reserved: 'Reserved',
  dirty: 'Dirty',
  blocked: 'Blocked',
};

const STATUS_COLORS: Record<string, string> = {
  available: 'var(--fnb-status-available)',
  seated: 'var(--fnb-status-seated)',
  reserved: 'var(--fnb-status-reserved)',
  dirty: 'var(--fnb-danger)',
  blocked: 'var(--fnb-text-disabled)',
};

function formatElapsed(seatedAt: string | null): string {
  if (!seatedAt) return '—';
  const ms = Date.now() - new Date(seatedAt).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function TablePopover({ table, position, onClose, onSeat, onClear }: TablePopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  const status = table.status ?? 'available';
  const statusColor = STATUS_COLORS[status] ?? 'var(--fnb-text-disabled)';

  return (
    <div
      ref={ref}
      className="absolute z-10 rounded-xl shadow-lg"
      style={{
        left: Math.min(position.x, 200),
        top: position.y + 8,
        width: 220,
        backgroundColor: 'var(--fnb-bg-surface)',
        border: 'var(--fnb-border-subtle)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: 'var(--fnb-border-subtle)' }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
            Table {table.tableNumber}
          </span>
          <span
            className="text-[9px] font-semibold rounded-full px-2 py-0.5"
            style={{
              backgroundColor: `color-mix(in srgb, ${statusColor} 15%, transparent)`,
              color: statusColor,
            }}
          >
            {STATUS_LABELS[status] ?? status}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 rounded transition-colors"
          style={{ color: 'var(--fnb-text-muted)' }}
        >
          <X size={13} />
        </button>
      </div>

      {/* Details */}
      <div className="px-3 py-2 flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Users size={12} style={{ color: 'var(--fnb-text-muted)' }} />
          <span className="text-[11px]" style={{ color: 'var(--fnb-text-secondary)' }}>
            Capacity: {table.capacityMin === table.capacityMax ? table.capacityMax : `${table.capacityMin}–${table.capacityMax}`}
          </span>
        </div>

        {table.serverName && (
          <div className="flex items-center gap-2">
            <User size={12} style={{ color: 'var(--fnb-text-muted)' }} />
            <span className="text-[11px]" style={{ color: 'var(--fnb-text-secondary)' }}>
              Server: {table.serverName}
            </span>
          </div>
        )}

        {status === 'seated' && table.seatedAt && (
          <div className="flex items-center gap-2">
            <Clock size={12} style={{ color: 'var(--fnb-text-muted)' }} />
            <span className="text-[11px]" style={{ color: 'var(--fnb-text-secondary)' }}>
              Seated: {formatElapsed(table.seatedAt)}
            </span>
          </div>
        )}

        {table.guestName && (
          <div className="flex items-center gap-2">
            <User size={12} style={{ color: 'var(--fnb-text-muted)' }} />
            <span className="text-[11px]" style={{ color: 'var(--fnb-text-secondary)' }}>
              Guest: {table.guestName}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      {(onSeat || onClear) && (
        <div
          className="px-3 py-2 flex gap-2"
          style={{ borderTop: 'var(--fnb-border-subtle)' }}
        >
          {status === 'available' && onSeat && (
            <button
              type="button"
              onClick={onSeat}
              className="flex-1 text-[11px] font-semibold rounded-md py-1.5 transition-all active:scale-95"
              style={{
                backgroundColor: 'var(--fnb-status-available)',
                color: '#fff',
              }}
            >
              Seat Guest
            </button>
          )}
          {status === 'dirty' && onClear && (
            <button
              type="button"
              onClick={onClear}
              className="flex-1 text-[11px] font-semibold rounded-md py-1.5 transition-all active:scale-95"
              style={{
                backgroundColor: 'var(--fnb-danger)',
                color: '#fff',
              }}
            >
              Mark Clean
            </button>
          )}
        </div>
      )}
    </div>
  );
}
