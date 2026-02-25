'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

// ── Types (exported for consumers) ───────────────────────────────

export interface RoleListItem {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
}

export interface ManagedUser {
  id: string;
  email: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  status: 'invited' | 'active' | 'inactive' | 'locked';
  lastLoginAt: string | null;
  roles: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
}

export interface LocationOption {
  id: string;
  name: string;
}

export interface RoleOption {
  id: string;
  name: string;
}

// ── Hooks ────────────────────────────────────────────────────────

/** Cached role list — shared across Users tab and Roles tab (60s staleTime) */
export function useRoles() {
  return useQuery({
    queryKey: ['settings-roles'],
    queryFn: async () => {
      const res = await apiFetch<{ data: RoleListItem[] }>('/api/v1/roles');
      return res.data;
    },
    staleTime: 60_000,
  });
}

/** Cached user list for the Users tab (30s staleTime) */
export function useUsers() {
  return useQuery({
    queryKey: ['settings-users'],
    queryFn: async () => {
      const res = await apiFetch<{ data: ManagedUser[] }>('/api/v1/users');
      return res.data;
    },
    staleTime: 30_000,
  });
}

/** Cached locations from /me for the Users tab (60s staleTime) */
export function useMyLocations() {
  return useQuery({
    queryKey: ['settings-my-locations'],
    queryFn: async () => {
      const res = await apiFetch<{ data: { locations: LocationOption[] } }>('/api/v1/me');
      return res.data.locations;
    },
    staleTime: 60_000,
  });
}

/** Invalidation helpers for after mutations */
export function useInvalidateSettingsData() {
  const queryClient = useQueryClient();
  return {
    invalidateUsers: () => queryClient.invalidateQueries({ queryKey: ['settings-users'] }),
    invalidateRoles: () => queryClient.invalidateQueries({ queryKey: ['settings-roles'] }),
    invalidateAll: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-users'] });
      queryClient.invalidateQueries({ queryKey: ['settings-roles'] });
    },
  };
}
