'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { adminFetch } from '@/lib/api-fetch';

// ── Types ────────────────────────────────────────────────────────

export interface SearchResults {
  tenants: SearchTenant[];
  users: SearchUser[];
  customers: SearchCustomer[];
  orders: SearchOrder[];
  locations: SearchLocation[];
  terminals: SearchTerminal[];
  totalResults: number;
  query: string;
  searchTimeMs: number;
}

export interface SearchTenant {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  status: string;
  match_field: string;
}

export interface SearchUser {
  id: string;
  name: string;
  email: string;
  tenant_id: string;
  tenant_name: string;
  status: string;
  match_field: string;
}

export interface SearchCustomer {
  id: string;
  display_name: string;
  email: string | null;
  tenant_id: string;
  tenant_name: string;
  match_field: string;
}

export interface SearchOrder {
  id: string;
  order_number: string;
  tenant_id: string;
  tenant_name: string;
  total: number;
  status: string;
  business_date: string;
  match_field: string;
}

export interface SearchLocation {
  id: string;
  name: string;
  tenant_id: string;
  tenant_name: string;
  location_type: string;
  is_active: boolean;
  match_field: string;
}

export interface SearchTerminal {
  id: string;
  name: string;
  tenant_id: string;
  tenant_name: string;
  location_name: string | null;
  status: string;
  match_field: string;
}

export interface RecentSearch {
  id: string;
  searchQuery: string | null;
  entityType: string | null;
  entityId: string | null;
  entityLabel: string;
  searchedAt: string;
}

// ── useGlobalSearch ──────────────────────────────────────────────

export function useGlobalSearch() {
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((query: string, options?: { limit?: number; tenantId?: string }) => {
    // Cancel previous request
    abortRef.current?.abort();

    // Clear debounce
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setResults(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const params = new URLSearchParams({ q: query });
        if (options?.limit) params.set('limit', String(options.limit));
        if (options?.tenantId) params.set('tenant_id', options.tenantId);

        const json = await adminFetch<{ data: SearchResults }>(`/api/v1/search?${params}`, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setResults(json.data);
          setError(null);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!abortRef.current?.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Search failed');
        }
      } finally {
        if (!abortRef.current?.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, 200);
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setResults(null);
    setIsLoading(false);
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { results, isLoading, error, search, clear };
}

// ── useRecentSearches ────────────────────────────────────────────

export function useRecentSearches() {
  const [items, setItems] = useState<RecentSearch[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const json = await adminFetch<{ data: RecentSearch[] }>('/api/v1/search/recent');
      setItems(json.data ?? []);
    } catch {
      // silent fail
    } finally {
      setIsLoading(false);
    }
  }, []);

  const save = useCallback(async (entry: {
    query?: string;
    entityType?: string;
    entityId?: string;
    entityLabel: string;
  }) => {
    try {
      await adminFetch('/api/v1/search/recent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: entry.query,
          entity_type: entry.entityType,
          entity_id: entry.entityId,
          entity_label: entry.entityLabel,
        }),
      });
    } catch {
      // silent fail
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { items, isLoading, save, reload: load };
}
