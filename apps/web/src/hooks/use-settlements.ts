'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type {
  Settlement,
  SettlementDetail,
  UnmatchedTenderItem,
} from '@/types/accounting';

// ── useSettlements ───────────────────────────────────────────

export interface SettlementFilters {
  status?: string;
  processorName?: string;
  startDate?: string;
  endDate?: string;
  cursor?: string;
  limit?: number;
}

export function useSettlements(filters: SettlementFilters = {}) {
  const result = useQuery({
    queryKey: ['settlements', filters],
    queryFn: () => {
      const qs = buildQueryString(filters);
      return apiFetch<{ data: Settlement[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/accounting/settlements${qs}`,
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

// ── useSettlement ────────────────────────────────────────────

export function useSettlement(id: string | null) {
  const result = useQuery({
    queryKey: ['settlement', id],
    queryFn: () =>
      apiFetch<{ data: SettlementDetail }>(
        `/api/v1/accounting/settlements/${id}`,
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

// ── useUnmatchedTenders ──────────────────────────────────────

export interface UnmatchedTenderFilters {
  startDate?: string;
  endDate?: string;
  locationId?: string;
  tenderType?: string;
  cursor?: string;
  limit?: number;
}

export function useUnmatchedTenders(filters: UnmatchedTenderFilters = {}) {
  const result = useQuery({
    queryKey: ['unmatched-tenders', filters],
    queryFn: () => {
      const qs = buildQueryString(filters);
      return apiFetch<{ data: UnmatchedTenderItem[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/accounting/settlements/unmatched-tenders${qs}`,
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

// ── useSettlementMutations ───────────────────────────────────

export function useSettlementMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['settlements'] });
    queryClient.invalidateQueries({ queryKey: ['settlement'] });
    queryClient.invalidateQueries({ queryKey: ['unmatched-tenders'] });
  };

  const createSettlement = useMutation({
    mutationFn: (input: {
      settlementDate: string;
      processorName: string;
      processorBatchId?: string;
      grossAmount: string;
      feeAmount?: string;
      netAmount: string;
      chargebackAmount?: string;
      bankAccountId?: string;
      notes?: string;
      lines?: Array<{
        originalAmountCents: number;
        settledAmountCents: number;
        feeCents?: number;
        netCents: number;
        tenderId?: string;
      }>;
    }) =>
      apiFetch('/api/v1/accounting/settlements', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidate(),
  });

  const importCsv = useMutation({
    mutationFn: (input: {
      processorName: string;
      bankAccountId?: string;
      csvContent: string;
    }) =>
      apiFetch('/api/v1/accounting/settlements/import', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidate(),
  });

  const matchTenders = useMutation({
    mutationFn: (input: {
      settlementId: string;
      matches: Array<{ settlementLineId: string; tenderId: string }>;
    }) =>
      apiFetch(`/api/v1/accounting/settlements/${input.settlementId}/match`, {
        method: 'POST',
        body: JSON.stringify({ matches: input.matches }),
      }),
    onSuccess: () => invalidate(),
  });

  const postSettlement = useMutation({
    mutationFn: (input: { settlementId: string; force?: boolean }) =>
      apiFetch(`/api/v1/accounting/settlements/${input.settlementId}/post`, {
        method: 'POST',
        body: JSON.stringify({ force: input.force }),
      }),
    onSuccess: () => invalidate(),
  });

  const voidSettlement = useMutation({
    mutationFn: (input: { settlementId: string; reason: string }) =>
      apiFetch(`/api/v1/accounting/settlements/${input.settlementId}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: input.reason }),
      }),
    onSuccess: () => invalidate(),
  });

  return {
    createSettlement,
    importCsv,
    matchTenders,
    postSettlement,
    voidSettlement,
  };
}
