'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

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

export function useRoleSelection() {
  const [roles, setRoles] = useState<RoleAssignment[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [autoSelected, setAutoSelected] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<MyRolesResponse>('/api/v1/terminal-session/my-roles');
        setRoles(res.data.roles);

        // Auto-select if only 1 role
        if (res.data.autoSelect && res.data.roles.length === 1) {
          setSelectedRoleId(res.data.roles[0]!.roleId);
          setAutoSelected(true);
        }
      } catch {
        setRoles([]);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

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
  };
}
