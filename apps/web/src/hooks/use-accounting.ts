'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { AccountingSettings, GLAccount, GLClassification } from '@/types/accounting';

// ── useAccountingSettings ─────────────────────────────────────

export function useAccountingSettings() {
  const result = useQuery({
    queryKey: ['accounting-settings'],
    queryFn: () =>
      apiFetch<{ data: AccountingSettings }>('/api/v1/accounting/settings')
        .then((r) => r.data)
        .catch((err) => {
          // 404 means not bootstrapped — return null
          if (err?.statusCode === 404) return null;
          throw err;
        }),
    staleTime: 60_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useGLAccounts ─────────────────────────────────────────────

interface UseGLAccountsOptions {
  accountType?: string;
  isActive?: boolean;
  isControlAccount?: boolean;
}

export function useGLAccounts(options: UseGLAccountsOptions = {}) {
  const result = useQuery({
    queryKey: ['gl-accounts', options.accountType, options.isActive, options.isControlAccount],
    queryFn: () => {
      const params = new URLSearchParams();
      if (options.accountType) params.set('accountType', options.accountType);
      if (options.isActive !== undefined) params.set('isActive', String(options.isActive));
      if (options.isControlAccount !== undefined)
        params.set('isControlAccount', String(options.isControlAccount));
      const qs = params.toString();
      return apiFetch<{ data: GLAccount[] }>(
        `/api/v1/accounting/accounts${qs ? `?${qs}` : ''}`,
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

// ── useGLClassifications ──────────────────────────────────────

export function useGLClassifications() {
  const result = useQuery({
    queryKey: ['gl-classifications'],
    queryFn: () =>
      apiFetch<{ data: GLClassification[] }>('/api/v1/accounting/classifications').then(
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

// ── useAccountingBootstrapStatus ──────────────────────────────

export function useAccountingBootstrapStatus() {
  const settings = useAccountingSettings();
  const accounts = useGLAccounts();

  return {
    isBootstrapped: settings.data !== null && accounts.data.length > 0,
    isLoading: settings.isLoading || accounts.isLoading,
  };
}

// ── useCoaHealth ─────────────────────────────────────────────

interface CoaHealthReport {
  overallStatus: 'healthy' | 'warning' | 'error';
  errorCount: number;
  warningCount: number;
  errors: Array<{ field?: string; message: string }>;
  warnings: Array<{ field?: string; message: string }>;
  accountDistribution: Record<string, number>;
  totalAccounts: number;
  activeAccounts: number;
  fallbackCount: number;
  systemAccountCount: number;
}

export function useCoaHealth() {
  const result = useQuery({
    queryKey: ['coa-health'],
    queryFn: () =>
      apiFetch<{ data: CoaHealthReport }>('/api/v1/accounting/health').then((r) => r.data),
    staleTime: 30_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useAccountChangeLog ──────────────────────────────────────

interface ChangeLogEntry {
  id: string;
  action: string;
  fieldChanged: string | null;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string | null;
  changedAt: string;
  metadata: Record<string, unknown> | null;
}

interface ChangeLogResult {
  items: ChangeLogEntry[];
  cursor: string | null;
  hasMore: boolean;
}

export function useAccountChangeLog(accountId: string | null) {
  const result = useQuery({
    queryKey: ['account-change-log', accountId],
    queryFn: () =>
      apiFetch<{ data: ChangeLogResult }>(
        `/api/v1/accounting/accounts/${accountId}/change-log`,
      ).then((r) => r.data),
    enabled: !!accountId,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useCoaImportHistory ──────────────────────────────────────

interface CoaImportLog {
  id: string;
  fileName: string;
  totalRows: number;
  successRows: number;
  errorRows: number;
  status: string;
  importedBy: string | null;
  startedAt: string;
  completedAt: string | null;
}

export function useCoaImportHistory() {
  const result = useQuery({
    queryKey: ['coa-import-history'],
    queryFn: () =>
      apiFetch<{ data: CoaImportLog[] }>('/api/v1/accounting/import/history').then((r) => r.data),
    staleTime: 60_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}
