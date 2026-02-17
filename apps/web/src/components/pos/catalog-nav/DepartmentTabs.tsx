'use client';

import { useCallback, useRef } from 'react';

interface DepartmentTabsProps {
  departments: Array<{ id: string; name: string }>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  size?: 'normal' | 'large';
}

export function DepartmentTabs({
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

  return (
    <div
      ref={scrollRef}
      className="flex gap-2 overflow-x-auto scrollbar-hide"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      {/* "All" tab */}
      <button
        type="button"
        onClick={() => handleSelect(null)}
        className={`shrink-0 rounded-full font-medium transition-colors ${tabPadding} ${
          selectedId === null
            ? 'bg-indigo-600 text-white shadow-sm'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {dept.name}
        </button>
      ))}
    </div>
  );
}
