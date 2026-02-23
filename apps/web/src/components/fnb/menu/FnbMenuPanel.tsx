'use client';

import { memo, useCallback } from 'react';
import { Search, ChevronRight, X, RefreshCw, AlertCircle } from 'lucide-react';
import { useFnbMenu } from '@/hooks/use-fnb-menu';
import { FnbItemTile } from './FnbItemTile';

interface FnbMenuPanelProps {
  onItemTap: (itemId: string, itemName: string, priceCents: number, itemType: string) => void;
}

// ── Department pill tabs (top-level, rounded-full) ────────────────

const DepartmentPills = memo(function DepartmentPills({
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
      <div className="px-3 py-2 shrink-0">
        <p className="text-[11px]" style={{ color: 'var(--fnb-text-muted)' }}>No departments</p>
      </div>
    );
  }

  return (
    <div
      className="flex gap-1.5 overflow-x-auto px-3 py-2 shrink-0"
      style={{ scrollbarWidth: 'none' }}
    >
      {departments.map((dept) => {
        const isActive = dept.id === selectedId;
        return (
          <button
            key={dept.id}
            type="button"
            onClick={() => onSelect(dept.id)}
            className={`shrink-0 whitespace-nowrap rounded-full font-semibold transition-all ${
              isActive ? 'shadow-sm' : 'hover:opacity-80'
            }`}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              backgroundColor: isActive ? 'var(--fnb-status-seated)' : 'var(--fnb-bg-elevated)',
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

// ── Sub-department chips (second level, smaller) ───────────────────

const SubDepartmentChips = memo(function SubDepartmentChips({
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
      className="flex gap-1 overflow-x-auto px-2 py-1.5 shrink-0 border-b"
      style={{ borderColor: 'rgba(148, 163, 184, 0.1)', scrollbarWidth: 'none' }}
    >
      <button
        type="button"
        onClick={() => onSelect(null)}
        className="shrink-0 rounded-full font-medium transition-all"
        style={{
          padding: '5px 12px',
          fontSize: '11px',
          backgroundColor: selectedId === null ? 'var(--fnb-status-ordered)' : 'transparent',
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
            className="shrink-0 whitespace-nowrap rounded-full font-medium transition-all"
            style={{
              padding: '5px 12px',
              fontSize: '11px',
              backgroundColor: isActive ? 'var(--fnb-status-ordered)' : 'transparent',
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

// ── Category rail (vertical sidebar with left-border accent) ──────

const CategorySidebar = memo(function CategorySidebar({
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
      className="shrink-0 overflow-y-auto border-r"
      style={{
        width: '120px',
        backgroundColor: 'var(--fnb-bg-primary)',
        borderColor: 'rgba(148, 163, 184, 0.1)',
      }}
    >
      <button
        type="button"
        onClick={() => onSelect(null)}
        className="w-full text-left px-3 py-2.5 text-[11px] font-semibold transition-colors border-l-2"
        style={{
          borderColor: selectedId === null ? 'var(--fnb-status-seated)' : 'transparent',
          backgroundColor: selectedId === null ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
          color: selectedId === null ? 'var(--fnb-status-seated)' : 'var(--fnb-text-muted)',
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
            className="w-full text-left px-3 py-2.5 text-[11px] font-semibold transition-colors border-l-2 leading-tight"
            style={{
              borderColor: isActive ? 'var(--fnb-status-seated)' : 'transparent',
              backgroundColor: isActive ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
              color: isActive ? 'var(--fnb-status-seated)' : 'var(--fnb-text-muted)',
            }}
          >
            {cat.name}
          </button>
        );
      })}
    </div>
  );
});

// ── Breadcrumb (contextual navigation) ─────────────────────────────

const MenuBreadcrumb = memo(function MenuBreadcrumb({
  segments,
  onNavigate,
}: {
  segments: Array<{ level: string; name: string }>;
  onNavigate: (level: string) => void;
}) {
  if (segments.length <= 1) return null;

  return (
    <nav className="flex items-center gap-1 px-2 py-1 text-[10px] shrink-0" aria-label="Menu breadcrumb">
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={seg.level} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-2.5 w-2.5 shrink-0" style={{ color: 'var(--fnb-text-muted)' }} />}
            {isLast ? (
              <span className="font-semibold" style={{ color: 'var(--fnb-text-primary)' }}>{seg.name}</span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(seg.level)}
                className="transition-colors hover:opacity-80"
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

// ── Main Menu Panel ────────────────────────────────────────────────

export function FnbMenuPanel({ onItemTap }: FnbMenuPanelProps) {
  const menu = useFnbMenu();

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

  // ── Error state ────────────────────────────────────────────────
  if (menu.error) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 p-4" style={{ backgroundColor: 'var(--fnb-bg-surface)' }}>
        <AlertCircle className="h-8 w-8" style={{ color: 'var(--fnb-status-dirty)' }} />
        <p className="text-xs text-center" style={{ color: 'var(--fnb-text-muted)' }}>
          {menu.error}
        </p>
        <button
          type="button"
          onClick={() => menu.refresh()}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: 'var(--fnb-status-seated)' }}
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--fnb-bg-surface)' }}>
      {/* Search bar */}
      <div className="px-2 py-1.5 border-b" style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}>
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2"
          style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
        >
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--fnb-text-muted)' }} />
          <input
            type="text"
            value={menu.searchQuery}
            onChange={(e) => menu.setSearchQuery(e.target.value)}
            placeholder="Search menu..."
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color: 'var(--fnb-text-primary)' }}
          />
          {menu.searchQuery && (
            <button
              type="button"
              onClick={() => menu.setSearchQuery('')}
              className="shrink-0 transition-opacity hover:opacity-70"
            >
              <X className="h-3.5 w-3.5" style={{ color: 'var(--fnb-text-muted)' }} />
            </button>
          )}
        </div>
      </div>

      {/* Department pills */}
      <div className="border-b" style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}>
        <DepartmentPills
          departments={menu.departments}
          selectedId={menu.activeDepartmentId}
          onSelect={(id) => {
            menu.setActiveDepartment(id);
            menu.setActiveSubDepartment(null);
            menu.setActiveCategory(null);
          }}
        />
      </div>

      {/* Sub-department chips */}
      <SubDepartmentChips
        subDepartments={menu.subDepartments}
        selectedId={menu.activeSubDepartmentId}
        onSelect={(id) => {
          menu.setActiveSubDepartment(id);
          menu.setActiveCategory(null);
        }}
      />

      {/* Breadcrumb */}
      <MenuBreadcrumb segments={breadcrumbSegments} onNavigate={handleBreadcrumbNavigate} />

      {/* Category sidebar + Item grid (horizontal split) */}
      <div className="flex-1 flex min-h-0">
        {/* Category vertical rail */}
        <CategorySidebar
          categories={menu.categories}
          selectedId={menu.activeCategoryId}
          onSelect={menu.setActiveCategory}
        />

        {/* Item grid */}
        <div className="flex-1 overflow-y-auto p-2">
          {menu.isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div
                  className="h-6 w-6 mx-auto mb-2 animate-spin rounded-full border-2 border-t-transparent"
                  style={{ borderColor: 'var(--fnb-status-seated)', borderTopColor: 'transparent' }}
                />
                <p className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>Loading menu...</p>
              </div>
            </div>
          ) : menu.filteredItems.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>
                {menu.searchQuery ? 'No items match search' : 'No items in this category'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
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
}
