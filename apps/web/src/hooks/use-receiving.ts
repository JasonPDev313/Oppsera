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

// ── Item Search (debounced 300ms) ───────────────────────────────

export function useReceivingItemSearch(
  locationId: string | undefined,
  vendorId?: string,
) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ReceivingItemSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!locationId || !query.trim()) {
      setResults([]);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      try {
        setIsSearching(true);
        const params = new URLSearchParams({ q: query, locationId });
        if (vendorId) params.set('vendorId', vendorId);
        const res = await apiFetch<{ data: ReceivingItemSearchResult[] }>(
          `/api/v1/inventory/receiving/search-items?${params}`,
        );
        setResults(res.data);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, locationId, vendorId]);

  return { query, setQuery, results, isSearching };
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

export function useVendors(search?: string) {
  const [items, setItems] = useState<Vendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchVendors = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({ isActive: 'true' });
      if (search) params.set('search', search);
      const res = await apiFetch<{ data: Vendor[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/inventory/vendors?${params}`,
      );
      setItems(res.data);
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const mutate = useCallback(() => fetchVendors(), [fetchVendors]);

  return { items, isLoading, mutate };
}
