'use client';

import { memo, useCallback } from 'react';

interface CategoryRailProps {
  categories: Array<{ id: string; name: string; color?: string | null }>;
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
    <nav aria-label="Categories" className="w-48 shrink-0 overflow-y-auto border-r border-border bg-muted">
      {/* "All" item */}
      <button
        type="button"
        aria-current={selectedId === null ? 'true' : undefined}
        onClick={() => handleSelect(null)}
        className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-all active:scale-[0.97] ${
          selectedId === null
            ? 'border-l-2 border-indigo-600 bg-indigo-500/10 text-indigo-400'
            : 'border-l-2 border-transparent text-foreground hover:bg-accent'
        }`}
      >
        All
      </button>

      {categories.map((cat) => {
        const isActive = selectedId === cat.id;
        const hasColor = !!cat.color && cat.color !== '#FFFFFF';
        const borderColor = hasColor ? cat.color! : undefined;

        return (
          <button
            key={cat.id}
            type="button"
            aria-current={isActive ? 'true' : undefined}
            onClick={() => handleSelect(cat.id)}
            className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-all active:scale-[0.97] ${
              isActive
                ? hasColor
                  ? 'bg-indigo-500/10 text-indigo-400'
                  : 'border-l-2 border-indigo-600 bg-indigo-500/10 text-indigo-400'
                : 'border-l-2 border-transparent text-foreground hover:bg-accent'
            }`}
            style={
              isActive && hasColor
                ? { borderLeft: `2px solid ${borderColor}` }
                : undefined
            }
          >
            {cat.name}
          </button>
        );
      })}
    </nav>
  );
});
