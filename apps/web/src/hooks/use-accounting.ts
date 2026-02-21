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
