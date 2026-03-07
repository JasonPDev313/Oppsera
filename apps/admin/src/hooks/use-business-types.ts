'use client';

import { useState, useCallback } from 'react';
import { adminFetch } from '@/lib/api-fetch';

export interface BusinessTypeListItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  isActive: boolean;
  isSystem: boolean;
  showAtSignup: boolean;
  sortOrder: number;
  publishedVersionId: string | null;
  publishedVersionNumber: number | null;
  hasDraft: boolean;
  moduleCount: number;
  roleCount: number;
  accountingConfigured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryOption {
  id: string;
  name: string;
  slug: string;
}

export function useBusinessTypeList() {
  const [items, setItems] = useState<BusinessTypeListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async (params: Record<string, string> = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams(params);
      const res = await adminFetch<{
        data: BusinessTypeListItem[];
        meta: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/admin/business-types?${qs}`);
      setItems(res.data);
      setCursor(res.meta.cursor);
      setHasMore(res.meta.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load business types');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadMore = useCallback(async (params: Record<string, string> = {}) => {
    if (!cursor) return;
    setIsLoading(true);
    try {
      const qs = new URLSearchParams({ ...params, cursor });
      const res = await adminFetch<{
        data: BusinessTypeListItem[];
        meta: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/admin/business-types?${qs}`);
      setItems((prev) => [...prev, ...res.data]);
      setCursor(res.meta.cursor);
      setHasMore(res.meta.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load more');
    } finally {
      setIsLoading(false);
    }
  }, [cursor]);

  return { items, isLoading, error, hasMore, load, loadMore };
}

export function useCategories() {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await adminFetch<{ data: CategoryOption[] }>(
        '/api/v1/admin/business-types/categories',
      );
      setCategories(res.data);
    } catch {
      // silently fail — categories are non-critical
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { categories, isLoading, load };
}
