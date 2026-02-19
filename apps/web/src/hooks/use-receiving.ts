'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type {
  Receipt,
  ReceiptSummary,
  ReceivingItemSearchResult,
  ReorderSuggestion,
  Vendor,
  ReceiptStatus,
} from '@/types/receiving';

// ── List Receipts ───────────────────────────────────────────────

interface UseReceiptsFilters {
  locationId?: string;
  status?: ReceiptStatus;
  vendorId?: string;
  limit?: number;
}

export function useReceipts(filters: UseReceiptsFilters = {}) {
  const queryClient = useQueryClient();

  const result = useInfiniteQuery({
    queryKey: ['receipts', filters] as const,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (filters.locationId) params.set('locationId', filters.locationId);
      if (filters.status) params.set('status', filters.status);
      if (filters.vendorId) params.set('vendorId', filters.vendorId);
      if (filters.limit) params.set('limit', String(filters.limit));
      if (pageParam) params.set('cursor', pageParam);

      return apiFetch<{ data: ReceiptSummary[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/inventory/receiving?${params}`,
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore ? (lastPage.meta.cursor ?? undefined) : undefined,
  });

  const items = result.data?.pages.flatMap((p) => p.data) ?? [];
  const { fetchNextPage, hasNextPage } = result;
  const hasMore = hasNextPage ?? false;

  const loadMore = useCallback(() => {
    if (hasNextPage) fetchNextPage();
  }, [hasNextPage, fetchNextPage]);

  const mutate = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: ['receipts'] });
  }, [queryClient]);

  return {
    items,
    isLoading: result.isLoading,
    error: result.error?.message ?? null,
    hasMore,
    loadMore,
    mutate,
  };
}

// ── Single Receipt ──────────────────────────────────────────────

export function useReceipt(receiptId: string | null) {
  const result = useQuery({
    queryKey: ['receipt', receiptId],
    queryFn: () =>
      apiFetch<{ data: Receipt }>(`/api/v1/inventory/receiving/${receiptId}`).then((r) => r.data),
    enabled: !!receiptId,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error?.message ?? null,
    mutate: result.refetch,
  };
}

// ── Item Search (debounced, with AbortController + LRU cache) ───

const SEARCH_DEBOUNCE_MS = 150;
const SEARCH_CACHE_MAX = 50;

export function useReceivingItemSearch(
  locationId: string | undefined,
  vendorId?: string,
) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ReceivingItemSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  // Simple LRU cache: key → results. Avoids re-fetching identical queries.
  const cacheRef = useRef<Map<string, ReceivingItemSearchResult[]>>(new Map());

  useEffect(() => {
    const trimmed = query.trim();

    if (!locationId || !trimmed) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    // Build cache key from all search parameters
    const cacheKey = `${locationId}:${vendorId ?? ''}:${trimmed.toLowerCase()}`;

    // Check cache first — instant results
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setResults(cached);
      setIsSearching(false);
      return;
    }

    // Cancel any in-flight request from a previous keystroke
    if (abortRef.current) {
      abortRef.current.abort();
    }

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;

      setIsSearching(true);

      const params = new URLSearchParams({ q: trimmed, locationId });
      if (vendorId) params.set('vendorId', vendorId);

      apiFetch<{ data: ReceivingItemSearchResult[] }>(
        `/api/v1/inventory/receiving/search-items?${params}`,
        { signal: controller.signal },
      )
        .then((res) => {
          // Only apply if this controller wasn't aborted
          if (!controller.signal.aborted) {
            setResults(res.data);
            setIsSearching(false);
            // Store in cache (evict oldest if over limit)
            const cache = cacheRef.current;
            if (cache.size >= SEARCH_CACHE_MAX) {
              const oldest = cache.keys().next().value;
              if (oldest !== undefined) cache.delete(oldest);
            }
            cache.set(cacheKey, res.data);
          }
        })
        .catch((err) => {
          // Ignore aborted requests — they are expected
          if (err?.name === 'AbortError' || controller.signal.aborted) return;
          if (!controller.signal.aborted) {
            setResults([]);
            setIsSearching(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [query, locationId, vendorId]);

  // Expose a way to clear cache (e.g., after adding an item changes inventory state)
  const clearCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  return { query, setQuery, results, isSearching, clearCache };
}

// ── Reorder Suggestions ─────────────────────────────────────────

export function useReorderSuggestions(locationId: string | undefined) {
  const result = useQuery({
    queryKey: ['reorder-suggestions', locationId],
    queryFn: () =>
      apiFetch<{ data: ReorderSuggestion[] }>(
        `/api/v1/inventory/receiving/reorder-suggestions?locationId=${locationId}`,
      ).then((r) => r.data),
    enabled: !!locationId,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
  };
}

// ── Vendors ─────────────────────────────────────────────────────

export function useVendors(search?: string, opts?: { minimal?: boolean }) {
  const minimal = opts?.minimal ?? false;

  const result = useQuery({
    queryKey: ['receiving-vendors', search, minimal],
    queryFn: async () => {
      const params = new URLSearchParams({ isActive: 'true' });
      if (search) params.set('search', search);
      if (minimal) params.set('minimal', 'true');
      const res = await apiFetch<{ data: Vendor[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/inventory/vendors?${params}`,
      );
      return res.data;
    },
  });

  return {
    items: result.data ?? [],
    isLoading: result.isLoading,
    mutate: result.refetch,
  };
}
