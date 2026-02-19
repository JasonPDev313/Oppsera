'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, Barcode } from 'lucide-react';
import type { ReceivingItemSearchResult } from '@/types/receiving';

interface ItemSearchInputProps {
  results: ReceivingItemSearchResult[];
  query: string;
  onQueryChange: (q: string) => void;
  isSearching: boolean;
  onSelect: (item: ReceivingItemSearchResult) => void;
  autoFocus?: boolean;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export function ItemSearchInput({
  results,
  query,
  onQueryChange,
  isSearching,
  onSelect,
  autoFocus = true,
}: ItemSearchInputProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) inputRef.current.focus();
  }, [autoFocus]);

  useEffect(() => {
    setShowDropdown(results.length > 0 && query.length > 0);
  }, [results, query]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Scan barcode or search by name/SKU..."
          className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        />
        {isSearching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-indigo-600" />
          </div>
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-surface shadow-lg">
          <ul className="max-h-64 overflow-y-auto py-1">
            {results.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50"
                  onClick={() => {
                    onSelect(item);
                    onQueryChange('');
                    setShowDropdown(false);
                    inputRef.current?.focus();
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900">{item.name}</div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {item.sku && <span>{item.sku}</span>}
                      {item.matchedOn === 'barcode' && item.barcode && (
                        <span className="flex items-center gap-0.5">
                          <Barcode className="h-3 w-3" />
                          {item.barcode}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    {item.vendorCost !== null && (
                      <div className="font-medium text-gray-700">{formatMoney(item.vendorCost)}</div>
                    )}
                    <div className="text-gray-500">{item.baseUnit}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
