'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';

export interface FieldChange {
  old: unknown;
  new: unknown;
  oldDisplay?: string | null;
  newDisplay?: string | null;
}

export interface ChangeLogEntry {
  id: string;
  itemId: string;
  actionType: string;
  changedByUserId: string;
  changedByName: string | null;
  changedAt: string;
  source: string;
  fieldChanges: Record<string, FieldChange>;
  summary: string | null;
  notes: string | null;
}

export interface ChangeLogFilters {
  dateFrom?: string;
  dateTo?: string;
  actionType?: string;
}

export function useItemChangeLog(itemId: string | null, filters: ChangeLogFilters = {}) {
  const [entries, setEntries] = useState<ChangeLogEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildUrl = useCallback(
    (appendCursor?: string) => {
      if (!itemId) return null;
      const params = new URLSearchParams();
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      if (filters.actionType) params.set('actionType', filters.actionType);
      if (appendCursor) params.set('cursor', appendCursor);
      params.set('limit', '50');
      const qs = params.toString();
      return `/api/v1/catalog/items/${itemId}/change-log${qs ? `?${qs}` : ''}`;
    },
    [itemId, filters.dateFrom, filters.dateTo, filters.actionType],
  );

  const fetchEntries = useCallback(
    async (appendCursor?: string) => {
      const url = buildUrl(appendCursor);
      if (!url) return;

      if (appendCursor) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      try {
        const res = await apiFetch<{
          data: ChangeLogEntry[];
          meta: { cursor: string | null; hasMore: boolean };
        }>(url);
        if (appendCursor) {
          setEntries((prev) => [...prev, ...res.data]);
        } else {
          setEntries(res.data);
        }
        setCursor(res.meta.cursor);
        setHasMore(res.meta.hasMore);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load change log'));
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [buildUrl],
  );

  // Reload from start when itemId or filters change (debounced for filters)
  useEffect(() => {
    if (!itemId) {
      setEntries([]);
      setCursor(null);
      setHasMore(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchEntries();
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [itemId, filters.dateFrom, filters.dateTo, filters.actionType, fetchEntries]);

  const loadMore = useCallback(() => {
    if (cursor && !isLoadingMore) {
      fetchEntries(cursor);
    }
  }, [cursor, isLoadingMore, fetchEntries]);

  const refresh = useCallback(() => {
    fetchEntries();
  }, [fetchEntries]);

  return { entries, isLoading, isLoadingMore, hasMore, error, loadMore, refresh };
}
