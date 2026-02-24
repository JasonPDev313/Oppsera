'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

// ── Types ─────────────────────────────────────────────────────

export interface FailedPaymentItem {
  id: string;
  status: string;
  amountCents: number;
  currency: string;
  paymentMethodType: string;
  cardLast4: string | null;
  cardBrand: string | null;
  customerId: string | null;
  orderId: string | null;
  locationId: string;
  errorMessage: string | null;
  attemptCount: number;
  latestResponseText: string | null;
  originalIntentId: string | null;
  // Response enrichment fields
  declineCategory: string | null;
  userMessage: string | null;
  suggestedAction: string | null;
  retryable: boolean;
  avsResult: string | null;
  cvvResult: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FailedPaymentCounts {
  total: number;
  declined: number;
  error: number;
}

export interface FailedPaymentFilters {
  dateFrom?: string;
  dateTo?: string;
  customerId?: string;
  locationId?: string;
  declineCategory?: string;
  cursor?: string;
  limit?: number;
}

// ── useFailedPayments ─────────────────────────────────────────

export function useFailedPayments(filters: FailedPaymentFilters = {}) {
  const result = useQuery({
    queryKey: ['failed-payments', filters],
    queryFn: () => {
      const qs = buildQueryString(filters);
      return apiFetch<{
        data: FailedPaymentItem[];
        meta: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/payments/failed${qs}`).then((r) => ({
        items: r.data,
        meta: r.meta,
      }));
    },
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

// ── useFailedPaymentCounts ────────────────────────────────────

export function useFailedPaymentCounts() {
  const result = useQuery({
    queryKey: ['failed-payment-counts'],
    queryFn: () =>
      apiFetch<{ data: FailedPaymentCounts }>(
        '/api/v1/payments/failed?counts=true',
      ).then((r) => r.data),
    staleTime: 30_000,
  });

  return {
    counts: result.data ?? { total: 0, declined: 0, error: 0 },
    isLoading: result.isLoading,
  };
}

// ── useFailedPaymentActions ───────────────────────────────────

export function useFailedPaymentActions() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['failed-payments'] });
    queryClient.invalidateQueries({ queryKey: ['failed-payment-counts'] });
    queryClient.invalidateQueries({ queryKey: ['payment-transactions'] });
  };

  const retryPayment = useMutation({
    mutationFn: (input: {
      id: string;
      token?: string;
      paymentMethodId?: string;
      paymentMethodType?: string;
    }) =>
      apiFetch(`/api/v1/payments/failed/${input.id}/retry`, {
        method: 'POST',
        body: JSON.stringify({
          token: input.token,
          paymentMethodId: input.paymentMethodId,
          paymentMethodType: input.paymentMethodType,
        }),
      }),
    onSuccess: () => invalidate(),
  });

  const resolvePayment = useMutation({
    mutationFn: (input: {
      id: string;
      resolution: 'resolved' | 'dismissed';
      reason: string;
      paidByOtherMeans?: boolean;
      otherMeansType?: string;
    }) =>
      apiFetch(`/api/v1/payments/failed/${input.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          resolution: input.resolution,
          reason: input.reason,
          paidByOtherMeans: input.paidByOtherMeans,
          otherMeansType: input.otherMeansType,
        }),
      }),
    onSuccess: () => invalidate(),
  });

  return {
    retryPayment,
    resolvePayment,
  };
}
