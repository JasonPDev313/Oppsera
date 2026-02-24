'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

export interface TagListItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  icon: string | null;
  tagType: string;
  category: string | null;
  isActive: boolean;
  isSystem: boolean;
  displayOrder: number;
  customerCount: number;
  createdAt: string;
  archivedAt: string | null;
}

export interface TagDetail extends TagListItem {
  metadata: Record<string, unknown> | null;
  archivedBy: string | null;
  archivedReason: string | null;
  rule: {
    id: string;
    name: string;
    isActive: boolean;
    evaluationMode: string;
    lastEvaluatedAt: string | null;
    customersMatched: number;
  } | null;
}

export interface CustomerTagEntry {
  id: string;
  tagId: string;
  tagName: string;
  tagSlug: string;
  tagColor: string;
  tagIcon: string | null;
  tagType: string;
  source: string;
  sourceRuleId: string | null;
  evidence: unknown;
  appliedAt: string;
  appliedBy: string;
  expiresAt: string | null;
}

interface UseTagsOptions {
  tagType?: 'manual' | 'smart';
  category?: string;
  isActive?: boolean;
  includeArchived?: boolean;
  search?: string;
}

export function useTags(options: UseTagsOptions = {}) {
  const [data, setData] = useState<TagListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);

  const fetchData = useCallback(async (loadMore = false) => {
    try {
      if (!loadMore) setIsLoading(true);
      setError(null);
      const qs = buildQueryString({
        tagType: options.tagType,
        category: options.category,
        isActive: options.isActive,
        includeArchived: options.includeArchived,
        search: options.search,
        cursor: loadMore ? cursorRef.current : undefined,
      });
      const res = await apiFetch<{ data: TagListItem[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/customers/tags${qs}`,
      );
      if (loadMore) {
        setData((prev) => [...prev, ...res.data]);
      } else {
        setData(res.data);
      }
      cursorRef.current = res.meta.cursor;
      setHasMore(res.meta.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load tags'));
    } finally {
      setIsLoading(false);
    }
  }, [options.tagType, options.category, options.isActive, options.includeArchived, options.search]);

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

export function useTag(tagId: string | null) {
  const [data, setData] = useState<TagDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!tagId) { setData(null); return; }
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<{ data: TagDetail }>(`/api/v1/customers/tags/${tagId}`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load tag'));
    } finally {
      setIsLoading(false);
    }
  }, [tagId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

export function useCustomerTags(customerId: string | null) {
  const [data, setData] = useState<CustomerTagEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!customerId) { setData([]); return; }
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<{ data: CustomerTagEntry[] }>(`/api/v1/customers/${customerId}/tags`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load customer tags'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

export function useTagMutations() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createTag = useCallback(async (input: {
    name: string;
    tagType: 'manual' | 'smart';
    description?: string;
    color?: string;
    icon?: string;
    category?: string;
  }) => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch<{ data: TagListItem }>('/api/v1/customers/tags', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return res.data;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const updateTag = useCallback(async (tagId: string, input: Record<string, unknown>) => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch<{ data: TagListItem }>(`/api/v1/customers/tags/${tagId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
      return res.data;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const archiveTag = useCallback(async (tagId: string, reason?: string) => {
    setIsSubmitting(true);
    try {
      await apiFetch(`/api/v1/customers/tags/${tagId}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason }),
      });
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const unarchiveTag = useCallback(async (tagId: string) => {
    setIsSubmitting(true);
    try {
      await apiFetch(`/api/v1/customers/tags/${tagId}/unarchive`, { method: 'POST' });
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const applyTag = useCallback(async (customerId: string, tagId: string) => {
    setIsSubmitting(true);
    try {
      await apiFetch(`/api/v1/customers/${customerId}/tags`, {
        method: 'POST',
        body: JSON.stringify({ tagId }),
      });
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const removeTag = useCallback(async (customerId: string, tagId: string, reason?: string) => {
    setIsSubmitting(true);
    try {
      await apiFetch(`/api/v1/customers/${customerId}/tags/${tagId}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason }),
      });
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return { createTag, updateTag, archiveTag, unarchiveTag, applyTag, removeTag, isSubmitting };
}
