'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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

// Module-level cache — shared across mounts, survives re-renders
let _customerCache: CustomerSearchResult[] | null = null;
let _cacheLoadedAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const FETCH_TIMEOUT = 8_000; // 8s — fail fast rather than spin forever

async function loadCustomers(signal?: AbortSignal): Promise<CustomerSearchResult[]> {
  if (_customerCache && Date.now() - _cacheLoadedAt < CACHE_TTL) {
    return _customerCache;
  }
  try {
    const res = await apiFetch<{ data: CustomerSearchResult[] }>(
      '/api/v1/customers/search',
      signal ? { signal } : {},
    );
    _customerCache = res.data;
    _cacheLoadedAt = Date.now();
  } catch {
    // Keep stale cache if fetch fails — return whatever we have
  }
  return _customerCache ?? [];
}

function filterCustomers(
  customers: CustomerSearchResult[],
  query: string,
): CustomerSearchResult[] {
  const q = query.toLowerCase();
  return customers
    .filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.includes(q),
    )
    .slice(0, 10);
}

export function CustomerAttachment({
  customerId,
  customerName,
  onAttach,
  onDetach,
  onViewProfile,
}: CustomerAttachmentProps) {
  const [query, setQuery] = useState('');
  const [allCustomers, setAllCustomers] = useState<CustomerSearchResult[]>(
    _customerCache ?? [],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [attachedName, setAttachedName] = useState<string | null>(null);
  const [showChangeSearch, setShowChangeSearch] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Eagerly load all customers on mount
  useEffect(() => {
    if (_customerCache && Date.now() - _cacheLoadedAt < CACHE_TTL) {
      setAllCustomers(_customerCache);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    setIsLoading(true);
    loadCustomers(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setAllCustomers(data);
      })
      .catch(() => {
        // Swallow — loadCustomers already handles errors internally
      })
      .finally(() => {
        clearTimeout(timer);
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  // Auto-resolve customer name when customerId is present but name is unknown
  useEffect(() => {
    if (!customerId || customerName || attachedName) return;

    // Try resolving from cache first — no API call needed
    const cached = allCustomers.find((c) => c.id === customerId);
    if (cached) {
      setAttachedName(cached.displayName);
      return;
    }

    let cancelled = false;
    apiFetch<{ data: { displayName: string } }>(
      `/api/v1/customers/${encodeURIComponent(customerId)}`,
    )
      .then((res) => {
        if (!cancelled && res.data.displayName) {
          setAttachedName(res.data.displayName);
        }
      })
      .catch(() => {
        // Silently fail — will show customerId as fallback
      });

    return () => {
      cancelled = true;
    };
  }, [customerId, customerName, attachedName, allCustomers]);

  // Filter locally — instant, no API call
  const filtered = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed.length < 1) return allCustomers.slice(0, 10);
    return filterCustomers(allCustomers, trimmed);
  }, [query, allCustomers]);

  const handleFocus = useCallback(() => {
    setShowDropdown(true);
    // Refresh cache in the background if stale
    if (Date.now() - _cacheLoadedAt > CACHE_TTL) {
      loadCustomers().then((data) => setAllCustomers(data)).catch(() => {});
    }
  }, []);

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
            onFocus={handleFocus}
            placeholder={customerId ? 'Search for a different customer...' : 'Search customer by name, phone, or email...'}
            className="h-8 w-full rounded-md border border-gray-300 bg-surface pl-8 pr-8 text-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            autoFocus={showChangeSearch}
          />
          {isLoading && (
            <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-gray-400" />
          )}
        </div>
        {customerId && showChangeSearch && (
          <button
            type="button"
            onClick={() => {
              setShowChangeSearch(false);
              setQuery('');
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
                setShowDropdown(false);
              }}
              className="flex w-full items-center gap-3 border-b border-gray-100 px-3 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              Remove customer from order
            </button>
          )}
          {filtered.length === 0 && !isLoading ? (
            <div className="px-3 py-3 text-center text-sm text-gray-400">
              {allCustomers.length === 0 && !query.trim() ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsLoading(true);
                    loadCustomers()
                      .then((data) => setAllCustomers(data))
                      .catch(() => {})
                      .finally(() => setIsLoading(false));
                  }}
                  className="text-indigo-500 hover:text-indigo-600"
                >
                  Retry loading customers
                </button>
              ) : (
                'No customers found'
              )}
            </div>
          ) : filtered.length === 0 && isLoading ? (
            <div className="px-3 py-3 text-center text-sm text-gray-400">
              Loading customers...
            </div>
          ) : (
            filtered.map((customer) => (
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
