'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

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

interface UseAdminLoginHistoryOptions {
  /** For admin's own login records */
  adminId?: string;
  /** For viewing a tenant user's login records cross-tenant */
  userId?: string;
  tenantId?: string;
  outcome?: string;
  limit?: number;
  /** Set to false to defer fetching until ready (e.g. section is collapsed). Default: true */
  enabled?: boolean;
}

export function useAdminLoginHistory(options: UseAdminLoginHistoryOptions) {
  const enabled = options.enabled !== false;
  const [records, setRecords] = useState<LoginRecord[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
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
        const params = new URLSearchParams();
        if (options.adminId) params.set('adminId', options.adminId);
        if (options.userId) params.set('userId', options.userId);
        if (options.tenantId) params.set('tenantId', options.tenantId);
        if (options.outcome) params.set('outcome', options.outcome);
        params.set('limit', String(options.limit ?? 20));
        if (append && cursorRef.current) params.set('cursor', cursorRef.current);

        const qs = params.toString();
        const res = await fetch(`/api/v1/admin/login-records?${qs}`, {
          credentials: 'include',
        });
        if (!res.ok || !mountedRef.current) return;
        const json = await res.json();
        const items = json.data as LoginRecord[];
        setRecords((prev) => (append ? [...prev, ...items] : items));
        cursorRef.current = json.meta?.cursor ?? null;
        setHasMore(json.meta?.hasMore ?? false);
      } catch {
        // silently fail
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    },
    [options.adminId, options.userId, options.tenantId, options.outcome, options.limit],
  );

  useEffect(() => {
    if (!enabled) return;
    cursorRef.current = null;
    fetchRecords(false);
  }, [fetchRecords, enabled]);

  const loadMore = useCallback(() => fetchRecords(true), [fetchRecords]);
  const refresh = useCallback(() => {
    cursorRef.current = null;
    fetchRecords(false);
  }, [fetchRecords]);

  return { records, isLoading, hasMore, loadMore, refresh };
}
