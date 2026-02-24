'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

interface RoleAccessConfig {
  locationIds: string[];
  profitCenterIds: string[];
  terminalIds: string[];
}

export function useRoleAccess(roleId: string | null) {
  const [access, setAccess] = useState<RoleAccessConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchAccess = useCallback(async () => {
    if (!roleId) {
      setAccess(null);
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: RoleAccessConfig }>(`/api/v1/roles/${roleId}/access`);
      setAccess(res.data);
    } catch {
      setAccess(null);
    } finally {
      setIsLoading(false);
    }
  }, [roleId]);

  useEffect(() => {
    fetchAccess();
  }, [fetchAccess]);

  const save = useCallback(
    async (config: RoleAccessConfig) => {
      if (!roleId) return;
      await apiFetch(`/api/v1/roles/${roleId}/access`, {
        method: 'PUT',
        body: JSON.stringify(config),
      });
      setAccess(config);
    },
    [roleId],
  );

  return {
    access,
    isLoading,
    save,
    refetch: fetchAccess,
  };
}
