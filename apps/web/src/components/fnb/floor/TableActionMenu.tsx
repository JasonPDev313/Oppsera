'use client';

import { createPortal } from 'react-dom';
import type { FnbTableWithStatus } from '@/types/fnb';
import {
  Users, Trash2, ArrowRightLeft, Merge, Unlink, ChevronRight,
} from 'lucide-react';

interface TableActionMenuProps {
  open: boolean;
  onClose: () => void;
  table: FnbTableWithStatus | null;
  onSeat: () => void;
  onClear: () => void;
  onTransfer: () => void;
  onCombine: () => void;
  onUncombine: () => void;
  onViewTab: () => void;
}

export function TableActionMenu({
  open, onClose, table,
  onSeat, onClear, onTransfer, onCombine, onUncombine, onViewTab,
}: TableActionMenuProps) {
  if (!open || !table) return null;

  const actions = [
    { label: 'Seat Guests', icon: Users, onClick: onSeat, show: table.status === 'available' },
    { label: 'View Tab', icon: ChevronRight, onClick: onViewTab, show: !!table.currentTabId },
    { label: 'Transfer', icon: ArrowRightLeft, onClick: onTransfer, show: table.status !== 'available' },
    { label: 'Combine', icon: Merge, onClick: onCombine, show: !table.combineGroupId && table.isCombinable },
    { label: 'Uncombine', icon: Unlink, onClick: onUncombine, show: !!table.combineGroupId },
    { label: 'Clear Table', icon: Trash2, onClick: onClear, show: ['paid', 'dirty'].includes(table.status) },
  ].filter((a) => a.show);

  return createPortal(
    <div
      className="fixed inset-0"
      style={{ zIndex: 'var(--fnb-z-overlay)' }}
      onClick={onClose}
    >
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl p-2 shadow-lg w-[220px]"
        style={{ backgroundColor: 'var(--fnb-bg-surface)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="px-3 py-2 text-xs font-bold" style={{ color: 'var(--fnb-text-muted)' }}>
          Table {table.tableNumber}
        </p>
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => { action.onClick(); onClose(); }}
            className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:opacity-80"
            style={{ color: 'var(--fnb-text-primary)' }}
          >
            <action.icon className="h-4 w-4" style={{ color: 'var(--fnb-text-muted)' }} />
            {action.label}
          </button>
        ))}
        {actions.length === 0 && (
          <p className="px-3 py-2 text-xs" style={{ color: 'var(--fnb-text-muted)' }}>
            No actions available
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
