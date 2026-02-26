'use client';

import { memo, useCallback, useRef } from 'react';
import { getContrastTextColor } from '@/lib/contrast';

interface DepartmentTabsProps {
  departments: Array<{ id: string; name: string; color?: string | null }>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  size?: 'normal' | 'large';
}

export const DepartmentTabs = memo(function DepartmentTabs({
  departments,
  selectedId,
  onSelect,
  size = 'normal',
}: DepartmentTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback(
    (id: string | null) => {
      onSelect(id);
    },
    [onSelect],
  );

  const isLarge = size === 'large';
  const tabPadding = isLarge ? 'py-3 px-5 text-base' : 'py-2 px-4 text-sm';
  const tabFontSize = isLarge
    ? 'calc(1rem * var(--pos-font-scale, 1))'
    : 'calc(0.875rem * var(--pos-font-scale, 1))';

  return (
    <div
      ref={scrollRef}
      role="tablist"
      aria-label="Departments"
      className="flex gap-2 overflow-x-auto scrollbar-hide"
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
            : 'bg-muted text-foreground hover:bg-accent'
        }`}
        style={{ fontSize: tabFontSize }}
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
                  ? 'bg-muted text-foreground hover:bg-accent'
                  : 'bg-muted text-foreground hover:bg-accent'
            }`}
            style={
              isActive && hasColor
                ? { backgroundColor: activeBg, color: activeText, fontSize: tabFontSize }
                : !isActive && hasColor
                  ? { borderLeft: `3px solid ${dept.color}`, fontSize: tabFontSize }
                  : { fontSize: tabFontSize }
            }
          >
            {dept.name}
          </button>
        );
      })}
    </div>
  );
});
