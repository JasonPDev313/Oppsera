'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

// ── Types ────────────────────────────────────────────────────────

export interface WorkflowConfig {
  moduleKey: string;
  workflowKey: string;
  autoMode: boolean;
  approvalRequired: boolean;
  userVisible: boolean;
  customSettings: Record<string, unknown>;
}

export interface TenantTierInfo {
  businessTier: string;
  businessVertical: string;
  tierOverride: boolean;
  tierOverrideReason: string | null;
  tierLastEvaluatedAt: string | null;
  tenantName: string;
  createdAt: string;
  locationCount: number;
  userCount: number;
  glAccountCount: number;
  enabledModuleCount: number;
  enabledModules: string[];
  verticalInfo: {
    name: string;
    icon: string;
    description: string;
    recommendedModules: string[];
  } | null;
}

export interface TierEvaluationResult {
  currentTier: string;
  recommendedTier: string;
  metrics: {
    annualRevenue: number;
    locationCount: number;
    userCount: number;
    glAccountCount: number;
  };
  shouldUpgrade: boolean;
}

export interface TierChangeResult {
  previousTier: string;
  newTier: string;
  warnings: string[];
  dataPreservation: string[];
}

export interface CloseOrchestratorRun {
  id: string;
  businessDate: string;
  locationId: string | null;
  status: string;
  totalSteps: number;
  completedSteps: number;
  skippedSteps: number;
  failedSteps: number;
  stepResults: Array<{
    stepKey: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    error?: string;
  }>;
  startedAt: string | null;
  completedAt: string | null;
  triggeredBy: string;
  createdAt: string;
}

// ── useErpConfig ────────────────────────────────────────────────

export function useErpConfig() {
  const result = useQuery({
    queryKey: ['erp-config'],
    queryFn: () =>
      apiFetch<{ data: Record<string, WorkflowConfig> }>('/api/v1/erp/config').then(
        (r) => r.data,
      ),
    staleTime: 60_000,
  });

  return {
    configs: result.data ?? {},
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useErpModuleConfig ──────────────────────────────────────────

export function useErpModuleConfig(moduleKey: string) {
  const result = useQuery({
    queryKey: ['erp-config', moduleKey],
    queryFn: () =>
      apiFetch<{ data: Record<string, WorkflowConfig> }>(
        `/api/v1/erp/config/${moduleKey}`,
      ).then((r) => r.data),
    enabled: !!moduleKey,
    staleTime: 60_000,
  });

  return {
    configs: result.data ?? {},
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useTenantTier ───────────────────────────────────────────────

export function useTenantTier() {
  const result = useQuery({
    queryKey: ['erp-tier'],
    queryFn: () =>
      apiFetch<{ data: TenantTierInfo }>('/api/v1/erp/tier').then((r) => r.data),
    staleTime: 60_000,
  });

  return {
    tier: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useCloseOrchestratorRuns ────────────────────────────────────

export interface CloseRunFilters {
  locationId?: string;
  businessDateFrom?: string;
  businessDateTo?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

export function useCloseOrchestratorRuns(filters: CloseRunFilters = {}) {
  const result = useQuery({
    queryKey: ['close-orchestrator-runs', filters],
    queryFn: () => {
      const qs = buildQueryString(filters);
      return apiFetch<{
        data: CloseOrchestratorRun[];
        meta: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/erp/close-orchestrator${qs}`).then((r) => ({
        items: r.data,
        meta: r.meta,
      }));
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

// ── Auto-Close Settings type ────────────────────────────────────

export interface AutoCloseSettings {
  autoCloseEnabled: boolean;
  autoCloseTime: string; // HH:MM
  autoCloseSkipHolidays: boolean;
  dayEndCloseEnabled: boolean;
  dayEndCloseTime: string; // HH:MM
}

// ── useAutoCloseSettings ────────────────────────────────────────

export function useAutoCloseSettings() {
  const queryClient = useQueryClient();

  const result = useQuery({
    queryKey: ['auto-close-settings'],
    queryFn: () =>
      apiFetch<{ data: AutoCloseSettings | null }>('/api/v1/accounting/settings').then((r) => {
        const d = r.data;
        if (!d) return null;
        return {
          autoCloseEnabled: d.autoCloseEnabled ?? false,
          autoCloseTime: d.autoCloseTime ?? '02:00',
          autoCloseSkipHolidays: d.autoCloseSkipHolidays ?? false,
          dayEndCloseEnabled: d.dayEndCloseEnabled ?? false,
          dayEndCloseTime: d.dayEndCloseTime ?? '23:00',
        } satisfies AutoCloseSettings;
      }),
    staleTime: 60_000,
  });

  const updateSettings = useMutation({
    mutationFn: (input: Partial<AutoCloseSettings>) =>
      apiFetch<{ data: unknown }>('/api/v1/accounting/settings', {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-close-settings'] });
    },
  });

  return {
    settings: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    updateSettings,
  };
}

// ── useErpMutations ─────────────────────────────────────────────

export function useErpMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['erp-config'] });
    queryClient.invalidateQueries({ queryKey: ['erp-tier'] });
    queryClient.invalidateQueries({ queryKey: ['close-orchestrator-runs'] });
  };

  const updateConfig = useMutation({
    mutationFn: (input: {
      moduleKey: string;
      workflowKey: string;
      autoMode?: boolean;
      approvalRequired?: boolean;
      userVisible?: boolean;
      customSettings?: Record<string, unknown>;
    }) =>
      apiFetch<{ data: WorkflowConfig }>(
        `/api/v1/erp/config/${input.moduleKey}/${input.workflowKey}`,
        {
          method: 'PATCH',
          body: JSON.stringify(input),
        },
      ).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  const evaluateTier = useMutation({
    mutationFn: () =>
      apiFetch<{ data: TierEvaluationResult }>('/api/v1/erp/tier/evaluate', {
        method: 'POST',
      }).then((r) => r.data),
  });

  const changeTier = useMutation({
    mutationFn: (input: { newTier: string; reason?: string }) =>
      apiFetch<{ data: TierChangeResult }>('/api/v1/erp/tier', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidate(),
  });

  const triggerClose = useMutation({
    mutationFn: (input: { businessDate: string; locationId?: string }) =>
      apiFetch<{ data: CloseOrchestratorRun }>('/api/v1/erp/close-orchestrator', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['close-orchestrator-runs'] });
    },
  });

  return {
    updateConfig,
    evaluateTier,
    changeTier,
    triggerClose,
  };
}
