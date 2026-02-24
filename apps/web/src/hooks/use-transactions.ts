'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

// ── Types ─────────────────────────────────────────────────────

export interface TransactionListItem {
  id: string;
  status: string;
  amountCents: number;
  currency: string;
  authorizedAmountCents: number | null;
  capturedAmountCents: number | null;
  refundedAmountCents: number | null;
  paymentMethodType: string;
  cardLast4: string | null;
  cardBrand: string | null;
  customerId: string | null;
  orderId: string | null;
  locationId: string;
  providerRef: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionRecord {
  id: string;
  transactionType: string;
  providerRef: string | null;
  authCode: string | null;
  amountCents: number;
  responseStatus: string;
  responseCode: string | null;
  responseText: string | null;
  avsResponse: string | null;
  cvvResponse: string | null;
  createdAt: string;
}

export interface TransactionDetail extends TransactionListItem {
  providerId: string;
  merchantAccountId: string;
  tenderId: string | null;
  token: string | null;
  idempotencyKey: string;
  metadata: Record<string, unknown> | null;
  createdBy: string;
  transactions: TransactionRecord[];
}

// ── Filters ───────────────────────────────────────────────────

export interface TransactionFilters {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  amountMinCents?: number;
  amountMaxCents?: number;
  cardLast4?: string;
  customerId?: string;
  orderId?: string;
  locationId?: string;
  cursor?: string;
  limit?: number;
}

// ── useTransactions ──────────────────────────────────────────

export function useTransactions(filters: TransactionFilters = {}) {
  const result = useQuery({
    queryKey: ['payment-transactions', filters],
    queryFn: () => {
      const qs = buildQueryString(filters);
      return apiFetch<{
        data: TransactionListItem[];
        meta: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/payments/transactions${qs}`).then((r) => ({
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

// ── useTransactionDetail ─────────────────────────────────────

export function useTransactionDetail(id: string | null) {
  const result = useQuery({
    queryKey: ['payment-transaction', id],
    queryFn: () =>
      apiFetch<{ data: TransactionDetail }>(
        `/api/v1/payments/transactions/${id}`,
      ).then((r) => r.data),
    enabled: !!id,
    staleTime: 10_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useTransactionActions ────────────────────────────────────

export function useTransactionActions() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['payment-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['payment-transaction'] });
  };

  const voidTransaction = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/payments/transactions/${id}/void`, { method: 'POST' }),
    onSuccess: () => invalidate(),
  });

  const refundTransaction = useMutation({
    mutationFn: (input: { id: string; amountCents?: number }) =>
      apiFetch(`/api/v1/payments/transactions/${input.id}/refund`, {
        method: 'POST',
        body: JSON.stringify(
          input.amountCents !== undefined ? { amountCents: input.amountCents } : {},
        ),
      }),
    onSuccess: () => invalidate(),
  });

  const inquireTransaction = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/payments/transactions/${id}/inquire`, { method: 'POST' }),
    onSuccess: () => invalidate(),
  });

  return {
    voidTransaction,
    refundTransaction,
    inquireTransaction,
  };
}
