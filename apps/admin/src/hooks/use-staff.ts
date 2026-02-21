'use client';

import { useState, useCallback } from 'react';
import { adminFetch } from '@/lib/api-fetch';
import type {
  StaffListItem,
  StaffDetail,
  AdminAuditEntry,
  AdminRoleListItem,
} from '@/types/users';

// ── Staff List ──────────────────────────────────────────────────

interface StaffListResponse {
  items: StaffListItem[];
  cursor: string | null;
  hasMore: boolean;
}

export function useStaffList() {
  const [data, setData] = useState<StaffListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (params: Record<string, string> = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams(params);
      const res = await adminFetch<{ data: StaffListResponse }>(`/api/v1/admin/staff?${qs}`);
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load staff');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { data, isLoading, error, load };
}

// ── Staff Detail ────────────────────────────────────────────────

export function useStaffDetail(id: string) {
  const [data, setData] = useState<StaffDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: StaffDetail }>(`/api/v1/admin/staff/${id}`);
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load staff detail');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const update = useCallback(async (body: Record<string, unknown>) => {
    const res = await adminFetch<{ data: StaffDetail }>(`/api/v1/admin/staff/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    setData(res.data);
    return res.data;
  }, [id]);

  const suspend = useCallback(async (reason: string) => {
    await adminFetch(`/api/v1/admin/staff/${id}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ action: 'suspend', reason }),
    });
    await load();
  }, [id, load]);

  const unsuspend = useCallback(async () => {
    await adminFetch(`/api/v1/admin/staff/${id}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ action: 'unsuspend' }),
    });
    await load();
  }, [id, load]);

  const deleteStaff = useCallback(async (reason: string, confirmationText: string) => {
    await adminFetch(`/api/v1/admin/staff/${id}/delete`, {
      method: 'DELETE',
      body: JSON.stringify({ reason, confirmationText }),
    });
  }, [id]);

  const resetPassword = useCallback(async () => {
    await adminFetch(`/api/v1/admin/staff/${id}/reset-password`, { method: 'POST' });
    await load();
  }, [id, load]);

  const resendInvite = useCallback(async () => {
    await adminFetch(`/api/v1/admin/staff/${id}/resend-invite`, { method: 'POST' });
    await load();
  }, [id, load]);

  return { data, isLoading, error, load, update, suspend, unsuspend, deleteStaff, resetPassword, resendInvite };
}

// ── Admin Audit Log ─────────────────────────────────────────────

interface AuditListResponse {
  items: AdminAuditEntry[];
  cursor: string | null;
  hasMore: boolean;
}

export function useAdminAudit(adminId?: string) {
  const [data, setData] = useState<AuditListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (params: Record<string, string> = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams(params);
      if (adminId) qs.set('adminId', adminId);
      const res = await adminFetch<{ data: AuditListResponse }>(`/api/v1/admin/audit?${qs}`);
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log');
    } finally {
      setIsLoading(false);
    }
  }, [adminId]);

  return { data, isLoading, error, load };
}

// ── Admin Roles ─────────────────────────────────────────────────

export function useAdminRoles() {
  const [data, setData] = useState<AdminRoleListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: AdminRoleListItem[] }>('/api/v1/admin/roles');
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load roles');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { data, isLoading, error, load };
}
