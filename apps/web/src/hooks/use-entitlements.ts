'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuthContext } from '@/components/auth-provider';

type AccessMode = 'off' | 'view' | 'full' | 'locked';

interface EntitlementInfo {
  moduleKey: string;
  displayName: string;
  isEnabled: boolean;
  accessMode: AccessMode;
  planTier: string;
  limits: Record<string, number>;
  activatedAt: string;
  expiresAt: string | null;
}

interface EntitlementsResponse {
  data: {
    entitlements: EntitlementInfo[];
  };
}

// ── Module-level cache (survives React re-mounts, same pattern as _catCache) ──
let _entCache: { entitlements: Map<string, EntitlementInfo>; ts: number } | null = null;
const ENT_CACHE_TTL = 60_000; // 60s — entitlements change very rarely
const MAX_RETRIES = 2;
const RETRY_DELAYS = [1_500, 4_000]; // escalating backoff

export function useEntitlements() {
  const { isAuthenticated } = useAuthContext();
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);

  // Seed state from cache if available and fresh
  const cached = _entCache && (Date.now() - _entCache.ts) < ENT_CACHE_TTL ? _entCache : null;
  const [entitlements, setEntitlements] = useState<Map<string, EntitlementInfo>>(cached?.entitlements ?? new Map());
  const [isLoading, setIsLoading] = useState(!cached);
  const [hasError, setHasError] = useState(false);

  const fetchEntitlements = useCallback(async (skipCache = false) => {
    if (!isAuthenticated) {
      setEntitlements(new Map());
      setHasError(false);
      _entCache = null;
      setIsLoading(false);
      return;
    }

    // Return cached data if still fresh (avoids refetch on re-mount)
    if (!skipCache && _entCache && (Date.now() - _entCache.ts) < ENT_CACHE_TTL) {
      setEntitlements(_entCache.entitlements);
      setHasError(false);
      setIsLoading(false);
      return;
    }

    try {
      const response = await apiFetch<EntitlementsResponse>('/api/v1/entitlements');
      const map = new Map<string, EntitlementInfo>();
      for (const e of response.data.entitlements) {
        map.set(e.moduleKey, e);
      }
      setEntitlements(map);
      setHasError(false);
      retryCountRef.current = 0;
      _entCache = { entitlements: map, ts: Date.now() };
    } catch {
      // Auto-retry with backoff before giving up
      if (retryCountRef.current < MAX_RETRIES) {
        const delay = RETRY_DELAYS[retryCountRef.current] ?? 4_000;
        retryCountRef.current++;
        retryTimerRef.current = setTimeout(() => fetchEntitlements(skipCache), delay);
        return; // keep isLoading true while retrying
      }
      setEntitlements(new Map());
      setHasError(true);
      setIsLoading(false);
      return;
    }
    setIsLoading(false);
  }, [isAuthenticated]);

  useEffect(() => {
    retryCountRef.current = 0;
    fetchEntitlements();
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [fetchEntitlements]);

  const isModuleEnabled = useMemo(() => {
    return (moduleKey: string): boolean => {
      if (moduleKey === 'platform_core') return true;
      const entry = entitlements.get(moduleKey);
      if (!entry) return false;
      if (entry.accessMode === 'locked') return false;
      if (!entry.isEnabled) return false;
      if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) return false;
      return true;
    };
  }, [entitlements]);

  const isModuleLocked = useMemo(() => {
    return (moduleKey: string): boolean => {
      const entry = entitlements.get(moduleKey);
      return entry?.accessMode === 'locked';
    };
  }, [entitlements]);

  const getAccessMode = useMemo(() => {
    return (moduleKey: string): AccessMode => {
      if (moduleKey === 'platform_core') return 'full';
      const entry = entitlements.get(moduleKey);
      if (!entry) return 'off';
      if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) return 'off';
      return entry.accessMode ?? (entry.isEnabled ? 'full' : 'off');
    };
  }, [entitlements]);

  const getLimit = useMemo(() => {
    return (moduleKey: string, limitKey: string): number | undefined => {
      const entry = entitlements.get(moduleKey);
      if (!entry) return undefined;
      return entry.limits[limitKey];
    };
  }, [entitlements]);

  const refetch = useCallback(() => fetchEntitlements(true), [fetchEntitlements]);

  return useMemo(() => ({
    entitlements,
    isModuleEnabled,
    isModuleLocked,
    getAccessMode,
    getLimit,
    isLoading,
    hasError,
    refetch,
  }), [entitlements, isModuleEnabled, isModuleLocked, getAccessMode, getLimit, isLoading, hasError, refetch]);
}
