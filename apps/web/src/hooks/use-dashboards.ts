'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useMutation } from '@/hooks/use-mutation';
import type { SavedDashboard, DashboardTile } from '@/types/custom-reports';

// ── List Dashboards ──────────────────────────────────────────
export function useDashboards() {
  const [items, setItems] = useState<SavedDashboard[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchDashboards = useCallback(async (loadMore = false) => {
    try {
      if (!loadMore) setIsLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (loadMore && cursor) params.set('cursor', cursor);

      const res = await apiFetch<{
        data: SavedDashboard[];
        meta: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/dashboards?${params.toString()}`);

      if (loadMore) {
        setItems((prev) => [...prev, ...res.data]);
      } else {
        setItems(res.data);
      }
      setCursor(res.meta.cursor);
      setHasMore(res.meta.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load dashboards'));
    } finally {
      setIsLoading(false);
    }
  }, [cursor]);

  useEffect(() => {
    fetchDashboards();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    items,
    isLoading,
    error,
    hasMore,
    loadMore: () => fetchDashboards(true),
    mutate: () => fetchDashboards(false),
  };
}

// ── Single Dashboard ─────────────────────────────────────────
export function useDashboard(dashboardId: string | undefined) {
  const [data, setData] = useState<SavedDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchDashboard = useCallback(async () => {
    if (!dashboardId) {
      setData(null);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<{ data: SavedDashboard }>(
        `/api/v1/dashboards/${dashboardId}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load dashboard'));
    } finally {
      setIsLoading(false);
    }
  }, [dashboardId]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  return { data, isLoading, error, mutate: fetchDashboard };
}

// ── Save Dashboard ───────────────────────────────────────────
interface SaveDashboardInput {
  id?: string;
  name: string;
  description?: string;
  tiles: DashboardTile[];
  isDefault?: boolean;
}

export function useSaveDashboard() {
  return useMutation<SaveDashboardInput, SavedDashboard>(async (input) => {
    const method = input.id ? 'PUT' : 'POST';
    const path = input.id ? `/api/v1/dashboards/${input.id}` : '/api/v1/dashboards';

    const res = await apiFetch<{ data: SavedDashboard }>(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return res.data;
  });
}

// ── Delete Dashboard ─────────────────────────────────────────
export function useDeleteDashboard() {
  return useMutation<string, void>(async (dashboardId) => {
    await apiFetch(`/api/v1/dashboards/${dashboardId}`, { method: 'DELETE' });
  });
}
