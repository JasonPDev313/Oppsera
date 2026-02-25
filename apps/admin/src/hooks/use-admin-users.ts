'use client';

import { useState, useCallback } from 'react';
import { adminFetch } from '@/lib/api-fetch';

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  phone: string | null;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  tenantId: string;
  tenantName: string | null;
  tenantSlug: string | null;
  passwordResetRequired: boolean;
  mfaEnabled: boolean | null;
  failedLoginCount: number | null;
  lockedUntil: string | null;
  isLocked: boolean;
  roleNames: string | null;
}

export interface AdminUserDetail extends AdminUser {
  roles: Array<{ roleId: string; roleName: string; locationId: string | null; locationName: string | null }>;
}

export interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  isEnabled: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface UserSearchFilters {
  search?: string;
  tenantId?: string;
  status?: string;
  isLocked?: boolean;
  hasMfa?: boolean;
  sort?: string;
}

export function useAdminUserSearch() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (filters: UserSearchFilters = {}, append = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.tenantId) params.set('tenantId', filters.tenantId);
      if (filters.status) params.set('status', filters.status);
      if (filters.isLocked) params.set('isLocked', 'true');
      if (filters.hasMfa) params.set('hasMfa', 'true');
      if (filters.sort) params.set('sort', filters.sort);
      if (append && cursor) params.set('cursor', cursor);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await adminFetch<{ data: { items: AdminUser[]; cursor: string | null; hasMore: boolean } }>(`/api/v1/admin/users${qs}`);
      if (append) {
        setUsers(prev => [...prev, ...res.data.items]);
      } else {
        setUsers(res.data.items);
      }
      setCursor(res.data.cursor);
      setHasMore(res.data.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to search users');
    } finally {
      setIsLoading(false);
    }
  }, [cursor]);

  return { users, isLoading, error, hasMore, cursor, search };
}

export function useAdminUserDetail(userId: string | null) {
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: AdminUserDetail }>(`/api/v1/admin/users/${userId}`);
      setUser(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load user');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  return { user, isLoading, error, load };
}

export function useAdminUserActions() {
  const [isActing, setIsActing] = useState(false);

  const performAction = useCallback(async (userId: string, action: string, reason?: string): Promise<boolean> => {
    setIsActing(true);
    try {
      await adminFetch(`/api/v1/admin/users/${userId}/actions`, {
        method: 'POST',
        body: JSON.stringify({ action, reason }),
      });
      return true;
    } catch {
      return false;
    } finally {
      setIsActing(false);
    }
  }, []);

  return { performAction, isActing };
}

export function useApiKeys(tenantId: string | null) {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    try {
      const res = await adminFetch<{ data: ApiKeyItem[] }>(`/api/v1/tenants/${tenantId}/api-keys`);
      setKeys(res.data);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  const revoke = useCallback(async (keyId: string): Promise<boolean> => {
    if (!tenantId) return false;
    try {
      await adminFetch(`/api/v1/tenants/${tenantId}/api-keys/${keyId}/revoke`, { method: 'POST' });
      await load();
      return true;
    } catch {
      return false;
    }
  }, [tenantId, load]);

  return { keys, isLoading, load, revoke };
}
