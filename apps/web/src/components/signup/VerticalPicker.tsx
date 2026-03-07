'use client';

import { useState, useMemo } from 'react';
import { Check, ArrowRight } from 'lucide-react';
import { useSignupBusinessTypes } from '@/hooks/use-signup-business-types';
import type { SignupBusinessType } from '@/hooks/use-signup-business-types';

type VerticalPickerProps = {
  onSelect: (slug: string | null) => void;
  selectedSlug: string | null;
};

export function VerticalPicker({ onSelect, selectedSlug }: VerticalPickerProps) {
  const { data: types, isLoading, error } = useSignupBusinessTypes();
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const t of types) {
      if (t.categoryName) cats.add(t.categoryName);
    }
    return Array.from(cats).sort();
  }, [types]);

  const filtered = useMemo(() => {
    if (!categoryFilter) return types;
    return types.filter((t) => t.categoryName === categoryFilter);
  }, [types, categoryFilter]);

  if (isLoading) {
    return (
      <div className="text-center py-12 text-slate-400 text-sm">
        Loading business types...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
        Failed to load business types. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="text-center">
        <h2 className="text-xl font-bold text-white">Choose Your Business Type</h2>
        <p className="text-sm text-slate-400 mt-1">
          Select the vertical that best matches your business.
        </p>
      </div>

      {/* Category Filter */}
      {categories.length > 1 && (
        <div className="flex justify-center gap-1 flex-wrap">
          <button
            onClick={() => setCategoryFilter(null)}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
              !categoryFilter
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                categoryFilter === cat
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((bt) => (
          <BusinessTypeCard
            key={bt.id}
            type={bt}
            isSelected={selectedSlug === bt.slug}
            onSelect={() => onSelect(bt.slug)}
          />
        ))}

        {/* Skip Card */}
        <button
          onClick={() => onSelect(null)}
          className={`text-left rounded-xl border-2 p-5 transition-all ${
            selectedSlug === null
              ? 'border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/30'
              : 'border-slate-700 bg-slate-800 hover:border-slate-600'
          }`}
        >
          <p className="text-sm font-medium text-slate-300">Not sure?</p>
          <p className="text-xs text-slate-500 mt-1">
            Start with our general setup and configure later.
          </p>
          <span className="inline-flex items-center gap-1 text-xs text-indigo-400 mt-3">
            Skip <ArrowRight size={12} />
          </span>
        </button>
      </div>
    </div>
  );
}

function BusinessTypeCard({
  type,
  isSelected,
  onSelect,
}: {
  type: SignupBusinessType;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`text-left rounded-xl border-2 p-5 transition-all relative ${
        isSelected
          ? 'border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/30'
          : 'border-slate-700 bg-slate-800 hover:border-slate-600'
      }`}
    >
      {isSelected && (
        <div className="absolute top-3 right-3">
          <Check size={16} className="text-indigo-400" />
        </div>
      )}
      <p className="text-sm font-semibold text-white">{type.name}</p>
      {type.description && (
        <p className="text-xs text-slate-400 mt-1 line-clamp-2">{type.description}</p>
      )}
      <div className="flex items-center justify-between mt-3">
        {type.moduleCount > 0 && (
          <span className="text-[10px] text-slate-500">
            {type.moduleCount} module{type.moduleCount !== 1 ? 's' : ''} included
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-xs text-indigo-400">
          Select <ArrowRight size={12} />
        </span>
      </div>
    </button>
  );
}
