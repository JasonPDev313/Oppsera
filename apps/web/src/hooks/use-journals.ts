'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type {
  JournalEntry,
  TrialBalanceRow,
  GLDetailRow,
  GLSummaryRow,
} from '@/types/accounting';

// ── useJournalEntries ────────────────────────────────────────

export interface JournalFilters {
  startDate?: string;
  endDate?: string;
  sourceModule?: string;
  status?: string;
  accountId?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export function useJournalEntries(filters: JournalFilters = {}) {
  const result = useQuery({
    queryKey: ['journal-entries', filters],
    queryFn: () => {
      const qs = buildQueryString(filters);
      return apiFetch<{
        data: JournalEntry[];
        meta?: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/accounting/journals${qs}`).then((r) => r);
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

// ── useJournalEntry ──────────────────────────────────────────

export function useJournalEntry(id: string | null) {
  const result = useQuery({
    queryKey: ['journal-entry', id],
    queryFn: () =>
      apiFetch<{ data: JournalEntry }>(`/api/v1/accounting/journals/${id}`).then(
        (r) => r.data,
      ),
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

// ── useJournalMutations ──────────────────────────────────────

export function useJournalMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    queryClient.invalidateQueries({ queryKey: ['journal-entry'] });
  };

  const createJournal = useMutation({
    mutationFn: (input: {
      businessDate: string;
      memo: string;
      lines: {
        accountId: string;
        debitAmount: number;
        creditAmount: number;
        locationId?: string | null;
        departmentId?: string | null;
        memo?: string | null;
      }[];
      autoPost?: boolean;
    }) =>
      apiFetch<{ data: JournalEntry }>('/api/v1/accounting/journals', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  const postJournal = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ data: JournalEntry }>(
        `/api/v1/accounting/journals/${id}/post`,
        { method: 'POST' },
      ).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  const voidJournal = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch<{ data: JournalEntry }>(
        `/api/v1/accounting/journals/${id}/void`,
        {
          method: 'POST',
          body: JSON.stringify({ reason }),
        },
      ).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  return { createJournal, postJournal, voidJournal };
}

// ── useTrialBalance ──────────────────────────────────────────

export interface TrialBalanceParams {
  asOfDate?: string;
  postingPeriod?: string;
  locationId?: string;
  showZeroBalances?: boolean;
}

export function useTrialBalance(params: TrialBalanceParams = {}) {
  const result = useQuery({
    queryKey: ['trial-balance', params],
    queryFn: () => {
      const qs = buildQueryString(params);
      return apiFetch<{
        data: {
          accounts: {
            accountId: string;
            accountNumber: string;
            accountName: string;
            accountType: string;
            classificationName: string | null;
            normalBalance: string;
            debitTotal: number;
            creditTotal: number;
            netBalance: number;
          }[];
          totalDebits: number;
          totalCredits: number;
          isBalanced: boolean;
          nonPostedEntryCount: number;
        };
      }>(`/api/v1/accounting/reports/trial-balance${qs}`).then((r) =>
        (r.data.accounts ?? []).map((a) => ({
          accountId: a.accountId,
          accountNumber: a.accountNumber,
          accountName: a.accountName,
          accountType: a.accountType as TrialBalanceRow['accountType'],
          classificationName: a.classificationName,
          debitBalance: a.debitTotal,
          creditBalance: a.creditTotal,
        })),
      );
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

// ── useGLDetail ──────────────────────────────────────────────

export interface GLDetailParams {
  accountId: string | null;
  startDate?: string;
  endDate?: string;
  locationId?: string;
  cursor?: string;
}

export function useGLDetail(params: GLDetailParams) {
  const result = useQuery({
    queryKey: ['gl-detail', params],
    queryFn: () => {
      const qs = buildQueryString(params);
      return apiFetch<{
        data: GLDetailRow[];
        meta?: {
          openingBalance: number;
          closingBalance: number;
          cursor: string | null;
          hasMore: boolean;
        };
      }>(`/api/v1/accounting/reports/detail${qs}`).then((r) => r);
    },
    enabled: !!params.accountId,
    staleTime: 30_000,
  });

  return {
    data: result.data?.data ?? [],
    meta: result.data?.meta ?? {
      openingBalance: 0,
      closingBalance: 0,
      cursor: null,
      hasMore: false,
    },
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useGLSummary ─────────────────────────────────────────────

export interface GLSummaryParams {
  startDate?: string;
  endDate?: string;
  locationId?: string;
  groupBy?: 'classification' | 'accountType';
}

export function useGLSummary(params: GLSummaryParams = {}) {
  const result = useQuery({
    queryKey: ['gl-summary', params],
    queryFn: () => {
      const qs = buildQueryString(params);
      return apiFetch<{
        data: {
          classifications: {
            classificationId: string | null;
            classificationName: string | null;
            accountType: string;
            debitTotal: number;
            creditTotal: number;
            netBalance: number;
          }[];
        };
      }>(`/api/v1/accounting/reports/summary${qs}`).then((r) =>
        (r.data.classifications ?? []).map((c) => ({
          groupLabel: c.classificationName ?? c.accountType,
          totalDebits: c.debitTotal,
          totalCredits: c.creditTotal,
          netBalance: c.netBalance,
        })),
      );
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
