'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type {
  BudgetListItem,
  BudgetDetail,
  BudgetVsActualReport,
} from '@oppsera/module-accounting';

// ── useBudgets (list) ─────────────────────────────────────────
export function useBudgets(params?: { fiscalYear?: number; status?: string }) {
  const result = useQuery({
    queryKey: ['budgets', params],
    queryFn: () => {
      const p = new URLSearchParams();
      if (params?.fiscalYear) p.set('fiscalYear', String(params.fiscalYear));
      if (params?.status) p.set('status', params.status);
      const qs = p.toString();
      return apiFetch<{ data: BudgetListItem[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/accounting/budgets${qs ? `?${qs}` : ''}`,
      ).then((r) => r.data);
    },
    staleTime: 30_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useBudget (single) ───────────────────────────────────────
export function useBudget(budgetId: string | null) {
  const result = useQuery({
    queryKey: ['budget', budgetId],
    queryFn: () =>
      apiFetch<{ data: BudgetDetail }>(`/api/v1/accounting/budgets/${budgetId}`).then(
        (r) => r.data,
      ),
    enabled: !!budgetId,
    staleTime: 15_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useBudgetVsActual ─────────────────────────────────────────
export function useBudgetVsActual(params: {
  budgetId?: string;
  from?: string;
  to?: string;
}) {
  const result = useQuery({
    queryKey: ['budget-vs-actual', params],
    queryFn: () => {
      const p = new URLSearchParams();
      if (params.budgetId) p.set('budgetId', params.budgetId);
      if (params.from) p.set('from', params.from);
      if (params.to) p.set('to', params.to);
      const qs = p.toString();
      return apiFetch<{ data: BudgetVsActualReport }>(
        `/api/v1/accounting/reports/budget-vs-actual${qs ? `?${qs}` : ''}`,
      ).then((r) => r.data);
    },
    enabled: !!params.budgetId && !!params.from && !!params.to,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── Budget mutations ──────────────────────────────────────────
export function useBudgetMutations() {
  const qc = useQueryClient();

  const createBudget = useMutation({
    mutationFn: (input: { name: string; fiscalYear: number; description?: string; locationId?: string }) =>
      apiFetch('/api/v1/accounting/budgets', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] });
    },
  });

  const updateBudget = useMutation({
    mutationFn: ({ budgetId, ...input }: { budgetId: string; name?: string; description?: string; locationId?: string | null }) =>
      apiFetch(`/api/v1/accounting/budgets/${budgetId}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] });
      qc.invalidateQueries({ queryKey: ['budget'] });
    },
  });

  const approveBudget = useMutation({
    mutationFn: (budgetId: string) =>
      apiFetch(`/api/v1/accounting/budgets/${budgetId}/approve`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] });
      qc.invalidateQueries({ queryKey: ['budget'] });
    },
  });

  const lockBudget = useMutation({
    mutationFn: (budgetId: string) =>
      apiFetch(`/api/v1/accounting/budgets/${budgetId}/lock`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] });
      qc.invalidateQueries({ queryKey: ['budget'] });
    },
  });

  const upsertLines = useMutation({
    mutationFn: ({ budgetId, lines }: { budgetId: string; lines: Array<{ glAccountId: string; month1?: number; month2?: number; month3?: number; month4?: number; month5?: number; month6?: number; month7?: number; month8?: number; month9?: number; month10?: number; month11?: number; month12?: number; notes?: string }> }) =>
      apiFetch(`/api/v1/accounting/budgets/${budgetId}/lines`, { method: 'POST', body: JSON.stringify({ lines }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budget'] });
      qc.invalidateQueries({ queryKey: ['budget-vs-actual'] });
    },
  });

  return { createBudget, updateBudget, approveBudget, lockBudget, upsertLines };
}
