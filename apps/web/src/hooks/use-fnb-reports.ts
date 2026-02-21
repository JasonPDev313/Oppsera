'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

interface ReportFilters {
  locationId: string;
  startDate: string;
  endDate: string;
  [key: string]: string | number | boolean | undefined;
}

function useFnbReport<T>(endpoint: string) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(
    async (filters: ReportFilters) => {
      setIsLoading(true);
      setError(null);
      try {
        const qs = buildQueryString(filters);
        const res = await apiFetch<{ data: T }>(`/api/v1/fnb/reports/${endpoint}${qs}`);
        setData(res.data);
        return res.data;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load report');
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [endpoint],
  );

  return { data, isLoading, error, fetch };
}

export function useTableTurns() {
  return useFnbReport<unknown>('table-turns');
}

export function useKitchenPerformance() {
  return useFnbReport<unknown>('kitchen-performance');
}

export function useDaypartSales() {
  return useFnbReport<unknown>('daypart-sales');
}

export function useMenuMix() {
  return useFnbReport<unknown>('menu-mix');
}

export function useDiscountComp() {
  return useFnbReport<unknown>('discount-comp');
}

export function useHourlySales() {
  return useFnbReport<unknown>('hourly-sales');
}

export function useServerPerformance() {
  return useFnbReport<unknown>('server-performance');
}
