'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Star, StarOff, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ITEM_TYPE_BADGES } from '@/types/catalog';
import { InventoryIndicator } from './InventoryIndicator';
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
}

export function ItemButton({
  item,
  onTap,
  size = 'normal',
  isFavorite,
  onToggleFavorite,
  canEditItem,
  onEditItem,
}: ItemButtonProps) {
  const handleClick = useCallback(() => {
    onTap(item);
  }, [item, onTap]);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      // Only show if at least one action is available
      if (!onToggleFavorite && !onEditItem) return;
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY });
    },
    [onToggleFavorite, onEditItem],
  );

  // Close on outside click or scroll
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [contextMenu]);

  const badgeConfig = ITEM_TYPE_BADGES[item.typeGroup];
  const barColor = TYPE_BAR_COLORS[item.typeGroup];

  const isNormal = size === 'normal';
  const sizeClasses = isNormal
    ? 'w-full h-[120px] text-sm'
    : 'w-full h-[140px] text-base';

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={`${sizeClasses} relative flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-surface shadow-sm transition-all hover:shadow-md hover:border-gray-300 active:scale-95 active:shadow-inner select-none`}
      >
        {/* Type-colored top bar */}
        <div className={`h-1 w-full shrink-0 ${barColor}`} />

        {/* Favorite indicator */}
        {isFavorite && (
          <div className="absolute top-2 right-2">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          </div>
        )}

        {/* Content */}
        <div className="flex flex-1 flex-col justify-between p-2">
          {/* Item name */}
          <span className="line-clamp-2 text-left font-medium leading-tight text-gray-900">
            {item.name}
          </span>

          {/* Price */}
          <span className="text-left font-semibold text-gray-700">
            {formatPrice(item.price)}
          </span>

          {/* Bottom row: type badge + stock */}
          <div className="flex items-center justify-between gap-1">
            <Badge variant={badgeConfig.variant} className="shrink-0">
              {badgeConfig.label}
            </Badge>
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
            className="fixed z-50 min-w-44 rounded-lg border border-gray-200 bg-surface py-1 shadow-xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {onToggleFavorite && (
              <button
                type="button"
                onClick={() => {
                  onToggleFavorite(item.id);
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-indigo-50"
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
            {canEditItem && onEditItem && (
              <button
                type="button"
                onClick={() => {
                  onEditItem(item.id);
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-indigo-50"
              >
                <Pencil className="h-4 w-4 text-gray-400" />
                Edit Item
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
