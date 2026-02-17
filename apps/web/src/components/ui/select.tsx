'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, X, Search } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  options: SelectOption[];
  value?: string | string[];
  onChange: (value: string | string[]) => void;
  placeholder?: string;
  multiple?: boolean;
  error?: boolean;
  className?: string;
}

export function Select({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  multiple = false,
  error = false,
  className = '',
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const showSearch = options.length >= 6;

  const selectedValues = multiple
    ? ((value as string[]) || [])
    : value
      ? [value as string]
      : [];

  const filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearch('');
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [handleClose]);

  const toggleOption = (optionValue: string) => {
    if (multiple) {
      const current = (value as string[]) || [];
      const next = current.includes(optionValue)
        ? current.filter((v) => v !== optionValue)
        : [...current, optionValue];
      onChange(next);
    } else {
      onChange(optionValue);
      handleClose();
    }
  };

  const removeTag = (optionValue: string) => {
    if (multiple) {
      onChange(((value as string[]) || []).filter((v) => v !== optionValue));
    }
  };

  const displayText = () => {
    if (selectedValues.length === 0) return placeholder;
    if (!multiple) {
      return options.find((o) => o.value === selectedValues[0])?.label || placeholder;
    }
    return null;
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm focus:ring-2 focus:outline-none ${
          error
            ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
            : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'
        }`}
      >
        <span className="flex flex-1 flex-wrap gap-1">
          {multiple && selectedValues.length > 0
            ? selectedValues.map((v) => {
                const opt = options.find((o) => o.value === v);
                return (
                  <span
                    key={v}
                    className="inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700"
                  >
                    {opt?.label}
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTag(v);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          removeTag(v);
                        }
                      }}
                      className="text-indigo-400 hover:text-indigo-600"
                    >
                      <X className="h-3 w-3" />
                    </span>
                  </span>
                );
              })
            : (
                <span className={selectedValues.length === 0 ? 'text-gray-400' : 'text-gray-900'}>
                  {displayText()}
                </span>
              )}
        </span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-surface shadow-lg">
          {showSearch && (
            <div className="border-b border-gray-100 p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter..."
                  className="w-full rounded border border-gray-200 py-1 pl-7 pr-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  autoFocus
                />
              </div>
            </div>
          )}
          <ul className="max-h-60 overflow-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-500">No options</li>
            )}
            {filtered.map((opt) => {
              const isSelected = selectedValues.includes(opt.value);
              return (
                <li key={opt.value}>
                  <button
                    type="button"
                    onClick={() => toggleOption(opt.value)}
                    className={`flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 ${
                      isSelected ? 'bg-indigo-50 text-indigo-700' : 'text-gray-900'
                    }`}
                  >
                    {multiple && (
                      <span
                        className={`mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-600 text-white'
                            : 'border-gray-300'
                        }`}
                      >
                        {isSelected && (
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                    )}
                    {opt.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
