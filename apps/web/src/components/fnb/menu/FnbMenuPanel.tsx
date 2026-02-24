'use client';

import { memo, useCallback } from 'react';
import { Search, ChevronRight, X, RefreshCw, AlertCircle, Zap, Wrench, LayoutGrid } from 'lucide-react';
import type { UseFnbMenuReturn } from '@/hooks/use-fnb-menu';
import { useFnbMenu } from '@/hooks/use-fnb-menu';
import { FnbItemTile } from './FnbItemTile';

// ── Menu Mode Tabs (All Items / Hot Sellers / Tools) ────────────────

type MenuMode = 'all_items' | 'hot_sellers' | 'tools';

const MODE_TABS: Array<{ key: MenuMode; label: string; icon: typeof LayoutGrid }> = [
  { key: 'all_items', label: 'All Items', icon: LayoutGrid },
  { key: 'hot_sellers', label: 'Hot Sellers', icon: Zap },
  { key: 'tools', label: 'Tools', icon: Wrench },
];

export const MenuModeTabs = memo(function MenuModeTabs({
  activeMode,
  onSelectMode,
}: {
  activeMode: MenuMode;
  onSelectMode: (mode: MenuMode) => void;
}) {
  return (
    <div
      className="flex gap-1 px-4 py-1.5 shrink-0"
      style={{ backgroundColor: 'var(--fnb-bg-surface)', borderBottom: 'var(--fnb-border-subtle)' }}
    >
      {MODE_TABS.map((tab) => {
        const isActive = activeMode === tab.key;
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onSelectMode(tab.key)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-80"
            style={{
              backgroundColor: isActive ? 'var(--fnb-info)' : 'var(--fnb-bg-elevated)',
              color: isActive ? '#fff' : 'var(--fnb-text-secondary)',
            }}
          >
            <Icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
});

// ── Department tabs (horizontal top bar 1) ─────────────────────────

export const DepartmentBar = memo(function DepartmentBar({
  departments,
  selectedId,
  onSelect,
}: {
  departments: Array<{ id: string; name: string }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (departments.length === 0) {
    return (
      <div className="px-4 py-2 shrink-0">
        <p className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>No departments</p>
      </div>
    );
  }

  return (
    <div
      className="flex gap-1 overflow-x-auto px-4 py-2 shrink-0"
      style={{ scrollbarWidth: 'none', borderBottom: 'var(--fnb-border-subtle)' }}
    >
      {departments.map((dept) => {
        const isActive = dept.id === selectedId;
        return (
          <button
            key={dept.id}
            type="button"
            onClick={() => onSelect(dept.id)}
            className="shrink-0 whitespace-nowrap rounded-lg font-semibold transition-opacity hover:opacity-80"
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              backgroundColor: isActive ? 'var(--fnb-info)' : 'var(--fnb-bg-elevated)',
              color: isActive ? '#fff' : 'var(--fnb-text-secondary)',
            }}
          >
            {dept.name}
          </button>
        );
      })}
    </div>
  );
});

// ── Sub-department tabs (horizontal top bar 2) ─────────────────────

export const SubDepartmentBar = memo(function SubDepartmentBar({
  subDepartments,
  selectedId,
  onSelect,
}: {
  subDepartments: Array<{ id: string; name: string }>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  if (subDepartments.length === 0) return null;

  return (
    <div
      className="flex gap-1 overflow-x-auto px-4 py-1.5 shrink-0"
      style={{ scrollbarWidth: 'none', borderBottom: 'var(--fnb-border-subtle)' }}
    >
      <button
        type="button"
        onClick={() => onSelect(null)}
        className="shrink-0 rounded-lg font-medium transition-opacity hover:opacity-80"
        style={{
          padding: '7px 16px',
          fontSize: '13px',
          backgroundColor: selectedId === null ? 'var(--fnb-warning)' : 'transparent',
          color: selectedId === null ? '#fff' : 'var(--fnb-text-muted)',
        }}
      >
        All
      </button>
      {subDepartments.map((sd) => {
        const isActive = sd.id === selectedId;
        return (
          <button
            key={sd.id}
            type="button"
            onClick={() => onSelect(sd.id)}
            className="shrink-0 whitespace-nowrap rounded-lg font-medium transition-opacity hover:opacity-80"
            style={{
              padding: '7px 16px',
              fontSize: '13px',
              backgroundColor: isActive ? 'var(--fnb-warning)' : 'transparent',
              color: isActive ? '#fff' : 'var(--fnb-text-muted)',
            }}
          >
            {sd.name}
          </button>
        );
      })}
    </div>
  );
});

// ── Category rail (vertical left sidebar) ──────────────────────────

export const CategorySidebar = memo(function CategorySidebar({
  categories,
  selectedId,
  onSelect,
}: {
  categories: Array<{ id: string; name: string }>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  if (categories.length === 0) return null;

  return (
    <div
      className="shrink-0 overflow-y-auto"
      style={{
        width: 'var(--fnb-category-sidebar-width)',
        scrollbarWidth: 'none',
        backgroundColor: 'var(--fnb-bg-surface)',
        borderRight: 'var(--fnb-border-subtle)',
      }}
    >
      <button
        type="button"
        onClick={() => onSelect(null)}
        className="w-full text-left px-3 py-3 text-xs font-semibold transition-opacity hover:opacity-80"
        style={{
          borderLeft: selectedId === null ? '3px solid var(--fnb-info)' : '3px solid transparent',
          backgroundColor: selectedId === null ? 'var(--fnb-bg-elevated)' : 'transparent',
          color: selectedId === null ? 'var(--fnb-info)' : 'var(--fnb-text-muted)',
        }}
      >
        All
      </button>
      {categories.map((cat) => {
        const isActive = cat.id === selectedId;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelect(isActive ? null : cat.id)}
            className="w-full text-left px-3 py-3 text-xs font-semibold transition-opacity hover:opacity-80 leading-tight"
            style={{
              borderLeft: isActive ? '3px solid var(--fnb-info)' : '3px solid transparent',
              backgroundColor: isActive ? 'var(--fnb-bg-elevated)' : 'transparent',
              color: isActive ? 'var(--fnb-info)' : 'var(--fnb-text-muted)',
            }}
          >
            {cat.name}
          </button>
        );
      })}
    </div>
  );
});

// ── Search bar ─────────────────────────────────────────────────────

export const MenuSearchBar = memo(function MenuSearchBar({
  searchQuery,
  setSearchQuery,
}: {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}) {
  return (
    <div
      className="px-4 py-2 shrink-0"
      style={{ borderBottom: 'var(--fnb-border-subtle)' }}
    >
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-2"
        style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
      >
        <Search className="h-4 w-4 shrink-0" style={{ color: 'var(--fnb-text-muted)' }} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search menu..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:opacity-50"
          style={{ color: 'var(--fnb-text-primary)' }}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="shrink-0 transition-opacity hover:opacity-70"
          >
            <X className="h-4 w-4" style={{ color: 'var(--fnb-text-muted)' }} />
          </button>
        )}
      </div>
    </div>
  );
});

// ── Breadcrumb (contextual, subtle) ────────────────────────────────

const MenuBreadcrumb = memo(function MenuBreadcrumb({
  segments,
  onNavigate,
}: {
  segments: Array<{ level: string; name: string }>;
  onNavigate: (level: string) => void;
}) {
  if (segments.length <= 1) return null;

  return (
    <nav className="flex items-center gap-1 px-3 py-0.5 text-[10px] shrink-0" aria-label="Menu breadcrumb">
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={seg.level} className="flex items-center gap-0.5">
            {i > 0 && <ChevronRight className="h-2.5 w-2.5 shrink-0" style={{ color: 'var(--fnb-text-muted)' }} />}
            {isLast ? (
              <span className="font-semibold" style={{ color: 'var(--fnb-text-secondary)' }}>{seg.name}</span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(seg.level)}
                className="transition-opacity hover:opacity-80"
                style={{ color: 'var(--fnb-text-muted)' }}
              >
                {seg.name}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
});

// ── Navigation Section (search + mode tabs + dept + subdept) ──────
// Exported for use in FnbTabView's top navigation area

export const FnbMenuNav = memo(function FnbMenuNav({
  menu,
  menuMode,
  onSelectMode,
}: {
  menu: UseFnbMenuReturn;
  menuMode?: MenuMode;
  onSelectMode?: (mode: MenuMode) => void;
}) {
  return (
    <div className="shrink-0" style={{ backgroundColor: 'var(--fnb-bg-surface)' }}>
      <MenuSearchBar searchQuery={menu.searchQuery} setSearchQuery={menu.setSearchQuery} />
      {menuMode !== undefined && onSelectMode && (
        <MenuModeTabs activeMode={menuMode} onSelectMode={onSelectMode} />
      )}
      {(!menuMode || menuMode === 'all_items') && (
        <>
          <DepartmentBar
            departments={menu.departments}
            selectedId={menu.activeDepartmentId}
            onSelect={(id) => {
              menu.setActiveDepartment(id);
              menu.setActiveSubDepartment(null);
              menu.setActiveCategory(null);
            }}
          />
          <SubDepartmentBar
            subDepartments={menu.subDepartments}
            selectedId={menu.activeSubDepartmentId}
            onSelect={(id) => {
              menu.setActiveSubDepartment(id);
              menu.setActiveCategory(null);
            }}
          />
        </>
      )}
    </div>
  );
});

// ── Content Section (categories sidebar + items grid) ──────────────
// Exported for use in FnbTabView's content area

export const FnbMenuContent = memo(function FnbMenuContent({ menu, menuMode, onItemTap }: {
  menu: UseFnbMenuReturn;
  menuMode?: MenuMode;
  onItemTap: (itemId: string, itemName: string, priceCents: number, itemType: string) => void;
}) {
  const handleBreadcrumbNavigate = useCallback((level: string) => {
    if (level === 'department') {
      menu.setActiveSubDepartment(null);
      menu.setActiveCategory(null);
    } else if (level === 'subDepartment') {
      menu.setActiveCategory(null);
    }
  }, [menu]);

  const handleItemTap = useCallback((id: string) => {
    const item = menu.items.find((i) => i.id === id);
    if (item) onItemTap(item.id, item.name, item.unitPriceCents, item.itemType);
  }, [menu.items, onItemTap]);

  // Show stub for non-catalog modes
  if (menuMode && menuMode !== 'all_items') {
    return (
      <div
        className="flex flex-1 min-h-0 min-w-0 items-center justify-center"
        style={{ backgroundColor: 'var(--fnb-bg-surface)' }}
      >
        <div className="text-center p-8">
          {menuMode === 'hot_sellers' ? (
            <Zap className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--fnb-text-muted)' }} />
          ) : (
            <Wrench className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--fnb-text-muted)' }} />
          )}
          <p className="text-sm font-semibold" style={{ color: 'var(--fnb-text-secondary)' }}>
            {menuMode === 'hot_sellers' ? 'Hot Sellers' : 'Tools'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--fnb-text-muted)' }}>
            Coming Soon
          </p>
        </div>
      </div>
    );
  }

  // Build breadcrumb segments
  const breadcrumbSegments: Array<{ level: string; name: string }> = [];
  if (menu.activeDepartmentId) {
    const dept = menu.departments.find((d) => d.id === menu.activeDepartmentId);
    if (dept) breadcrumbSegments.push({ level: 'department', name: dept.name });
  }
  if (menu.activeSubDepartmentId) {
    const sd = menu.subDepartments.find((d) => d.id === menu.activeSubDepartmentId);
    if (sd) breadcrumbSegments.push({ level: 'subDepartment', name: sd.name });
  }
  if (menu.activeCategoryId) {
    const cat = menu.categories.find((c) => c.id === menu.activeCategoryId);
    if (cat) breadcrumbSegments.push({ level: 'category', name: cat.name });
  }

  return (
    <div className="flex flex-1 min-h-0 min-w-0" style={{ backgroundColor: 'var(--fnb-bg-surface)' }}>
      {/* Category vertical rail */}
      <CategorySidebar
        categories={menu.categories}
        selectedId={menu.activeCategoryId}
        onSelect={menu.setActiveCategory}
      />

      {/* Items area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Subtle breadcrumb (inline, minimal height) */}
        <MenuBreadcrumb segments={breadcrumbSegments} onNavigate={handleBreadcrumbNavigate} />

        {/* Item grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {menu.isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div
                  className="h-6 w-6 mx-auto mb-2 animate-spin rounded-full border-2 border-t-transparent"
                  style={{ borderColor: 'var(--fnb-info)', borderTopColor: 'transparent' }}
                />
                <p className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>Loading menu...</p>
              </div>
            </div>
          ) : menu.filteredItems.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm" style={{ color: 'var(--fnb-text-muted)' }}>
                {menu.searchQuery ? 'No items match search' : 'No items in this category'}
              </p>
            </div>
          ) : (
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}
            >
              {menu.filteredItems.map((item) => (
                <FnbItemTile
                  key={item.id}
                  name={item.name}
                  priceCents={item.unitPriceCents}
                  is86d={item.is86d}
                  allergenIcons={item.allergenIds
                    .map((aid) => menu.allergens.find((a) => a.id === aid)?.icon)
                    .filter(Boolean) as string[]}
                  onTap={() => handleItemTap(item.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// ── Error State ────────────────────────────────────────────────────

export function FnbMenuError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div
      className="flex flex-col h-full items-center justify-center gap-3 p-4"
      style={{ backgroundColor: 'var(--fnb-bg-surface)' }}
    >
      <AlertCircle className="h-8 w-8" style={{ color: 'var(--fnb-action-void)' }} />
      <p className="text-xs text-center" style={{ color: 'var(--fnb-text-muted)' }}>
        {error}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
        style={{ backgroundColor: 'var(--fnb-info)', color: '#fff' }}
      >
        <RefreshCw className="h-3 w-3" />
        Retry
      </button>
    </div>
  );
}

// ── Composed Menu Panel (backward-compatible) ──────────────────────

interface FnbMenuPanelProps {
  onItemTap: (itemId: string, itemName: string, priceCents: number, itemType: string) => void;
  menuMode?: MenuMode;
  onSelectMode?: (mode: MenuMode) => void;
}

export function FnbMenuPanel({ onItemTap, menuMode, onSelectMode }: FnbMenuPanelProps) {
  const menu = useFnbMenu();

  if (menu.error) {
    return <FnbMenuError error={menu.error} onRetry={() => menu.refresh()} />;
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--fnb-bg-surface)' }}>
      <FnbMenuNav menu={menu} menuMode={menuMode} onSelectMode={onSelectMode} />
      <FnbMenuContent menu={menu} menuMode={menuMode} onItemTap={onItemTap} />
    </div>
  );
}
