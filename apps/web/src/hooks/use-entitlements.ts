'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuthContext } from '@/components/auth-provider';

interface EntitlementInfo {
  moduleKey: string;
  displayName: string;
  isEnabled: boolean;
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

export function useEntitlements() {
  const { isAuthenticated } = useAuthContext();
  const [entitlements, setEntitlements] = useState<Map<string, EntitlementInfo>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  const fetchEntitlements = useCallback(async () => {
    if (!isAuthenticated) {
      setEntitlements(new Map());
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
      if (!entry.isEnabled) return false;
      if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) return false;
      return true;
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
    getLimit,
    isLoading,
    refetch: fetchEntitlements,
  };
}
