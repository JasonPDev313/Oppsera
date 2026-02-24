'use client';

import { memo, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CatalogItemForPOS } from '@/types/pos';

// ── Types ─────────────────────────────────────────────────────────

export interface QuickMenuTile {
  id: string;
  type: 'item' | 'category' | 'action' | 'spacer';
  label: string;
  color?: string;
  /** Column span (1-4). Default 1. */
  colSpan?: number;
  /** Row span (1-2). Default 1. */
  rowSpan?: number;
  /** Catalog item ID (for type=item). */
  catalogItemId?: string;
  /** Category ID (for type=category). */
  categoryId?: string;
  /** Action name (for type=action). */
  action?: string;
}

export interface QuickMenuPage {
  id: string;
  label: string;
  tiles: QuickMenuTile[];
}

interface QuickMenuGridProps {
  pages: QuickMenuPage[];
  /** All catalog items for resolving tile→item lookups. */
  allItems: CatalogItemForPOS[];
  onItemTap: (item: CatalogItemForPOS) => void;
  onCategoryTap?: (categoryId: string) => void;
  onAction?: (action: string) => void;
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function getContrastColor(hexColor: string): string {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1f2937' : '#ffffff';
}

// ── Grid Tile ─────────────────────────────────────────────────────

const GridTile = memo(function GridTile({
  tile,
  item,
  onItemTap,
  onCategoryTap,
  onAction,
}: {
  tile: QuickMenuTile;
  item?: CatalogItemForPOS;
  onItemTap: (item: CatalogItemForPOS) => void;
  onCategoryTap?: (categoryId: string) => void;
  onAction?: (action: string) => void;
}) {
  const colSpan = tile.colSpan ?? 1;
  const rowSpan = tile.rowSpan ?? 1;
  const bgColor = tile.color || '#e0e7ff';
  const textColor = getContrastColor(bgColor);

  if (tile.type === 'spacer') {
    return (
      <div
        style={{ gridColumn: `span ${colSpan}`, gridRow: `span ${rowSpan}` }}
      />
    );
  }

  const handleClick = () => {
    if (tile.type === 'item' && item) {
      onItemTap(item);
    } else if (tile.type === 'category' && tile.categoryId && onCategoryTap) {
      onCategoryTap(tile.categoryId);
    } else if (tile.type === 'action' && tile.action && onAction) {
      onAction(tile.action);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex flex-col items-center justify-center gap-1 rounded-lg p-2 text-center transition-all active:scale-[0.97]"
      style={{
        gridColumn: `span ${colSpan}`,
        gridRow: `span ${rowSpan}`,
        backgroundColor: bgColor,
        color: textColor,
        minHeight: rowSpan > 1 ? '120px' : '60px',
      }}
    >
      <span className="text-sm font-semibold leading-tight truncate w-full">
        {tile.label}
      </span>
      {tile.type === 'item' && item && (
        <span className="text-xs opacity-80">{formatPrice(item.price)}</span>
      )}
    </button>
  );
});

// ── Quick Menu Grid ───────────────────────────────────────────────

export const QuickMenuGrid = memo(function QuickMenuGrid({
  pages,
  allItems,
  onItemTap,
  onCategoryTap,
  onAction,
}: QuickMenuGridProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const currentPage = pages[pageIndex];

  const goNext = useCallback(() => {
    setPageIndex((i) => Math.min(i + 1, pages.length - 1));
  }, [pages.length]);

  const goPrev = useCallback(() => {
    setPageIndex((i) => Math.max(i - 1, 0));
  }, []);

  if (!currentPage || pages.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-gray-400">No quick menu configured</p>
      </div>
    );
  }

  // Build item lookup map
  const itemMap = new Map(allItems.map((i) => [i.id, i]));

  return (
    <div className="flex flex-col gap-3">
      {/* Page navigation */}
      {pages.length > 1 && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={goPrev}
            disabled={pageIndex === 0}
            className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex gap-1.5">
            {pages.map((page, i) => (
              <button
                key={page.id}
                type="button"
                onClick={() => setPageIndex(i)}
                className={`h-2 rounded-full transition-colors ${
                  i === pageIndex ? 'w-6 bg-indigo-500' : 'w-2 bg-gray-300'
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={goNext}
            disabled={pageIndex === pages.length - 1}
            className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* 8-column CSS Grid */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}
      >
        {currentPage.tiles.map((tile) => (
          <GridTile
            key={tile.id}
            tile={tile}
            item={tile.catalogItemId ? itemMap.get(tile.catalogItemId) : undefined}
            onItemTap={onItemTap}
            onCategoryTap={onCategoryTap}
            onAction={onAction}
          />
        ))}
      </div>
    </div>
  );
});
