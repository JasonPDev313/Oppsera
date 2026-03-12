'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuthContext } from '@/components/auth-provider';

interface RoleInfo {
  id: string;
  name: string;
  scope: string;
  locationId: string | null;
}

interface PermissionsResponse {
  data: {
    permissions: string[];
    roles: RoleInfo[];
  };
}

function matchPermission(granted: string, requested: string): boolean {
  if (granted === '*') return true;
  if (granted === requested) return true;
  if (granted.endsWith('.*')) {
    const grantedModule = granted.slice(0, -2);
    const requestedModule = requested.split('.')[0];
    return grantedModule === requestedModule;
  }
  return false;
}

// ── Module-level cache (survives React re-mounts, same pattern as _catCache) ──
let _permCache: { permissions: Set<string>; roles: RoleInfo[]; roleId: string | null; ts: number } | null = null;
const PERM_CACHE_TTL = 30_000; // 30s — permissions rarely change mid-session
const MAX_RETRIES = 2;
const RETRY_DELAYS = [1_500, 4_000]; // escalating backoff

export function usePermissions() {
  const { isAuthenticated } = useAuthContext();
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read roleId from terminal session for role-scoped permission fetching
  const roleId = useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem('oppsera:terminal-session');
      if (!stored) return null;
      return JSON.parse(stored).roleId ?? null;
    } catch {
      return null;
    }
  }, []);

  // Seed state from cache if available and fresh
  const cached = _permCache && _permCache.roleId === roleId && (Date.now() - _permCache.ts) < PERM_CACHE_TTL ? _permCache : null;
  const [permissions, setPermissions] = useState<Set<string>>(cached?.permissions ?? new Set());
  const [roles, setRoles] = useState<RoleInfo[]>(cached?.roles ?? []);
  const [isLoading, setIsLoading] = useState(!cached);
  const [hasError, setHasError] = useState(false);
  const retryCountRef = useRef(0);

  const fetchPermissions = useCallback(async () => {
    if (!isAuthenticated) {
      setPermissions(new Set());
      setRoles([]);
      setHasError(false);
      _permCache = null;
      setIsLoading(false);
      return;
    }

    // Return cached data if still fresh (avoids refetch on re-mount)
    if (_permCache && _permCache.roleId === roleId && (Date.now() - _permCache.ts) < PERM_CACHE_TTL) {
      setPermissions(_permCache.permissions);
      setRoles(_permCache.roles);
      setHasError(false);
      setIsLoading(false);
      return;
    }

    try {
      const roleParam = roleId ? `?roleId=${roleId}` : '';
      const response = await apiFetch<PermissionsResponse>(`/api/v1/me/permissions${roleParam}`);
      const perms = new Set(response.data.permissions);
      setPermissions(perms);
      setRoles(response.data.roles);
      setHasError(false);
      retryCountRef.current = 0;
      _permCache = { permissions: perms, roles: response.data.roles, roleId, ts: Date.now() };
    } catch {
      // Auto-retry with backoff before giving up
      if (retryCountRef.current < MAX_RETRIES) {
        const delay = RETRY_DELAYS[retryCountRef.current] ?? 4_000;
        retryCountRef.current++;
        retryTimerRef.current = setTimeout(() => fetchPermissions(), delay);
        return; // keep isLoading true while retrying
      }
      setPermissions(new Set());
      setRoles([]);
      setHasError(true);
      setIsLoading(false);
      return;
    }
    setIsLoading(false);
  }, [isAuthenticated, roleId]);

  useEffect(() => {
    retryCountRef.current = 0;
    fetchPermissions();
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [fetchPermissions]);

  const can = useMemo(() => {
    return (permission: string): boolean => {
      for (const granted of permissions) {
        if (matchPermission(granted, permission)) return true;
      }
      return false;
    };
  }, [permissions]);

  return {
    permissions,
    roles,
    can,
    isLoading,
    hasError,
    refetch: fetchPermissions,
  };
}
