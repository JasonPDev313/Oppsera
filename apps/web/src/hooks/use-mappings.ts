'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type {
  MappingCoverage,
  SubDepartmentMapping,
  SubDepartmentItem,
  PaymentTypeMapping,
  TaxGroupMapping,
  UnmappedEvent,
  BankAccount,
  FnbMappingCoverageResult,
  TransactionTypeMapping,
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

// ── useSubDepartmentItems ────────────────────────────────────

export function useSubDepartmentItems(subDepartmentId: string | null) {
  const result = useQuery({
    queryKey: ['sub-department-items', subDepartmentId],
    queryFn: () =>
      apiFetch<{ data: SubDepartmentItem[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/accounting/mappings/sub-departments/${subDepartmentId}/items`,
      ).then((r) => ({ items: r.data, meta: r.meta })),
    enabled: !!subDepartmentId,
    staleTime: 60_000,
  });

  return {
    items: result.data?.items ?? [],
    meta: result.data?.meta ?? { cursor: null, hasMore: false },
    isLoading: result.isLoading,
    error: result.error,
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

// ── useTransactionTypeMappings ──────────────────────────────

export function useTransactionTypeMappings(category?: string) {
  const result = useQuery({
    queryKey: ['transaction-type-mappings', category],
    queryFn: () => {
      const qs = category ? `?category=${category}` : '';
      return apiFetch<{ data: TransactionTypeMapping[] }>(
        `/api/v1/accounting/mappings/transaction-types${qs}`,
      ).then((r) => r.data);
    },
    staleTime: 60_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useCreateTenderType ─────────────────────────────────────

export function useCreateTenderType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      name: string;
      code: string;
      category?: string;
      postingMode?: string;
      requiresReference?: boolean;
      referenceLabel?: string;
      defaultClearingAccountId?: string | null;
      defaultBankAccountId?: string | null;
      defaultFeeAccountId?: string | null;
      defaultExpenseAccountId?: string | null;
      reportingBucket?: string;
    }) =>
      apiFetch('/api/v1/accounting/tender-types', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transaction-type-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['mapping-coverage'] });
    },
  });
}

// ── useUpdateTenderType ─────────────────────────────────────

export function useUpdateTenderType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { id: string } & Record<string, unknown>) => {
      const { id, ...body } = input;
      return apiFetch(`/api/v1/accounting/tender-types/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transaction-type-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['mapping-coverage'] });
    },
  });
}

// ── useDeactivateTenderType ─────────────────────────────────

export function useDeactivateTenderType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/accounting/tender-types/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transaction-type-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['mapping-coverage'] });
    },
  });
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
    queryClient.invalidateQueries({ queryKey: ['remappable-tenders'] });
    queryClient.invalidateQueries({ queryKey: ['unmapped-events'] });
    queryClient.invalidateQueries({ queryKey: ['transaction-type-mappings'] });
  };

  const saveSubDepartmentDefaults = useMutation({
    mutationFn: (input: { subDepartmentId: string; revenueAccountId: string | null; cogsAccountId: string | null; inventoryAssetAccountId: string | null; discountAccountId: string | null; returnsAccountId: string | null; compAccountId?: string | null }) =>
      apiFetch(`/api/v1/accounting/mappings/sub-departments/${input.subDepartmentId}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidate(),
  });

  const saveTransactionTypeMapping = useMutation({
    mutationFn: (input: { code: string; creditAccountId?: string | null; debitAccountId?: string | null; locationId?: string | null }) => {
      const { code, ...body } = input;
      return apiFetch(`/api/v1/accounting/mappings/transaction-type-mappings/${code}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => invalidate(),
  });

  const deleteTransactionTypeMapping = useMutation({
    mutationFn: (input: { code: string; locationId?: string | null }) => {
      const qs = input.locationId ? `?locationId=${input.locationId}` : '';
      return apiFetch(`/api/v1/accounting/mappings/transaction-type-mappings/${input.code}${qs}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => invalidate(),
  });

  const savePaymentTypeDefaults = useMutation({
    mutationFn: (input: { paymentType: string; cashAccountId: string | null; clearingAccountId: string | null; feeExpenseAccountId: string | null; postingMode?: string; expenseAccountId?: string | null; description?: string | null }) =>
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

  return { saveSubDepartmentDefaults, savePaymentTypeDefaults, saveTaxGroupDefaults, saveTransactionTypeMapping, deleteTransactionTypeMapping };
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

// ── useFnbMappingCoverage ─────────────────────────────────

export function useFnbMappingCoverage(locationId: string | undefined) {
  const result = useQuery({
    queryKey: ['fnb-mapping-coverage', locationId],
    queryFn: () =>
      apiFetch<{ data: FnbMappingCoverageResult }>(
        `/api/v1/accounting/mappings/fnb-categories?locationId=${locationId}`,
      ).then((r) => r.data),
    enabled: !!locationId,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useSaveFnbMapping ─────────────────────────────────────

export function useSaveFnbMapping() {
  const queryClient = useQueryClient();

  const { mutateAsync: saveFnbMapping } = useMutation({
    mutationFn: (input: {
      locationId: string;
      entityType: string;
      entityId?: string;
      revenueAccountId?: string | null;
      expenseAccountId?: string | null;
      liabilityAccountId?: string | null;
      assetAccountId?: string | null;
      contraRevenueAccountId?: string | null;
    }) =>
      apiFetch('/api/v1/accounting/mappings/fnb-categories', {
        method: 'POST',
        body: JSON.stringify({ entityId: 'default', ...input }),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['fnb-mapping-coverage', variables.locationId] });
    },
  });

  return { saveFnbMapping };
}
