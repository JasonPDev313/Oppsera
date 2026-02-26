'use client';

import { useState, useCallback } from 'react';
import { adminFetch, AdminApiError } from '@/lib/api-fetch';

export interface FeatureFlagItem {
  definitionId: string;
  flagKey: string;
  displayName: string;
  description: string | null;
  moduleKey: string | null;
  riskLevel: string;
  isEnabled: boolean;
  enabledAt: string | null;
  enabledBy: string | null;
  disabledAt: string | null;
  disabledBy: string | null;
}

export function useFeatureFlags(tenantId: string) {
  const [flags, setFlags] = useState<FeatureFlagItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: FeatureFlagItem[] }>(`/api/v1/tenants/${tenantId}/feature-flags`);
      setFlags(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load feature flags');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  const toggle = useCallback(async (flagKey: string, isEnabled: boolean) => {
    await adminFetch(`/api/v1/tenants/${tenantId}/feature-flags/${flagKey}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_enabled: isEnabled }),
    });
    await load();
  }, [tenantId, load]);

  return { flags, isLoading, error, load, toggle };
}

export interface MatrixRow {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  industry: string | null;
  status: string;
  modules: Record<string, string>;
}

export function useCapabilityMatrix() {
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (filters?: { industry?: string; status?: string; search?: string }) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters?.industry) params.set('industry', filters.industry);
      if (filters?.status) params.set('status', filters.status);
      if (filters?.search) params.set('search', filters.search);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await adminFetch<{ data: MatrixRow[] }>(`/api/v1/modules/matrix${qs}`);
      setRows(res.data);
    } catch (err) {
      const msg = err instanceof AdminApiError
        ? `${err.code} (${err.status}): ${err.message}`
        : err instanceof Error ? err.message : 'Failed to load matrix';
      setError(msg);
      console.error('[useCapabilityMatrix]', msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { rows, isLoading, error, load };
}
