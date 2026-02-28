'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type {
  DashboardMetrics,
  DailySalesRow,
  ItemSalesRow,
  InventorySummaryRow,
  CustomerSpendingResult,
} from '@/types/reports';

// ── Helpers ──────────────────────────────────────────────────────

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Format dollar amount as USD currency string */
export function formatReportMoney(dollars: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(dollars);
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
  const result = useQuery({
    queryKey: ['reports-dashboard', locationId, getTodayDate()],
    queryFn: () => {
      const params = new URLSearchParams({ date: getTodayDate() });
      if (locationId) params.set('locationId', locationId);
      return apiFetch<{ data: DashboardMetrics }>(
        `/api/v1/reports/dashboard?${params.toString()}`,
      ).then((r) => r.data);
    },
    refetchInterval: 60_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useDailySales ────────────────────────────────────────────────

interface UseDailySalesOptions {
  dateFrom: string;
  dateTo: string;
  locationId?: string;
}

export function useDailySales(options: UseDailySalesOptions) {
  const result = useQuery({
    queryKey: ['daily-sales', options.dateFrom, options.dateTo, options.locationId],
    queryFn: () => {
      const params = new URLSearchParams({
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
      });
      if (options.locationId) params.set('locationId', options.locationId);
      return apiFetch<{ data: DailySalesRow[] }>(
        `/api/v1/reports/daily-sales?${params.toString()}`,
      ).then((r) => r.data);
    },
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
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
  const result = useQuery({
    queryKey: ['item-sales', options.dateFrom, options.dateTo, options.locationId, options.sortBy, options.sortDir, options.limit],
    queryFn: () => {
      const params = new URLSearchParams({
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
      });
      if (options.locationId) params.set('locationId', options.locationId);
      if (options.sortBy) params.set('sortBy', options.sortBy);
      if (options.sortDir) params.set('sortDir', options.sortDir);
      if (options.limit) params.set('limit', String(options.limit));
      return apiFetch<{ data: ItemSalesRow[] }>(
        `/api/v1/reports/item-sales?${params.toString()}`,
      ).then((r) => r.data);
    },
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useCustomerSpending ──────────────────────────────────────────

interface UseCustomerSpendingOptions {
  dateFrom: string;
  dateTo: string;
  locationId?: string;
  search?: string;
  sortBy?: 'totalSpend' | 'customerName';
  sortDir?: 'asc' | 'desc';
  limit?: number;
}

export function useCustomerSpending(options: UseCustomerSpendingOptions) {
  const result = useQuery({
    queryKey: [
      'customer-spending',
      options.dateFrom,
      options.dateTo,
      options.locationId,
      options.search,
      options.sortBy,
      options.sortDir,
      options.limit,
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
      });
      if (options.locationId) params.set('locationId', options.locationId);
      if (options.search) params.set('search', options.search);
      if (options.sortBy) params.set('sortBy', options.sortBy);
      if (options.sortDir) params.set('sortDir', options.sortDir);
      if (options.limit) params.set('limit', String(options.limit));
      return apiFetch<{ data: CustomerSpendingResult }>(
        `/api/v1/reports/customer-spending?${params.toString()}`,
      ).then((r) => r.data);
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useInventorySummary ──────────────────────────────────────────

interface UseInventorySummaryOptions {
  locationId?: string;
  belowThresholdOnly?: boolean;
  search?: string;
}

export function useInventorySummary(options: UseInventorySummaryOptions = {}) {
  const result = useQuery({
    queryKey: ['inventory-summary', options.locationId, options.belowThresholdOnly, options.search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (options.locationId) params.set('locationId', options.locationId);
      if (options.belowThresholdOnly) params.set('belowThresholdOnly', 'true');
      if (options.search) params.set('search', options.search);
      return apiFetch<{ data: InventorySummaryRow[] }>(
        `/api/v1/reports/inventory-summary?${params.toString()}`,
      ).then((r) => r.data);
    },
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}
