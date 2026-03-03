'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api-fetch';

// ── Types ────────────────────────────────────────────────────────

export interface TenantHealthSnapshot {
  id: string;
  tenantId: string;
  capturedAt: string | null;
  orders24h: number;
  activeUsers24h: number;
  lastOrderAt: string | null;
  lastLoginAt: string | null;
  errorCount24h: number;
  errorCount1h: number;
  dlqDepth: number;
  dlqUnresolvedOver24h: number;
  backgroundJobFailures24h: number;
  integrationErrorCount24h: number;
  unpostedGlEntries: number;
  unmappedGlEvents: number;
  openCloseBatches: number;
  healthScore: number;
  healthGrade: string;
  gradeFactors: Array<{ factor: string; impact: number; detail: string }>;
}

export interface TenantHealthHistory {
  tenantId: string;
  tenantName: string;
  snapshots: TenantHealthSnapshot[];
}

// ── Hook ─────────────────────────────────────────────────────────

export function useTenantHealth(tenantId: string) {
  const [history, setHistory] = useState<TenantHealthHistory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    setError(null);
    try {
      const json = await adminFetch<{ data: TenantHealthHistory }>(
        `/api/v1/health/tenants/${tenantId}/history`,
      );
      setHistory(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tenant health');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { history, isLoading, error, refresh: fetchData };
}
