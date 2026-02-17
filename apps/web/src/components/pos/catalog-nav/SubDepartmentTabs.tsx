'use client';

import { useCallback, useRef } from 'react';

interface SubDepartmentTabsProps {
  departments: Array<{ id: string; name: string }>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  size?: 'normal' | 'large';
}

export function SubDepartmentTabs({
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
      className="flex gap-1.5 overflow-x-auto scrollbar-hide"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      {/* "All" tab */}
      <button
        type="button"
        onClick={() => handleSelect(null)}
        className={`shrink-0 rounded-full font-medium transition-colors ${tabPadding} ${
          selectedId === null
            ? 'bg-indigo-600 text-white shadow-sm'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        All
      </button>

      {departments.map((dept) => (
        <button
          key={dept.id}
          type="button"
          onClick={() => handleSelect(dept.id)}
          className={`shrink-0 whitespace-nowrap rounded-full font-medium transition-colors ${tabPadding} ${
            selectedId === dept.id
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {dept.name}
        </button>
      ))}
    </div>
  );
}
