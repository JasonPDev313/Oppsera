'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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

export function useEntitlements() {
  const { isAuthenticated } = useAuthContext();

  // Seed state from cache if available and fresh
  const cached = _entCache && (Date.now() - _entCache.ts) < ENT_CACHE_TTL ? _entCache : null;
  const [entitlements, setEntitlements] = useState<Map<string, EntitlementInfo>>(cached?.entitlements ?? new Map());
  const [isLoading, setIsLoading] = useState(!cached);

  const fetchEntitlements = useCallback(async (skipCache = false) => {
    if (!isAuthenticated) {
      setEntitlements(new Map());
      _entCache = null;
      setIsLoading(false);
      return;
    }

    // Return cached data if still fresh (avoids refetch on re-mount)
    if (!skipCache && _entCache && (Date.now() - _entCache.ts) < ENT_CACHE_TTL) {
      setEntitlements(_entCache.entitlements);
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
      _entCache = { entitlements: map, ts: Date.now() };
    } catch {
      setEntitlements(new Map());
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchEntitlements();
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

  return {
    entitlements,
    isModuleEnabled,
    isModuleLocked,
    getAccessMode,
    getLimit,
    isLoading,
    refetch: () => fetchEntitlements(true),
  };
}
