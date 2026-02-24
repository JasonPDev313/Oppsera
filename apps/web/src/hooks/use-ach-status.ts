'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

// ── Types ─────────────────────────────────────────────────────

export interface AchStatusSummary {
  pendingCount: number;
  pendingAmountCents: number;
  originatedCount: number;
  originatedAmountCents: number;
  settledCount: number;
  settledAmountCents: number;
  returnedCount: number;
  returnedAmountCents: number;
}

export interface AchPendingItem {
  id: string;
  amountCents: number;
  customerId: string | null;
  orderId: string | null;
  achSecCode: string | null;
  bankLast4: string | null;
  achSettlementStatus: string;
  createdAt: string;
}

export interface AchReturnItem {
  id: string;
  paymentIntentId: string;
  returnCode: string;
  returnReason: string;
  returnDate: string;
  originalAmountCents: number;
  isAdministrative: boolean;
  resolvedAt: string | null;
  createdAt: string;
}

export interface AchReturnCodeDistribution {
  returnCode: string;
  returnReason: string;
  count: number;
}

export interface AchSettlementByDate {
  date: string;
  settledCount: number;
  settledAmountCents: number;
  returnedCount: number;
  returnedAmountCents: number;
}

export interface AchStatusFilters {
  dateFrom?: string;
  dateTo?: string;
  locationId?: string;
}

// ── Summary Hook ──────────────────────────────────────────────

export function useAchStatusSummary(filters: AchStatusFilters = {}) {
  const result = useQuery({
    queryKey: ['ach-status-summary', filters],
    queryFn: () =>
      apiFetch<{ data: AchStatusSummary }>(
        `/api/v1/payments/ach-status${buildQueryString({ ...filters, view: 'summary' })}`,
      ).then((r) => r.data),
    staleTime: 30_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── Pending List Hook ─────────────────────────────────────────

export function useAchPending(filters: AchStatusFilters & { cursor?: string; limit?: number } = {}) {
  const result = useQuery({
    queryKey: ['ach-pending', filters],
    queryFn: () =>
      apiFetch<{ data: AchPendingItem[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/payments/ach-status${buildQueryString({ ...filters, view: 'pending' })}`,
      ).then((r) => ({ items: r.data, meta: r.meta })),
    staleTime: 15_000,
  });

  return {
    items: result.data?.items ?? [],
    meta: result.data?.meta ?? { cursor: null, hasMore: false },
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── Returns List Hook ─────────────────────────────────────────

export function useAchReturns(filters: AchStatusFilters & { cursor?: string; limit?: number } = {}) {
  const result = useQuery({
    queryKey: ['ach-returns', filters],
    queryFn: () =>
      apiFetch<{ data: AchReturnItem[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/payments/ach-status${buildQueryString({ ...filters, view: 'returns' })}`,
      ).then((r) => ({ items: r.data, meta: r.meta })),
    staleTime: 15_000,
  });

  return {
    items: result.data?.items ?? [],
    meta: result.data?.meta ?? { cursor: null, hasMore: false },
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── Return Distribution Hook ──────────────────────────────────

export function useAchReturnDistribution(filters: AchStatusFilters = {}) {
  const result = useQuery({
    queryKey: ['ach-return-distribution', filters],
    queryFn: () =>
      apiFetch<{ data: AchReturnCodeDistribution[] }>(
        `/api/v1/payments/ach-status${buildQueryString({ ...filters, view: 'distribution' })}`,
      ).then((r) => r.data),
    staleTime: 60_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── Settlement by Date Hook ───────────────────────────────────

export function useAchSettlementByDate(filters: AchStatusFilters = {}) {
  const result = useQuery({
    queryKey: ['ach-settlement-by-date', filters],
    queryFn: () =>
      apiFetch<{ data: AchSettlementByDate[] }>(
        `/api/v1/payments/ach-status${buildQueryString({ ...filters, view: 'settlement' })}`,
      ).then((r) => r.data),
    staleTime: 60_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── Poll Trigger ──────────────────────────────────────────────

export function useAchFundingPoll() {
  const queryClient = useQueryClient();

  const poll = useMutation({
    mutationFn: (input?: { date?: string; lookbackDays?: number }) =>
      apiFetch<{ data: { count: number; totalSettled: number; totalReturned: number; totalOriginated: number } }>(
        '/api/v1/payments/ach-funding/poll',
        {
          method: 'POST',
          body: JSON.stringify(input ?? {}),
        },
      ).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ach-status-summary'] });
      queryClient.invalidateQueries({ queryKey: ['ach-pending'] });
      queryClient.invalidateQueries({ queryKey: ['ach-returns'] });
      queryClient.invalidateQueries({ queryKey: ['ach-return-distribution'] });
      queryClient.invalidateQueries({ queryKey: ['ach-settlement-by-date'] });
    },
  });

  return poll;
}
