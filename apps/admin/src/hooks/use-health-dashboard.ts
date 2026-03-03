'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { adminFetch } from '@/lib/api-fetch';

// ── Types ────────────────────────────────────────────────────────

export interface SystemSnapshot {
  id: string;
  capturedAt: string | null;
  totalOrdersToday: number;
  totalOrders1h: number;
  activeTenantsToday: number;
  activeUsersToday: number;
  totalErrors1h: number;
  totalDlqDepth: number;
  totalDlqUnresolved: number;
  dbConnectionCount: number | null;
  dbMaxConnections: number | null;
  dbCacheHitPct: number | null;
  dbSizeBytes: number | null;
  queuedJobs: number;
  failedJobs1h: number;
  stuckConsumers: number;
  tenantsGradeA: number;
  tenantsGradeB: number;
  tenantsGradeC: number;
  tenantsGradeD: number;
  tenantsGradeF: number;
}

export interface HealthAlert {
  id: number;
  level: string;
  title: string;
  details: string | null;
  tenantId: string | null;
  context: Record<string, unknown> | null;
  sentAt: string | null;
  channel: string | null;
}

export interface TopIssue {
  tenantId: string;
  tenantName: string;
  grade: string;
  score: number;
  factors: Array<{ factor: string; impact: number; detail: string }>;
}

export interface HealthDashboardData {
  system: SystemSnapshot | null;
  trend: SystemSnapshot[];
  alerts: HealthAlert[];
  tenantsByGrade: { A: number; B: number; C: number; D: number; F: number };
  topIssues: TopIssue[];
}

const POLL_INTERVAL_MS = 60_000;

// ── Hook ─────────────────────────────────────────────────────────

export function useHealthDashboard() {
  const [data, setData] = useState<HealthDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const json = await adminFetch<{ data: HealthDashboardData }>(
        '/api/v1/health/dashboard',
      );
      setData(json.data);
      setLastUpdatedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load health dashboard');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    timerRef.current = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchData]);

  return { data, isLoading, error, lastUpdatedAt, refresh: fetchData };
}
