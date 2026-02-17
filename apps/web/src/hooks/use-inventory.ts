'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [data, setData] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);

  const fetchData = useCallback(async (loadMore = false) => {
    try {
      if (!loadMore) setIsLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (options.locationId) params.set('locationId', options.locationId);
      if (options.status) params.set('status', options.status);
      if (options.itemType) params.set('itemType', options.itemType);
      if (options.search) params.set('search', options.search);
      if (options.lowStockOnly) params.set('lowStockOnly', 'true');
      if (loadMore && cursorRef.current) params.set('cursor', cursorRef.current);

      const res = await apiFetch<{ data: InventoryItem[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/inventory?${params.toString()}`
      );
      if (loadMore) {
        setData((prev) => [...prev, ...res.data]);
      } else {
        setData(res.data);
      }
      cursorRef.current = res.meta.cursor;
      setHasMore(res.meta.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load inventory'));
    } finally {
      setIsLoading(false);
    }
  }, [options.locationId, options.status, options.itemType, options.search, options.lowStockOnly]);

  useEffect(() => {
    cursorRef.current = null;
    fetchData();
  }, [fetchData]);

  const loadMore = useCallback(() => fetchData(true), [fetchData]);
  const mutate = useCallback(() => {
    cursorRef.current = null;
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, hasMore, loadMore, mutate };
}

export function useInventoryItem(itemId: string | null) {
  const [data, setData] = useState<InventoryItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!itemId) return;
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<{ data: InventoryItem }>(`/api/v1/inventory/${itemId}`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load inventory item'));
    } finally {
      setIsLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const mutate = () => fetchData();
  return { data, isLoading, error, mutate };
}

export function useMovements(itemId: string | null) {
  const [data, setData] = useState<InventoryMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);

  const fetchData = useCallback(async (loadMore = false) => {
    if (!itemId) return;
    try {
      if (!loadMore) setIsLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (loadMore && cursorRef.current) params.set('cursor', cursorRef.current);

      const res = await apiFetch<{ data: InventoryMovement[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/inventory/${itemId}/movements?${params.toString()}`
      );
      if (loadMore) {
        setData((prev) => [...prev, ...res.data]);
      } else {
        setData(res.data);
      }
      cursorRef.current = res.meta.cursor;
      setHasMore(res.meta.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load movements'));
    } finally {
      setIsLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    cursorRef.current = null;
    fetchData();
  }, [fetchData]);

  const loadMore = useCallback(() => fetchData(true), [fetchData]);
  const mutate = useCallback(() => {
    cursorRef.current = null;
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, hasMore, loadMore, mutate };
}
