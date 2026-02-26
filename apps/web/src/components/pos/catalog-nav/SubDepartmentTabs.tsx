'use client';

import { memo, useCallback, useRef } from 'react';
import { getContrastTextColor } from '@/lib/contrast';

interface SubDepartmentTabsProps {
  departments: Array<{ id: string; name: string; color?: string | null }>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  size?: 'normal' | 'large';
}

export const SubDepartmentTabs = memo(function SubDepartmentTabs({
  departments,
  selectedId,
  onSelect,
  size = 'normal',
}: SubDepartmentTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback(
    (id: string | null) => {
      onSelect(id);
    },
    [onSelect],
  );

  if (departments.length === 0) return null;

  const isLarge = size === 'large';
  const tabPadding = isLarge ? 'py-2.5 px-4 text-sm' : 'py-1.5 px-3 text-xs';

  return (
    <div
      ref={scrollRef}
      role="tablist"
      aria-label="Sub-departments"
      className="flex gap-1.5 overflow-x-auto scrollbar-hide"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      {/* "All" tab */}
      <button
        type="button"
        role="tab"
        aria-selected={selectedId === null}
        onClick={() => handleSelect(null)}
        className={`shrink-0 rounded-full font-medium transition-all active:scale-[0.97] ${tabPadding} ${
          selectedId === null
            ? 'bg-indigo-600 text-white shadow-sm'
            : 'bg-muted text-muted-foreground hover:bg-accent'
        }`}
      >
        All
      </button>

      {departments.map((dept) => {
        const isActive = selectedId === dept.id;
        const hasColor = !!dept.color && dept.color !== '#FFFFFF';
        const activeBg = hasColor ? dept.color! : undefined;
        const activeText = hasColor ? getContrastTextColor(dept.color!) : undefined;

        return (
          <button
            key={dept.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => handleSelect(dept.id)}
            className={`shrink-0 whitespace-nowrap rounded-full font-medium transition-all active:scale-[0.97] ${tabPadding} ${
              isActive
                ? hasColor
                  ? 'shadow-sm'
                  : 'bg-indigo-600 text-white shadow-sm'
                : hasColor
                  ? 'bg-muted text-muted-foreground hover:bg-accent'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
            style={
              isActive && hasColor
                ? { backgroundColor: activeBg, color: activeText }
                : !isActive && hasColor
                  ? { borderLeft: `3px solid ${dept.color}` }
                  : undefined
            }
          >
            {dept.name}
          </button>
        );
      })}
    </div>
  );
});
