'use client';

import type { KdsTicketItem } from '@/types/fnb';
import { DeltaBadge } from './DeltaBadge';

interface TicketItemRowProps {
  item: KdsTicketItem;
  showSeat?: boolean;
  onBump?: (itemId: string) => void;
}

export function TicketItemRow({ item, showSeat = true, onBump }: TicketItemRowProps) {
  const isBumped = item.itemStatus === 'ready' || item.itemStatus === 'bumped';
  const isVoided = item.itemStatus === 'voided';

  return (
    <div
      className="flex items-start gap-2 px-2 py-1.5 xl:px-3 xl:py-2 border-b last:border-b-0"
      style={{
        borderColor: 'rgba(148, 163, 184, 0.1)',
        opacity: isVoided ? 0.3 : 1,
        textDecoration: isVoided ? 'line-through' : 'none',
      }}
      onClick={onBump && !isBumped && !isVoided ? () => onBump(item.itemId) : undefined}
    >
      {/* Seat badge */}
      {showSeat && item.seatNumber && (
        <span
          className="shrink-0 flex items-center justify-center rounded-full text-[10px] font-bold kds-seat-badge"
          style={{
            width: '20px',
            height: '20px',
            backgroundColor: 'var(--fnb-status-ordered)',
            color: '#fff',
          }}
        >
          {item.seatNumber}
        </span>
      )}

      {/* Item content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {item.quantity > 1 && (
            <span className="text-sm kds-text-item font-bold fnb-mono" style={{ color: 'var(--fnb-text-primary)' }}>
              {item.quantity}x
            </span>
          )}
          <span
            className="text-sm kds-text-item font-bold truncate"
            style={{
              color: isBumped ? 'var(--fnb-status-available)' : 'var(--fnb-text-primary)',
            }}
          >
            {item.itemName}
          </span>
          {item.isRush && (
            <span className="text-[10px] font-bold" style={{ color: 'var(--fnb-status-dirty)' }}>RUSH</span>
          )}
          {item.isAllergy && (
            <span className="text-[10px] font-bold" style={{ color: 'var(--fnb-status-entrees-fired)' }}>ALLERGY</span>
          )}
          {item.isVip && (
            <span className="text-[10px] font-bold" style={{ color: 'var(--fnb-status-dessert)' }}>VIP</span>
          )}
        </div>
        {item.modifierSummary && (
          <p className="text-xs kds-text-modifier italic mt-0.5" style={{ color: 'var(--fnb-status-entrees-fired)' }}>
            {item.modifierSummary}
          </p>
        )}
        {item.specialInstructions && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--fnb-status-check-presented)' }}>
            ** {item.specialInstructions}
          </p>
        )}
      </div>

      {/* Status indicator */}
      {isBumped && (
        <span className="shrink-0 text-xs font-bold" style={{ color: 'var(--fnb-status-available)' }}>
          ✓
        </span>
      )}
    </div>
  );
}
