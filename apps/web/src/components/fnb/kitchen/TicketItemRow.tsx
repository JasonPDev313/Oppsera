'use client';

import { useState, useEffect, useRef } from 'react';
import type { KdsTicketItem } from '@/types/fnb';

interface TicketItemRowProps {
  item: KdsTicketItem;
  showSeat?: boolean;
  onBump?: (itemId: string, stationId?: string | null) => void | Promise<void>;
  density?: 'compact' | 'standard' | 'comfortable';
  /** "All Day" count — total of this item across all open tickets */
  allDayCount?: number;
}

// Cook temp keywords to extract from modifier summary and highlight
const COOK_TEMP_PATTERNS = /\b(rare|med(?:ium)?\s*rare|medium|med(?:ium)?\s*well|well(?:\s*done)?|blue|black(?:\s*&\s*blue)?|pittsburg(?:h)?)\b/gi;

// "No" modifiers to highlight in red
const NO_MOD_PATTERN = /\bno\s+\w+/gi;

/**
 * Parse modifiers into structured display: cook temp, "no" mods, and regular mods.
 */
export function parseModifiers(modifierSummary: string | null): {
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

/** Compact countdown timer showing remaining prep time */
function PrepCountdown({ estimatedPrepSeconds, elapsedSeconds }: { estimatedPrepSeconds: number; elapsedSeconds: number }) {
  const remaining = Math.max(0, estimatedPrepSeconds - elapsedSeconds);
  const isOvertime = elapsedSeconds > estimatedPrepSeconds;
  const overtime = elapsedSeconds - estimatedPrepSeconds;
  const m = Math.floor((isOvertime ? overtime : remaining) / 60);
  const s = (isOvertime ? overtime : remaining) % 60;
  const label = isOvertime ? `+${m}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`;
  const color = isOvertime ? '#ef4444' : remaining < 60 ? '#f97316' : '#22c55e';

  return (
    <span
      className={`shrink-0 text-[10px] font-bold fnb-mono rounded px-1.5 py-0.5 ${isOvertime ? 'animate-pulse' : ''}`}
      style={{
        color,
        backgroundColor: isOvertime ? 'rgba(239, 68, 68, 0.25)' : `${color}15`,
        border: isOvertime ? '1px solid rgba(239, 68, 68, 0.4)' : 'none',
      }}
      title={isOvertime ? `${Math.ceil(overtime / 60)}m over estimated prep time` : `${Math.ceil(remaining / 60)}m remaining`}
    >
      {label}
    </span>
  );
}

export function TicketItemRow({ item, showSeat = true, onBump, density = 'standard', allDayCount }: TicketItemRowProps) {
  const [isBumping, setIsBumping] = useState(false);
  const bumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReady = item.itemStatus === 'ready';
  const isServed = item.itemStatus === 'served';
  const isVoided = item.itemStatus === 'voided';
  const isTerminal = isReady || isServed || isVoided;
  const isTappable = !!onBump && !isTerminal && Boolean(item.stationId);
  const isRemake = item.specialInstructions?.startsWith('REMAKE:') ?? false;
  const { cookTemp, noMods, regularMods } = parseModifiers(item.modifierSummary ?? null);

  // Clean up bump animation timer on unmount or when item becomes ready (optimistic)
  useEffect(() => {
    if (isReady && isBumping) setIsBumping(false);
    return () => {
      if (bumpTimerRef.current) clearTimeout(bumpTimerRef.current);
    };
  }, [isReady, isBumping]);

  const playBumpSound = () => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.08);
      setTimeout(() => ctx.close(), 150);
    } catch {
      // Audio not available
    }
  };

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
        backgroundColor: isBumping
          ? 'rgba(34, 197, 94, 0.2)'
          : isServed
            ? 'rgba(34, 197, 94, 0.1)'
            : isReady
              ? 'rgba(34, 197, 94, 0.05)'
              : item.isAllergy
                ? 'rgba(245, 158, 11, 0.08)'
                : 'transparent',
        transition: 'background-color 0.15s ease',
        borderLeft: item.isAllergy && !isTerminal ? '4px solid #f59e0b' : undefined,
        cursor: isTappable ? 'pointer' : 'default',
        // Active press feedback for touch
        WebkitTapHighlightColor: isTappable ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
      }}
      onClick={isTappable ? () => {
        if (isBumping) return;
        setIsBumping(true);
        navigator.vibrate?.(50);
        playBumpSound();
        void onBump(item.itemId, item.stationId);
        // Auto-clear after animation (cleanup handled in useEffect)
        if (bumpTimerRef.current) clearTimeout(bumpTimerRef.current);
        bumpTimerRef.current = setTimeout(() => { bumpTimerRef.current = null; setIsBumping(false); }, 600);
      } : undefined}
      onKeyDown={isTappable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (isBumping) return;
          setIsBumping(true);
          navigator.vibrate?.(50);
          playBumpSound();
          void onBump(item.itemId, item.stationId);
          if (bumpTimerRef.current) clearTimeout(bumpTimerRef.current);
          bumpTimerRef.current = setTimeout(() => { bumpTimerRef.current = null; setIsBumping(false); }, 600);
        }
      } : undefined}
    >
      {/* Item color stripe — station/category color coding */}
      {item.itemColor && (
        <span
          className="shrink-0 rounded-full"
          style={{
            width: '8px',
            height: '8px',
            backgroundColor: item.itemColor,
          }}
        />
      )}

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
          {isRemake && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ color: '#ec4899', backgroundColor: 'rgba(236,72,153,0.15)' }}>REMAKE</span>
          )}
          {item.isRush && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.15)' }}>RUSH</span>
          )}
          {item.isAllergy && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded animate-pulse" style={{ color: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.25)', border: '1px solid rgba(245,158,11,0.4)' }}>ALLERGY</span>
          )}
          {item.isVip && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ color: '#a855f7', backgroundColor: 'rgba(168,85,247,0.15)' }}>VIP</span>
          )}
          {/* "All Day" count — total of this item across all open tickets */}
          {allDayCount != null && allDayCount > 1 && (
            <span className="text-[10px] font-bold fnb-mono px-1 py-0.5 rounded" style={{ color: 'var(--fnb-text-muted)', backgroundColor: 'rgba(148,163,184,0.1)' }}>
              {allDayCount} all day
            </span>
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

        {/* Special instructions — more prominent for allergy items */}
        {item.specialInstructions && (
          <p
            className={`${modTextSize} ${item.isAllergy ? 'font-bold' : 'italic'} mt-1 rounded px-1.5 py-0.5`}
            style={{
              color: item.isAllergy ? '#ef4444' : 'var(--fnb-status-check-presented)',
              backgroundColor: item.isAllergy ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.08)',
              border: item.isAllergy ? '1px solid rgba(239, 68, 68, 0.2)' : undefined,
            }}
          >
            {item.isAllergy ? '⚠ ' : '** '}{item.specialInstructions}
          </p>
        )}
      </div>

      {/* Prep countdown timer — shows remaining time when estimatedPrepSeconds is set */}
      {!isTerminal && item.estimatedPrepSeconds != null && item.estimatedPrepSeconds > 0 && (
        <PrepCountdown estimatedPrepSeconds={item.estimatedPrepSeconds} elapsedSeconds={item.elapsedSeconds} />
      )}

      {/* Bump affordance — visible indicator for tappable items */}
      {(isTappable || isBumping) && (
        <div aria-live="polite" className="shrink-0">
          {isTappable && !isBumping && (
            <span
              className="flex items-center justify-center rounded-md text-[10px] font-bold uppercase tracking-wide"
              style={{
                minWidth: '44px',
                minHeight: '36px',
                padding: '4px 8px',
                backgroundColor: 'rgba(99, 102, 241, 0.12)',
                color: '#818cf8',
                border: '1px solid rgba(99, 102, 241, 0.25)',
              }}
            >
              Bump
            </span>
          )}
          {isBumping && (
            <span
              className="flex items-center justify-center rounded-md text-[10px] font-bold uppercase tracking-wide animate-pulse"
              style={{
                minWidth: '44px',
                minHeight: '36px',
                padding: '4px 8px',
                backgroundColor: 'rgba(34, 197, 94, 0.2)',
                color: '#22c55e',
                border: '1px solid rgba(34, 197, 94, 0.4)',
              }}
            >
              ✓
            </span>
          )}
        </div>
      )}

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
