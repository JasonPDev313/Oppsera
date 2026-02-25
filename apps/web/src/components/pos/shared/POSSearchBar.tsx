'use client';

import { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Search, User, ShoppingBag, Package, X } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import type { CatalogItemForPOS } from '@/types/pos';

// ── Types ─────────────────────────────────────────────────────────

interface POSSearchBarProps {
  onItemSelect: (item: CatalogItemForPOS) => void;
  onCustomerSelect: (customerId: string, customerName: string) => void;
  onHeldOrderSelect: (orderId: string) => void;
  allItems: CatalogItemForPOS[];
  className?: string;
}

interface CustomerResult {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
}

type SearchMode = 'items' | 'customers' | 'held_orders';

interface ResultItem {
  type: SearchMode;
  id: string;
  label: string;
  sublabel: string | null;
}

interface ResultSection {
  type: SearchMode;
  items: ResultItem[];
  startIndex: number;
}

const MAX_PER_SECTION = 5;
const DEBOUNCE_MS = 300;

const SECTION_META: Record<SearchMode, { label: string; icon: React.ReactNode }> = {
  items: { label: 'Items', icon: <Package className="h-3.5 w-3.5" /> },
  customers: { label: 'Customers', icon: <User className="h-3.5 w-3.5" /> },
  held_orders: { label: 'Held Orders', icon: <ShoppingBag className="h-3.5 w-3.5" /> },
};

// ── Helpers ───────────────────────────────────────────────────────

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function detectMode(query: string): { mode: SearchMode; term: string } {
  if (query.startsWith('@')) return { mode: 'customers', term: query.slice(1).trim() };
  if (query.startsWith('#')) return { mode: 'held_orders', term: query.slice(1).trim() };
  return { mode: 'items', term: query.trim() };
}

function filterItems(items: CatalogItemForPOS[], term: string): CatalogItemForPOS[] {
  if (!term) return [];
  const lower = term.toLowerCase();
  const matches: CatalogItemForPOS[] = [];
  for (const item of items) {
    if (matches.length >= MAX_PER_SECTION) break;
    if (
      item.name.toLowerCase().includes(lower) ||
      (item.sku?.toLowerCase().includes(lower) ?? false) ||
      (item.barcode?.toLowerCase().includes(lower) ?? false)
    ) {
      matches.push(item);
    }
  }
  return matches;
}

function clearAllResults(
  setters: [
    React.Dispatch<React.SetStateAction<CatalogItemForPOS[]>>,
    React.Dispatch<React.SetStateAction<CustomerResult[]>>,
  ],
) {
  setters[0]([]);
  setters[1]([]);
}

// ── Result Row ────────────────────────────────────────────────────

