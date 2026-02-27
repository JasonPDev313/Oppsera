'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type {
  TagPopulationTrendsResult,
  TagOverlapMatrixResult,
  TagEffectivenessResult,
  TagHealthResult,
} from '@oppsera/module-customers';

// ── Tag Health ──────────────────────────────────────────────────────

export function useTagHealth() {
  const [data, setData] = useState<TagHealthResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<{ data: TagHealthResult }>(
        '/api/v1/customers/tags/analytics?metric=health',
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load tag health'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

// ── Population Trends ───────────────────────────────────────────────

export function useTagPopulationTrends(options: { tagIds?: string[]; days?: number } = {}) {
  const [data, setData] = useState<TagPopulationTrendsResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const qs = buildQueryString({
        metric: 'trends',
        tagIds: options.tagIds?.join(','),
        days: options.days,
      });
      const res = await apiFetch<{ data: TagPopulationTrendsResult }>(
        `/api/v1/customers/tags/analytics${qs}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load population trends'));
    } finally {
      setIsLoading(false);
    }
  }, [options.tagIds?.join(','), options.days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

// ── Overlap Matrix ──────────────────────────────────────────────────

export function useTagOverlapMatrix() {
  const [data, setData] = useState<TagOverlapMatrixResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<{ data: TagOverlapMatrixResult }>(
        '/api/v1/customers/tags/analytics?metric=overlap',
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load overlap matrix'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

// ── Tag Effectiveness ───────────────────────────────────────────────

export function useTagEffectiveness(tagId: string | null) {
  const [data, setData] = useState<TagEffectivenessResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!tagId) { setData(null); return; }
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<{ data: TagEffectivenessResult }>(
        `/api/v1/customers/tags/analytics?metric=effectiveness&tagId=${encodeURIComponent(tagId)}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load tag effectiveness'));
    } finally {
      setIsLoading(false);
    }
  }, [tagId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}
