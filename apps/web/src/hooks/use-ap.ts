'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type {
  APBill,
  APPayment,
  PaymentTerms,
  VendorAccounting,
  APAgingRow,
  VendorLedgerRow,
  CashRequirementsRow,
  Report1099Row,
  ExpenseByVendorRow,
  AssetPurchaseRow,
} from '@/types/accounting';

// ── useAPBills ───────────────────────────────────────────────

export interface APBillFilters {
  vendorId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  locationId?: string;
  overdueOnly?: boolean;
  cursor?: string;
  limit?: number;
}

export function useAPBills(filters: APBillFilters = {}) {
  const result = useQuery({
    queryKey: ['ap-bills', filters],
    queryFn: () => {
      const qs = buildQueryString(filters);
      return apiFetch<{
        data: APBill[];
        meta?: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/ap/bills${qs}`).then((r) => r);
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

// ── useAPBill ────────────────────────────────────────────────

export function useAPBill(id: string | null) {
  const result = useQuery({
    queryKey: ['ap-bill', id],
    queryFn: () =>
      apiFetch<{ data: APBill }>(`/api/v1/ap/bills/${id}`).then((r) => r.data),
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

// ── useAPBillMutations ───────────────────────────────────────

export function useAPBillMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['ap-bills'] });
    queryClient.invalidateQueries({ queryKey: ['ap-bill'] });
    queryClient.invalidateQueries({ queryKey: ['ap-summary'] });
  };

  const createBill = useMutation({
    mutationFn: (input: {
      vendorId: string;
      billNumber: string;
      billDate: string;
      dueDate: string;
      paymentTermsId?: string | null;
      locationId?: string | null;
      memo?: string | null;
      taxAmount?: string;
      lines: {
        lineType: string;
        glAccountId: string;
        description?: string | null;
        quantity: string;
        unitCost: string;
        amount: string;
      }[];
    }) =>
      apiFetch<{ data: APBill }>('/api/v1/ap/bills', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  const updateBill = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Record<string, unknown>) =>
      apiFetch<{ data: APBill }>(`/api/v1/ap/bills/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  const postBill = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ data: APBill }>(`/api/v1/ap/bills/${id}/post`, {
        method: 'POST',
      }).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  const voidBill = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch<{ data: APBill }>(`/api/v1/ap/bills/${id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  return { createBill, updateBill, postBill, voidBill };
}

// ── usePaymentTerms ──────────────────────────────────────────

export function usePaymentTerms() {
  const result = useQuery({
    queryKey: ['payment-terms'],
    queryFn: () =>
      apiFetch<{ data: PaymentTerms[] }>('/api/v1/ap/payment-terms').then(
        (r) => r.data,
      ),
    staleTime: 60_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useVendorAccounting ──────────────────────────────────────

export function useVendorAccounting(vendorId: string | null) {
  const result = useQuery({
    queryKey: ['vendor-accounting', vendorId],
    queryFn: () =>
      apiFetch<{ data: VendorAccounting }>(
        `/api/v1/ap/vendors/${vendorId}/accounting`,
      ).then((r) => r.data),
    enabled: !!vendorId,
    staleTime: 60_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useVendorAccountingMutation ──────────────────────────────

export function useVendorAccountingMutation() {
  const queryClient = useQueryClient();

  const updateVendorAccounting = useMutation({
    mutationFn: (input: {
      vendorId: string;
      vendorNumber?: string | null;
      defaultExpenseAccountId?: string | null;
      defaultAPAccountId?: string | null;
      paymentTermsId?: string | null;
      is1099Eligible?: boolean;
    }) =>
      apiFetch(`/api/v1/ap/vendors/${input.vendorId}/accounting`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['vendor-accounting', variables.vendorId] });
    },
  });

  return { updateVendorAccounting };
}

// ── useAPSummary ─────────────────────────────────────────────

export interface APSummary {
  totalOutstanding: number;
  overdueAmount: number;
  draftCount: number;
  dueThisWeek: number;
}

export function useAPSummary() {
  const result = useQuery({
    queryKey: ['ap-summary'],
    queryFn: () =>
      apiFetch<{ data: APSummary }>('/api/v1/ap/reports/summary').then((r) => r.data),
    staleTime: 30_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useAPPayments (for Session 40) ───────────────────────────

export interface APPaymentFilters {
  vendorId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  cursor?: string;
}

export function useAPPayments(filters: APPaymentFilters = {}) {
  const result = useQuery({
    queryKey: ['ap-payments', filters],
    queryFn: () => {
      const qs = buildQueryString(filters);
      return apiFetch<{
        data: APPayment[];
        meta?: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/ap/payments${qs}`).then((r) => r);
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

// ── useAPPayment ────────────────────────────────────────────

export function useAPPayment(id: string | null) {
  const result = useQuery({
    queryKey: ['ap-payment', id],
    queryFn: () =>
      apiFetch<{ data: APPayment }>(`/api/v1/ap/payments/${id}`).then((r) => r.data),
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

// ── useAPPaymentMutations ───────────────────────────────────

export function useAPPaymentMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['ap-payments'] });
    queryClient.invalidateQueries({ queryKey: ['ap-payment'] });
    queryClient.invalidateQueries({ queryKey: ['ap-bills'] });
    queryClient.invalidateQueries({ queryKey: ['ap-bill'] });
    queryClient.invalidateQueries({ queryKey: ['ap-summary'] });
  };

  const createPayment = useMutation({
    mutationFn: (input: {
      vendorId: string;
      paymentDate: string;
      paymentMethod: string;
      bankAccountId: string | null;
      referenceNumber?: string | null;
      amount: string;
      memo?: string | null;
      allocations: { billId: string; amount: string }[];
    }) =>
      apiFetch<{ data: APPayment }>('/api/v1/ap/payments', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  const postPayment = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ data: APPayment }>(`/api/v1/ap/payments/${id}/post`, {
        method: 'POST',
      }).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  const voidPayment = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch<{ data: APPayment }>(`/api/v1/ap/payments/${id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  return { createPayment, postPayment, voidPayment };
}

// ── useVendorCredits ────────────────────────────────────────

export function useVendorCreditMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['ap-bills'] });
    queryClient.invalidateQueries({ queryKey: ['ap-summary'] });
  };

  const createCredit = useMutation({
    mutationFn: (input: {
      vendorId: string;
      creditDate: string;
      amount: string;
      memo?: string | null;
      glAccountId: string;
    }) =>
      apiFetch<{ data: APBill }>('/api/v1/ap/credits', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  const applyCredit = useMutation({
    mutationFn: (input: {
      creditBillId: string;
      allocations: { billId: string; amount: string }[];
    }) =>
      apiFetch('/api/v1/ap/credits/apply', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidate(),
  });

  return { createCredit, applyCredit };
}

// ── useOpenBills ─────────────────────────────────────────────

export function useOpenBills(vendorId: string | null) {
  const result = useQuery({
    queryKey: ['ap-open-bills', vendorId],
    queryFn: () => {
      const qs = buildQueryString({ vendorId });
      return apiFetch<{ data: APBill[] }>(
        `/api/v1/ap/reports/open-bills${qs}`,
      ).then((r) => r.data);
    },
    enabled: !!vendorId,
    staleTime: 15_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useAPAging ───────────────────────────────────────────────

export function useAPAging(params: { asOfDate?: string } = {}) {
  const result = useQuery({
    queryKey: ['ap-aging', params],
    queryFn: () => {
      const qs = buildQueryString(params);
      return apiFetch<{ data: APAgingRow[] }>(
        `/api/v1/ap/reports/aging${qs}`,
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

// ── useVendorLedger ──────────────────────────────────────────

export function useVendorLedger(
  vendorId: string | null,
  params: { startDate?: string; endDate?: string } = {},
) {
  const result = useQuery({
    queryKey: ['vendor-ledger', vendorId, params],
    queryFn: () => {
      const qs = buildQueryString(params);
      return apiFetch<{
        data: VendorLedgerRow[];
        meta?: { openingBalance: number; closingBalance: number };
      }>(`/api/v1/ap/reports/vendor-ledger/${vendorId}${qs}`).then(
        (r) => r,
      );
    },
    enabled: !!vendorId,
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

// ── useCashRequirements ─────────────────────────────────────

export function useCashRequirements(params: { groupBy?: 'week' | 'month' } = {}) {
  const result = useQuery({
    queryKey: ['cash-requirements', params],
    queryFn: () => {
      const qs = buildQueryString(params);
      return apiFetch<{ data: CashRequirementsRow[] }>(
        `/api/v1/ap/reports/cash-requirements${qs}`,
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

// ── use1099Report ───────────────────────────────────────────

export function use1099Report(year: number) {
  const result = useQuery({
    queryKey: ['1099-report', year],
    queryFn: () =>
      apiFetch<{ data: Report1099Row[] }>(
        `/api/v1/ap/reports/1099?year=${year}`,
      ).then((r) => r.data),
    staleTime: 60_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
  };
}

// ── useExpenseByVendor ──────────────────────────────────────

export function useExpenseByVendor(params: { startDate?: string; endDate?: string } = {}) {
  const result = useQuery({
    queryKey: ['expense-by-vendor', params],
    queryFn: () => {
      const qs = buildQueryString(params);
      return apiFetch<{ data: ExpenseByVendorRow[] }>(
        `/api/v1/ap/reports/expense-by-vendor${qs}`,
      ).then((r) => r.data);
    },
    staleTime: 30_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
  };
}

// ── useAssetPurchases ───────────────────────────────────────

export function useAssetPurchases(params: { startDate?: string; endDate?: string } = {}) {
  const result = useQuery({
    queryKey: ['asset-purchases', params],
    queryFn: () => {
      const qs = buildQueryString(params);
      return apiFetch<{ data: AssetPurchaseRow[] }>(
        `/api/v1/ap/reports/asset-purchases${qs}`,
      ).then((r) => r.data);
    },
    staleTime: 30_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
  };
}
