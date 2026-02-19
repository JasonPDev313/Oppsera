'use client';

import { memo, useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ItemButton } from './ItemButton';
import type { CatalogItemForPOS } from '@/types/pos';

/** Threshold below which we skip virtualization (DOM overhead not worth it) */
const VIRTUAL_THRESHOLD = 50;

interface VirtualItemGridProps {
  items: CatalogItemForPOS[];
  onItemTap: (item: CatalogItemForPOS) => void;
  /** Ref to the scroll parent element (the overflow-y-auto container) */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  size?: 'normal' | 'large';
  minColumnWidth?: number;
  gap?: number;
  isFavorite?: (itemId: string) => boolean;
  onToggleFavorite?: (itemId: string) => void;
  canEditItem?: boolean;
  onEditItem?: (itemId: string) => void;
  onArchiveItem?: (itemId: string) => void;
  onViewHistory?: (itemId: string) => void;
}

export const VirtualItemGrid = memo(function VirtualItemGrid({
  items,
  onItemTap,
  scrollRef,
  size = 'normal',
  minColumnWidth = 130,
  gap = 8,
  isFavorite,
  onToggleFavorite,
  canEditItem,
  onEditItem,
  onArchiveItem,
  onViewHistory,
}: VirtualItemGridProps) {
  // Below threshold: simple flat grid (no virtualization overhead)
  if (items.length < VIRTUAL_THRESHOLD) {
    return (
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))`,
          gap: `${gap}px`,
        }}
      >
        {items.map((item) => (
          <ItemButton
            key={item.id}
            item={item}
            onTap={onItemTap}
            size={size}
            isFavorite={isFavorite?.(item.id)}
            onToggleFavorite={onToggleFavorite}
            canEditItem={canEditItem}
            onEditItem={onEditItem}
            onArchiveItem={onArchiveItem}
            onViewHistory={onViewHistory}
          />
        ))}
      </div>
    );
  }

  return (
    <VirtualizedInner
      items={items}
      onItemTap={onItemTap}
      scrollRef={scrollRef}
      size={size}
      minColumnWidth={minColumnWidth}
      gap={gap}
      isFavorite={isFavorite}
      onToggleFavorite={onToggleFavorite}
      canEditItem={canEditItem}
      onEditItem={onEditItem}
      onArchiveItem={onArchiveItem}
      onViewHistory={onViewHistory}
    />
  );
});

/**
 * Inner component that uses the virtualizer — only rendered when items >= threshold.
 * Uses the parent scroll container via scrollRef for virtualization.
 */
const VirtualizedInner = memo(function VirtualizedInner({
  items,
  onItemTap,
  scrollRef,
  size,
  minColumnWidth,
  gap,
  isFavorite,
  onToggleFavorite,
  canEditItem,
  onEditItem,
  onArchiveItem,
  onViewHistory,
}: {
  items: CatalogItemForPOS[];
  onItemTap: (item: CatalogItemForPOS) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  size: 'normal' | 'large';
  minColumnWidth: number;
  gap: number;
  isFavorite?: (itemId: string) => boolean;
  onToggleFavorite?: (itemId: string) => void;
  canEditItem?: boolean;
  onEditItem?: (itemId: string) => void;
  onArchiveItem?: (itemId: string) => void;
  onViewHistory?: (itemId: string) => void;
}) {
  const sizeRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Measure available width from the size sentinel div
  useEffect(() => {
    const el = sizeRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(el);
    setContainerWidth(el.clientWidth);

    return () => observer.disconnect();
  }, []);

  const columnCount = useMemo(() => {
    if (containerWidth <= 0) return 1;
    return Math.max(1, Math.floor((containerWidth + gap) / (minColumnWidth + gap)));
  }, [containerWidth, minColumnWidth, gap]);

  const rowHeight = size === 'large' ? 140 + gap : 120 + gap;
  const rowCount = Math.ceil(items.length / columnCount);

  const getScrollElement = useCallback(() => scrollRef.current, [scrollRef]);
  const estimateSize = useCallback(() => rowHeight, [rowHeight]);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement,
    estimateSize,
    overscan: 3,
  });

  return (
    <>
      {/* Invisible sentinel to measure available grid width */}
      <div ref={sizeRef} style={{ width: '100%', height: 0, overflow: 'hidden' }} />

      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * columnCount;
          const rowItems = items.slice(startIndex, startIndex + columnCount);

          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
                  gap: `${gap}px`,
                }}
              >
                {rowItems.map((item) => (
                  <ItemButton
                    key={item.id}
                    item={item}
                    onTap={onItemTap}
                    size={size}
                    isFavorite={isFavorite?.(item.id)}
                    onToggleFavorite={onToggleFavorite}
                    canEditItem={canEditItem}
                    onEditItem={onEditItem}
                    onArchiveItem={onArchiveItem}
                    onViewHistory={onViewHistory}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
});
