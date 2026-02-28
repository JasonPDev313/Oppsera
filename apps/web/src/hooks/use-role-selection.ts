'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';

export interface RoleAssignment {
  assignmentId: string;
  roleId: string;
  roleName: string;
  isSystem: boolean;
  scope: 'tenant' | 'location';
  locationId: string | null;
  locationName: string | null;
}

interface MyRolesResponse {
  data: {
    roles: RoleAssignment[];
    autoSelect: boolean;
  };
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.statusCode === 401) return 'Session expired — please log in again.';
    if (err.statusCode === 403) return `Access denied: ${err.message}`;
    if (err.statusCode === 503) return 'Service temporarily unavailable — please wait a moment and retry.';
    if (err.statusCode === 504) return 'Request timed out — the server may be starting up. Please retry.';
    return `${err.message} (${err.code}, ${err.statusCode})`;
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    return 'Request was cancelled.';
  }
  if (err instanceof TypeError && String(err.message).includes('fetch')) {
    return 'Network error — check your connection and retry.';
  }
  return String(err instanceof Error ? err.message : err);
}

export function useRoleSelection() {
  const [roles, setRoles] = useState<RoleAssignment[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [autoSelected, setAutoSelected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchCount = useRef(0);

  const fetchRoles = useCallback(async () => {
    fetchCount.current++;
    const attempt = fetchCount.current;
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<MyRolesResponse>('/api/v1/terminal-session/my-roles');
      setRoles(res.data.roles);
      setError(null);

      // Auto-select if only 1 role
      if (res.data.autoSelect && res.data.roles.length === 1) {
        setSelectedRoleId(res.data.roles[0]!.roleId);
        setAutoSelected(true);
      }
    } catch (err) {
      console.error(`[useRoleSelection] attempt=${attempt} failed:`, err);
      setRoles([]);
      setError(describeError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const selectedRole = roles.find((r) => r.roleId === selectedRoleId) ?? null;
  const hasMultipleRoles = roles.length > 1;

  const handleSelectRole = useCallback((roleId: string) => {
    setSelectedRoleId(roleId);
    setAutoSelected(false);
  }, []);

  return {
    roles,
    selectedRoleId,
    setSelectedRoleId: handleSelectRole,
    selectedRole,
    isLoading,
    autoSelected,
    hasMultipleRoles,
    error,
    retry: fetchRoles,
  };
}
