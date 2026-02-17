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
  CustomerProfileOverview,
  CustomerFinancial,
  CustomerPreference,
  CustomerActivity,
  CustomerVisit,
  CustomerIncident,
  CustomerAlert,
  CustomerDocument,
  CustomerCommunication,
  CustomerConsent,
  CustomerExternalId,
  CustomerSegmentMembership,
  CustomerScore,
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

// ── Session 16.5: Customer Profile Hooks ────────────────────────

// ── Profile Overview Hook ────────────────────────────────────────
export function useCustomerProfile(customerId: string | null) {
  const [data, setData] = useState<CustomerProfileOverview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!customerId) { setData(null); return; }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: CustomerProfileOverview }>(`/api/v1/customers/${customerId}/profile`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch profile'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  return { data, isLoading, error, mutate: fetchProfile };
}

// ── Financial Tab Hook ───────────────────────────────────────────
export function useCustomerFinancial(customerId: string | null) {
  const [data, setData] = useState<CustomerFinancial | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!customerId) { setData(null); return; }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: CustomerFinancial }>(`/api/v1/customers/${customerId}/profile/financial`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch financial data'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

// ── Preferences Tab Hook ─────────────────────────────────────────
export function useCustomerPreferences(customerId: string | null) {
  const [data, setData] = useState<Record<string, CustomerPreference[]> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!customerId) { setData(null); return; }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: Record<string, CustomerPreference[]> }>(`/api/v1/customers/${customerId}/profile/preferences`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch preferences'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

// ── Activity Tab Hook ────────────────────────────────────────────
interface CustomerActivityData {
  timeline: CustomerActivity[];
  recentVisits: CustomerVisit[];
}

export function useCustomerActivityTab(customerId: string | null) {
  const [data, setData] = useState<CustomerActivityData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);

  const fetchData = useCallback(async (loadMoreFlag = false) => {
    if (!customerId) { setData(null); return; }
    if (!loadMoreFlag) setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (loadMoreFlag && cursorRef.current) params.set('cursor', cursorRef.current);

      const res = await apiFetch<{
        data: CustomerActivityData;
        meta: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/customers/${customerId}/profile/activity?${params.toString()}`);

      if (loadMoreFlag && data) {
        setData({
          timeline: [...data.timeline, ...res.data.timeline],
          recentVisits: res.data.recentVisits,
        });
      } else {
        setData(res.data);
      }
      cursorRef.current = res.meta.cursor;
      setHasMore(res.meta.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch activity'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId, data]);

  useEffect(() => {
    cursorRef.current = null;
    fetchData();
  }, [customerId]); // fetchData intentionally omitted to avoid refetch loops

  const loadMore = useCallback(() => fetchData(true), [fetchData]);
  const mutate = useCallback(() => {
    cursorRef.current = null;
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, hasMore, loadMore, mutate };
}

// ── Notes Tab Hook ───────────────────────────────────────────────
interface CustomerNotesData {
  staffNotes: Array<{ id: string; content: string; createdAt: string; createdBy: string | null }>;
  incidents: CustomerIncident[];
  alerts: CustomerAlert[];
}

export function useCustomerNotes(customerId: string | null) {
  const [data, setData] = useState<CustomerNotesData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!customerId) { setData(null); return; }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: CustomerNotesData }>(`/api/v1/customers/${customerId}/profile/notes`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch notes'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

// ── Documents Tab Hook ───────────────────────────────────────────
export function useCustomerDocuments(customerId: string | null) {
  const [data, setData] = useState<CustomerDocument[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!customerId) { setData(null); return; }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: CustomerDocument[] }>(`/api/v1/customers/${customerId}/profile/documents`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch documents'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

// ── Communications Tab Hook ──────────────────────────────────────
export function useCustomerCommunications(customerId: string | null) {
  const [data, setData] = useState<CustomerCommunication[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);

  const fetchData = useCallback(async (loadMoreFlag = false) => {
    if (!customerId) { setData([]); return; }
    if (!loadMoreFlag) setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (loadMoreFlag && cursorRef.current) params.set('cursor', cursorRef.current);

      const res = await apiFetch<{
        data: CustomerCommunication[];
        meta: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/customers/${customerId}/profile/communications?${params.toString()}`);

      if (loadMoreFlag) {
        setData((prev) => [...prev, ...res.data]);
      } else {
        setData(res.data);
      }
      cursorRef.current = res.meta.cursor;
      setHasMore(res.meta.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch communications'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

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

// ── Compliance Tab Hook ──────────────────────────────────────────
interface CustomerComplianceData {
  consents: CustomerConsent[];
  externalIds: CustomerExternalId[];
}

export function useCustomerCompliance(customerId: string | null) {
  const [data, setData] = useState<CustomerComplianceData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!customerId) { setData(null); return; }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: CustomerComplianceData }>(`/api/v1/customers/${customerId}/profile/compliance`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch compliance data'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

// ── Segments Tab Hook ────────────────────────────────────────────
export function useCustomerSegments(customerId: string | null) {
  const [data, setData] = useState<CustomerSegmentMembership[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!customerId) { setData(null); return; }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: CustomerSegmentMembership[] }>(`/api/v1/customers/${customerId}/profile/segments`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch segments'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

// ── Integrations Tab Hook ────────────────────────────────────────
interface CustomerIntegrationsData {
  externalIds: CustomerExternalId[];
}

export function useCustomerIntegrations(customerId: string | null) {
  const [data, setData] = useState<CustomerIntegrationsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!customerId) { setData(null); return; }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: CustomerIntegrationsData }>(`/api/v1/customers/${customerId}/profile/integrations`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch integrations'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

// ── Analytics Tab Hook ───────────────────────────────────────────
interface CustomerAnalyticsData {
  scores: CustomerScore[];
  stats: {
    totalVisits: number;
    totalSpendCents: number;
    avgSpendCents: number;
    lifetimeValueCents: number;
    revenueByCategory: Record<string, number>;
    firstVisitAt: string | null;
    lastVisitAt: string | null;
    daysSinceLastVisit: number | null;
    visitFrequency: string;
    avgVisitDurationMinutes: number | null;
  };
}

export function useCustomerAnalytics(customerId: string | null) {
  const [data, setData] = useState<CustomerAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!customerId) { setData(null); return; }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: CustomerAnalyticsData }>(`/api/v1/customers/${customerId}/profile/analytics`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch analytics'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}
