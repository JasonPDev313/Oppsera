'use client';

import { useRef, useCallback } from 'react';
import { MessageSquare } from 'lucide-react';

interface FnbOrderLineProps {
  seatNumber: number;
  itemName: string;
  modifiers?: string[];
  specialInstructions?: string | null;
  priceCents: number;
  qty: number;
  status: 'draft' | 'sent' | 'fired' | 'served' | 'voided';
  isUnsent?: boolean;
  onTap?: () => void;
  onLongPress?: () => void;
}

// ── Modifier chip color resolver ───────────────────────────────
const MODIFIER_PREFIXES: { match: string; color: string }[] = [
  { match: 'NO ',      color: 'red' },
  { match: 'EXTRA ',   color: 'amber' },
  { match: 'ADD ',     color: 'green' },
  { match: 'ON SIDE ', color: 'blue' },
  { match: 'LITE ',    color: 'sky' },
  { match: 'SUB ',     color: 'violet' },
];

function getModChipStyle(mod: string): { label: string; bg: string; text: string } {
  const upper = mod.toUpperCase();
  for (const p of MODIFIER_PREFIXES) {
    if (upper.startsWith(p.match)) {
      return {
        label: mod,
        bg: `var(--fnb-mod-${p.color}-bg, rgba(245,158,11,0.1))`,
        text: `var(--fnb-mod-${p.color}, #f59e0b)`,
      };
    }
  }
  return { label: mod, bg: 'var(--fnb-bg-elevated)', text: 'var(--fnb-text-secondary)' };
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

export function FnbOrderLine({ seatNumber, itemName, modifiers, specialInstructions, priceCents, qty, status, isUnsent, onTap, onLongPress }: FnbOrderLineProps) {
  const seatColorVar = `var(--fnb-seat-${Math.min(seatNumber, 9)})`;
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const handlePointerDown = useCallback(() => {
    if (!onLongPress) return;
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      onLongPress();
    }, 500);
  }, [onLongPress]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleClick = useCallback(() => {
    if (didLongPress.current) return;
    onTap?.();
  }, [onTap]);

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
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
          <div className="flex flex-wrap gap-1 mt-0.5">
            {modifiers.map((mod, i) => {
              const chip = getModChipStyle(mod);
              return (
                <span
                  key={i}
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-tight"
                  style={{ backgroundColor: chip.bg, color: chip.text }}
                >
                  {chip.label}
                </span>
              );
            })}
          </div>
        )}
        {specialInstructions && (
          <div className="flex items-center gap-1 mt-0.5">
            <MessageSquare className="h-2.5 w-2.5 shrink-0" style={{ color: 'var(--fnb-text-muted)' }} />
            <span className="text-[10px] italic truncate" style={{ color: 'var(--fnb-text-muted)' }}>
              {specialInstructions}
            </span>
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
