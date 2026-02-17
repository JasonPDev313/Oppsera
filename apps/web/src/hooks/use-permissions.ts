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

export function usePermissions() {
  const { isAuthenticated } = useAuthContext();
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    if (!isAuthenticated) {
      setPermissions(new Set());
      setRoles([]);
      setIsLoading(false);
      return;
    }

    try {
      const response = await apiFetch<PermissionsResponse>('/api/v1/me/permissions');
      setPermissions(new Set(response.data.permissions));
      setRoles(response.data.roles);
    } catch {
      setPermissions(new Set());
      setRoles([]);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

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
