'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';

/**
 * Simple data-fetching hook. Auto-fetches on mount and when url changes.
 * `mutate()` triggers a manual refetch.
 */
export function useFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(!!url);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetch = useCallback(async () => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      const result = await apiFetch<T>(url, { signal: controller.signal });
      if (!controller.signal.aborted) setData(result);
    } catch (err: unknown) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      }
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void fetch();
    return () => { abortRef.current?.abort(); };
  }, [fetch]);

  return { data, isLoading, error, mutate: fetch };
}
