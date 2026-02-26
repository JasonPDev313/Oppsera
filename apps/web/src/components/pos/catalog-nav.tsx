'use client';

import { ItemButton } from './ItemButton';
import type { CategoryRow } from '@/types/catalog';
import type { CatalogItemForPOS, CatalogNavLevel } from '@/types/pos';

// ── Department / Sub-Department Tabs ────────────────────────────────

interface DepartmentTabsProps {
  departments: CategoryRow[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  size?: 'normal' | 'large';
}

export function DepartmentTabs({ departments, selectedId, onSelect, size = 'normal' }: DepartmentTabsProps) {
  const sizeClasses = size === 'large' ? 'px-5 py-3 text-sm' : 'px-4 py-2.5 text-sm';

  return (
    <div className="flex gap-2 overflow-x-auto">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`shrink-0 rounded-lg ${sizeClasses} font-medium transition-colors ${
          selectedId === null
            ? 'bg-indigo-600 text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        All
      </button>
      {departments.map((dept) => (
        <button
          key={dept.id}
          type="button"
          onClick={() => onSelect(dept.id)}
          className={`shrink-0 rounded-lg ${sizeClasses} font-medium transition-colors ${
            selectedId === dept.id
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {dept.name}
        </button>
      ))}
    </div>
  );
}

export function SubDepartmentTabs({ departments, selectedId, onSelect, size = 'normal' }: DepartmentTabsProps) {
  const sizeClasses = size === 'large' ? 'px-5 py-3 text-sm' : 'px-4 py-2.5 text-sm';

  return (
    <div className="flex gap-2 overflow-x-auto">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`shrink-0 rounded-lg ${sizeClasses} font-medium transition-colors ${
          selectedId === null
            ? 'bg-indigo-500/20 text-indigo-500'
            : 'bg-muted text-muted-foreground hover:bg-accent'
        }`}
      >
        All
      </button>
      {departments.map((dept) => (
        <button
          key={dept.id}
          type="button"
          onClick={() => onSelect(dept.id)}
          className={`shrink-0 rounded-lg ${sizeClasses} font-medium transition-colors ${
            selectedId === dept.id
              ? 'bg-indigo-500/20 text-indigo-500'
              : 'bg-muted text-muted-foreground hover:bg-accent'
          }`}
        >
          {dept.name}
        </button>
      ))}
    </div>
  );
}

// ── Category Rail (vertical sidebar) ────────────────────────────────

interface CategoryRailProps {
  categories: CategoryRow[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function CategoryRail({ categories, selectedId, onSelect }: CategoryRailProps) {
  return (
    <div className="w-44 shrink-0 overflow-y-auto border-r border-border bg-muted/50 py-2">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`w-full px-4 py-3 text-left text-sm font-medium transition-colors ${
          selectedId === null
            ? 'bg-indigo-500/10 text-indigo-500 border-r-2 border-indigo-600'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        }`}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          type="button"
          onClick={() => onSelect(cat.id)}
          className={`w-full px-4 py-3 text-left text-sm font-medium transition-colors ${
            selectedId === cat.id
              ? 'bg-indigo-500/10 text-indigo-500 border-r-2 border-indigo-600'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
        >
          {cat.name}
        </button>
      ))}
    </div>
  );
}

// ── Breadcrumb ──────────────────────────────────────────────────────

interface CatalogBreadcrumbProps {
  breadcrumb: Array<{ level: CatalogNavLevel; id: string; name: string }>;
  onNavigate: (level: string) => void;
}

export function CatalogBreadcrumb({ breadcrumb, onNavigate }: CatalogBreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1 text-xs text-gray-500">
      {breadcrumb.map((crumb, idx) => (
        <span key={crumb.id} className="flex items-center gap-1">
          {idx > 0 && <span className="text-gray-300">/</span>}
          <button
            type="button"
            onClick={() => onNavigate(crumb.level)}
            className="font-medium text-gray-600 hover:text-indigo-600 transition-colors"
          >
            {crumb.name}
          </button>
        </span>
      ))}
    </nav>
  );
}

// ── Quick Menu Tab ──────────────────────────────────────────────────

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

export function QuickMenuTab({
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
    activeTab === 'favorites'
      ? 'No favorites yet — right-click any item to add it to Hot Sellers'
      : 'No recently used items';

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onTabChange('favorites')}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'favorites'
              ? 'bg-amber-500/20 text-amber-500'
              : 'bg-muted text-muted-foreground hover:bg-accent'
          }`}
        >
          Favorites
        </button>
        <button
          type="button"
          onClick={() => onTabChange('recent')}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'recent'
              ? 'bg-blue-500/20 text-blue-500'
              : 'bg-muted text-muted-foreground hover:bg-accent'
          }`}
        >
          Recent
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <p className="text-sm text-gray-400">{emptyMessage}</p>
        </div>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
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
}
