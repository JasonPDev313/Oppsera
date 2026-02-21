'use client';

import { Search } from 'lucide-react';
import { useFnbMenu } from '@/hooks/use-fnb-menu';
import { FnbItemTile } from './FnbItemTile';
import { QuickItemsRow } from './QuickItemsRow';

interface FnbMenuPanelProps {
  onItemTap: (itemId: string, itemName: string, priceCents: number, itemType: string) => void;
}

export function FnbMenuPanel({ onItemTap }: FnbMenuPanelProps) {
  const menu = useFnbMenu();

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--fnb-bg-surface)' }}>
      {/* Search bar */}
      <div className="px-2 py-1.5 border-b" style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}>
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2"
          style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
        >
          <Search className="h-3.5 w-3.5" style={{ color: 'var(--fnb-text-muted)' }} />
          <input
            type="text"
            value={menu.searchQuery}
            onChange={(e) => menu.setSearchQuery(e.target.value)}
            placeholder="Search items..."
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color: 'var(--fnb-text-primary)' }}
          />
        </div>
      </div>

      {/* Department tabs */}
      <div className="flex gap-1 px-2 py-1.5 overflow-x-auto border-b shrink-0" style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}>
        {menu.departments.map((dept) => {
          const isActive = dept.id === menu.activeDepartmentId;
          return (
            <button
              key={dept.id}
              type="button"
              onClick={() => {
                menu.setActiveDepartment(dept.id);
                menu.setActiveSubDepartment(null);
                menu.setActiveCategory(null);
              }}
              className={`rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors shrink-0 ${
                isActive ? 'text-white' : 'hover:opacity-80'
              }`}
              style={{
                backgroundColor: isActive ? 'var(--fnb-status-seated)' : 'var(--fnb-bg-elevated)',
                color: isActive ? '#fff' : 'var(--fnb-text-secondary)',
              }}
            >
              {dept.name}
            </button>
          );
        })}
      </div>

      {/* Sub-department tabs */}
      {menu.subDepartments.length > 0 && (
        <div className="flex gap-1 px-2 py-1 overflow-x-auto border-b shrink-0" style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}>
          <button
            type="button"
            onClick={() => { menu.setActiveSubDepartment(null); menu.setActiveCategory(null); }}
            className="rounded px-2.5 py-1.5 text-[10px] font-semibold whitespace-nowrap transition-colors shrink-0"
            style={{
              backgroundColor: !menu.activeSubDepartmentId ? 'var(--fnb-status-ordered)' : 'transparent',
              color: !menu.activeSubDepartmentId ? '#fff' : 'var(--fnb-text-muted)',
            }}
          >
            All
          </button>
          {menu.subDepartments.map((sd) => {
            const isActive = sd.id === menu.activeSubDepartmentId;
            return (
              <button
                key={sd.id}
                type="button"
                onClick={() => { menu.setActiveSubDepartment(sd.id); menu.setActiveCategory(null); }}
                className="rounded px-2.5 py-1.5 text-[10px] font-semibold whitespace-nowrap transition-colors shrink-0"
                style={{
                  backgroundColor: isActive ? 'var(--fnb-status-ordered)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--fnb-text-muted)',
                }}
              >
                {sd.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Category rail */}
      {menu.categories.length > 0 && (
        <div className="flex gap-1 px-2 py-1 overflow-x-auto border-b shrink-0" style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}>
          {menu.categories.map((cat) => {
            const isActive = cat.id === menu.activeCategoryId;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => menu.setActiveCategory(isActive ? null : cat.id)}
                className="rounded px-2.5 py-1 text-[10px] font-medium whitespace-nowrap transition-colors shrink-0"
                style={{
                  backgroundColor: isActive ? 'var(--fnb-bg-elevated)' : 'transparent',
                  color: isActive ? 'var(--fnb-text-primary)' : 'var(--fnb-text-muted)',
                }}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Quick items row */}
      <QuickItemsRow
        items={menu.filteredItems.slice(0, 8).map((i) => ({ id: i.id, name: i.name, priceCents: i.unitPriceCents }))}
        onTap={(id) => {
          const item = menu.items.find((i) => i.id === id);
          if (item) onItemTap(item.id, item.name, item.unitPriceCents, item.itemType);
        }}
      />

      {/* Item grid */}
      <div className="flex-1 overflow-y-auto p-2">
        {menu.isLoading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>Loading menu...</p>
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
                onTap={() => onItemTap(item.id, item.name, item.unitPriceCents, item.itemType)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
