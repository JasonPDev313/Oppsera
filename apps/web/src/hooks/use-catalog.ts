'use client';

import { useCallback } from 'react';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type {
  CatalogItemRow,
  CategoryRow,
  ModifierGroupRow,
  TaxRateRow,
  TaxGroupRow,
} from '@/types/catalog';

// ── Items ─────────────────────────────────────────────────────────

interface ItemFilters {
  departmentId?: string;
  subDepartmentId?: string;
  categoryId?: string;
  itemType?: string;
  /** Comma-separated multi-type filter (e.g., 'food,beverage') */
  itemTypes?: string;
  search?: string;
  includeArchived?: boolean;
  /** Include on-hand, reorderPoint, etc. from inventory (single query) */
  includeInventory?: boolean;
}

export function useCatalogItems(filters: ItemFilters) {
  const queryClient = useQueryClient();

  const result = useInfiniteQuery({
    queryKey: ['catalog-items', filters] as const,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (filters.categoryId) params.set('categoryId', filters.categoryId);
      if (filters.itemType) params.set('itemType', filters.itemType);
      if (filters.itemTypes) params.set('itemTypes', filters.itemTypes);
      if (filters.search) params.set('search', filters.search);
      if (filters.includeArchived) params.set('includeArchived', 'true');
      if (filters.includeInventory) params.set('includeInventory', 'true');
      if (pageParam) params.set('cursor', pageParam);
      params.set('limit', '25');

      return apiFetch<{
        data: CatalogItemRow[];
        meta: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/catalog/items?${params.toString()}`);
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
    return queryClient.invalidateQueries({ queryKey: ['catalog-items'] });
  }, [queryClient]);

  return { data, isLoading: result.isLoading, error: result.error, hasMore, loadMore, mutate };
}

export function useCatalogItem(id: string) {
  const result = useQuery({
    queryKey: ['catalog-item', id],
    queryFn: () =>
      apiFetch<{ data: CatalogItemRow }>(`/api/v1/catalog/items/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── Hierarchy (TanStack Query replaces the old module-level cache) ─

export function useAllCategories() {
  const queryClient = useQueryClient();

  const result = useQuery({
    queryKey: ['categories'],
    queryFn: () =>
      apiFetch<{ data: CategoryRow[] }>('/api/v1/catalog/categories').then((r) => r.data),
    staleTime: 5 * 60_000, // 5 min — categories rarely change mid-session
  });

  const mutate = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: ['categories'] });
  }, [queryClient]);

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate,
  };
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
  const result = useQuery({
    queryKey: ['tax-rates'],
    queryFn: () =>
      apiFetch<{ data: TaxRateRow[] }>('/api/v1/catalog/tax-rates').then((r) => r.data),
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── Tax Groups ────────────────────────────────────────────────────

export function useTaxGroups(locationId?: string) {
  const url = locationId ? `/api/v1/catalog/tax-groups?locationId=${locationId}` : null;

  const result = useQuery({
    queryKey: ['tax-groups', locationId],
    queryFn: () =>
      apiFetch<{ data: TaxGroupRow[] }>(url!).then((r) => r.data),
    enabled: url !== null,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── Item Tax Groups ───────────────────────────────────────────────

export function useItemTaxGroups(itemId: string, locationId?: string) {
  const url =
    itemId && locationId
      ? `/api/v1/catalog/items/${itemId}/tax-groups?locationId=${locationId}`
      : null;

  const result = useQuery({
    queryKey: ['item-tax-groups', itemId, locationId],
    queryFn: () =>
      apiFetch<{ data: Array<{ taxGroupId: string; taxGroupName: string }> }>(url!).then((r) => r.data),
    enabled: url !== null,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── Modifier Groups ───────────────────────────────────────────────

export function useModifierGroups(options?: { categoryId?: string; channel?: string }) {
  const params = new URLSearchParams();
  if (options?.categoryId) params.set('categoryId', options.categoryId);
  if (options?.channel) params.set('channel', options.channel);
  const qs = params.toString();

  const result = useQuery({
    queryKey: ['modifier-groups', qs],
    queryFn: () =>
      apiFetch<{ data: ModifierGroupRow[] }>(
        `/api/v1/catalog/modifier-groups${qs ? `?${qs}` : ''}`,
      ).then((r) => r.data),
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── Modifier Group Categories ────────────────────────────────────

interface ModifierGroupCategoryRow {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

export function useModifierGroupCategories() {
  const result = useQuery({
    queryKey: ['modifier-group-categories'],
    queryFn: () =>
      apiFetch<{ data: ModifierGroupCategoryRow[] }>(
        '/api/v1/catalog/modifier-group-categories',
      ).then((r) => r.data),
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
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
