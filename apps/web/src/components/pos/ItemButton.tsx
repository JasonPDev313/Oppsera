'use client';

import { useCallback } from 'react';
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
}

export function ItemButton({ item, onTap, size = 'normal' }: ItemButtonProps) {
  const handleClick = useCallback(() => {
    onTap(item);
  }, [item, onTap]);

  const badgeConfig = ITEM_TYPE_BADGES[item.typeGroup];
  const barColor = TYPE_BAR_COLORS[item.typeGroup];

  const isNormal = size === 'normal';
  const sizeClasses = isNormal
    ? 'w-28 h-28 text-sm'
    : 'w-36 h-36 text-base';

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${sizeClasses} relative flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md hover:border-gray-300 active:scale-95 active:shadow-inner select-none`}
    >
      {/* Type-colored top bar */}
      <div className={`h-1 w-full shrink-0 ${barColor}`} />

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
  );
}