const ResultRow = memo(function ResultRow({
  result, isHighlighted, onSelect, onMouseEnter,
}: {
  result: ResultItem;
  isHighlighted: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
        isHighlighted
          ? 'bg-indigo-600/10 text-indigo-600'
          : 'text-gray-700 hover:bg-gray-200/50'
      }`}
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
    >
      <span className="flex-1 truncate font-medium">{result.label}</span>
      {result.sublabel && (
        <span className="shrink-0 text-xs text-gray-400">
          {result.sublabel}
        </span>
      )}
    </button>
  );
});

// ── Main Component ────────────────────────────────────────────────

export const POSSearchBar = memo(function POSSearchBar({
  onItemSelect, onCustomerSelect, onHeldOrderSelect, allItems, className,
}: POSSearchBarProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [itemResults, setItemResults] = useState<CatalogItemForPOS[]>([]);
  const [customerResults, setCustomerResults] = useState<CustomerResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Build flat result list + grouped sections ───────────────

  const { flatResults, sections } = useMemo(() => {
    const flat: ResultItem[] = [];

    for (const item of itemResults) {
      flat.push({
        type: 'items',
        id: item.id,
        label: item.name,
        sublabel: item.sku ? `${item.sku} - ${formatPrice(item.price)}` : formatPrice(item.price),
      });
    }
    for (const c of customerResults) {
      flat.push({
        type: 'customers',
        id: c.id,
        label: c.displayName,
        sublabel: c.email || c.phone || null,
      });
    }

    // Group consecutive items by type with their starting index
    const groups: ResultSection[] = [];
    let prevType: SearchMode | null = null;
    let group: ResultItem[] = [];
    let groupStart = 0;

    for (let i = 0; i < flat.length; i++) {
      const r = flat[i]!;
      if (r.type !== prevType) {
        if (prevType !== null && group.length > 0) {
          groups.push({ type: prevType, items: group, startIndex: groupStart });
        }
        prevType = r.type;
        group = [r];
        groupStart = i;
      } else {
        group.push(r);
      }
    }
    if (prevType !== null && group.length > 0) {
      groups.push({ type: prevType, items: group, startIndex: groupStart });
    }

    return { flatResults: flat, sections: groups };
  }, [itemResults, customerResults]);

  // ── Search execution ────────────────────────────────────────

  const executeSearch = useCallback(async (rawQuery: string) => {
    const { mode, term } = detectMode(rawQuery);
    if (!term) {
      clearAllResults([setItemResults, setCustomerResults]);
      setIsOpen(false);
      return;
    }

    // Cancel any in-flight API request
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    if (mode === 'items') {
      const matches = filterItems(allItems, term);
      setItemResults(matches);
      setCustomerResults([]);
      setHighlightIndex(0);
      setIsOpen(matches.length > 0);
    } else if (mode === 'customers') {
      setItemResults([]);
      setIsLoading(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await apiFetch<{ data: CustomerResult[] }>(
          `/api/v1/customers?search=${encodeURIComponent(term)}&limit=${MAX_PER_SECTION}`,
          { signal: controller.signal },
        );
        const customers = res.data ?? [];
        setCustomerResults(customers);
        setHighlightIndex(0);
        setIsOpen(customers.length > 0);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setCustomerResults([]);
      } finally {
        setIsLoading(false);
      }
    } else {
      // held_orders: stub — held orders are recalled via the hold/recall workflow
      clearAllResults([setItemResults, setCustomerResults]);
      setIsOpen(false);
    }
  }, [allItems]);

  // ── Debounced input handler ─────────────────────────────────

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      clearAllResults([setItemResults, setCustomerResults]);
      setIsOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => executeSearch(value), DEBOUNCE_MS);
  }, [executeSearch]);

  // ── Selection handler ───────────────────────────────────────

  const handleSelect = useCallback((result: ResultItem) => {
    if (result.type === 'items') {
      const item = allItems.find((i) => i.id === result.id);
      if (item) onItemSelect(item);
    } else if (result.type === 'customers') {
      onCustomerSelect(result.id, result.label);
    } else {
      onHeldOrderSelect(result.id);
    }
    setQuery('');
    setIsOpen(false);
    setItemResults([]);
    setCustomerResults([]);
    inputRef.current?.blur();
  }, [allItems, onItemSelect, onCustomerSelect, onHeldOrderSelect]);

  // ── Keyboard navigation ─────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || flatResults.length === 0) {
      if (e.key === 'Escape') {
        setQuery('');
        setIsOpen(false);
        inputRef.current?.blur();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((i) => (i < flatResults.length - 1 ? i + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((i) => (i > 0 ? i - 1 : flatResults.length - 1));
        break;
      case 'Enter': {
        e.preventDefault();
        const selected = flatResults[highlightIndex];
        if (selected) handleSelect(selected);
        break;
      }
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setQuery('');
        inputRef.current?.blur();
        break;
    }
  }, [isOpen, flatResults, highlightIndex, handleSelect]);

  // ── `/` keyboard shortcut to focus ──────────────────────────

  useEffect(() => {
    function onGlobalKey(e: KeyboardEvent) {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onGlobalKey);
    return () => document.removeEventListener('keydown', onGlobalKey);
  }, []);

  // ── Click outside to close ──────────────────────────────────

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  // ── Cleanup on unmount ──────────────────────────────────────

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
  }, []);

  // ── Clear button ────────────────────────────────────────────

  const handleClear = useCallback(() => {
    setQuery('');
    setIsOpen(false);
    setItemResults([]);
    setCustomerResults([]);
    inputRef.current?.focus();
  }, []);

  // ── Render ──────────────────────────────────────────────────

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (flatResults.length > 0) setIsOpen(true); }}
          placeholder="Search items, @customers, #held orders..."
          className="w-full rounded-lg border border-gray-200 bg-surface py-2.5 pl-10 pr-10 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
        />
        {query ? (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 transition-colors hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">
            /
          </kbd>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && flatResults.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-80 overflow-y-auto rounded-lg border border-gray-200 bg-surface shadow-lg">
          {sections.map((section) => (
            <div key={section.type}>
              <div className="flex items-center gap-1.5 border-b border-gray-100 px-3 py-1.5">
                <span className="text-gray-400">{SECTION_META[section.type].icon}</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {SECTION_META[section.type].label}
                </span>
              </div>
              {section.items.map((result, i) => (
                <ResultRow
                  key={result.id}
                  result={result}
                  isHighlighted={highlightIndex === section.startIndex + i}
                  onSelect={() => handleSelect(result)}
                  onMouseEnter={() => setHighlightIndex(section.startIndex + i)}
                />
              ))}
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center justify-center py-3">
              <span className="text-xs text-gray-400">Searching...</span>
            </div>
          )}
        </div>
      )}

      {/* Loading state when no results yet */}
      {isOpen && flatResults.length === 0 && isLoading && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 rounded-lg border border-gray-200 bg-surface px-3 py-4 shadow-lg">
          <p className="text-center text-xs text-gray-400">Searching...</p>
        </div>
      )}
    </div>
  );
});
