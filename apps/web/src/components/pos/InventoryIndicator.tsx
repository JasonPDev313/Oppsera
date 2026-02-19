'use client';

import { memo } from 'react';

interface InventoryIndicatorProps {
  onHand: number | null;
  isTrackInventory: boolean;
  compact?: boolean;
}

export const InventoryIndicator = memo(function InventoryIndicator({
  onHand,
  isTrackInventory,
  compact = false,
}: InventoryIndicatorProps) {
  if (!isTrackInventory) return null;

  if (onHand === null || onHand === undefined) return null;

  if (onHand === 0) {
    return (
      <span className="text-xs font-medium text-red-600">
        {compact ? '0' : 'Out of stock'}
      </span>
    );
  }

  if (onHand <= 10) {
    return (
      <span className="text-xs font-medium text-amber-600">
        {compact ? String(onHand) : `${onHand} in stock`}
      </span>
    );
  }

  return (
    <span className="text-xs font-medium text-green-600">
      {compact ? String(onHand) : `${onHand} in stock`}
    </span>
  );
});
