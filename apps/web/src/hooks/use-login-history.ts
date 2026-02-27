'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

export interface LoginRecord {
  id: string;
  tenantId: string;
  userId: string | null;
  email: string;
  outcome: string;
  ipAddress: string | null;
  userAgent: string | null;
  geoCity: string | null;
  geoRegion: string | null;
  geoCountry: string | null;
  geoLatitude: string | null;
  geoLongitude: string | null;
  terminalId: string | null;
  terminalName: string | null;
  failureReason: string | null;
  createdAt: string;
  browser: string;
  os: string;
}

interface UseLoginHistoryOptions {
  userId?: string;
  outcome?: string;
  limit?: number;
}

export function useLoginHistory(options: UseLoginHistoryOptions = {}) {
  const [records, setRecords] = useState<LoginRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchRecords = useCallback(
    async (append = false) => {
      setIsLoading(true);
      try {
        const qs = buildQueryString({
          userId: options.userId,
          outcome: options.outcome,
          limit: String(options.limit ?? 20),
          cursor: append ? cursorRef.current ?? undefined : undefined,
        });
        const res = await apiFetch(`/api/v1/login-records${qs}`);
        if (!mountedRef.current) return;
        const items = res.data as LoginRecord[];
        setRecords((prev) => (append ? [...prev, ...items] : items));
        cursorRef.current = res.meta?.cursor ?? null;
        setHasMore(res.meta?.hasMore ?? false);
      } catch {
        // silently fail
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    },
    [options.userId, options.outcome, options.limit],
  );

  useEffect(() => {
    cursorRef.current = null;
    fetchRecords(false);
  }, [fetchRecords]);

  const loadMore = useCallback(() => fetchRecords(true), [fetchRecords]);
  const refresh = useCallback(() => {
    cursorRef.current = null;
    fetchRecords(false);
  }, [fetchRecords]);

  return { records, isLoading, hasMore, loadMore, refresh };
}
