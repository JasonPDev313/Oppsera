'use client';

import { useCallback } from 'react';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { InventoryItem, InventoryMovement } from '@/types/inventory';

interface UseInventoryOptions {
  locationId?: string;
  status?: string;
  itemType?: string;
  search?: string;
  lowStockOnly?: boolean;
}

export function useInventory(options: UseInventoryOptions = {}) {
  const queryClient = useQueryClient();

  const result = useInfiniteQuery({
    queryKey: ['inventory', options] as const,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (options.locationId) params.set('locationId', options.locationId);
      if (options.status) params.set('status', options.status);
      if (options.itemType) params.set('itemType', options.itemType);
      if (options.search) params.set('search', options.search);
      if (options.lowStockOnly) params.set('lowStockOnly', 'true');
      if (pageParam) params.set('cursor', pageParam);

      return apiFetch<{ data: InventoryItem[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/inventory?${params.toString()}`
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore ? (lastPage.meta.cursor ?? undefined) : undefined,
  });

  const data = result.data?.pages.flatMap((p) => p.data) ?? [];
  const { fetchNextPage, hasNextPage } = result;
  const hasMore = hasNextPage ?? false;

  const loadMore = useCallback(() => {
    if (hasNextPage) fetchNextPage();
  }, [hasNextPage, fetchNextPage]);

  const mutate = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: ['inventory'] });
  }, [queryClient]);

  return { data, isLoading: result.isLoading, error: result.error, hasMore, loadMore, mutate };
}

export function useInventoryItem(itemId: string | null) {
  const result = useQuery({
    queryKey: ['inventory-item', itemId],
    queryFn: () =>
      apiFetch<{ data: InventoryItem }>(`/api/v1/inventory/${itemId}`).then((r) => r.data),
    enabled: !!itemId,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

export function useMovements(itemId: string | null) {
  const queryClient = useQueryClient();

  const result = useInfiniteQuery({
    queryKey: ['movements', itemId] as const,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) params.set('cursor', pageParam);

      return apiFetch<{ data: InventoryMovement[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/inventory/${itemId}/movements?${params.toString()}`
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore ? (lastPage.meta.cursor ?? undefined) : undefined,
    enabled: !!itemId,
  });

  const data = result.data?.pages.flatMap((p) => p.data) ?? [];
  const { fetchNextPage, hasNextPage } = result;
  const hasMore = hasNextPage ?? false;

  const loadMore = useCallback(() => {
    if (hasNextPage) fetchNextPage();
  }, [hasNextPage, fetchNextPage]);

  const mutate = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: ['movements', itemId] });
  }, [queryClient, itemId]);

  return { data, isLoading: result.isLoading, error: result.error, hasMore, loadMore, mutate };
}
