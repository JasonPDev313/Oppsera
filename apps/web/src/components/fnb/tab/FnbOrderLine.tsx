'use client';

interface FnbOrderLineProps {
  seatNumber: number;
  itemName: string;
  modifiers?: string[];
  priceCents: number;
  qty: number;
  status: 'draft' | 'sent' | 'fired' | 'served' | 'voided';
  isUnsent?: boolean;
  onTap?: () => void;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const STATUS_ICONS: Record<string, string> = {
  draft: '\u25CF',
  sent: '\u2192',
  fired: '\uD83D\uDD25',
  served: '\u2713',
  voided: '\u2715',
};

export function FnbOrderLine({ seatNumber, itemName, modifiers, priceCents, qty, status, isUnsent, onTap }: FnbOrderLineProps) {
  const seatColorVar = `var(--fnb-seat-${Math.min(seatNumber, 9)})`;

  return (
    <button
      type="button"
      onClick={onTap}
      className="flex items-start gap-2 w-full rounded-lg px-2 py-1.5 text-left transition-opacity hover:opacity-80"
      style={{
        borderLeft: isUnsent ? '3px solid var(--fnb-warning)' : '3px solid transparent',
      }}
    >
      {/* Seat dot */}
      <span
        className="flex items-center justify-center rounded-full text-[9px] font-bold shrink-0 mt-0.5"
        style={{
          width: 18,
          height: 18,
          backgroundColor: seatColorVar,
          color: '#fff',
        }}
      >
        {seatNumber}
      </span>

      {/* Item info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          {qty > 1 && (
            <span className="text-xs font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
              {qty}x
            </span>
          )}
          <span
            className={`text-sm font-medium truncate ${status === 'voided' ? 'line-through' : ''}`}
            style={{ color: status === 'voided' ? 'var(--fnb-text-disabled)' : 'var(--fnb-text-primary)' }}
          >
            {itemName}
          </span>
        </div>
        {modifiers && modifiers.length > 0 && (
          <div className="text-xs italic truncate" style={{ color: 'var(--fnb-text-muted)' }}>
            {modifiers.join(', ')}
          </div>
        )}
      </div>

      {/* Price */}
      <span className="text-xs shrink-0" style={{ color: 'var(--fnb-text-secondary)' }}>
        {formatMoney(priceCents * qty)}
      </span>

      {/* Status icon */}
      <span className="text-[10px] shrink-0 w-4 text-center" style={{ color: 'var(--fnb-text-muted)' }}>
        {STATUS_ICONS[status] ?? ''}
      </span>
    </button>
  );
}
