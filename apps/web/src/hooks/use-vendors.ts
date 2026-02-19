'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();

  const result = useInfiniteQuery({
    queryKey: ['vendors', filters] as const,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.isActive !== undefined) params.set('isActive', String(filters.isActive));
      if (filters.limit) params.set('limit', String(filters.limit));
      if (pageParam) params.set('cursor', pageParam);

      return apiFetch<{ data: VendorSummary[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/inventory/vendors?${params}`,
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
    return queryClient.invalidateQueries({ queryKey: ['vendors'] });
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

// ── Single Vendor ───────────────────────────────────────────────

export function useVendor(vendorId: string | null) {
  const result = useQuery({
    queryKey: ['vendor', vendorId],
    queryFn: () =>
      apiFetch<{ data: VendorDetail }>(`/api/v1/inventory/vendors/${vendorId}`).then((r) => r.data),
    enabled: !!vendorId,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error?.message ?? null,
    mutate: result.refetch,
  };
}

// ── Vendor Catalog ──────────────────────────────────────────────

interface UseVendorCatalogFilters {
  search?: string;
  isActive?: boolean;
  limit?: number;
}

export function useVendorCatalog(vendorId: string | null, filters: UseVendorCatalogFilters = {}) {
  const queryClient = useQueryClient();

  const result = useInfiniteQuery({
    queryKey: ['vendor-catalog', vendorId, filters] as const,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.isActive !== undefined) params.set('isActive', String(filters.isActive));
      if (filters.limit) params.set('limit', String(filters.limit));
      if (pageParam) params.set('cursor', pageParam);

      return apiFetch<{ data: VendorCatalogEntry[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/inventory/vendors/${vendorId}/catalog?${params}`,
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore ? (lastPage.meta.cursor ?? undefined) : undefined,
    enabled: !!vendorId,
  });

  const items = result.data?.pages.flatMap((p) => p.data) ?? [];
  const { fetchNextPage, hasNextPage } = result;
  const hasMore = hasNextPage ?? false;

  const loadMore = useCallback(() => {
    if (hasNextPage) fetchNextPage();
  }, [hasNextPage, fetchNextPage]);

  const mutate = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: ['vendor-catalog', vendorId] });
  }, [queryClient, vendorId]);

  return {
    items,
    isLoading: result.isLoading,
    error: result.error?.message ?? null,
    hasMore,
    loadMore,
    mutate,
  };
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
