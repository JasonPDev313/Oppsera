'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type { TipBalanceItem, TipPayoutItem, TipPayoutType } from '@/types/accounting';

// ── Tip Balances ────────────────────────────────────────────

interface UseTipBalancesOptions {
  locationId?: string;
  asOfDate?: string;
}

export function useTipBalances(options?: UseTipBalancesOptions) {
  const [data, setData] = useState<TipBalanceItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString({
        locationId: options?.locationId,
        asOfDate: options?.asOfDate,
      });
      const res = await apiFetch<{ data: TipBalanceItem[] }>(`/api/v1/tip-payouts/balances${qs}`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tip balances');
    } finally {
      setIsLoading(false);
    }
  }, [options?.locationId, options?.asOfDate]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, isLoading, error, refresh: fetch };
}

// ── Tip Payout History ──────────────────────────────────────

interface UseTipPayoutsOptions {
  locationId?: string;
  employeeId?: string;
  businessDateFrom?: string;
  businessDateTo?: string;
  status?: string;
  limit?: number;
}

export function useTipPayouts(options?: UseTipPayoutsOptions) {
  const [items, setItems] = useState<TipPayoutItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (nextCursor?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString({
        locationId: options?.locationId,
        employeeId: options?.employeeId,
        businessDateFrom: options?.businessDateFrom,
        businessDateTo: options?.businessDateTo,
        status: options?.status,
        limit: options?.limit ? String(options.limit) : undefined,
        cursor: nextCursor,
      });
      const res = await apiFetch<{ data: TipPayoutItem[]; meta: { cursor: string | null; hasMore: boolean } }>(`/api/v1/tip-payouts${qs}`);
      if (nextCursor) {
        setItems((prev) => [...prev, ...res.data]);
      } else {
        setItems(res.data);
      }
      setCursor(res.meta?.cursor ?? null);
      setHasMore(res.meta?.hasMore ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tip payouts');
    } finally {
      setIsLoading(false);
    }
  }, [options?.locationId, options?.employeeId, options?.businessDateFrom, options?.businessDateTo, options?.status, options?.limit]);

  useEffect(() => { fetch(); }, [fetch]);

  const loadMore = useCallback(() => {
    if (cursor && hasMore) fetch(cursor);
  }, [cursor, hasMore, fetch]);

  return { items, isLoading, error, hasMore, loadMore, refresh: () => fetch() };
}

// ── Mutations ───────────────────────────────────────────────

export function useTipPayoutMutations() {
  const [isLoading, setIsLoading] = useState(false);

  const createPayout = useCallback(async (input: {
    locationId: string;
    employeeId: string;
    payoutType: TipPayoutType;
    amountCents: number;
    businessDate: string;
    drawerSessionId?: string;
    payrollPeriod?: string;
    approvedBy?: string;
    notes?: string;
  }) => {
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: TipPayoutItem }>('/api/v1/tip-payouts', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return res.data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const voidPayout = useCallback(async (payoutId: string, reason: string) => {
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: TipPayoutItem }>(`/api/v1/tip-payouts/${payoutId}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      return res.data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { createPayout, voidPayout, isLoading };
}
