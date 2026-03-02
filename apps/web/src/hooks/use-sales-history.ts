'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type { SalesHistoryItem, SalesHistorySummary } from '@oppsera/module-reporting';

export interface SalesHistoryFilters {
  sources?: string[];
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  status?: string;
  paymentMethod?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  locationId?: string;
}

interface SalesHistoryResponse {
  data: SalesHistoryItem[];
  summary: SalesHistorySummary;
  meta: { cursor: string | null; hasMore: boolean };
}

const LIMIT = 25;

export function useSalesHistory(filters: SalesHistoryFilters) {
  const [allItems, setAllItems] = useState<SalesHistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const queryParams = useMemo(() => {
    const params: Record<string, string | undefined> = {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      search: filters.search || undefined,
      status: filters.status || undefined,
      paymentMethod: filters.paymentMethod || undefined,
      sortBy: filters.sortBy || 'occurred_at',
      sortDir: filters.sortDir || 'desc',
      locationId: filters.locationId,
      limit: String(LIMIT),
    };
    if (filters.sources && filters.sources.length > 0) {
      params.sources = filters.sources.join(',');
    }
    return params;
  }, [filters]);

  const queryKey = ['sales-history', queryParams];

  const { data, isLoading, error, refetch } = useQuery<SalesHistoryResponse>({
    queryKey,
    queryFn: async ({ signal }) => {
      const qs = buildQueryString(queryParams);
      const res = await apiFetch<SalesHistoryResponse>(
        `/api/v1/reports/sales-history${qs}`,
        { signal },
      );
      // Reset accumulated items on fresh fetch
      setAllItems(res.data);
      setCursor(res.meta.cursor);
      setHasMore(res.meta.hasMore);
      return res;
    },
    staleTime: 30_000,
  });

  // Sync React Query cached data into local state on remount
  // (queryFn only runs when cache is stale, but useState resets on remount)
  useEffect(() => {
    if (data && allItems.length === 0) {
      setAllItems(data.data);
      setCursor(data.meta.cursor);
      setHasMore(data.meta.hasMore);
    }
  }, [data]);

  const loadMore = useCallback(async () => {
    if (!cursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const params = { ...queryParams, cursor };
      const qs = buildQueryString(params);
      const res = await apiFetch<SalesHistoryResponse>(
        `/api/v1/reports/sales-history${qs}`,
      );
      setAllItems((prev) => [...prev, ...res.data]);
      setCursor(res.meta.cursor);
      setHasMore(res.meta.hasMore);
    } finally {
      setIsLoadingMore(false);
    }
  }, [cursor, isLoadingMore, queryParams]);

  return {
    items: allItems,
    summary: data?.summary ?? null,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
    refetch,
  };
}
