'use client';

import { memo, useMemo, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import type { CatalogItemForPOS, OrderLine } from '@/types/pos';

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

interface SuggestedItemsStripProps {
  /** All catalog items available */
  allItems: CatalogItemForPOS[];
  /** Current order lines */
  orderLines: OrderLine[];
  /** Callback when a suggested item is tapped */
  onItemTap: (item: CatalogItemForPOS) => void;
  /** Max number of suggestions to display */
  maxSuggestions?: number;
}

/**
 * Horizontal scrollable strip of suggested/upsell items based on the current cart contents.
 * Shows items from the same category as cart items, plus popular items the customer hasn't added yet.
 * Hidden when cart is empty.
 */
export const SuggestedItemsStrip = memo(function SuggestedItemsStrip({
  allItems,
  orderLines,
  onItemTap,
  maxSuggestions = 12,
}: SuggestedItemsStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Compute suggestions based on cart contents
  const suggestions = useMemo(() => {
    if (!orderLines || orderLines.length === 0 || allItems.length === 0) return [];

    // Collect category IDs from cart items + item IDs already in cart
    const cartItemIds = new Set(orderLines.map((l) => l.catalogItemId));
    const cartCategoryIds = new Set<string>();
    for (const line of orderLines) {
      const catItem = allItems.find((i) => i.id === line.catalogItemId);
      if (catItem) cartCategoryIds.add(catItem.categoryId);
    }

    // Items from the same categories, not already in cart, in stock
    const sameCategoryItems = allItems.filter(
      (item) =>
        cartCategoryIds.has(item.categoryId) &&
        !cartItemIds.has(item.id) &&
        !(item.isTrackInventory && item.onHand !== null && item.onHand === 0),
    );

    // Sort by price descending (upsell higher-value items first)
    sameCategoryItems.sort((a, b) => b.price - a.price);

    // If we don't have enough from same category, fill with other in-stock items
    const result = sameCategoryItems.slice(0, maxSuggestions);

    if (result.length < maxSuggestions) {
      const remaining = maxSuggestions - result.length;
      const resultIds = new Set(result.map((r) => r.id));
      const otherItems = allItems
        .filter(
          (item) =>
            !cartItemIds.has(item.id) &&
            !resultIds.has(item.id) &&
            !cartCategoryIds.has(item.categoryId) &&
            !(item.isTrackInventory && item.onHand !== null && item.onHand === 0),
        )
        .slice(0, remaining);
      result.push(...otherItems);
    }

    return result;
  }, [allItems, orderLines, maxSuggestions]);

  const scroll = useCallback((direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = 280;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  }, []);

  if (suggestions.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-border">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 pt-2 pb-1">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Sparkles aria-hidden="true" className="h-3 w-3 text-amber-500" />
          Suggested Items
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => scroll('left')}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => scroll('right')}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Scroll right"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Scrollable strip */}
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto px-4 pb-2 scrollbar-thin"
        style={{ scrollbarWidth: 'thin' }}
      >
        {suggestions.map((item) => {
          const imageUrl = (item.metadata?.imageUrl as string) ?? null;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onItemTap(item)}
              className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/5 active:scale-[0.97]"
              style={{ maxWidth: 200 }}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt=""
                  className="h-7 w-7 shrink-0 rounded object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-indigo-500/10 text-xs font-semibold text-indigo-500">
                  {item.name.charAt(0)}
                </div>
              )}
              <div className="min-w-0 text-left">
                <p className="truncate text-xs font-medium text-foreground">{item.name}</p>
                <p className="text-xs text-muted-foreground">{formatPrice(item.price)}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
});
