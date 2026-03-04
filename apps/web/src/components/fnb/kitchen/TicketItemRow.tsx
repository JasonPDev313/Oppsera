'use client';

import type { KdsTicketItem } from '@/types/fnb';

interface TicketItemRowProps {
  item: KdsTicketItem;
  showSeat?: boolean;
  onBump?: (itemId: string) => void;
  density?: 'compact' | 'standard' | 'comfortable';
}

// Cook temp keywords to extract from modifier summary and highlight
const COOK_TEMP_PATTERNS = /\b(rare|med(?:ium)?\s*rare|medium|med(?:ium)?\s*well|well(?:\s*done)?|blue|black(?:\s*&\s*blue)?|pittsburg(?:h)?)\b/gi;

// "No" modifiers to highlight in red
const NO_MOD_PATTERN = /\bno\s+\w+/gi;

/**
 * Parse modifiers into structured display: cook temp, "no" mods, and regular mods.
 */
function parseModifiers(modifierSummary: string | null): {
  cookTemp: string | null;
  noMods: string[];
  regularMods: string;
} {
  if (!modifierSummary) return { cookTemp: null, noMods: [], regularMods: '' };

  let remaining = modifierSummary;

  // Extract cook temp
  let cookTemp: string | null = null;
  const tempMatch = remaining.match(COOK_TEMP_PATTERNS);
  if (tempMatch) {
    cookTemp = tempMatch[0].toUpperCase();
    remaining = remaining.replace(COOK_TEMP_PATTERNS, '').trim();
  }

  // Extract "No" modifiers
  const noMods: string[] = [];
  const noMatches = remaining.match(NO_MOD_PATTERN);
  if (noMatches) {
    noMods.push(...noMatches.map((m) => m.trim()));
    remaining = remaining.replace(NO_MOD_PATTERN, '').trim();
  }

  // Clean up remaining (remove extra commas, spaces)
  const regularMods = remaining
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .replace(/,\s*,/g, ',')
    .replace(/\s+/g, ' ')
    .trim();

  return { cookTemp, noMods, regularMods };
}

export function TicketItemRow({ item, showSeat = true, onBump, density = 'standard' }: TicketItemRowProps) {
  const isBumped = item.itemStatus === 'ready' || item.itemStatus === 'bumped';
  const isVoided = item.itemStatus === 'voided';
  const { cookTemp, noMods, regularMods } = parseModifiers(item.modifierSummary ?? null);

  const itemTextSize = density === 'compact' ? 'text-xs' : 'text-sm';
  const modTextSize = density === 'compact' ? 'text-[10px]' : 'text-xs';
  const padding = density === 'compact' ? 'px-1.5 py-1' : density === 'comfortable' ? 'px-3 py-2.5' : 'px-2 py-1.5 xl:px-3 xl:py-2';

  return (
    <div
      className={`flex items-start gap-2 ${padding} border-b last:border-b-0 transition-colors`}
      style={{
        borderColor: 'rgba(148, 163, 184, 0.1)',
        opacity: isVoided ? 0.3 : 1,
        textDecoration: isVoided ? 'line-through' : 'none',
        backgroundColor: isBumped ? 'rgba(34, 197, 94, 0.05)' : 'transparent',
        cursor: onBump && !isBumped && !isVoided ? 'pointer' : 'default',
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
        {/* Item name + quantity */}
        <div className="flex items-center gap-1.5">
          {item.quantity > 1 && (
            <span className={`${itemTextSize} font-bold fnb-mono`} style={{ color: 'var(--fnb-text-primary)' }}>
              {item.quantity}x
            </span>
          )}
          <span
            className={`${itemTextSize} font-bold truncate`}
            style={{
              color: isBumped ? 'var(--fnb-status-available)' : 'var(--fnb-text-primary)',
            }}
          >
            {item.kitchenLabel || item.itemName}
          </span>
          {/* Inline badges */}
          {item.isRush && (
            <span className="text-[9px] font-bold px-1 rounded" style={{ color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)' }}>RUSH</span>
          )}
          {item.isAllergy && (
            <span className="text-[9px] font-bold px-1 rounded" style={{ color: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)' }}>ALLERGY</span>
          )}
          {item.isVip && (
            <span className="text-[9px] font-bold px-1 rounded" style={{ color: '#a855f7', backgroundColor: 'rgba(168,85,247,0.1)' }}>VIP</span>
          )}
        </div>

        {/* Cook temp — bold and prominent */}
        {cookTemp && (
          <p className={`${modTextSize} font-bold mt-0.5`} style={{ color: '#f97316' }}>
            {cookTemp}
          </p>
        )}

        {/* "No" modifiers — highlighted in red */}
        {noMods.length > 0 && (
          <p className={`${modTextSize} font-semibold mt-0.5`} style={{ color: '#ef4444' }}>
            {noMods.join(', ')}
          </p>
        )}

        {/* Regular modifiers — compact inline */}
        {regularMods && (
          <p className={`${modTextSize} mt-0.5`} style={{ color: 'var(--fnb-text-muted)' }}>
            + {regularMods}
          </p>
        )}

        {/* Special instructions */}
        {item.specialInstructions && (
          <p
            className={`${modTextSize} italic mt-0.5 rounded px-1`}
            style={{
              color: 'var(--fnb-status-check-presented)',
              backgroundColor: 'rgba(245, 158, 11, 0.08)',
            }}
          >
            ** {item.specialInstructions}
          </p>
        )}
      </div>

      {/* Status indicator */}
      {isBumped && (
        <span className="shrink-0 text-sm font-bold" style={{ color: 'var(--fnb-status-available)' }}>
          ✓
        </span>
      )}
    </div>
  );
}
