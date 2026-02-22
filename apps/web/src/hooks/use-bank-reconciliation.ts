'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type {
  BankReconciliationListItem,
  BankReconciliationDetail,
  BankReconciliationItem,
} from '@/types/accounting';

// ── List Reconciliations ─────────────────────────────────────

interface ListFilters {
  bankAccountId?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

export function useBankReconciliations(filters: ListFilters = {}) {
  const qs = buildQueryString(filters);
  const result = useQuery({
    queryKey: ['bank-reconciliations', filters],
    queryFn: async () => {
      const res = await apiFetch<{
        data: BankReconciliationListItem[];
        meta: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/accounting/bank-reconciliation${qs}`);
      return res;
    },
    staleTime: 15_000,
  });

  return {
    data: result.data?.data ?? [],
    meta: result.data?.meta ?? { cursor: null, hasMore: false },
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── Get Single Reconciliation ────────────────────────────────

export function useBankReconciliation(id: string | null) {
  const result = useQuery({
    queryKey: ['bank-reconciliation', id],
    queryFn: async () => {
      if (!id) return null;
      const res = await apiFetch<{ data: BankReconciliationDetail }>(
        `/api/v1/accounting/bank-reconciliation/${id}`,
      );
      return res.data;
    },
    enabled: !!id,
    staleTime: 5_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── Mutations ────────────────────────────────────────────────

export function useBankReconciliationMutations() {
  const queryClient = useQueryClient();

  const startReconciliation = useMutation({
    mutationFn: async (input: {
      bankAccountId: string;
      statementDate: string;
      statementEndingBalance: string;
    }) => {
      const res = await apiFetch<{ data: BankReconciliationDetail }>(
        '/api/v1/accounting/bank-reconciliation',
        { method: 'POST', body: JSON.stringify(input) },
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-reconciliations'] });
    },
  });

  const clearItems = useMutation({
    mutationFn: async (input: {
      reconciliationId: string;
      itemIds: string[];
      cleared: boolean;
    }) => {
      await apiFetch(
        `/api/v1/accounting/bank-reconciliation/${input.reconciliationId}/clear`,
        {
          method: 'POST',
          body: JSON.stringify({ itemIds: input.itemIds, cleared: input.cleared }),
        },
      );
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['bank-reconciliation', vars.reconciliationId] });
    },
  });

  const addAdjustment = useMutation({
    mutationFn: async (input: {
      reconciliationId: string;
      itemType: string;
      amount: string;
      date: string;
      description: string;
    }) => {
      const res = await apiFetch<{ data: BankReconciliationItem }>(
        `/api/v1/accounting/bank-reconciliation/${input.reconciliationId}/adjustment`,
        {
          method: 'POST',
          body: JSON.stringify({
            itemType: input.itemType,
            amount: input.amount,
            date: input.date,
            description: input.description,
          }),
        },
      );
      return res.data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['bank-reconciliation', vars.reconciliationId] });
    },
  });

  const completeReconciliation = useMutation({
    mutationFn: async (input: {
      reconciliationId: string;
      notes?: string;
    }) => {
      const res = await apiFetch<{ data: BankReconciliationDetail }>(
        `/api/v1/accounting/bank-reconciliation/${input.reconciliationId}/complete`,
        {
          method: 'POST',
          body: JSON.stringify({ notes: input.notes }),
        },
      );
      return res.data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['bank-reconciliation', vars.reconciliationId] });
      queryClient.invalidateQueries({ queryKey: ['bank-reconciliations'] });
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
    },
  });

  return {
    startReconciliation,
    clearItems,
    addAdjustment,
    completeReconciliation,
  };
}
