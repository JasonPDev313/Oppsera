'use client';

import { Star } from 'lucide-react';
import { getContrastTextColor } from '@/lib/contrast';

export type TileSize = 'compact' | 'standard' | 'large';

const TILE_HEIGHTS: Record<TileSize, number> = {
  compact: 72,
  standard: 100,
  large: 140,
};

interface FnbItemTileProps {
  name: string;
  priceCents: number;
  is86d: boolean;
  onTap: () => void;
  allergenIcons?: string[];
  menuColor?: string | null;
  imageUrl?: string | null;
  cartQty?: number;
  stockRemaining?: number | null;
  tileSize?: TileSize;
  /** Whether this item is starred as a favorite */
  isFavorite?: boolean;
  /** Toggle favorite (called with stopPropagation already handled) */
  onToggleFavorite?: () => void;
  /** Show modifier badge indicating item opens modifier drawer */
  hasModifiers?: boolean;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function FnbItemTile({
  name,
  priceCents,
  is86d,
  onTap,
  allergenIcons,
  menuColor,
  imageUrl,
  cartQty,
  stockRemaining,
  tileSize = 'standard',
  isFavorite,
  onToggleFavorite,
  hasModifiers,
}: FnbItemTileProps) {
  const hasMenuColor = !!menuColor && menuColor !== '#FFFFFF';
  const hasImage = !!imageUrl;
  const textColor = hasImage ? '#ffffff' : hasMenuColor ? getContrastTextColor(menuColor) : null;
  const minH = TILE_HEIGHTS[tileSize];

  return (
    <button
      type="button"
      onClick={is86d ? undefined : onTap}
      disabled={is86d}
      className={`relative flex flex-col items-center justify-center p-2 transition-all disabled:cursor-not-allowed overflow-hidden ${
        is86d ? 'opacity-40' : 'hover:scale-[1.02] active:scale-[0.98]'
      }`}
      style={{
        width: '100%',
        minHeight: minH,
        borderRadius: 'var(--fnb-radius-lg)',
        backgroundColor: hasImage ? '#1e293b' : hasMenuColor ? menuColor : 'var(--fnb-bg-elevated)',
      }}
    >
      {/* Background image */}
      {hasImage && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${imageUrl})`, opacity: 0.55 }}
        />
      )}

      {/* Content (above image) */}
      <div className="relative z-1 flex flex-col items-center justify-center">
        {/* Item name */}
        <span
          className={`font-semibold text-center leading-tight line-clamp-2 ${tileSize === 'compact' ? 'text-xs' : 'text-sm'}`}
          style={{
            color: textColor ?? 'var(--fnb-text-primary)',
            textShadow: hasImage ? '0 1px 3px rgba(0,0,0,0.6)' : undefined,
          }}
        >
          {name}
        </span>

        {/* Price — more prominent */}
        <span
          className={`font-bold mt-1 ${tileSize === 'compact' ? 'text-xs' : 'text-sm'}`}
          style={{
            color: textColor ?? 'var(--fnb-text-secondary)',
            opacity: textColor ? 0.9 : undefined,
            fontFamily: 'var(--fnb-font-mono)',
            textShadow: hasImage ? '0 1px 3px rgba(0,0,0,0.6)' : undefined,
          }}
        >
          {formatMoney(priceCents)}
        </span>
      </div>

      {/* Cart quantity badge (top-left) */}
      {cartQty != null && cartQty > 0 && (
        <span
          className="absolute top-1 left-1 flex items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{
            width: 20,
            height: 20,
            backgroundColor: 'var(--fnb-info)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }}
        >
          {cartQty}
        </span>
      )}

      {/* Stock remaining indicator */}
      {stockRemaining != null && stockRemaining > 0 && stockRemaining <= 5 && !is86d && (
        <span
          className="absolute bottom-1 left-1 rounded px-1 py-0.5 text-[9px] font-bold"
          style={{
            backgroundColor: 'rgba(234, 179, 8, 0.2)',
            color: 'var(--fnb-warning)',
          }}
        >
          {stockRemaining} left
        </span>
      )}

      {/* Modifier badge (bottom-right) */}
      {hasModifiers && !is86d && (
        <span
          className="absolute bottom-1 right-1 rounded px-1 py-0.5 text-[9px] font-bold z-1"
          style={{
            backgroundColor: 'rgba(99, 102, 241, 0.2)',
            color: 'var(--fnb-info)',
          }}
        >
          MOD
        </span>
      )}

      {/* 86'd overlay */}
      {is86d && (
        <div
          className="absolute inset-0 flex items-center justify-center z-2"
          style={{ borderRadius: 'var(--fnb-radius-lg)', backgroundColor: 'rgba(0,0,0,0.6)' }}
        >
          <span className="text-sm font-bold text-white tracking-wider">86&apos;d</span>
        </div>
      )}

      {/* Top-right badges: favorite star + allergen icons */}
      <div className="absolute top-1 right-1 flex items-center gap-0.5 z-1">
        {onToggleFavorite && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onToggleFavorite(); } }}
            className="cursor-pointer transition-transform hover:scale-110"
          >
            <Star
              className="h-3.5 w-3.5"
              style={{
                color: isFavorite ? 'var(--fnb-warning)' : (textColor ?? 'var(--fnb-text-muted)'),
                fill: isFavorite ? 'var(--fnb-warning)' : 'none',
                opacity: isFavorite ? 1 : 0.5,
              }}
            />
          </span>
        )}
        {allergenIcons && allergenIcons.length > 0 && (
          allergenIcons.slice(0, 3).map((icon, i) => (
            <span key={i} className="text-[10px]">{icon}</span>
          ))
        )}
      </div>
    </button>
  );
}
