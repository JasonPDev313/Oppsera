'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import type { Order } from '@/types/pos';

// ── Generic fetcher ───────────────────────────────────────────────

function useFetch<T>(url: string | null, headers?: Record<string, string>) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    if (!url) {
      setData(null);
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: T }>(url, headers ? { headers } : undefined);
      setData(res.data);
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Fetch failed');
      setError(e);
      toast.error(e.message);
    } finally {
      setIsLoading(false);
    }
  }, [url, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

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
  const [items, setItems] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const { toast } = useToast();

  const locationHeaders = filters.locationId
    ? { 'X-Location-Id': filters.locationId }
    : undefined;

  const fetchOrders = useCallback(
    async (appendCursor?: string) => {
      if (!filters.locationId) return;
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
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
        if (appendCursor) params.set('cursor', appendCursor);
        params.set('limit', '50');

        const res = await apiFetch<{
          data: Order[];
          meta: { cursor: string | null; hasMore: boolean };
        }>(`/api/v1/orders?${params.toString()}`, locationHeaders ? { headers: locationHeaders } : undefined);

        if (appendCursor) {
          setItems((prev) => [...prev, ...res.data]);
        } else {
          setItems(res.data);
        }
        setCursor(res.meta.cursor ?? undefined);
        setHasMore(res.meta.hasMore);
      } catch (err) {
        const e = err instanceof Error ? err : new Error('Failed to load orders');
        setError(e);
        toast.error(e.message);
      } finally {
        setIsLoading(false);
      }
    },
    [
      filters.status, filters.businessDate, filters.dateFrom, filters.dateTo,
      filters.search, filters.paymentMethod, filters.employeeId, filters.terminalId,
      filters.sortBy, filters.sortDir, filters.locationId, toast,
    ],
  );

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const loadMore = useCallback(() => {
    if (cursor) fetchOrders(cursor);
  }, [cursor, fetchOrders]);

  return { data: items, isLoading, error, hasMore, loadMore, mutate: () => fetchOrders() };
}

// ── Single Order ──────────────────────────────────────────────────

export function useOrder(orderId: string | null, locationId?: string) {
  const headers = locationId ? { 'X-Location-Id': locationId } : undefined;
  return useFetch<Order>(orderId ? `/api/v1/orders/${orderId}` : null, headers);
}
