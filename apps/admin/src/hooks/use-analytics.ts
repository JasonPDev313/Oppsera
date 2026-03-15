'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api-fetch';

// ── Types ────────────────────────────────────────────────────────

interface ScoringResult {
  scored: number;
  highRisk: number;
  errors: number;
  dataAvailability: {
    loginTenants: number;
    usageTenants: number;
    adoptionTenants: number;
    breadthTenants: number;
    errorTenants: number;
    totalTenants: number;
  };
  elapsedMs: number;
}

interface PlatformKpis {
  totalRequests: number;
  activeTenants: number;
  errorRate: number;
  avgLatencyMs: number;
}

interface ModuleRanking {
  moduleKey: string;
  requestCount: number;
  errorCount: number;
  uniqueTenants: number;
}

interface TenantRanking {
  tenantId: string;
  tenantName: string;
  requestCount: number;
  lastActiveAt: string;
}

interface AdoptionRate {
  moduleKey: string;
  activeTenants: number;
  totalTenants: number;
  adoptionPct: number;
}

interface ErrorTrendPoint {
  usageDate: string;
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
  usageDate: string;
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
  errorCount: number;
  pct: number;
}

interface TenantDailyActivity {
  usageDate: string;
  requestCount: number;
}

interface FeatureAdoption {
  moduleKey: string;
  firstUsedAt: string | null;
  lastUsedAt: string | null;
  totalRequests: number;
  isActive: boolean;
}

interface TenantWorkflow {
  workflowKey: string;
  moduleKey: string;
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
    } catch (err) {
      console.error('[Action Items] Generate failed:', err);
      return null;
    } finally {
      setIsActing(false);
    }
  }, []);

  return { updateStatus, generateItems, isActing };
}

// ── Attrition Risk ──────────────────────────────────────────────

export interface AttritionScore {
  id: string;
  tenantId: string;
  overallScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  loginDeclineScore: number;
  usageDeclineScore: number;
  moduleAbandonmentScore: number;
  userShrinkageScore: number;
  errorFrustrationScore: number;
  breadthNarrowingScore: number;
  stalenessScore: number;
  onboardingStallScore: number;
  narrative: string;
  tenantName: string;
  tenantStatus: string;
  industry: string | null;
  healthGrade: string | null;
  totalLocations: number;
  totalUsers: number;
  activeModules: number;
  lastActivityAt: string | null;
  scoredAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNotes: string | null;
  status: string;
  previousScore: number | null;
}

interface AttritionStats {
  open: number;
  reviewed: number;
  actioned: number;
  dismissed: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface AttritionListResult {
  items: AttritionScore[];
  stats: AttritionStats;
  cursor: string | null;
  hasMore: boolean;
}

interface AttritionFilters {
  riskLevel?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

export function useAttritionList(filters: AttritionFilters = {}) {
  const [data, setData] = useState<AttritionListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (cursorVal?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.riskLevel) params.set('riskLevel', filters.riskLevel);
      if (filters.status) params.set('status', filters.status);
      if (cursorVal) params.set('cursor', cursorVal);
      if (filters.limit) params.set('limit', String(filters.limit));
      const qs = params.toString() ? `?${params.toString()}` : '';
      const json = await adminFetch<{ data: AttritionListResult }>(
        `/api/v1/analytics/attrition${qs}`,
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
      setError(err instanceof Error ? err.message : 'Failed to load attrition data');
    } finally {
      setIsLoading(false);
    }
  }, [filters.riskLevel, filters.status, filters.limit]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const loadMore = useCallback(() => {
    if (data?.cursor && data.hasMore) fetchData(data.cursor);
  }, [data?.cursor, data?.hasMore, fetchData]);

  const refresh = useCallback(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, loadMore, refresh };
}

interface AttritionDetailResult {
  current: AttritionScore & {
    signals: Record<string, { score: number }>;
    signalDetails: Record<string, unknown>;
  };
  history: { overallScore: number; riskLevel: string; scoredAt: string }[];
}

export function useAttritionDetail(tenantId: string) {
  const [data, setData] = useState<AttritionDetailResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!tenantId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const json = await adminFetch<{ data: AttritionDetailResult }>(
        `/api/v1/analytics/attrition/${tenantId}`,
      );
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load attrition detail');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, refresh: fetchData };
}

export function useAttritionMutations() {
  const [isActing, setIsActing] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const updateStatus = useCallback(async (
    id: string,
    status: 'reviewed' | 'actioned' | 'dismissed',
    reviewNotes?: string,
  ) => {
    setIsActing(true);
    setMutationError(null);
    try {
      await adminFetch('/api/v1/analytics/attrition', {
        method: 'PATCH',
        body: JSON.stringify({ id, status, reviewNotes }),
      });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update status';
      setMutationError(msg);
      console.error('[Attrition] Status update failed:', err);
      return false;
    } finally {
      setIsActing(false);
    }
  }, []);

  const runScoring = useCallback(async (): Promise<ScoringResult | { error: string }> => {
    setIsActing(true);
    try {
      const json = await adminFetch<{ data: ScoringResult }>(
        '/api/v1/analytics/attrition/score',
        { method: 'POST' },
      );
      return json.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[Attrition] Scoring failed:', err);
      return { error: msg };
    } finally {
      setIsActing(false);
    }
  }, []);

  return { updateStatus, runScoring, isActing, mutationError };
}
