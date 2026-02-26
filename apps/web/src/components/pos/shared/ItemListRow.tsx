'use client';

import { memo, useCallback } from 'react';
import { InventoryIndicator } from '../InventoryIndicator';
import type { CatalogItemForPOS } from '@/types/pos';

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

interface ItemListRowProps {
  item: CatalogItemForPOS;
  onTap: (item: CatalogItemForPOS) => void;
}

export const ItemListRow = memo(function ItemListRow({ item, onTap }: ItemListRowProps) {
  const handleClick = useCallback(() => onTap(item), [item, onTap]);

  const isOutOfStock = item.isTrackInventory && item.onHand !== null && item.onHand === 0;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`flex w-full items-center gap-3 rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:bg-accent active:scale-[0.99] ${
        isOutOfStock ? 'opacity-50' : ''
      }`}
    >
      {/* Name */}
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {item.name}
      </span>

      {/* SKU */}
      <span className="w-24 shrink-0 truncate text-xs font-mono text-muted-foreground">
        {item.sku ?? ''}
      </span>

      {/* Price */}
      <span className="w-20 shrink-0 text-right text-sm font-semibold text-foreground">
        {formatPrice(item.price)}
      </span>

      {/* Stock */}
      <span className="w-16 shrink-0">
        <InventoryIndicator
          onHand={item.onHand}
          isTrackInventory={item.isTrackInventory}
          compact
        />
      </span>
    </button>
  );
});
