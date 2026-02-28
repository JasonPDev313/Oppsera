'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

// ── Types ────────────────────────────────────────────────────

interface SupportedCurrenciesData {
  baseCurrency: string;
  supportedCurrencies: string[];
}

interface ExchangeRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  effectiveDate: string;
  source: string | null;
  createdAt: string;
}

interface ExchangeRateListResult {
  data: ExchangeRate[];
  meta: { cursor: string | null; hasMore: boolean };
}

interface UnrealizedGainLossLine {
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: string;
  normalBalance: string;
  transactionCurrency: string;
  transactionCurrencyBalance: number;
  bookedBaseBalance: number;
  currentRate: number | null;
  revaluedBaseBalance: number | null;
  unrealizedGainLoss: number | null;
}

interface UnrealizedGainLossReport {
  asOfDate: string;
  baseCurrency: string;
  lines: UnrealizedGainLossLine[];
  totalUnrealizedGainLoss: number;
  missingRates: string[];
}

// ── useSupportedCurrencies ───────────────────────────────────

export function useSupportedCurrencies() {
  const result = useQuery({
    queryKey: ['currency-supported'],
    queryFn: () =>
      apiFetch<{ data: SupportedCurrenciesData }>('/api/v1/accounting/currencies/supported')
        .then((r) => r.data)
        .catch((err) => {
          if (err?.statusCode === 404) return null;
          throw err;
        }),
    staleTime: 60_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useUpdateSupportedCurrencies ─────────────────────────────

export function useUpdateSupportedCurrencies() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (currencies: string[]) =>
      apiFetch<{ data: unknown }>('/api/v1/accounting/currencies/supported', {
        method: 'PATCH',
        body: JSON.stringify({ currencies }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currency-supported'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-settings'] });
    },
  });
}

// ── useExchangeRates ─────────────────────────────────────────

interface UseExchangeRatesOptions {
  fromCurrency?: string;
  toCurrency?: string;
  limit?: number;
}

export function useExchangeRates(options: UseExchangeRatesOptions = {}) {
  const result = useQuery({
    queryKey: ['exchange-rates', options.fromCurrency, options.toCurrency],
    queryFn: () => {
      const params = new URLSearchParams();
      if (options.fromCurrency) params.set('fromCurrency', options.fromCurrency);
      if (options.toCurrency) params.set('toCurrency', options.toCurrency);
      if (options.limit) params.set('limit', String(options.limit));
      const qs = params.toString();
      return apiFetch<ExchangeRateListResult>(
        `/api/v1/accounting/currencies/rates${qs ? `?${qs}` : ''}`,
      ).then((r) => ({ items: r.data, cursor: r.meta.cursor, hasMore: r.meta.hasMore }));
    },
    staleTime: 30_000,
  });

  return {
    data: result.data ?? { items: [], cursor: null, hasMore: false },
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useUpdateExchangeRate ────────────────────────────────────

interface UpdateExchangeRateInput {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  effectiveDate: string;
  source?: string;
}

export function useUpdateExchangeRate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateExchangeRateInput) =>
      apiFetch<{ data: unknown }>('/api/v1/accounting/currencies/rates', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchange-rates'] });
    },
  });
}

// ── useUnrealizedGainLoss ────────────────────────────────────

export function useUnrealizedGainLoss(asOfDate: string | null) {
  const result = useQuery({
    queryKey: ['unrealized-gain-loss', asOfDate],
    queryFn: () =>
      apiFetch<{ data: UnrealizedGainLossReport }>(
        `/api/v1/accounting/currencies/unrealized-gain-loss?asOfDate=${asOfDate}`,
      ).then((r) => r.data),
    enabled: !!asOfDate,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}
