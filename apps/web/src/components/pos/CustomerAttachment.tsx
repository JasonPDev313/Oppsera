'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { User, UserPlus, RefreshCw, Eye, Search, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

interface CustomerSearchResult {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  type: 'person' | 'organization';
}

interface CustomerAttachmentProps {
  customerId: string | null;
  customerName?: string | null;
  onAttach: (customerId: string) => void;
  onDetach: () => void;
  onViewProfile?: (customerId: string) => void;
}

export function CustomerAttachment({
  customerId,
  customerName,
  onAttach,
  onDetach,
  onViewProfile,
}: CustomerAttachmentProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [attachedName, setAttachedName] = useState<string | null>(null);
  const [showChangeSearch, setShowChangeSearch] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search customers as user types
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await apiFetch<{ data: CustomerSearchResult[] }>(
          `/api/v1/customers/search?search=${encodeURIComponent(trimmed)}`,
        );
        setResults(res.data);
        setShowDropdown(true);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setShowChangeSearch(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = useCallback(
    (customer: CustomerSearchResult) => {
      onAttach(customer.id);
      setAttachedName(customer.displayName);
      setQuery('');
      setResults([]);
      setShowDropdown(false);
      setShowChangeSearch(false);
    },
    [onAttach],
  );

  // Customer is attached — show name with View Profile + Change Customer
  if (customerId && !showChangeSearch) {
    const displayLabel = customerName || attachedName || customerId;
    return (
      <div ref={containerRef} className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-md bg-indigo-50 px-2.5 py-1.5">
          <User className="h-3.5 w-3.5 text-indigo-500" />
          <span className="text-sm font-medium text-indigo-700 max-w-40 truncate">{displayLabel}</span>
        </div>
        <button
          type="button"
          onClick={() => onViewProfile?.(customerId)}
          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50"
          title="View customer profile"
        >
          <Eye className="h-3.5 w-3.5" />
          View Profile
        </button>
        <button
          type="button"
          onClick={() => {
            setShowChangeSearch(true);
            setQuery('');
          }}
          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          title="Change or detach customer"
        >
          <RefreshCw className="h-3 w-3" />
          Change
        </button>
      </div>
    );
  }

  // "Change Customer" search mode or no customer attached
  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (results.length > 0) setShowDropdown(true);
            }}
            placeholder={customerId ? 'Search for a different customer...' : 'Search customer by name, phone, or email...'}
            className="h-8 w-full rounded-md border border-gray-300 bg-surface pl-8 pr-8 text-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            autoFocus={showChangeSearch}
          />
          {isSearching && (
            <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-gray-400" />
          )}
        </div>
        {customerId && showChangeSearch && (
          <button
            type="button"
            onClick={() => {
              setShowChangeSearch(false);
              setQuery('');
              setResults([]);
              setShowDropdown(false);
            }}
            className="shrink-0 text-xs font-medium text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        )}
        {!customerId && (
          <div className="flex shrink-0 items-center gap-1 text-xs text-gray-400">
            <UserPlus className="h-3.5 w-3.5" />
            Attach Customer
          </div>
        )}
      </div>

      {/* Search results dropdown */}
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-surface shadow-lg">
          {/* If changing customer, show "Remove customer" option */}
          {customerId && showChangeSearch && (
            <button
              type="button"
              onClick={() => {
                onDetach();
                setAttachedName(null);
                setShowChangeSearch(false);
                setQuery('');
                setResults([]);
                setShowDropdown(false);
              }}
              className="flex w-full items-center gap-3 border-b border-gray-100 px-3 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              Remove customer from order
            </button>
          )}
          {results.length === 0 ? (
            <div className="px-3 py-3 text-center text-sm text-gray-400">
              No customers found
            </div>
          ) : (
            results.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => handleSelect(customer)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-indigo-50"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                  {customer.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {customer.displayName}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {[customer.email, customer.phone].filter(Boolean).join(' \u00B7 ') || customer.type}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
