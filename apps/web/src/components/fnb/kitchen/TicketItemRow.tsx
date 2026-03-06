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
  const isReady = item.itemStatus === 'ready' || item.itemStatus === 'bumped';
  const isServed = item.itemStatus === 'served';
  const isVoided = item.itemStatus === 'voided';
  const isTerminal = isServed || isVoided;
  const isTappable = !!onBump && !isTerminal;
  const { cookTemp, noMods, regularMods } = parseModifiers(item.modifierSummary ?? null);

  // Touch-optimized sizes — kitchen monitors need large, well-spaced tap targets
  const itemTextSize = density === 'compact' ? 'text-base' : 'text-lg';
  const modTextSize = density === 'compact' ? 'text-sm' : 'text-base';
  const padding = density === 'compact'
    ? 'px-3 py-3'
    : density === 'comfortable'
      ? 'px-5 py-5'
      : 'px-4 py-4';
  // Min height ensures a fat touch target even for single-line items
  const minHeight = density === 'compact' ? '56px' : density === 'comfortable' ? '72px' : '64px';
  // Visible gap between rows so adjacent items are clearly separate
  const gapBorder = density === 'compact'
    ? '3px solid rgba(148, 163, 184, 0.12)'
    : '4px solid rgba(148, 163, 184, 0.12)';

  return (
    <div
      className={`flex items-center gap-3 ${padding} transition-colors`}
      role={isTappable ? 'button' : undefined}
      tabIndex={isTappable ? 0 : undefined}
      style={{
        borderBottom: gapBorder,
        minHeight,
        opacity: isVoided ? 0.3 : isServed ? 0.4 : 1,
        textDecoration: isVoided ? 'line-through' : 'none',
        backgroundColor: isServed
          ? 'rgba(34, 197, 94, 0.1)'
          : isReady
            ? 'rgba(34, 197, 94, 0.05)'
            : 'transparent',
        cursor: isTappable ? 'pointer' : 'default',
        // Active press feedback for touch
        WebkitTapHighlightColor: isTappable ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
      }}
      onClick={isTappable ? () => onBump(item.itemId) : undefined}
      onKeyDown={isTappable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onBump(item.itemId); } } : undefined}
    >
      {/* Seat badge */}
      {showSeat && item.seatNumber && (
        <span
          className="shrink-0 flex items-center justify-center rounded-full text-xs font-bold kds-seat-badge"
          style={{
            width: '28px',
            height: '28px',
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
        <div className="flex items-center gap-2">
          {item.quantity > 1 && (
            <span className={`${itemTextSize} font-bold fnb-mono`} style={{ color: 'var(--fnb-text-primary)' }}>
              {item.quantity}x
            </span>
          )}
          <span
            className={`${itemTextSize} font-bold truncate`}
            style={{
              color: isReady ? 'var(--fnb-status-available)' : 'var(--fnb-text-primary)',
            }}
          >
            {item.kitchenLabel || item.itemName}
          </span>
          {/* Inline badges */}
          {item.isRush && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.15)' }}>RUSH</span>
          )}
          {item.isAllergy && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ color: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.15)' }}>ALLERGY</span>
          )}
          {item.isVip && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ color: '#a855f7', backgroundColor: 'rgba(168,85,247,0.15)' }}>VIP</span>
          )}
        </div>

        {/* Cook temp — bold and prominent */}
        {cookTemp && (
          <p className={`${modTextSize} font-bold mt-1`} style={{ color: '#f97316' }}>
            {cookTemp}
          </p>
        )}

        {/* "No" modifiers — highlighted in red */}
        {noMods.length > 0 && (
          <p className={`${modTextSize} font-semibold mt-1`} style={{ color: '#ef4444' }}>
            {noMods.join(', ')}
          </p>
        )}

        {/* Regular modifiers — compact inline */}
        {regularMods && (
          <p className={`${modTextSize} mt-1`} style={{ color: 'var(--fnb-text-muted)' }}>
            + {regularMods}
          </p>
        )}

        {/* Special instructions */}
        {item.specialInstructions && (
          <p
            className={`${modTextSize} italic mt-1 rounded px-1.5 py-0.5`}
            style={{
              color: 'var(--fnb-status-check-presented)',
              backgroundColor: 'rgba(245, 158, 11, 0.08)',
            }}
          >
            ** {item.specialInstructions}
          </p>
        )}
      </div>

      {/* Status indicator — large enough to see at a glance */}
      {isServed && (
        <span className="shrink-0 text-xl font-bold" style={{ color: 'var(--fnb-status-available)', opacity: 0.6 }}>
          ✓✓
        </span>
      )}
      {isReady && !isServed && (
        <span className="shrink-0 text-xl font-bold" style={{ color: 'var(--fnb-status-available)' }}>
          ✓
        </span>
      )}
    </div>
  );
}
