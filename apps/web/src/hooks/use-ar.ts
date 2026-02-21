'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type {
  ARInvoice,
  ARReceipt,
  ARAgingRow,
} from '@/types/accounting';

// ── Invoice Filters ─────────────────────────────────────────

export interface ARInvoiceFilters {
  customerId?: string;
  status?: string;
  sourceType?: string;
  startDate?: string;
  endDate?: string;
  overdueOnly?: boolean;
  cursor?: string;
  limit?: number;
}

// ── useARInvoices ───────────────────────────────────────────

export function useARInvoices(filters: ARInvoiceFilters = {}) {
  const result = useQuery({
    queryKey: ['ar-invoices', filters],
    queryFn: () => {
      const qs = buildQueryString(filters);
      return apiFetch<{
        data: ARInvoice[];
        meta?: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/ar/invoices${qs}`).then((r) => r);
    },
    staleTime: 30_000,
  });

  return {
    data: result.data?.data ?? [],
    meta: result.data?.meta ?? { cursor: null, hasMore: false },
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useARInvoice ────────────────────────────────────────────

export function useARInvoice(id: string | null) {
  const result = useQuery({
    queryKey: ['ar-invoice', id],
    queryFn: () =>
      apiFetch<{ data: ARInvoice }>(`/api/v1/ar/invoices/${id}`).then((r) => r.data),
    enabled: !!id,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useARInvoiceMutations ───────────────────────────────────

export function useARInvoiceMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['ar-invoices'] });
    queryClient.invalidateQueries({ queryKey: ['ar-invoice'] });
  };

  const createInvoice = useMutation({
    mutationFn: (input: {
      customerId: string;
      billingAccountId?: string | null;
      invoiceDate: string;
      dueDate: string;
      sourceType: string;
      locationId?: string | null;
      memo?: string | null;
      lines: {
        revenueAccountId: string;
        description?: string | null;
        quantity: string;
        unitPrice: string;
        amount: string;
        taxGroupId?: string | null;
        taxAmount?: string;
      }[];
    }) =>
      apiFetch<{ data: ARInvoice }>('/api/v1/ar/invoices', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  const postInvoice = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ data: ARInvoice }>(`/api/v1/ar/invoices/${id}/post`, {
        method: 'POST',
      }).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  const voidInvoice = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch<{ data: ARInvoice }>(`/api/v1/ar/invoices/${id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  return { createInvoice, postInvoice, voidInvoice };
}

// ── Receipt Filters ─────────────────────────────────────────

export interface ARReceiptFilters {
  customerId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  cursor?: string;
}

// ── useARReceipts ───────────────────────────────────────────

export function useARReceipts(filters: ARReceiptFilters = {}) {
  const result = useQuery({
    queryKey: ['ar-receipts', filters],
    queryFn: () => {
      const qs = buildQueryString(filters);
      return apiFetch<{
        data: ARReceipt[];
        meta?: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/ar/receipts${qs}`).then((r) => r);
    },
    staleTime: 30_000,
  });

  return {
    data: result.data?.data ?? [],
    meta: result.data?.meta ?? { cursor: null, hasMore: false },
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useARReceiptMutations ───────────────────────────────────

export function useARReceiptMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['ar-receipts'] });
    queryClient.invalidateQueries({ queryKey: ['ar-invoices'] });
    queryClient.invalidateQueries({ queryKey: ['ar-invoice'] });
  };

  const createReceipt = useMutation({
    mutationFn: (input: {
      customerId: string;
      receiptDate: string;
      paymentMethod: string;
      bankAccountId?: string | null;
      referenceNumber?: string | null;
      amount: string;
      memo?: string | null;
      allocations: { invoiceId: string; amount: string }[];
    }) =>
      apiFetch<{ data: ARReceipt }>('/api/v1/ar/receipts', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  const postReceipt = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ data: ARReceipt }>(`/api/v1/ar/receipts/${id}/post`, {
        method: 'POST',
      }).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  const voidReceipt = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch<{ data: ARReceipt }>(`/api/v1/ar/receipts/${id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  return { createReceipt, postReceipt, voidReceipt };
}

// ── useARAging ──────────────────────────────────────────────

export function useARAging(params: { asOfDate?: string } = {}) {
  const result = useQuery({
    queryKey: ['ar-aging', params],
    queryFn: () => {
      const qs = buildQueryString(params);
      return apiFetch<{ data: ARAgingRow[] }>(
        `/api/v1/ar/reports/aging${qs}`,
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

// ── useCustomerLedger ───────────────────────────────────────

export interface CustomerLedgerRow {
  date: string;
  type: 'invoice' | 'receipt' | 'credit';
  referenceNumber: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export function useCustomerLedger(
  customerId: string | null,
  params: { startDate?: string; endDate?: string } = {},
) {
  const result = useQuery({
    queryKey: ['customer-ledger', customerId, params],
    queryFn: () => {
      const qs = buildQueryString(params);
      return apiFetch<{
        data: CustomerLedgerRow[];
        meta?: { openingBalance: number; closingBalance: number };
      }>(`/api/v1/ar/reports/customer-ledger/${customerId}${qs}`).then(
        (r) => r,
      );
    },
    enabled: !!customerId,
    staleTime: 30_000,
  });

  return {
    data: result.data?.data ?? [],
    meta: result.data?.meta ?? { openingBalance: 0, closingBalance: 0 },
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useOpenInvoices ─────────────────────────────────────────

export function useOpenInvoices(customerId: string | null) {
  const result = useQuery({
    queryKey: ['ar-open-invoices', customerId],
    queryFn: () => {
      const qs = buildQueryString({ customerId });
      return apiFetch<{ data: ARInvoice[] }>(
        `/api/v1/ar/reports/open-invoices${qs}`,
      ).then((r) => r.data);
    },
    enabled: !!customerId,
    staleTime: 15_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}
