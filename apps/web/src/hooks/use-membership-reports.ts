'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type {
  MembershipAgingReport,
  MembershipComplianceReportData,
  MembershipSpendReportData,
  MembershipChurnReportData,
  MembershipPortfolioData,
  MembershipPredictiveInsights,
} from '@/types/membership';

export function useMembershipAging(asOfDate?: string) {
  const [data, setData] = useState<MembershipAgingReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString({ asOfDate });
      const res = await apiFetch<{ data: MembershipAgingReport }>(`/api/v1/membership/reports/aging${qs}`);
      setData(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load aging report');
    } finally {
      setIsLoading(false);
    }
  }, [asOfDate]);

  useEffect(() => { fetch(); }, [fetch]);
  return { data, isLoading, error, refetch: fetch };
}

export function useMembershipCompliance(periodKey: string) {
  const [data, setData] = useState<MembershipComplianceReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!periodKey) return;
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString({ periodKey });
      const res = await apiFetch<{ data: MembershipComplianceReportData }>(`/api/v1/membership/reports/compliance${qs}`);
      setData(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load compliance report');
    } finally {
      setIsLoading(false);
    }
  }, [periodKey]);

  useEffect(() => { fetch(); }, [fetch]);
  return { data, isLoading, error, refetch: fetch };
}

export function useMembershipSpend(periodKey: string, membershipAccountId?: string) {
  const [data, setData] = useState<MembershipSpendReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!periodKey) return;
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString({ periodKey, membershipAccountId });
      const res = await apiFetch<{ data: MembershipSpendReportData }>(`/api/v1/membership/reports/spend${qs}`);
      setData(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load spend report');
    } finally {
      setIsLoading(false);
    }
  }, [periodKey, membershipAccountId]);

  useEffect(() => { fetch(); }, [fetch]);
  return { data, isLoading, error, refetch: fetch };
}

export function useMembershipChurn(riskLevel?: string) {
  const [data, setData] = useState<MembershipChurnReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString({ riskLevel });
      const res = await apiFetch<{ data: MembershipChurnReportData }>(`/api/v1/membership/reports/churn${qs}`);
      setData(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load churn report');
    } finally {
      setIsLoading(false);
    }
  }, [riskLevel]);

  useEffect(() => { fetch(); }, [fetch]);
  return { data, isLoading, error, refetch: fetch };
}

export function useMembershipPortfolio(asOfDate?: string) {
  const [data, setData] = useState<MembershipPortfolioData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString({ asOfDate });
      const res = await apiFetch<{ data: MembershipPortfolioData }>(`/api/v1/membership/reports/portfolio${qs}`);
      setData(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load portfolio report');
    } finally {
      setIsLoading(false);
    }
  }, [asOfDate]);

  useEffect(() => { fetch(); }, [fetch]);
  return { data, isLoading, error, refetch: fetch };
}

export function useMembershipInsights() {
  const [data, setData] = useState<MembershipPredictiveInsights | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: MembershipPredictiveInsights }>('/api/v1/membership/reports/insights');
      setData(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load insights');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { data, isLoading, error, refetch: fetch };
}
