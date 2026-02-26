'use client';

import { memo, useCallback, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Star, StarOff, Pencil, Archive, History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ITEM_TYPE_BADGES } from '@/types/catalog';
import { InventoryIndicator } from './InventoryIndicator';
import { getContrastTextColor } from '@/lib/contrast';
import type { CatalogItemForPOS } from '@/types/pos';
import type { ItemTypeGroup } from '@oppsera/shared';

const TYPE_BAR_COLORS: Record<ItemTypeGroup, string> = {
  fnb: 'bg-amber-500',
  retail: 'bg-indigo-500',
  service: 'bg-purple-500',
  package: 'bg-green-500',
};

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

interface ItemButtonProps {
  item: CatalogItemForPOS;
  onTap: (item: CatalogItemForPOS) => void;
  size?: 'normal' | 'large';
  isFavorite?: boolean;
  onToggleFavorite?: (itemId: string) => void;
  canEditItem?: boolean;
  onEditItem?: (itemId: string) => void;
  onArchiveItem?: (itemId: string) => void;
  onViewHistory?: (itemId: string) => void;
}

export const ItemButton = memo(function ItemButton({
  item,
  onTap,
  size = 'normal',
  isFavorite,
  onToggleFavorite,
  canEditItem,
  onEditItem,
  onArchiveItem,
  onViewHistory,
}: ItemButtonProps) {
  const handleClick = useCallback(() => {
    onTap(item);
  }, [item, onTap]);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasAnyAction = onToggleFavorite || (canEditItem && onEditItem) || (canEditItem && onArchiveItem) || (canEditItem && onViewHistory);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!hasAnyAction) return;
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY });
    },
    [hasAnyAction],
  );

  // Close on outside click, scroll, or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', handleKey);
    };
  }, [contextMenu]);

  const badgeConfig = ITEM_TYPE_BADGES[item.typeGroup];
  const barColor = TYPE_BAR_COLORS[item.typeGroup];

  // Menu color from metadata + auto-contrast text
  const menuColor = (item.metadata?.menuColor as string) ?? null;
  const hasMenuColor = !!menuColor && menuColor !== '#FFFFFF';
  const textColor = hasMenuColor ? getContrastTextColor(menuColor) : null;
  const isLightText = textColor === '#FFFFFF';

  // Stock status
  const isOutOfStock = item.isTrackInventory && item.onHand !== null && item.onHand === 0;
  const isLowStock = item.isTrackInventory && item.onHand !== null && item.onHand > 0 && item.onHand <= 10;

  const isNormal = size === 'normal';
  const sizeClasses = isNormal
    ? 'w-full h-[120px] text-sm'
    : 'w-full h-[140px] text-base';

  const menuItemClass = 'flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent';

  return (
    <>
      <button
        type="button"
        data-contextmenu
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={`${sizeClasses} relative flex flex-col overflow-hidden rounded-lg shadow-sm transition-all hover:shadow-md active:scale-[0.97] active:shadow-inner select-none ${
          isOutOfStock
            ? 'border border-gray-300 opacity-60'
            : isLowStock
              ? 'border border-gray-200 border-b-2 border-b-amber-400 hover:border-gray-300'
              : 'border border-gray-200 hover:border-gray-300'
        } ${hasMenuColor ? '' : 'bg-surface'}`}
        style={hasMenuColor ? { backgroundColor: menuColor } : undefined}
      >
        {/* Out of stock overlay */}
        {isOutOfStock && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface/60">
            <span className="rounded-md bg-red-500/20 px-2 py-1 text-xs font-semibold text-red-500">
              Out of Stock
            </span>
          </div>
        )}

        {/* Type-colored top bar */}
        <div className={`h-1 w-full shrink-0 ${barColor}`} />

        {/* Content */}
        <div className="flex flex-1 flex-col justify-between p-2">
          {/* Item name */}
          <span
            className={`line-clamp-2 text-left font-medium leading-tight ${hasMenuColor ? '' : 'text-foreground'}`}
            style={{
              fontSize: `calc(${isNormal ? '0.875rem' : '1rem'} * var(--pos-font-scale, 1))`,
              ...(textColor ? { color: textColor } : {}),
            }}
          >
            {item.name}
          </span>

          {/* Price */}
          <span
            className={`text-left font-semibold ${hasMenuColor ? '' : 'text-foreground'}`}
            style={{
              fontSize: `calc(${isNormal ? '0.875rem' : '1rem'} * var(--pos-font-scale, 1))`,
              ...(textColor ? { color: textColor, opacity: 0.85 } : {}),
            }}
          >
            {formatPrice(item.price)}
          </span>

          {/* Bottom row: type badge + favorite + stock */}
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1">
              <Badge variant={badgeConfig.variant} className="shrink-0">
                {badgeConfig.label}
              </Badge>
              {isFavorite && (
                <Star
                  className={`h-3 w-3 shrink-0 ${isLightText ? 'fill-amber-300 text-amber-300' : 'fill-amber-400 text-amber-400'}`}
                  aria-label="Favorite item"
                />
              )}
            </div>
            <InventoryIndicator
              onHand={item.onHand}
              isTrackInventory={item.isTrackInventory}
              compact
            />
          </div>
        </div>
      </button>

      {/* Context menu */}
      {contextMenu && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-50 min-w-48 rounded-lg border border-gray-200 bg-surface py-1 shadow-xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
            role="menu"
          >
            {/* Edit — requires canEditItem */}
            {canEditItem && onEditItem && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onEditItem(item.id);
                  setContextMenu(null);
                }}
                className={menuItemClass}
              >
                <Pencil className="h-4 w-4 text-gray-400" />
                Edit Item
              </button>
            )}

            {/* Favorites — always visible */}
            {onToggleFavorite && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onToggleFavorite(item.id);
                  setContextMenu(null);
                }}
                className={menuItemClass}
              >
                {isFavorite ? (
                  <>
                    <StarOff className="h-4 w-4 text-gray-400" />
                    Remove from Hot Sellers
                  </>
                ) : (
                  <>
                    <Star className="h-4 w-4 text-amber-500" />
                    Add to Hot Sellers
                  </>
                )}
              </button>
            )}

            {/* Divider — only show if there are items both above and below */}
            {(onToggleFavorite || (canEditItem && onEditItem)) && canEditItem && (onViewHistory || onArchiveItem) && (
              <div className="my-1 border-t border-gray-100" role="separator" />
            )}

            {/* View History — requires canEditItem */}
            {canEditItem && onViewHistory && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onViewHistory(item.id);
                  setContextMenu(null);
                }}
                className={menuItemClass}
              >
                <History className="h-4 w-4 text-gray-400" />
                View History
              </button>
            )}

            {/* Archive — requires canEditItem */}
            {canEditItem && onArchiveItem && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onArchiveItem(item.id);
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-500 transition-colors hover:bg-red-500/10"
              >
                <Archive className="h-4 w-4" />
                Archive Item
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
});
