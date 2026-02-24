'use client';

import { useState, useCallback } from 'react';
import { adminFetch } from '@/lib/api-fetch';
import type { SystemLens, CreateSystemLensPayload, UpdateSystemLensPayload } from '@/types/lenses';

export function useLenses() {
  const [data, setData] = useState<SystemLens[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (params: Record<string, string> = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams(params);
      const res = await adminFetch<{ data: SystemLens[] }>(`/api/v1/eval/lenses?${qs}`);
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load lenses');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const create = useCallback(
    async (payload: CreateSystemLensPayload) => {
      await adminFetch('/api/v1/eval/lenses', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await load();
    },
    [load],
  );

  const update = useCallback(
    async (slug: string, payload: UpdateSystemLensPayload) => {
      await adminFetch(`/api/v1/eval/lenses/${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      await load();
    },
    [load],
  );

  const deactivate = useCallback(
    async (slug: string) => {
      await adminFetch(`/api/v1/eval/lenses/${encodeURIComponent(slug)}`, {
        method: 'DELETE',
      });
      await load();
    },
    [load],
  );

  const reactivate = useCallback(
    async (slug: string) => {
      await adminFetch(`/api/v1/eval/lenses/${encodeURIComponent(slug)}?action=reactivate`, {
        method: 'DELETE',
      });
      await load();
    },
    [load],
  );

  return { data, isLoading, error, load, create, update, deactivate, reactivate };
}
