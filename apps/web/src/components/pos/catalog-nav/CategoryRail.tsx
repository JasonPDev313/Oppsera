'use client';

import { memo, useCallback } from 'react';

interface CategoryRailProps {
  categories: Array<{ id: string; name: string }>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export const CategoryRail = memo(function CategoryRail({
  categories,
  selectedId,
  onSelect,
}: CategoryRailProps) {
  const handleSelect = useCallback(
    (id: string | null) => {
      onSelect(id);
    },
    [onSelect],
  );

  return (
    <div className="w-48 shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50">
      {/* "All" item */}
      <button
        type="button"
        onClick={() => handleSelect(null)}
        className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${
          selectedId === null
            ? 'border-l-2 border-indigo-600 bg-indigo-50 text-indigo-600'
            : 'border-l-2 border-transparent text-gray-700 hover:bg-gray-100'
        }`}
      >
        All
      </button>

      {categories.map((cat) => (
        <button
          key={cat.id}
          type="button"
          onClick={() => handleSelect(cat.id)}
          className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${
            selectedId === cat.id
              ? 'border-l-2 border-indigo-600 bg-indigo-50 text-indigo-600'
              : 'border-l-2 border-transparent text-gray-700 hover:bg-gray-100'
          }`}
        >
          {cat.name}
        </button>
      ))}
    </div>
  );
});
