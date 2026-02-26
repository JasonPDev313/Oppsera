'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  UserPlus,
  CalendarCheck,
  Combine,
  XCircle,
  Receipt,
  Clock,
  ArrowRightLeft,
  Check,
  Calendar,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface TableContextMenuProps {
  tableId: string;
  tableNumber: number | string;
  status: string;
  position: { x: number; y: number };
  onClose: () => void;
  onAction: (action: string, tableId: string) => void;
}

interface MenuAction {
  label: string;
  icon: LucideIcon;
  action: string;
  variant?: 'destructive';
}

const TABLE_ACTIONS: Record<string, MenuAction[]> = {
  available: [
    { label: 'Seat Walk-in', icon: UserPlus, action: 'seat_walkin' },
    { label: 'Assign Reservation', icon: CalendarCheck, action: 'assign_reservation' },
    { label: 'Combine Tables', icon: Combine, action: 'combine' },
    { label: 'Out of Service', icon: XCircle, action: 'oos', variant: 'destructive' },
  ],
  seated: [
    { label: 'View Tab', icon: Receipt, action: 'view_tab' },
    { label: 'Mark Clearing', icon: Clock, action: 'mark_clearing' },
    { label: 'Transfer Server', icon: ArrowRightLeft, action: 'transfer' },
  ],
  reserved: [
    { label: 'View Reservation', icon: Calendar, action: 'view_reservation' },
    { label: 'Change Table', icon: ArrowRightLeft, action: 'change_table' },
  ],
  dirty: [
    { label: 'Mark Available', icon: Check, action: 'mark_available' },
    { label: 'Out of Service', icon: XCircle, action: 'oos', variant: 'destructive' },
  ],
  blocked: [
    { label: 'Mark Available', icon: Check, action: 'mark_available' },
  ],
};

export function TableContextMenu({
  tableId,
  tableNumber,
  status,
  position,
  onClose,
  onAction,
}: TableContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const actions = TABLE_ACTIONS[status] ?? [];
  if (actions.length === 0) return null;

  // Viewport-clamp position
  const menuWidth = 200;
  const menuHeight = actions.length * 36 + 40;
  const x = Math.min(position.x, window.innerWidth - menuWidth - 16);
  const y = Math.min(position.y, window.innerHeight - menuHeight - 16);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-50 rounded-xl shadow-xl overflow-hidden"
      style={{
        left: x,
        top: y,
        width: menuWidth,
        backgroundColor: 'var(--fnb-bg-surface)',
        border: 'var(--fnb-border-subtle)',
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-2"
        style={{ borderBottom: 'var(--fnb-border-subtle)' }}
      >
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: 'var(--fnb-text-muted)' }}
        >
          Table {tableNumber}
        </span>
      </div>

      {/* Actions */}
      <div className="py-1">
        {actions.map((item) => {
          const Icon = item.icon;
          const color =
            item.variant === 'destructive'
              ? 'var(--fnb-danger)'
              : 'var(--fnb-text-primary)';
          return (
            <button
              key={item.action}
              type="button"
              onClick={() => {
                onAction(item.action, tableId);
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
              style={{ color }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  'var(--fnb-bg-elevated)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  'transparent';
              }}
            >
              <Icon size={14} />
              <span className="text-[12px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

// Export for testing
export { TABLE_ACTIONS };
