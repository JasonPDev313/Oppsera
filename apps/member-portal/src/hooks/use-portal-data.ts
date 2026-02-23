'use client';

import { useState, useEffect, useCallback } from 'react';
import { portalFetch } from '@/lib/api-client';

function usePortalQuery<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await portalFetch<{ data: T }>(url);
      setData(res.data);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [url]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, isLoading, error, refresh };
}

// ── Typed hooks for each portal endpoint ─────────────────────────

export interface PortalSummary {
  accountId: string | null;
  accountNumber: string | null;
  accountStatus: string | null;
  memberRole: string | null;
  creditLimitCents: number;
  autopayEnabled: boolean;
  statementDayOfMonth: number;
  startDate: string | null;
  recentStatements: PortalStatement[];
  activeSubscriptionCount: number;
}

export interface PortalStatement {
  id: string;
  statementNumber: string | null;
  periodStart: string;
  periodEnd: string;
  totalDueCents: number;
  status: string;
  createdAt: string;
}

export interface PortalAccount {
  accountId: string;
  accountNumber: string;
  status: string;
  memberRole: string;
  planName: string | null;
  currentBalanceCents: number;
  creditLimitCents: number;
  autopayEnabled: boolean;
  statementDayOfMonth: number;
  startDate: string | null;
}

export interface AutopayProfile {
  enabled: boolean;
  strategy: string | null;
  maxAmountCents: number | null;
  paymentMethodId: string | null;
}

export interface MinimumProgress {
  policyId: string;
  policyName: string;
  requiredCents: number;
  spentCents: number;
  remainingCents: number;
  periodStart: string;
  periodEnd: string;
  percentComplete: number;
}

export function usePortalSummary() {
  return usePortalQuery<PortalSummary>('/api/v1/summary');
}

export function usePortalAccount() {
  return usePortalQuery<PortalAccount>('/api/v1/account');
}

export function usePortalStatements() {
  return usePortalQuery<PortalStatement[]>('/api/v1/statements');
}

export function usePortalAutopay() {
  return usePortalQuery<AutopayProfile>('/api/v1/autopay');
}

export function usePortalMinimums() {
  return usePortalQuery<MinimumProgress[]>('/api/v1/minimums');
}

export function usePortalInitiation() {
  return usePortalQuery<any>('/api/v1/initiation');
}

export function useUpdateAutopay() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateAutopay = useCallback(async (updates: Record<string, unknown>) => {
    setIsSubmitting(true);
    try {
      const res = await portalFetch<{ data: AutopayProfile }>('/api/v1/autopay', {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      return res.data;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return { updateAutopay, isSubmitting };
}
