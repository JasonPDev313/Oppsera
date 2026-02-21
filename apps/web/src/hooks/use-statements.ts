'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type {
  ProfitAndLoss,
  BalanceSheet,
  CashFlowStatement,
  HealthSummary,
  ClosePeriod,
  SalesTaxRow,
} from '@/types/accounting';

// ── useProfitAndLoss ────────────────────────────────────────

export function useProfitAndLoss(params: {
  startDate?: string;
  endDate?: string;
  locationId?: string;
  comparative?: boolean;
}) {
  const result = useQuery({
    queryKey: ['profit-loss', params],
    queryFn: () => {
      const p = new URLSearchParams();
      if (params.startDate) p.set('startDate', params.startDate);
      if (params.endDate) p.set('endDate', params.endDate);
      if (params.locationId) p.set('locationId', params.locationId);
      if (params.comparative) p.set('comparative', 'true');
      const qs = p.toString();
      return apiFetch<{ data: ProfitAndLoss }>(
        `/api/v1/accounting/statements/profit-loss${qs ? `?${qs}` : ''}`,
      ).then((r) => r.data);
    },
    enabled: !!params.startDate && !!params.endDate,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useBalanceSheet ─────────────────────────────────────────

export function useBalanceSheet(params: {
  asOfDate?: string;
  locationId?: string;
}) {
  const result = useQuery({
    queryKey: ['balance-sheet', params],
    queryFn: () => {
      const p = new URLSearchParams();
      if (params.asOfDate) p.set('asOfDate', params.asOfDate);
      if (params.locationId) p.set('locationId', params.locationId);
      const qs = p.toString();
      return apiFetch<{ data: BalanceSheet }>(
        `/api/v1/accounting/statements/balance-sheet${qs ? `?${qs}` : ''}`,
      ).then((r) => r.data);
    },
    enabled: !!params.asOfDate,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useCashFlow ─────────────────────────────────────────────

export function useCashFlow(params: { startDate?: string; endDate?: string }) {
  const result = useQuery({
    queryKey: ['cash-flow', params],
    queryFn: () => {
      const p = new URLSearchParams();
      if (params.startDate) p.set('startDate', params.startDate);
      if (params.endDate) p.set('endDate', params.endDate);
      const qs = p.toString();
      return apiFetch<{ data: CashFlowStatement }>(
        `/api/v1/accounting/statements/cash-flow${qs ? `?${qs}` : ''}`,
      ).then((r) => r.data);
    },
    enabled: !!params.startDate && !!params.endDate,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useSalesTaxLiability ────────────────────────────────────

export function useSalesTaxLiability(params: { startDate?: string; endDate?: string }) {
  const result = useQuery({
    queryKey: ['sales-tax-liability', params],
    queryFn: () => {
      const p = new URLSearchParams();
      if (params.startDate) p.set('startDate', params.startDate);
      if (params.endDate) p.set('endDate', params.endDate);
      const qs = p.toString();
      return apiFetch<{ data: SalesTaxRow[] }>(
        `/api/v1/accounting/reports/sales-tax-liability${qs ? `?${qs}` : ''}`,
      ).then((r) => r.data);
    },
    enabled: !!params.startDate && !!params.endDate,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
  };
}

// ── useHealthSummary ────────────────────────────────────────

export function useHealthSummary() {
  const result = useQuery({
    queryKey: ['health-summary'],
    queryFn: () =>
      apiFetch<{ data: HealthSummary }>(
        '/api/v1/accounting/statements/health-summary',
      ).then((r) => r.data),
    staleTime: 60_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useClosePeriods ─────────────────────────────────────────

export function useClosePeriods() {
  const result = useQuery({
    queryKey: ['close-periods'],
    queryFn: () =>
      apiFetch<{ data: ClosePeriod[] }>('/api/v1/accounting/close-periods').then(
        (r) => r.data,
      ),
    staleTime: 30_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useClosePeriod ──────────────────────────────────────────

export function useClosePeriod(period: string | null) {
  const result = useQuery({
    queryKey: ['close-period', period],
    queryFn: () =>
      apiFetch<{ data: ClosePeriod }>(
        `/api/v1/accounting/close-periods/${period}`,
      ).then((r) => r.data),
    enabled: !!period,
    staleTime: 15_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useCloseMutations ───────────────────────────────────────

export function useCloseMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['close-periods'] });
    queryClient.invalidateQueries({ queryKey: ['close-period'] });
  };

  const updateCloseStatus = useMutation({
    mutationFn: ({ period, status, notes }: { period: string; status: string; notes?: string }) =>
      apiFetch(`/api/v1/accounting/close-periods/${period}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, notes }),
      }),
    onSuccess: () => invalidate(),
  });

  const closePeriod = useMutation({
    mutationFn: (period: string) =>
      apiFetch(`/api/v1/accounting/close-periods/${period}/close`, {
        method: 'POST',
      }),
    onSuccess: () => invalidate(),
  });

  const generateRetainedEarnings = useMutation({
    mutationFn: (params: { startDate: string; endDate: string }) =>
      apiFetch('/api/v1/accounting/retained-earnings', {
        method: 'POST',
        body: JSON.stringify(params),
      }),
    onSuccess: () => invalidate(),
  });

  return { updateCloseStatus, closePeriod, generateRetainedEarnings };
}
