'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type { DepositSlipItem, DenominationBreakdown } from '@/types/accounting';

// ── useDepositSlips ──────────────────────────────────────────

export interface DepositSlipFilters {
  locationId?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

export function useDepositSlips(filters: DepositSlipFilters = {}) {
  const result = useQuery({
    queryKey: ['deposit-slips', filters],
    queryFn: () => {
      const qs = buildQueryString(filters);
      return apiFetch<{ data: DepositSlipItem[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/accounting/deposits${qs}`,
      ).then((r) => ({ items: r.data, meta: r.meta }));
    },
    staleTime: 30_000,
  });

  return {
    items: result.data?.items ?? [],
    meta: result.data?.meta ?? { cursor: null, hasMore: false },
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useDepositSlip ───────────────────────────────────────────

export function useDepositSlip(id: string | null) {
  const result = useQuery({
    queryKey: ['deposit-slip', id],
    queryFn: () =>
      apiFetch<{ data: DepositSlipItem }>(
        `/api/v1/accounting/deposits/${id}`,
      ).then((r) => r.data),
    enabled: !!id,
    staleTime: 15_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useDepositMutations ──────────────────────────────────────

export function useDepositMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['deposit-slips'] });
    queryClient.invalidateQueries({ queryKey: ['deposit-slip'] });
    queryClient.invalidateQueries({ queryKey: ['close-status'] });
  };

  const createDeposit = useMutation({
    mutationFn: (input: {
      locationId: string;
      businessDate: string;
      depositType?: string;
      totalAmountCents: number;
      bankAccountId?: string;
      retailCloseBatchIds?: string[];
      fnbCloseBatchId?: string;
      notes?: string;
    }) =>
      apiFetch('/api/v1/accounting/deposits', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidate(),
  });

  const markDeposited = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/accounting/deposits/${id}/deposited`, {
        method: 'POST',
      }),
    onSuccess: () => invalidate(),
  });

  const prepareDeposit = useMutation({
    mutationFn: (input: {
      depositSlipId: string;
      denominationBreakdown: DenominationBreakdown;
      slipNumber?: string;
      totalAmountCents: number;
    }) =>
      apiFetch(`/api/v1/accounting/deposits/${input.depositSlipId}/prepare`, {
        method: 'POST',
        body: JSON.stringify({
          denominationBreakdown: input.denominationBreakdown,
          slipNumber: input.slipNumber,
          totalAmountCents: input.totalAmountCents,
        }),
      }),
    onSuccess: () => invalidate(),
  });

  const reconcileDeposit = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/accounting/deposits/${id}/reconcile`, {
        method: 'POST',
      }),
    onSuccess: () => invalidate(),
  });

  return {
    createDeposit,
    prepareDeposit,
    markDeposited,
    reconcileDeposit,
  };
}
