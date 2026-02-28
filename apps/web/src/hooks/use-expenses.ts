'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

// ── Types ────────────────────────────────────────────────────

export interface Expense {
  id: string;
  expenseNumber: string;
  employeeUserId: string;
  employeeName?: string;
  status: string;
  expenseDate: string;
  vendorName: string | null;
  category: string;
  description: string | null;
  amount: number;
  currency: string;
  paymentMethod: string | null;
  isReimbursable: boolean;
  glAccountId: string | null;
  glAccountName?: string;
  projectId: string | null;
  receiptUrl: string | null;
  receiptFileName: string | null;
  glJournalEntryId: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  postedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  reimbursedAt: string | null;
  reimbursementMethod: string | null;
  reimbursementReference: string | null;
  locationId: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExpensePolicy {
  id: string;
  name: string;
  description: string | null;
  autoApproveThreshold: number | null;
  requiresReceiptAbove: number | null;
  maxAmountPerExpense: number | null;
  allowedCategories: string[] | null;
  approverRole: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseSummary {
  category: string;
  fiscalPeriod: string;
  locationId: string | null;
  expenseCount: number;
  totalAmount: number;
  reimbursedCount: number;
  reimbursedAmount: number;
  pendingCount: number;
  pendingAmount: number;
}

// ── Filters ──────────────────────────────────────────────────

export interface ExpenseFilters {
  status?: string;
  category?: string;
  employeeUserId?: string;
  startDate?: string;
  endDate?: string;
  locationId?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

// ── useExpenses (list) ───────────────────────────────────────

export function useExpenses(filters: ExpenseFilters = {}) {
  const result = useQuery({
    queryKey: ['expenses', filters],
    queryFn: () => {
      const qs = buildQueryString(filters);
      return apiFetch<{
        data: Expense[];
        meta?: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/expenses${qs}`);
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

// ── useExpense (single) ──────────────────────────────────────

export function useExpense(id: string | null) {
  const result = useQuery({
    queryKey: ['expense', id],
    queryFn: () =>
      apiFetch<{ data: Expense }>(`/api/v1/expenses/${id}`),
    enabled: !!id,
    staleTime: 30_000,
  });

  return {
    data: result.data?.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── usePendingApprovals ──────────────────────────────────────

export function usePendingApprovals() {
  const result = useQuery({
    queryKey: ['expenses', 'pending-approvals'],
    queryFn: () =>
      apiFetch<{
        data: Expense[];
        meta?: { cursor: string | null; hasMore: boolean };
      }>('/api/v1/expenses/pending-approvals'),
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

// ── useExpenseSummary ────────────────────────────────────────

export interface ExpenseSummaryFilters {
  startDate?: string;
  endDate?: string;
  locationId?: string;
  category?: string;
}

export function useExpenseSummary(filters: ExpenseSummaryFilters = {}) {
  const result = useQuery({
    queryKey: ['expenses', 'summary', filters],
    queryFn: () => {
      const qs = buildQueryString(filters);
      return apiFetch<{ data: ExpenseSummary[] }>(`/api/v1/expenses/summary${qs}`);
    },
    staleTime: 30_000,
  });

  return {
    data: result.data?.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useExpensePolicies ───────────────────────────────────────

export function useExpensePolicies() {
  const result = useQuery({
    queryKey: ['expense-policies'],
    queryFn: () =>
      apiFetch<{ data: ExpensePolicy[] }>('/api/v1/expenses/policies'),
    staleTime: 60_000,
  });

  return {
    data: result.data?.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useExpenseMutations ──────────────────────────────────────

export function useExpenseMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
    queryClient.invalidateQueries({ queryKey: ['expense'] });
  };

  const createExpense = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      apiFetch<{ data: Expense }>('/api/v1/expenses', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });

  const updateExpense = useMutation({
    mutationFn: ({ id, ...input }: Record<string, unknown> & { id: string }) =>
      apiFetch<{ data: Expense }>(`/api/v1/expenses/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });

  const submitExpense = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ data: Expense }>(`/api/v1/expenses/${id}/submit`, {
        method: 'POST',
      }),
    onSuccess: invalidate,
  });

  const approveExpense = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ data: Expense }>(`/api/v1/expenses/${id}/approve`, {
        method: 'POST',
      }),
    onSuccess: invalidate,
  });

  const rejectExpense = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch<{ data: Expense }>(`/api/v1/expenses/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: invalidate,
  });

  const postExpense = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ data: Expense }>(`/api/v1/expenses/${id}/post`, {
        method: 'POST',
      }),
    onSuccess: invalidate,
  });

  const voidExpense = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch<{ data: Expense }>(`/api/v1/expenses/${id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: invalidate,
  });

  const reimburseExpense = useMutation({
    mutationFn: ({ id, method, reference }: { id: string; method: string; reference?: string }) =>
      apiFetch<{ data: Expense }>(`/api/v1/expenses/${id}/reimburse`, {
        method: 'POST',
        body: JSON.stringify({ method, reference }),
      }),
    onSuccess: invalidate,
  });

  return {
    createExpense,
    updateExpense,
    submitExpense,
    approveExpense,
    rejectExpense,
    postExpense,
    voidExpense,
    reimburseExpense,
  };
}
