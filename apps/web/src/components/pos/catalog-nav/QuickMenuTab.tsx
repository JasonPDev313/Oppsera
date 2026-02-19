'use client';

import { memo } from 'react';
import { Star, Clock } from 'lucide-react';
import { ItemButton } from '../ItemButton';
import type { CatalogItemForPOS } from '@/types/pos';

interface QuickMenuTabProps {
  favorites: CatalogItemForPOS[];
  recentItems: CatalogItemForPOS[];
  onItemTap: (item: CatalogItemForPOS) => void;
  activeTab: 'favorites' | 'recent';
  onTabChange: (tab: 'favorites' | 'recent') => void;
  itemSize?: 'normal' | 'large';
  isFavorite?: (itemId: string) => boolean;
  onToggleFavorite?: (itemId: string) => void;
  canEditItem?: boolean;
  onEditItem?: (itemId: string) => void;
  onArchiveItem?: (itemId: string) => void;
  onViewHistory?: (itemId: string) => void;
}

export const QuickMenuTab = memo(function QuickMenuTab({
  favorites,
  recentItems,
  onItemTap,
  activeTab,
  onTabChange,
  itemSize = 'normal',
  isFavorite,
  onToggleFavorite,
  canEditItem,
  onEditItem,
  onArchiveItem,
  onViewHistory,
}: QuickMenuTabProps) {
  const items = activeTab === 'favorites' ? favorites : recentItems;
  const emptyMessage =
    activeTab === 'favorites' ? 'No favorites yet' : 'No recent items';

  return (
    <div className="flex flex-col gap-3">
      {/* Sub-tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => onTabChange('favorites')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-colors ${
            activeTab === 'favorites'
              ? 'bg-surface text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Star className="h-4 w-4" />
          Favorites
        </button>
        <button
          type="button"
          onClick={() => onTabChange('recent')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-colors ${
            activeTab === 'recent'
              ? 'bg-surface text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Clock className="h-4 w-4" />
          Recent
        </button>
      </div>

      {/* Items grid */}
      {items.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-gray-400">{emptyMessage}</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <ItemButton
              key={item.id}
              item={item}
              onTap={onItemTap}
              size={itemSize}
              isFavorite={isFavorite?.(item.id)}
              onToggleFavorite={onToggleFavorite}
              canEditItem={canEditItem}
              onEditItem={onEditItem}
              onArchiveItem={onArchiveItem}
              onViewHistory={onViewHistory}
            />
          ))}
        </div>
      )}
    </div>
  );
});
