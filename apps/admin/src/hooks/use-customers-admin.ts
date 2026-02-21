'use client';

import { useState, useCallback } from 'react';
import { adminFetch } from '@/lib/api-fetch';
import type { CustomerListItem, CustomerDetail } from '@/types/users';

// ── Customer List ────────────────────────────────────────────────

interface CustomerListResponse {
  items: CustomerListItem[];
  cursor: string | null;
  hasMore: boolean;
}

export function useCustomerList() {
  const [data, setData] = useState<CustomerListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (params: Record<string, string> = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams(params);
      const res = await adminFetch<{ data: CustomerListResponse }>(`/api/v1/admin/customers?${qs}`);
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load customers');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { data, isLoading, error, load };
}

// ── Customer Detail ──────────────────────────────────────────────

export function useCustomerDetail(id: string) {
  const [data, setData] = useState<CustomerDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: CustomerDetail }>(`/api/v1/admin/customers/${id}`);
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load customer');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const update = useCallback(async (body: Record<string, unknown>) => {
    const res = await adminFetch<{ data: CustomerDetail }>(`/api/v1/admin/customers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    setData(res.data);
    return res.data;
  }, [id]);

  const suspend = useCallback(async (reason?: string) => {
    await adminFetch(`/api/v1/admin/customers/${id}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ action: 'suspend', reason }),
    });
    await load();
  }, [id, load]);

  const unsuspend = useCallback(async () => {
    await adminFetch(`/api/v1/admin/customers/${id}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ action: 'unsuspend' }),
    });
    await load();
  }, [id, load]);

  const resetPassword = useCallback(async () => {
    await adminFetch(`/api/v1/admin/customers/${id}/reset-password`, { method: 'POST' });
    await load();
  }, [id, load]);

  const resendInvite = useCallback(async () => {
    await adminFetch(`/api/v1/admin/customers/${id}/resend-invite`, { method: 'POST' });
    await load();
  }, [id, load]);

  return { data, isLoading, error, load, update, suspend, unsuspend, resetPassword, resendInvite };
}
