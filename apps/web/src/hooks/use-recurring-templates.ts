'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type {
  RecurringTemplate,
  RecurringTemplateHistoryEntry,
} from '@/types/accounting';

// ── useRecurringTemplates ───────────────────────────────────

export interface RecurringTemplateFilters {
  isActive?: boolean;
  cursor?: string;
  limit?: number;
}

export function useRecurringTemplates(filters: RecurringTemplateFilters = {}) {
  const result = useQuery({
    queryKey: ['recurring-templates', filters],
    queryFn: () => {
      const qs = buildQueryString(filters);
      return apiFetch<{ data: RecurringTemplate[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/accounting/recurring${qs}`,
      ).then((r) => ({ items: r.data, meta: r.meta }));
    },
    staleTime: 30_000,
  });

  return {
    items: result.data?.items ?? [],
    meta: result.data?.meta ?? { cursor: null, hasMore: false },
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useRecurringTemplate ────────────────────────────────────

export function useRecurringTemplate(id: string | null) {
  const result = useQuery({
    queryKey: ['recurring-template', id],
    queryFn: () =>
      apiFetch<{ data: RecurringTemplate }>(
        `/api/v1/accounting/recurring/${id}`,
      ).then((r) => r.data),
    enabled: !!id,
    staleTime: 15_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useRecurringTemplateHistory ──────────────────────────────

export function useRecurringTemplateHistory(id: string | null) {
  const result = useQuery({
    queryKey: ['recurring-template-history', id],
    queryFn: () =>
      apiFetch<{ data: RecurringTemplateHistoryEntry[] }>(
        `/api/v1/accounting/recurring/${id}/history`,
      ).then((r) => r.data),
    enabled: !!id,
    staleTime: 15_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useRecurringTemplateMutations ───────────────────────────

export function useRecurringTemplateMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['recurring-templates'] });
    queryClient.invalidateQueries({ queryKey: ['recurring-template'] });
    queryClient.invalidateQueries({ queryKey: ['recurring-template-history'] });
  };

  const createTemplate = useMutation({
    mutationFn: (input: {
      name: string;
      description?: string;
      frequency: string;
      dayOfPeriod?: number;
      startDate: string;
      endDate?: string;
      templateLines: Array<{
        accountId: string;
        debitAmount: string;
        creditAmount: string;
        memo?: string;
      }>;
    }) =>
      apiFetch('/api/v1/accounting/recurring', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidate(),
  });

  const updateTemplate = useMutation({
    mutationFn: (input: {
      id: string;
      name?: string;
      description?: string | null;
      frequency?: string;
      dayOfPeriod?: number;
      startDate?: string;
      endDate?: string | null;
      isActive?: boolean;
      templateLines?: Array<{
        accountId: string;
        debitAmount: string;
        creditAmount: string;
        memo?: string;
      }>;
    }) =>
      apiFetch(`/api/v1/accounting/recurring/${input.id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidate(),
  });

  const deactivateTemplate = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/accounting/recurring/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => invalidate(),
  });

  const executeTemplate = useMutation({
    mutationFn: (input: { id: string; businessDate?: string }) =>
      apiFetch(`/api/v1/accounting/recurring/${input.id}/execute`, {
        method: 'POST',
        body: JSON.stringify({ businessDate: input.businessDate }),
      }),
    onSuccess: () => invalidate(),
  });

  const executeDue = useMutation({
    mutationFn: () =>
      apiFetch('/api/v1/accounting/recurring/execute-due', {
        method: 'POST',
      }),
    onSuccess: () => invalidate(),
  });

  return {
    createTemplate,
    updateTemplate,
    deactivateTemplate,
    executeTemplate,
    executeDue,
  };
}
