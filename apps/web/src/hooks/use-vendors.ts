'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import type {
  VendorSummary,
  VendorDetail,
  VendorSearchResult,
  VendorCatalogEntry,
  VendorFormInput,
  VendorCatalogItemInput,
} from '@/types/vendors';

// ── Vendor List ─────────────────────────────────────────────────

interface UseVendorsFilters {
  search?: string;
  isActive?: boolean;
  limit?: number;
}

export function useVendors(filters: UseVendorsFilters = {}) {
  const [items, setItems] = useState<VendorSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVendors = useCallback(async (nextCursor?: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.isActive !== undefined) params.set('isActive', String(filters.isActive));
      if (filters.limit) params.set('limit', String(filters.limit));
      if (nextCursor) params.set('cursor', nextCursor);

      const res = await apiFetch<{ data: VendorSummary[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/inventory/vendors?${params}`,
      );
      if (nextCursor) {
        setItems((prev) => [...prev, ...res.data]);
      } else {
        setItems(res.data);
      }
      setCursor(res.meta.cursor);
      setHasMore(res.meta.hasMore);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load vendors');
    } finally {
      setIsLoading(false);
    }
  }, [filters.search, filters.isActive, filters.limit]);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const loadMore = useCallback(() => {
    if (cursor && hasMore) fetchVendors(cursor);
  }, [cursor, hasMore, fetchVendors]);

  const mutate = useCallback(() => {
    setCursor(null);
    fetchVendors();
  }, [fetchVendors]);

  return { items, isLoading, error, hasMore, loadMore, mutate };
}

// ── Single Vendor ───────────────────────────────────────────────

export function useVendor(vendorId: string | null) {
  const [data, setData] = useState<VendorDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVendor = useCallback(async () => {
    if (!vendorId) return;
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<{ data: VendorDetail }>(
        `/api/v1/inventory/vendors/${vendorId}`,
      );
      setData(res.data);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load vendor');
    } finally {
      setIsLoading(false);
    }
  }, [vendorId]);

  useEffect(() => {
    fetchVendor();
  }, [fetchVendor]);

  const mutate = useCallback(() => fetchVendor(), [fetchVendor]);

  return { data, isLoading, error, mutate };
}

// ── Vendor Catalog ──────────────────────────────────────────────

interface UseVendorCatalogFilters {
  search?: string;
  isActive?: boolean;
  limit?: number;
}

export function useVendorCatalog(vendorId: string | null, filters: UseVendorCatalogFilters = {}) {
  const [items, setItems] = useState<VendorCatalogEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCatalog = useCallback(async (nextCursor?: string) => {
    if (!vendorId) return;
    try {
      setIsLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.isActive !== undefined) params.set('isActive', String(filters.isActive));
      if (filters.limit) params.set('limit', String(filters.limit));
      if (nextCursor) params.set('cursor', nextCursor);

      const res = await apiFetch<{ data: VendorCatalogEntry[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/inventory/vendors/${vendorId}/catalog?${params}`,
      );
      if (nextCursor) {
        setItems((prev) => [...prev, ...res.data]);
      } else {
        setItems(res.data);
      }
      setCursor(res.meta.cursor);
      setHasMore(res.meta.hasMore);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load catalog');
    } finally {
      setIsLoading(false);
    }
  }, [vendorId, filters.search, filters.isActive, filters.limit]);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  const loadMore = useCallback(() => {
    if (cursor && hasMore) fetchCatalog(cursor);
  }, [cursor, hasMore, fetchCatalog]);

  const mutate = useCallback(() => {
    setCursor(null);
    fetchCatalog();
  }, [fetchCatalog]);

  return { items, isLoading, error, hasMore, loadMore, mutate };
}

// ── Vendor Search (lightweight, for picker dropdowns) ───────────

export function useVendorSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<VendorSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      try {
        setIsSearching(true);
        const params = new URLSearchParams({ q: query });
        const res = await apiFetch<{ data: VendorSearchResult[] }>(
          `/api/v1/inventory/vendors/search?${params}`,
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
  }, [query]);

  return { query, setQuery, results, isSearching };
}

// ── Vendor Mutations ────────────────────────────────────────────

export function useVendorMutations() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createVendor = useCallback(async (input: VendorFormInput) => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch<{ data: VendorDetail }>('/api/v1/inventory/vendors', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return res.data;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const updateVendor = useCallback(async (vendorId: string, input: Partial<VendorFormInput>) => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch<{ data: VendorDetail }>(`/api/v1/inventory/vendors/${vendorId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
      return res.data;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const deactivateVendor = useCallback(async (vendorId: string) => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch<{ data: VendorDetail }>(`/api/v1/inventory/vendors/${vendorId}/deactivate`, {
        method: 'POST',
      });
      return res.data;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const reactivateVendor = useCallback(async (vendorId: string) => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch<{ data: VendorDetail }>(`/api/v1/inventory/vendors/${vendorId}/reactivate`, {
        method: 'POST',
      });
      return res.data;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const addCatalogItem = useCallback(async (vendorId: string, input: VendorCatalogItemInput) => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch<{ data: VendorCatalogEntry }>(`/api/v1/inventory/vendors/${vendorId}/catalog`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return res.data;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const updateCatalogItem = useCallback(async (vendorId: string, itemVendorId: string, input: Partial<VendorCatalogItemInput>) => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch<{ data: VendorCatalogEntry }>(`/api/v1/inventory/vendors/${vendorId}/catalog/${itemVendorId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
      return res.data;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const removeCatalogItem = useCallback(async (vendorId: string, itemVendorId: string) => {
    setIsSubmitting(true);
    try {
      await apiFetch(`/api/v1/inventory/vendors/${vendorId}/catalog/${itemVendorId}`, {
        method: 'DELETE',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return {
    isSubmitting,
    createVendor,
    updateVendor,
    deactivateVendor,
    reactivateVendor,
    addCatalogItem,
    updateCatalogItem,
    removeCatalogItem,
  };
}
