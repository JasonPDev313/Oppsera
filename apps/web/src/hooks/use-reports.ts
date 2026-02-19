'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import type {
  DashboardMetrics,
  DailySalesRow,
  ItemSalesRow,
  InventorySummaryRow,
} from '@/types/reports';

// ── Helpers ──────────────────────────────────────────────────────

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Format cents as USD currency string */
export function formatReportMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

/** Build CSV export URL from base path and params */
export function buildExportUrl(
  basePath: string,
  params: Record<string, string | undefined>,
): string {
  const url = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.set(k, v);
  }
  return `${basePath}?${url.toString()}`;
}

/** Fetch CSV with auth token and trigger browser download */
export async function downloadCsvExport(
  basePath: string,
  params: Record<string, string | undefined>,
) {
  const url = buildExportUrl(basePath, params);
  const token = typeof window !== 'undefined'
    ? localStorage.getItem('oppsera_access_token')
    : null;

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);

  // Extract filename from Content-Disposition header or generate one
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

// ── useReportsDashboard ──────────────────────────────────────────

export function useReportsDashboard(locationId?: string) {
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const params = new URLSearchParams({ date: getTodayDate() });
      if (locationId) params.set('locationId', locationId);

      const res = await apiFetch<{ data: DashboardMetrics }>(
        `/api/v1/reports/dashboard?${params.toString()}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load dashboard'));
    } finally {
      setIsLoading(false);
    }
  }, [locationId]);

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

// ── useDailySales ────────────────────────────────────────────────

interface UseDailySalesOptions {
  dateFrom: string;
  dateTo: string;
  locationId?: string;
}

export function useDailySales(options: UseDailySalesOptions) {
  const [data, setData] = useState<DailySalesRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const params = new URLSearchParams({
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
      });
      if (options.locationId) params.set('locationId', options.locationId);

      const res = await apiFetch<{ data: DailySalesRow[] }>(
        `/api/v1/reports/daily-sales?${params.toString()}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load daily sales'));
    } finally {
      setIsLoading(false);
    }
  }, [options.dateFrom, options.dateTo, options.locationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

// ── useItemSales ─────────────────────────────────────────────────

interface UseItemSalesOptions {
  dateFrom: string;
  dateTo: string;
  locationId?: string;
  sortBy?: 'quantitySold' | 'grossRevenue';
  sortDir?: 'asc' | 'desc';
  limit?: number;
}

export function useItemSales(options: UseItemSalesOptions) {
  const [data, setData] = useState<ItemSalesRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const params = new URLSearchParams({
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
      });
      if (options.locationId) params.set('locationId', options.locationId);
      if (options.sortBy) params.set('sortBy', options.sortBy);
      if (options.sortDir) params.set('sortDir', options.sortDir);
      if (options.limit) params.set('limit', String(options.limit));

      const res = await apiFetch<{ data: ItemSalesRow[] }>(
        `/api/v1/reports/item-sales?${params.toString()}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load item sales'));
    } finally {
      setIsLoading(false);
    }
  }, [options.dateFrom, options.dateTo, options.locationId, options.sortBy, options.sortDir, options.limit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

// ── useInventorySummary ──────────────────────────────────────────

interface UseInventorySummaryOptions {
  locationId?: string;
  belowThresholdOnly?: boolean;
  search?: string;
}

export function useInventorySummary(options: UseInventorySummaryOptions = {}) {
  const [data, setData] = useState<InventorySummaryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (options.locationId) params.set('locationId', options.locationId);
      if (options.belowThresholdOnly) params.set('belowThresholdOnly', 'true');
      if (options.search) params.set('search', options.search);

      const res = await apiFetch<{ data: InventorySummaryRow[] }>(
        `/api/v1/reports/inventory-summary?${params.toString()}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load inventory'));
    } finally {
      setIsLoading(false);
    }
  }, [options.locationId, options.belowThresholdOnly, options.search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}
