'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type {
  MappingCoverage,
  SubDepartmentMapping,
  PaymentTypeMapping,
  TaxGroupMapping,
  UnmappedEvent,
  BankAccount,
} from '@/types/accounting';

// ── useMappingCoverage ───────────────────────────────────────

export function useMappingCoverage() {
  const result = useQuery({
    queryKey: ['mapping-coverage'],
    queryFn: () =>
      apiFetch<{ data: MappingCoverage }>('/api/v1/accounting/mappings/coverage').then(
        (r) => r.data,
      ),
    staleTime: 30_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useSubDepartmentMappings ─────────────────────────────────

export function useSubDepartmentMappings() {
  const result = useQuery({
    queryKey: ['sub-department-mappings'],
    queryFn: () =>
      apiFetch<{ data: SubDepartmentMapping[] }>(
        '/api/v1/accounting/mappings/sub-departments',
      ).then((r) => r.data),
    staleTime: 60_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── usePaymentTypeMappings ───────────────────────────────────

export function usePaymentTypeMappings() {
  const result = useQuery({
    queryKey: ['payment-type-mappings'],
    queryFn: () =>
      apiFetch<{ data: PaymentTypeMapping[] }>(
        '/api/v1/accounting/mappings/payment-types',
      ).then((r) => r.data),
    staleTime: 60_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useTaxGroupMappings ──────────────────────────────────────

export function useTaxGroupMappings() {
  const result = useQuery({
    queryKey: ['tax-group-mappings'],
    queryFn: () =>
      apiFetch<{ data: TaxGroupMapping[] }>(
        '/api/v1/accounting/mappings/tax-groups',
      ).then((r) => r.data),
    staleTime: 60_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useMappingMutations ──────────────────────────────────────

export function useMappingMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['sub-department-mappings'] });
    queryClient.invalidateQueries({ queryKey: ['payment-type-mappings'] });
    queryClient.invalidateQueries({ queryKey: ['tax-group-mappings'] });
    queryClient.invalidateQueries({ queryKey: ['mapping-coverage'] });
  };

  const saveSubDepartmentDefaults = useMutation({
    mutationFn: (input: { subDepartmentId: string; revenueAccountId: string | null; cogsAccountId: string | null; inventoryAssetAccountId: string | null; discountAccountId: string | null; returnsAccountId: string | null }) =>
      apiFetch(`/api/v1/accounting/mappings/sub-departments/${input.subDepartmentId}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidate(),
  });

  const savePaymentTypeDefaults = useMutation({
    mutationFn: (input: { paymentType: string; cashBankAccountId: string | null; clearingAccountId: string | null; feeExpenseAccountId: string | null }) =>
      apiFetch(`/api/v1/accounting/mappings/payment-types/${input.paymentType}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidate(),
  });

  const saveTaxGroupDefaults = useMutation({
    mutationFn: (input: { taxGroupId: string; taxPayableAccountId: string | null }) =>
      apiFetch(`/api/v1/accounting/mappings/tax-groups/${input.taxGroupId}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidate(),
  });

  return { saveSubDepartmentDefaults, savePaymentTypeDefaults, saveTaxGroupDefaults };
}

// ── useUnmappedEvents ────────────────────────────────────────

export interface UnmappedEventFilters {
  status?: 'unresolved' | 'resolved';
  startDate?: string;
  endDate?: string;
}

export function useUnmappedEvents(filters: UnmappedEventFilters = {}) {
  const result = useQuery({
    queryKey: ['unmapped-events', filters],
    queryFn: () => {
      const qs = buildQueryString(filters);
      return apiFetch<{ data: UnmappedEvent[] }>(
        `/api/v1/accounting/unmapped-events${qs}`,
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

// ── useUnmappedEventMutations ────────────────────────────────

export function useUnmappedEventMutations() {
  const queryClient = useQueryClient();

  const resolveEvent = useMutation({
    mutationFn: (input: { id: string; note?: string }) =>
      apiFetch(`/api/v1/accounting/unmapped-events/${input.id}/resolve`, {
        method: 'PATCH',
        body: JSON.stringify({ note: input.note }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unmapped-events'] });
    },
  });

  return { resolveEvent };
}

// ── useBankAccounts ──────────────────────────────────────────

export function useBankAccounts() {
  const result = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () =>
      apiFetch<{ data: BankAccount[] }>('/api/v1/accounting/bank-accounts').then(
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

// ── useBankAccountMutations ──────────────────────────────────

export function useBankAccountMutations() {
  const queryClient = useQueryClient();

  const saveBankAccount = useMutation({
    mutationFn: (input: {
      id?: string;
      name: string;
      glAccountId: string;
      bankName?: string | null;
      accountNumberLast4?: string | null;
      isDefault?: boolean;
    }) => {
      if (input.id) {
        return apiFetch(`/api/v1/accounting/bank-accounts/${input.id}`, {
          method: 'PATCH',
          body: JSON.stringify(input),
        });
      }
      return apiFetch('/api/v1/accounting/bank-accounts', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
    },
  });

  return { saveBankAccount };
}
