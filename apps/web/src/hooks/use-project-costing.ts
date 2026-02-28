'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

// ── Types ────────────────────────────────────────────────────

export interface Project {
  id: string;
  projectNumber: string;
  name: string;
  description: string | null;
  status: string;
  projectType: string | null;
  customerId: string | null;
  managerUserId: string | null;
  locationId: string | null;
  startDate: string | null;
  endDate: string | null;
  completionDate: string | null;
  budgetAmount: number | null;
  budgetLaborHours: number | null;
  notes: string | null;
  taskCount: number;
  totalCost: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDetail extends Project {
  tasks: ProjectTask[];
  costSummary: ProjectCostSummary;
}

export interface ProjectTask {
  id: string;
  taskNumber: string;
  name: string;
  description: string | null;
  status: string;
  budgetAmount: number | null;
  budgetHours: number | null;
  glExpenseAccountId: string | null;
  glExpenseAccountName: string | null;
  actualCost: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCostSummary {
  totalRevenue: number;
  totalDirectCost: number;
  totalLaborHours: number;
  totalLaborCost: number;
  totalMaterialCost: number;
  totalOtherCost: number;
  totalGrossMargin: number;
}

export interface ProjectProfitability {
  project: {
    id: string;
    projectNumber: string;
    name: string;
    status: string;
    budgetAmount: number | null;
    budgetLaborHours: number | null;
  };
  periods: Array<{
    fiscalPeriod: string;
    revenue: number;
    directCost: number;
    laborHours: number;
    laborCost: number;
    materialCost: number;
    otherCost: number;
    grossMargin: number;
  }>;
  totals: ProjectCostSummary;
  budgetVariance: number | null;
  budgetUsedPercent: number | null;
  laborHoursUsedPercent: number | null;
  marginPercent: number | null;
}

export interface CostDetailLine {
  id: string;
  journalEntryId: string;
  journalNumber: string;
  entryDate: string;
  description: string | null;
  memo: string | null;
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: string;
  debitAmount: number;
  creditAmount: number;
  projectTaskId: string | null;
  taskName: string | null;
}

export interface CostDetailTotals {
  totalDebits: number;
  totalCredits: number;
  netAmount: number;
}

// ── Filters ──────────────────────────────────────────────────

export interface ProjectFilters {
  status?: string;
  locationId?: string;
  customerId?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface CostDetailFilters {
  taskId?: string;
  accountType?: string;
  fromDate?: string;
  toDate?: string;
  cursor?: string;
  limit?: number;
}

// ── useProjects ──────────────────────────────────────────────

export function useProjects(filters: ProjectFilters = {}) {
  const result = useQuery({
    queryKey: ['projects', filters],
    queryFn: () => {
      const qs = buildQueryString(filters);
      return apiFetch<{
        data: Project[];
        meta?: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/projects${qs}`).then((r) => r);
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

// ── useProject ───────────────────────────────────────────────

export function useProject(id: string | null) {
  const result = useQuery({
    queryKey: ['project', id],
    queryFn: () =>
      apiFetch<{ data: ProjectDetail }>(`/api/v1/projects/${id}`).then((r) => r.data),
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

// ── useProjectTasks ──────────────────────────────────────────

export function useProjectTasks(projectId: string | null) {
  const result = useQuery({
    queryKey: ['project-tasks', projectId],
    queryFn: () =>
      apiFetch<{ data: ProjectTask[] }>(`/api/v1/projects/${projectId}/tasks`).then(
        (r) => r.data,
      ),
    enabled: !!projectId,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useProjectProfitability ──────────────────────────────────

export function useProjectProfitability(projectId: string | null) {
  const result = useQuery({
    queryKey: ['project-profitability', projectId],
    queryFn: () =>
      apiFetch<{ data: ProjectProfitability }>(
        `/api/v1/projects/${projectId}/profitability`,
      ).then((r) => r.data),
    enabled: !!projectId,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useProjectCostDetail ─────────────────────────────────────

export function useProjectCostDetail(
  projectId: string | null,
  filters: CostDetailFilters = {},
) {
  const result = useQuery({
    queryKey: ['project-cost-detail', projectId, filters],
    queryFn: () => {
      const qs = buildQueryString(filters);
      return apiFetch<{
        data: CostDetailLine[];
        meta: { cursor: string | null; hasMore: boolean; totals: CostDetailTotals };
      }>(`/api/v1/projects/${projectId}/cost-detail${qs}`).then((r) => r);
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  return {
    data: result.data?.data ?? [],
    meta: result.data?.meta ?? {
      cursor: null,
      hasMore: false,
      totals: { totalDebits: 0, totalCredits: 0, netAmount: 0 },
    },
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useProjectMutations ──────────────────────────────────────

export function useProjectMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    queryClient.invalidateQueries({ queryKey: ['project'] });
    queryClient.invalidateQueries({ queryKey: ['project-tasks'] });
    queryClient.invalidateQueries({ queryKey: ['project-profitability'] });
    queryClient.invalidateQueries({ queryKey: ['project-cost-detail'] });
  };

  const createProject = useMutation({
    mutationFn: (input: {
      name: string;
      description?: string;
      projectType?: string;
      customerId?: string;
      managerUserId?: string;
      locationId?: string;
      startDate?: string;
      endDate?: string;
      budgetAmount?: number;
      budgetLaborHours?: number;
      notes?: string;
      clientRequestId?: string;
    }) =>
      apiFetch<{ data: Project }>('/api/v1/projects', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  const updateProject = useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      name?: string;
      description?: string | null;
      projectType?: string | null;
      customerId?: string | null;
      managerUserId?: string | null;
      locationId?: string | null;
      startDate?: string | null;
      endDate?: string | null;
      budgetAmount?: number | null;
      budgetLaborHours?: number | null;
      notes?: string | null;
    }) =>
      apiFetch<{ data: Project }>(`/api/v1/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  const closeProject = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ data: Project }>(`/api/v1/projects/${id}/close`, {
        method: 'POST',
      }).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  const archiveProject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiFetch<{ data: Project }>(`/api/v1/projects/${id}/archive`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  const unarchiveProject = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ data: Project }>(`/api/v1/projects/${id}/unarchive`, {
        method: 'POST',
      }).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  const createTask = useMutation({
    mutationFn: ({
      projectId,
      ...input
    }: {
      projectId: string;
      name: string;
      description?: string;
      budgetAmount?: number;
      budgetHours?: number;
      glExpenseAccountId?: string;
      sortOrder?: number;
      clientRequestId?: string;
    }) =>
      apiFetch<{ data: ProjectTask }>(`/api/v1/projects/${projectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  const updateTask = useMutation({
    mutationFn: ({
      projectId,
      taskId,
      ...input
    }: {
      projectId: string;
      taskId: string;
      name?: string;
      description?: string | null;
      status?: string;
      budgetAmount?: number | null;
      budgetHours?: number | null;
      glExpenseAccountId?: string | null;
      sortOrder?: number;
    }) =>
      apiFetch<{ data: ProjectTask }>(
        `/api/v1/projects/${projectId}/tasks/${taskId}`,
        { method: 'PATCH', body: JSON.stringify(input) },
      ).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  const closeTask = useMutation({
    mutationFn: ({
      projectId,
      taskId,
    }: {
      projectId: string;
      taskId: string;
    }) =>
      apiFetch<{ data: ProjectTask }>(
        `/api/v1/projects/${projectId}/tasks/${taskId}/close`,
        { method: 'POST' },
      ).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  return {
    createProject,
    updateProject,
    closeProject,
    archiveProject,
    unarchiveProject,
    createTask,
    updateTask,
    closeTask,
  };
}
