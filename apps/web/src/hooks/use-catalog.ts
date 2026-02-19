'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import type {
  CatalogItemRow,
  CategoryRow,
  ModifierGroupRow,
  TaxRateRow,
  TaxGroupRow,
} from '@/types/catalog';

// ── Generic fetcher ───────────────────────────────────────────────

function useFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { toast } = useToast();
  const toastRef = React.useRef(toast);
  toastRef.current = toast;

  const fetchData = useCallback(async () => {
    if (!url) {
      setData(null);
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: T }>(url);
      setData(res.data);
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Fetch failed');
      setError(e);
      toastRef.current.error(e.message);
    } finally {
      setIsLoading(false);
    }
  }, [url]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

// ── Items ─────────────────────────────────────────────────────────

interface ItemFilters {
  departmentId?: string;
  subDepartmentId?: string;
  categoryId?: string;
  itemType?: string;
  search?: string;
  includeArchived?: boolean;
}

export function useCatalogItems(filters: ItemFilters) {
  const [items, setItems] = useState<CatalogItemRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const { toast } = useToast();
  const toastRef2 = React.useRef(toast);
  toastRef2.current = toast;

  const fetchItems = useCallback(
    async (appendCursor?: string) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (filters.categoryId) params.set('categoryId', filters.categoryId);
        if (filters.itemType) params.set('itemType', filters.itemType);
        if (filters.search) params.set('search', filters.search);
        if (filters.includeArchived) params.set('includeArchived', 'true');
        if (appendCursor) params.set('cursor', appendCursor);
        params.set('limit', '25');

        const res = await apiFetch<{
          data: CatalogItemRow[];
          meta: { cursor: string | null; hasMore: boolean };
        }>(`/api/v1/catalog/items?${params.toString()}`);

        if (appendCursor) {
          setItems((prev) => [...prev, ...res.data]);
        } else {
          setItems(res.data);
        }
        setCursor(res.meta.cursor ?? undefined);
        setHasMore(res.meta.hasMore);
      } catch (err) {
        const e = err instanceof Error ? err : new Error('Failed to load items');
        setError(e);
        toastRef2.current.error(e.message);
      } finally {
        setIsLoading(false);
      }
    },
    [filters.categoryId, filters.itemType, filters.search, filters.includeArchived],
  );

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const loadMore = useCallback(() => {
    if (cursor) fetchItems(cursor);
  }, [cursor, fetchItems]);

  return { data: items, isLoading, error, hasMore, loadMore, mutate: () => fetchItems() };
}

export function useCatalogItem(id: string) {
  return useFetch<CatalogItemRow>(id ? `/api/v1/catalog/items/${id}` : null);
}

// ── Hierarchy ─────────────────────────────────────────────────────

function useAllCategories() {
  return useFetch<CategoryRow[]>('/api/v1/catalog/categories');
}

export function useDepartments() {
  const { data: all, isLoading, error, mutate } = useAllCategories();
  const departments = (all || []).filter((c) => c.parentId === null);
  return { data: departments, isLoading, error, mutate };
}

export function useSubDepartments(departmentId?: string) {
  const { data: all, isLoading, error, mutate } = useAllCategories();
  const subDepts = departmentId
    ? (all || []).filter((c) => c.parentId === departmentId)
    : [];
  return { data: subDepts, isLoading, error, mutate };
}

export function useCategories(subDepartmentId?: string) {
  const { data: all, isLoading, error, mutate } = useAllCategories();
  const categories = subDepartmentId
    ? (all || []).filter((c) => c.parentId === subDepartmentId)
    : [];
  return { data: categories, isLoading, error, mutate };
}

// ── Tax Rates ─────────────────────────────────────────────────────

export function useTaxRates() {
  return useFetch<TaxRateRow[]>('/api/v1/catalog/tax-rates');
}

// ── Tax Groups ────────────────────────────────────────────────────

export function useTaxGroups(locationId?: string) {
  const url = locationId ? `/api/v1/catalog/tax-groups?locationId=${locationId}` : null;
  return useFetch<TaxGroupRow[]>(url);
}

// ── Item Tax Groups ───────────────────────────────────────────────

export function useItemTaxGroups(itemId: string, locationId?: string) {
  const url =
    itemId && locationId
      ? `/api/v1/catalog/items/${itemId}/tax-groups?locationId=${locationId}`
      : null;
  return useFetch<Array<{ taxGroupId: string; taxGroupName: string; calculationMode: string }>>(
    url,
  );
}

// ── Modifier Groups ───────────────────────────────────────────────

export function useModifierGroups() {
  return useFetch<ModifierGroupRow[]>('/api/v1/catalog/modifier-groups');
}

// ── Archive Mutations ─────────────────────────────────────────────

export async function archiveCatalogItem(itemId: string, reason?: string) {
  return apiFetch(`/api/v1/catalog/items/${itemId}/archive`, {
    method: 'POST',
    body: JSON.stringify(reason ? { reason } : {}),
  });
}

export async function unarchiveCatalogItem(itemId: string) {
  return apiFetch(`/api/v1/catalog/items/${itemId}/unarchive`, {
    method: 'POST',
  });
}

// ── Retail Option Groups (scaffolded) ─────────────────────────────

export function useRetailOptionGroups() {
  // TODO: Backend API not yet available
  return { data: [] as never[], isLoading: false, error: null, mutate: () => {} };
}
