'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { ReorderSuggestion } from '@/types/receiving';

// ── Types ─────────────────────────────────────────────────────────

export interface NegativeStockItem {
  inventoryItemId: string;
  itemName: string;
  sku: string | null;
  locationId: string;
  onHand: number;
}

export interface StockAlertNotification {
  id: string;
  title: string;
  body: string;
  severity: string;
  metricSlug: string | null;
  metricValue: string | null;
  baselineValue: string | null;
  locationId: string | null;
  isRead: boolean;
  isDismissed: boolean;
  createdAt: string;
}

export interface StockAlertSummary {
  criticalCount: number;
  warningCount: number;
  totalIssues: number;
  unreadAlertCount: number;
}

interface StockAlertsResponse {
  data: {
    lowStockItems: ReorderSuggestion[];
    negativeStockItems: NegativeStockItem[];
    recentAlerts: StockAlertNotification[];
  };
  meta: {
    summary: StockAlertSummary;
  };
}

// ── Hook ──────────────────────────────────────────────────────────

interface UseStockAlertsOptions {
  locationId?: string;
  daysBack?: number;
}

export function useStockAlerts(options: UseStockAlertsOptions = {}) {
  const queryClient = useQueryClient();

  const result = useQuery({
    queryKey: ['stock-alerts', options.locationId, options.daysBack],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      if (options.locationId) params.set('locationId', options.locationId);
      if (options.daysBack) params.set('daysBack', String(options.daysBack));
      return apiFetch<StockAlertsResponse>(
        `/api/v1/inventory/stock-alerts?${params}`,
        { signal },
      );
    },
    staleTime: 60_000, // 1 minute
    refetchInterval: () => (document.hidden ? false : 5 * 60_000), // auto-refresh every 5 minutes, pause when hidden
    refetchOnWindowFocus: true,
  });

  const mutate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['stock-alerts'] });
  }, [queryClient]);

  return {
    lowStockItems: result.data?.data.lowStockItems ?? [],
    negativeStockItems: result.data?.data.negativeStockItems ?? [],
    recentAlerts: result.data?.data.recentAlerts ?? [],
    summary: result.data?.meta.summary ?? { criticalCount: 0, warningCount: 0, totalIssues: 0, unreadAlertCount: 0 },
    isLoading: result.isLoading,
    error: result.error,
    mutate,
  };
}
