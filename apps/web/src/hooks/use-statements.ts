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
      if (params.startDate) p.set('from', params.startDate);
      if (params.endDate) p.set('to', params.endDate);
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
      if (params.startDate) p.set('from', params.startDate);
      if (params.endDate) p.set('to', params.endDate);
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
      if (params.startDate) p.set('from', params.startDate);
      if (params.endDate) p.set('to', params.endDate);
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

// ── useAgedTrialBalance ─────────────────────────────────────

export interface AgedTrialBalanceAccount {
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: string;
  normalBalance: string;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
  total: number;
}

export interface AgedTrialBalanceTotals {
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
  total: number;
}

export interface AgedTrialBalanceReport {
  asOfDate: string;
  accounts: AgedTrialBalanceAccount[];
  totals: AgedTrialBalanceTotals;
  accountCount: number;
}

const emptyAgedTB: AgedTrialBalanceReport = {
  asOfDate: '',
  accounts: [],
  totals: { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0, total: 0 },
  accountCount: 0,
};

export function useAgedTrialBalance(params: {
  asOfDate?: string;
  locationId?: string;
}) {
  const result = useQuery({
    queryKey: ['aged-trial-balance', params],
    queryFn: () => {
      const p = new URLSearchParams();
      if (params.asOfDate) p.set('asOf', params.asOfDate);
      if (params.locationId) p.set('locationId', params.locationId);
      const qs = p.toString();
      return apiFetch<{ data: AgedTrialBalanceReport }>(
        `/api/v1/accounting/reports/aged-trial-balance${qs ? `?${qs}` : ''}`,
      ).then((r) => r.data);
    },
    enabled: !!params.asOfDate,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? emptyAgedTB,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useCashFlowForecast ─────────────────────────────────────

export interface CashFlowForecastItem {
  date: string;
  type: 'ap' | 'ar';
  entityId: string;
  entityName: string;
  referenceNumber: string;
  amount: number;
}

export interface CashFlowForecastDay {
  date: string;
  inflows: number;
  outflows: number;
  net: number;
  runningBalance: number;
}

export interface CashFlowForecastReport {
  asOfDate: string;
  forecastDays: number;
  startingCash: number;
  projected30: number;
  projected60: number;
  projected90: number;
  dailyForecast: CashFlowForecastDay[];
  upcomingItems: CashFlowForecastItem[];
}

const emptyCashForecast: CashFlowForecastReport = {
  asOfDate: '',
  forecastDays: 90,
  startingCash: 0,
  projected30: 0,
  projected60: 0,
  projected90: 0,
  dailyForecast: [],
  upcomingItems: [],
};

export function useCashFlowForecast(params: {
  days?: number;
  locationId?: string;
}) {
  const result = useQuery({
    queryKey: ['cash-flow-forecast', params],
    queryFn: () => {
      const p = new URLSearchParams();
      if (params.days) p.set('days', String(params.days));
      if (params.locationId) p.set('locationId', params.locationId);
      const qs = p.toString();
      return apiFetch<{ data: CashFlowForecastReport }>(
        `/api/v1/accounting/reports/cash-flow-forecast${qs ? `?${qs}` : ''}`,
      ).then((r) => r.data);
    },
    staleTime: 30_000,
  });

  return {
    data: result.data ?? emptyCashForecast,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useConsolidatedPL ───────────────────────────────────────

export interface ConsolidatedPLAccountLine {
  accountId: string;
  accountNumber: string;
  accountName: string;
  classificationName: string | null;
  isContraAccount: boolean;
  amount: number;
}

export interface ConsolidatedPLSection {
  label: string;
  accounts: ConsolidatedPLAccountLine[];
  subtotal: number;
}

export interface LocationPnl {
  locationId: string;
  locationName: string;
  sections: ConsolidatedPLSection[];
  grossRevenue: number;
  contraRevenue: number;
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
}

export interface ConsolidatedPLReport {
  period: { from: string; to: string };
  locations: LocationPnl[];
  consolidated: {
    sections: ConsolidatedPLSection[];
    grossRevenue: number;
    contraRevenue: number;
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
  };
  locationCount: number;
}

const emptyConsolidatedPL: ConsolidatedPLReport = {
  period: { from: '', to: '' },
  locations: [],
  consolidated: {
    sections: [],
    grossRevenue: 0,
    contraRevenue: 0,
    totalRevenue: 0,
    totalExpenses: 0,
    netIncome: 0,
  },
  locationCount: 0,
};

export function useConsolidatedPL(params: {
  from?: string;
  to?: string;
  locationIds?: string[];
}) {
  const result = useQuery({
    queryKey: ['consolidated-pl', params],
    queryFn: () => {
      const p = new URLSearchParams();
      if (params.from) p.set('from', params.from);
      if (params.to) p.set('to', params.to);
      if (params.locationIds?.length) p.set('locationIds', params.locationIds.join(','));
      const qs = p.toString();
      return apiFetch<{ data: ConsolidatedPLReport }>(
        `/api/v1/accounting/reports/consolidated-pl${qs ? `?${qs}` : ''}`,
      ).then((r) => r.data);
    },
    enabled: !!params.from && !!params.to,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? emptyConsolidatedPL,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
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
