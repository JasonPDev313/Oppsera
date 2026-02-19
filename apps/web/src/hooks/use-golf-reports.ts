'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import type {
  GolfDashboardMetrics,
  GolfUtilizationRow,
  TeeSheetKpis,
  GolfRevenueRow,
  PaceKpis,
  GolfDaypartRow,
  ChannelKpis,
  GolfCustomerRow,
  GolfCustomerKpis,
} from '@/types/golf-reports';

// ── Helpers ──────────────────────────────────────────────────────

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildParams(entries: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(entries)) {
    if (v !== undefined) params.set(k, v);
  }
  return params.toString();
}

/** Fetch CSV with auth token and trigger browser download */
export async function downloadGolfExport(
  endpoint: string,
  params: Record<string, string | undefined>,
) {
  const qs = buildParams(params);
  const url = qs ? `${endpoint}?${qs}` : endpoint;
  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem('oppsera_access_token')
      : null;

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);

  const disposition = res.headers.get('Content-Disposition');
  const filenameMatch = disposition?.match(/filename="?([^"]+)"?/);
  const filename = filenameMatch?.[1] ?? 'export.csv';

  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

// ── useGolfDashboard ─────────────────────────────────────────────

export function useGolfDashboard(
  courseId?: string,
  locationId?: string,
  date?: string,
) {
  const [data, setData] = useState<GolfDashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const qs = buildParams({
        date: date ?? getTodayDate(),
        courseId,
        locationId,
      });
      const res = await apiFetch<{ data: GolfDashboardMetrics }>(
        `/api/v1/reports/golf/dashboard?${qs}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load golf dashboard'));
    } finally {
      setIsLoading(false);
    }
  }, [courseId, locationId, date]);

  useEffect(() => {
    setIsLoading(true);
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 60s
  useEffect(() => {
    intervalRef.current = setInterval(fetchData, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

// ── useGolfUtilization ───────────────────────────────────────────

interface UseGolfDateRangeOptions {
  dateFrom: string;
  dateTo: string;
  courseId?: string;
  locationId?: string;
}

export function useGolfUtilization(options: UseGolfDateRangeOptions) {
  const [data, setData] = useState<GolfUtilizationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const qs = buildParams({
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
        courseId: options.courseId,
        locationId: options.locationId,
      });
      const res = await apiFetch<{ data: GolfUtilizationRow[] }>(
        `/api/v1/reports/golf/utilization?${qs}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load utilization'));
    } finally {
      setIsLoading(false);
    }
  }, [options.dateFrom, options.dateTo, options.courseId, options.locationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

// ── useTeeSheetKpis ──────────────────────────────────────────────

export function useTeeSheetKpis(options: UseGolfDateRangeOptions) {
  const [data, setData] = useState<TeeSheetKpis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const qs = buildParams({
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
        courseId: options.courseId,
        locationId: options.locationId,
      });
      const res = await apiFetch<{ data: TeeSheetKpis }>(
        `/api/v1/reports/golf/utilization/kpis?${qs}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load tee sheet KPIs'));
    } finally {
      setIsLoading(false);
    }
  }, [options.dateFrom, options.dateTo, options.courseId, options.locationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

// ── useGolfRevenue ───────────────────────────────────────────────

export function useGolfRevenue(options: UseGolfDateRangeOptions) {
  const [data, setData] = useState<GolfRevenueRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const qs = buildParams({
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
        courseId: options.courseId,
        locationId: options.locationId,
      });
      const res = await apiFetch<{ data: GolfRevenueRow[] }>(
        `/api/v1/reports/golf/revenue?${qs}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load golf revenue'));
    } finally {
      setIsLoading(false);
    }
  }, [options.dateFrom, options.dateTo, options.courseId, options.locationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

// ── usePaceKpis ──────────────────────────────────────────────────

export function usePaceKpis(options: UseGolfDateRangeOptions) {
  const [data, setData] = useState<PaceKpis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const qs = buildParams({
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
        courseId: options.courseId,
        locationId: options.locationId,
      });
      const res = await apiFetch<{ data: PaceKpis }>(
        `/api/v1/reports/golf/pace?${qs}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load pace KPIs'));
    } finally {
      setIsLoading(false);
    }
  }, [options.dateFrom, options.dateTo, options.courseId, options.locationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

// ── useGolfDayparts ──────────────────────────────────────────────

export function useGolfDayparts(options: UseGolfDateRangeOptions) {
  const [data, setData] = useState<GolfDaypartRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const qs = buildParams({
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
        courseId: options.courseId,
        locationId: options.locationId,
      });
      const res = await apiFetch<{ data: GolfDaypartRow[] }>(
        `/api/v1/reports/golf/dayparts?${qs}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load dayparts'));
    } finally {
      setIsLoading(false);
    }
  }, [options.dateFrom, options.dateTo, options.courseId, options.locationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

// ── useChannelKpis ───────────────────────────────────────────────

export function useChannelKpis(options: UseGolfDateRangeOptions) {
  const [data, setData] = useState<ChannelKpis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const qs = buildParams({
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
        courseId: options.courseId,
        locationId: options.locationId,
      });
      const res = await apiFetch<{ data: ChannelKpis }>(
        `/api/v1/reports/golf/channels?${qs}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load channel KPIs'));
    } finally {
      setIsLoading(false);
    }
  }, [options.dateFrom, options.dateTo, options.courseId, options.locationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

// ── useGolfCustomers ─────────────────────────────────────────────

interface UseGolfCustomersOptions {
  cursor?: string;
  limit?: number;
  sortBy?: 'totalRounds' | 'totalRevenue' | 'lastPlayedAt' | 'customerName';
  sortDir?: 'asc' | 'desc';
}

export function useGolfCustomers(options: UseGolfCustomersOptions = {}) {
  const [data, setData] = useState<GolfCustomerRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const qs = buildParams({
        cursor: options.cursor,
        limit: options.limit ? String(options.limit) : undefined,
        sortBy: options.sortBy,
        sortDir: options.sortDir,
      });
      const res = await apiFetch<{
        data: GolfCustomerRow[];
        meta: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/reports/golf/customers?${qs}`);
      setData(res.data);
      setCursor(res.meta.cursor);
      setHasMore(res.meta.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load golf customers'));
    } finally {
      setIsLoading(false);
    }
  }, [options.cursor, options.limit, options.sortBy, options.sortDir]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, cursor, hasMore, isLoading, error, mutate: fetchData };
}

// ── useGolfCustomerKpis ──────────────────────────────────────────

export function useGolfCustomerKpis() {
  const [data, setData] = useState<GolfCustomerKpis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<{ data: GolfCustomerKpis }>(
        '/api/v1/reports/golf/customers/kpis',
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load customer KPIs'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}
