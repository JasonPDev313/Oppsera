'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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

export function usePermissions() {
  const { isAuthenticated } = useAuthContext();

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

  const fetchPermissions = useCallback(async () => {
    if (!isAuthenticated) {
      setPermissions(new Set());
      setRoles([]);
      _permCache = null;
      setIsLoading(false);
      return;
    }

    // Return cached data if still fresh (avoids refetch on re-mount)
    if (_permCache && _permCache.roleId === roleId && (Date.now() - _permCache.ts) < PERM_CACHE_TTL) {
      setPermissions(_permCache.permissions);
      setRoles(_permCache.roles);
      setIsLoading(false);
      return;
    }

    try {
      const roleParam = roleId ? `?roleId=${roleId}` : '';
      const response = await apiFetch<PermissionsResponse>(`/api/v1/me/permissions${roleParam}`);
      const perms = new Set(response.data.permissions);
      setPermissions(perms);
      setRoles(response.data.roles);
      _permCache = { permissions: perms, roles: response.data.roles, roleId, ts: Date.now() };
    } catch {
      setPermissions(new Set());
      setRoles([]);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, roleId]);

  useEffect(() => {
    fetchPermissions();
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
    refetch: fetchPermissions,
  };
}
