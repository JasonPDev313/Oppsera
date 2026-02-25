'use client';

import { useCallback } from 'react';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { Order } from '@/types/pos';

// ── Order Filters ─────────────────────────────────────────────────

export interface OrderFilters {
  status?: string;
  businessDate?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  paymentMethod?: string;
  employeeId?: string;
  terminalId?: string;
  sortBy?: 'createdAt' | 'total' | 'orderNumber';
  sortDir?: 'asc' | 'desc';
  locationId?: string;
}

// ── Orders List ───────────────────────────────────────────────────

export function useOrders(filters: OrderFilters) {
  const queryClient = useQueryClient();

  const locationHeaders = filters.locationId
    ? { 'X-Location-Id': filters.locationId }
    : undefined;

  const result = useInfiniteQuery({
    queryKey: ['orders', filters] as const,
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      if (filters.locationId) params.set('locationId', filters.locationId);
      if (filters.status) params.set('status', filters.status);
      if (filters.businessDate) params.set('businessDate', filters.businessDate);
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      if (filters.search) params.set('search', filters.search);
      if (filters.paymentMethod) params.set('paymentMethod', filters.paymentMethod);
      if (filters.employeeId) params.set('employeeId', filters.employeeId);
      if (filters.terminalId) params.set('terminalId', filters.terminalId);
      if (filters.sortBy) params.set('sortBy', filters.sortBy);
      if (filters.sortDir) params.set('sortDir', filters.sortDir);
      if (pageParam) params.set('cursor', pageParam);
      params.set('limit', '50');

      return apiFetch<{
        data: Order[];
        meta: { cursor: string | null; hasMore: boolean };
      }>(
        `/api/v1/orders?${params.toString()}`,
        { headers: locationHeaders ?? undefined, signal },
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
    return queryClient.invalidateQueries({ queryKey: ['orders'] });
  }, [queryClient]);

  return { data, isLoading: result.isLoading, error: result.error, hasMore, loadMore, mutate };
}

// ── Single Order ──────────────────────────────────────────────────

export function useOrder(orderId: string | null, locationId?: string) {
  const headers = locationId ? { 'X-Location-Id': locationId } : undefined;

  const result = useQuery({
    queryKey: ['order', orderId, locationId],
    queryFn: () =>
      apiFetch<{ data: Order }>(
        `/api/v1/orders/${orderId}`,
        headers ? { headers } : undefined,
      ).then((r) => r.data),
    enabled: !!orderId,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}
