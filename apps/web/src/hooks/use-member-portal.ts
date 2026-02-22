'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import type {
  MemberPortalSummary,
  MemberPortalAutopayProfile,
} from '@/types/membership';

export function useMemberPortalSummary() {
  const [data, setData] = useState<MemberPortalSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/v1/member-portal/summary');
      setData(res.data);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load portal summary');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, isLoading, error, refresh: fetch };
}

export function useMemberPortalAutopay() {
  const [data, setData] = useState<MemberPortalAutopayProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/v1/member-portal/autopay');
      setData(res.data);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load autopay profile');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const updateAutopay = useCallback(async (updates: Record<string, unknown>) => {
    const res = await apiFetch('/api/v1/member-portal/autopay', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    setData(res.data);
    return res.data;
  }, []);

  return { data, isLoading, error, refresh: fetch, updateAutopay };
}
