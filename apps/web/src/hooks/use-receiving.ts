'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [items, setItems] = useState<ReceiptSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReceipts = useCallback(async (nextCursor?: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (filters.locationId) params.set('locationId', filters.locationId);
      if (filters.status) params.set('status', filters.status);
      if (filters.vendorId) params.set('vendorId', filters.vendorId);
      if (filters.limit) params.set('limit', String(filters.limit));
      if (nextCursor) params.set('cursor', nextCursor);

      const res = await apiFetch<{ data: ReceiptSummary[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/inventory/receiving?${params}`,
      );
      if (nextCursor) {
        setItems((prev) => [...prev, ...res.data]);
      } else {
        setItems(res.data);
      }
      setCursor(res.meta.cursor);
      setHasMore(res.meta.hasMore);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load receipts');
    } finally {
      setIsLoading(false);
    }
  }, [filters.locationId, filters.status, filters.vendorId, filters.limit]);

  useEffect(() => {
    fetchReceipts();
  }, [fetchReceipts]);

  const loadMore = useCallback(() => {
    if (cursor && hasMore) fetchReceipts(cursor);
  }, [cursor, hasMore, fetchReceipts]);

  const mutate = useCallback(() => fetchReceipts(), [fetchReceipts]);

  return { items, isLoading, error, hasMore, loadMore, mutate };
}

// ── Single Receipt ──────────────────────────────────────────────

export function useReceipt(receiptId: string | null) {
  const [data, setData] = useState<Receipt | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReceipt = useCallback(async () => {
    if (!receiptId) return;
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<{ data: Receipt }>(
        `/api/v1/inventory/receiving/${receiptId}`,
      );
      setData(res.data);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load receipt');
    } finally {
      setIsLoading(false);
    }
  }, [receiptId]);

  useEffect(() => {
    fetchReceipt();
  }, [fetchReceipt]);

  const mutate = useCallback(() => fetchReceipt(), [fetchReceipt]);

  return { data, isLoading, error, mutate };
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
  const [data, setData] = useState<ReorderSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!locationId) return;
    setIsLoading(true);
    apiFetch<{ data: ReorderSuggestion[] }>(
      `/api/v1/inventory/receiving/reorder-suggestions?locationId=${locationId}`,
    )
      .then((res) => setData(res.data))
      .catch(() => setData([]))
      .finally(() => setIsLoading(false));
  }, [locationId]);

  return { data, isLoading };
}

// ── Vendors ─────────────────────────────────────────────────────

export function useVendors(search?: string, opts?: { minimal?: boolean }) {
  const [items, setItems] = useState<Vendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const minimal = opts?.minimal ?? false;

  const fetchVendors = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({ isActive: 'true' });
      if (search) params.set('search', search);
      if (minimal) params.set('minimal', 'true');
      const res = await apiFetch<{ data: Vendor[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/inventory/vendors?${params}`,
      );
      setItems(res.data);
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [search, minimal]);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const mutate = useCallback(() => fetchVendors(), [fetchVendors]);

  return { items, isLoading, mutate };
}
