'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import type {
  Customer,
  CustomerDetail,
  MembershipPlan,
  MembershipPlanDetail,
  BillingAccount,
  BillingAccountDetail,
  ArTransaction,
  AgingReport,
} from '@/types/customers';

interface UseCustomersOptions {
  search?: string;
  tags?: string[];
}

export function useCustomers(options: UseCustomersOptions = {}) {
  const [data, setData] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);

  const fetchData = useCallback(async (loadMore = false) => {
    try {
      if (!loadMore) setIsLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (options.search) params.set('search', options.search);
      if (options.tags?.length) params.set('tags', options.tags.join(','));
      if (loadMore && cursorRef.current) params.set('cursor', cursorRef.current);

      const res = await apiFetch<{ data: Customer[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/customers?${params.toString()}`
      );
      if (loadMore) {
        setData((prev) => [...prev, ...res.data]);
      } else {
        setData(res.data);
      }
      cursorRef.current = res.meta.cursor;
      setHasMore(res.meta.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load customers'));
    } finally {
      setIsLoading(false);
    }
  }, [options.search, options.tags]);

  useEffect(() => {
    cursorRef.current = null;
    fetchData();
  }, [fetchData]);

  const loadMore = useCallback(() => fetchData(true), [fetchData]);
  const mutate = useCallback(() => {
    cursorRef.current = null;
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, hasMore, loadMore, mutate };
}

export function useCustomer(id: string | null) {
  const [data, setData] = useState<CustomerDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<{ data: CustomerDetail }>(`/api/v1/customers/${id}`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load customer'));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const mutate = () => fetchData();
  return { data, isLoading, error, mutate };
}

interface UseMembershipPlansOptions {
  isActive?: boolean;
}

export function useMembershipPlans(options: UseMembershipPlansOptions = {}) {
  const [data, setData] = useState<MembershipPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);

  const fetchData = useCallback(async (loadMore = false) => {
    try {
      if (!loadMore) setIsLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (options.isActive !== undefined) params.set('isActive', String(options.isActive));
      if (loadMore && cursorRef.current) params.set('cursor', cursorRef.current);

      const res = await apiFetch<{ data: MembershipPlan[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/memberships/plans?${params.toString()}`
      );
      if (loadMore) {
        setData((prev) => [...prev, ...res.data]);
      } else {
        setData(res.data);
      }
      cursorRef.current = res.meta.cursor;
      setHasMore(res.meta.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load membership plans'));
    } finally {
      setIsLoading(false);
    }
  }, [options.isActive]);

  useEffect(() => {
    cursorRef.current = null;
    fetchData();
  }, [fetchData]);

  const loadMore = useCallback(() => fetchData(true), [fetchData]);
  const mutate = useCallback(() => {
    cursorRef.current = null;
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, hasMore, loadMore, mutate };
}

export function useMembershipPlan(id: string | null) {
  const [data, setData] = useState<MembershipPlanDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<{ data: MembershipPlanDetail }>(`/api/v1/memberships/plans/${id}`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load membership plan'));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const mutate = () => fetchData();
  return { data, isLoading, error, mutate };
}

interface UseBillingAccountsOptions {
  status?: string;
}

export function useBillingAccounts(options: UseBillingAccountsOptions = {}) {
  const [data, setData] = useState<BillingAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);

  const fetchData = useCallback(async (loadMore = false) => {
    try {
      if (!loadMore) setIsLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (options.status) params.set('status', options.status);
      if (loadMore && cursorRef.current) params.set('cursor', cursorRef.current);

      const res = await apiFetch<{ data: BillingAccount[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/billing/accounts?${params.toString()}`
      );
      if (loadMore) {
        setData((prev) => [...prev, ...res.data]);
      } else {
        setData(res.data);
      }
      cursorRef.current = res.meta.cursor;
      setHasMore(res.meta.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load billing accounts'));
    } finally {
      setIsLoading(false);
    }
  }, [options.status]);

  useEffect(() => {
    cursorRef.current = null;
    fetchData();
  }, [fetchData]);

  const loadMore = useCallback(() => fetchData(true), [fetchData]);
  const mutate = useCallback(() => {
    cursorRef.current = null;
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, hasMore, loadMore, mutate };
}

export function useBillingAccount(id: string | null) {
  const [data, setData] = useState<BillingAccountDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<{ data: BillingAccountDetail }>(`/api/v1/billing/accounts/${id}`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load billing account'));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const mutate = () => fetchData();
  return { data, isLoading, error, mutate };
}

export function useArLedger(billingAccountId: string | null) {
  const [data, setData] = useState<ArTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);

  const fetchData = useCallback(async (loadMore = false) => {
    if (!billingAccountId) return;
    try {
      if (!loadMore) setIsLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (loadMore && cursorRef.current) params.set('cursor', cursorRef.current);

      const res = await apiFetch<{ data: ArTransaction[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/billing/accounts/${billingAccountId}/transactions?${params.toString()}`
      );
      if (loadMore) {
        setData((prev) => [...prev, ...res.data]);
      } else {
        setData(res.data);
      }
      cursorRef.current = res.meta.cursor;
      setHasMore(res.meta.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load transactions'));
    } finally {
      setIsLoading(false);
    }
  }, [billingAccountId]);

  useEffect(() => {
    cursorRef.current = null;
    fetchData();
  }, [fetchData]);

  const loadMore = useCallback(() => fetchData(true), [fetchData]);
  const mutate = useCallback(() => {
    cursorRef.current = null;
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, hasMore, loadMore, mutate };
}

export function useAgingReport(billingAccountId: string | null) {
  const [data, setData] = useState<AgingReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!billingAccountId) return;
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<{ data: AgingReport }>(`/api/v1/billing/accounts/${billingAccountId}/aging`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load aging report'));
    } finally {
      setIsLoading(false);
    }
  }, [billingAccountId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const mutate = () => fetchData();
  return { data, isLoading, error, mutate };
}
