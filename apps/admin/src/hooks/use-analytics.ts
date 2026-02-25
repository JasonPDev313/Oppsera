'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api-fetch';

// ── Types ────────────────────────────────────────────────────────

interface PlatformKpis {
  totalRequests: number;
  activeTenants: number;
  errorRate: number;
  avgLatencyMs: number;
}

interface ModuleRanking {
  moduleKey: string;
  totalRequests: number;
  errorRate: number;
  avgLatencyMs: number;
  uniqueTenants: number;
}

interface TenantRanking {
  tenantId: string;
  tenantName: string;
  totalRequests: number;
  uniqueModules: number;
}

interface AdoptionRate {
  moduleKey: string;
  activeTenants: number;
  totalTenants: number;
  rate: number;
}

interface ErrorTrendPoint {
  date: string;
  errorRate: number;
  requestCount: number;
}

interface HourlyPoint {
  hour: number;
  requestCount: number;
}

export interface PlatformDashboardData {
  kpis: PlatformKpis;
  moduleRanking: ModuleRanking[];
  tenantRanking: TenantRanking[];
  adoptionRates: AdoptionRate[];
  errorTrend: ErrorTrendPoint[];
  hourlyTraffic: HourlyPoint[];
}

interface ModuleKpis {
  totalRequests: number;
  uniqueTenants: number;
  uniqueUsers: number;
  avgLatencyMs: number;
  errorRate: number;
}

interface DailyUsagePoint {
  date: string;
  requestCount: number;
  errorCount: number;
}

interface WorkflowStat {
  workflowKey: string;
  workflowName: string;
  requestCount: number;
  errorCount: number;
  uniqueUsers: number;
}

interface ModuleTenantStat {
  tenantId: string;
  tenantName: string;
  requestCount: number;
}

export interface ModuleAnalyticsData {
  kpis: ModuleKpis;
  dailyUsage: DailyUsagePoint[];
  topWorkflows: WorkflowStat[];
  topTenants: ModuleTenantStat[];
}

interface TenantModuleBreakdown {
  moduleKey: string;
  requestCount: number;
  pct: number;
}

interface TenantDailyActivity {
  date: string;
  requestCount: number;
}

interface FeatureAdoption {
  moduleKey: string;
  isEnabled: boolean;
  isActive: boolean;
  lastUsedAt: string | null;
  totalRequests: number;
  activeDays: number;
}

interface TenantWorkflow {
  workflowKey: string;
  workflowName: string;
  requestCount: number;
}

export interface TenantUsageData {
  moduleBreakdown: TenantModuleBreakdown[];
  dailyActivity: TenantDailyActivity[];
  featureAdoption: FeatureAdoption[];
  topWorkflows: TenantWorkflow[];
}

export interface ActionItem {
  id: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  tenantId: string | null;
  moduleKey: string | null;
  metadata: Record<string, unknown>;
  status: string;
  reviewedBy: string | null;
  reviewNotes: string | null;
  expiresAt: string;
  createdAt: string;
}

interface ActionItemStats {
  open: number;
  reviewed: number;
  actioned: number;
  dismissed: number;
}

interface ActionItemsResult {
  items: ActionItem[];
  stats: ActionItemStats;
  cursor: string | null;
  hasMore: boolean;
}

interface ActionItemFilters {
  status?: string;
  category?: string;
  severity?: string;
  cursor?: string;
  limit?: number;
}

// ── Platform Dashboard ───────────────────────────────────────────

export function usePlatformDashboard(period: '1d' | '7d' | '30d' = '30d') {
  const [data, setData] = useState<PlatformDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const json = await adminFetch<{ data: PlatformDashboardData }>(
        `/api/v1/analytics/dashboard?period=${period}`,
      );
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, refresh: fetchData };
}

// ── Module Analytics ─────────────────────────────────────────────

export function useModuleAnalytics(moduleKey: string, period: '7d' | '30d' = '30d') {
  const [data, setData] = useState<ModuleAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!moduleKey) return;
    setIsLoading(true);
    setError(null);
    try {
      const json = await adminFetch<{ data: ModuleAnalyticsData }>(
        `/api/v1/analytics/modules/${moduleKey}?period=${period}`,
      );
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load module analytics');
    } finally {
      setIsLoading(false);
    }
  }, [moduleKey, period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, refresh: fetchData };
}

// ── Tenant Usage ─────────────────────────────────────────────────

export function useTenantUsage(tenantId: string, period: '7d' | '30d' = '30d') {
  const [data, setData] = useState<TenantUsageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    setError(null);
    try {
      const json = await adminFetch<{ data: TenantUsageData }>(
        `/api/v1/analytics/tenants/${tenantId}?period=${period}`,
      );
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tenant usage');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, refresh: fetchData };
}

// ── Action Items ─────────────────────────────────────────────────

export function useActionItems(filters: ActionItemFilters = {}) {
  const [data, setData] = useState<ActionItemsResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (cursorVal?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.category) params.set('category', filters.category);
      if (filters.severity) params.set('severity', filters.severity);
      if (cursorVal) params.set('cursor', cursorVal);
      if (filters.limit) params.set('limit', String(filters.limit));
      const qs = params.toString() ? `?${params.toString()}` : '';
      const json = await adminFetch<{ data: ActionItemsResult }>(
        `/api/v1/analytics/action-items${qs}`,
      );
      if (cursorVal) {
        setData((prev) =>
          prev
            ? { ...json.data, items: [...prev.items, ...json.data.items] }
            : json.data,
        );
      } else {
        setData(json.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load action items');
    } finally {
      setIsLoading(false);
    }
  }, [filters.status, filters.category, filters.severity, filters.limit]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const loadMore = useCallback(() => {
    if (data?.cursor && data.hasMore) fetchData(data.cursor);
  }, [data?.cursor, data?.hasMore, fetchData]);

  const refresh = useCallback(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, loadMore, refresh };
}

// ── Action Item Mutations ────────────────────────────────────────

export function useActionItemMutations() {
  const [isActing, setIsActing] = useState(false);

  const updateStatus = useCallback(async (
    id: string,
    status: 'reviewed' | 'actioned' | 'dismissed',
    reviewNotes?: string,
  ) => {
    setIsActing(true);
    try {
      await adminFetch('/api/v1/analytics/action-items', {
        method: 'PATCH',
        body: JSON.stringify({ id, status, reviewNotes }),
      });
      return true;
    } catch {
      return false;
    } finally {
      setIsActing(false);
    }
  }, []);

  const generateItems = useCallback(async () => {
    setIsActing(true);
    try {
      const json = await adminFetch<{ data: { created: number; skipped: number } }>(
        '/api/v1/analytics/action-items/generate',
        { method: 'POST' },
      );
      return json.data;
    } catch {
      return null;
    } finally {
      setIsActing(false);
    }
  }, []);

  return { updateStatus, generateItems, isActing };
}
