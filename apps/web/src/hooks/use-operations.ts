'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type {
  CashManagementDashboardResult,
  TenderAuditTrailResult,
  DailyReconciliationResult,
  OperationsSummaryResult,
} from '@/types/accounting';

export function useCashDashboard(
  locationId: string | null,
  startDate: string | null,
  endDate: string | null,
) {
  return useQuery({
    queryKey: ['cash-dashboard', locationId, startDate, endDate],
    queryFn: async () => {
      const qs = buildQueryString({ locationId, startDate, endDate });
      const res = await apiFetch<{ data: CashManagementDashboardResult }>(
        `/api/v1/accounting/operations/cash-dashboard${qs}`,
      );
      return res.data;
    },
    enabled: !!locationId && !!startDate && !!endDate,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useTenderAuditTrail(tenderId: string | null) {
  return useQuery({
    queryKey: ['tender-audit', tenderId],
    queryFn: async () => {
      const res = await apiFetch<{ data: TenderAuditTrailResult }>(
        `/api/v1/accounting/operations/tender-audit/${tenderId}`,
      );
      return res.data;
    },
    enabled: !!tenderId,
    staleTime: 30_000,
  });
}

export function useDailyReconciliation(
  locationId: string | null,
  businessDate: string | null,
) {
  return useQuery({
    queryKey: ['daily-reconciliation', locationId, businessDate],
    queryFn: async () => {
      const qs = buildQueryString({ locationId, businessDate });
      const res = await apiFetch<{ data: DailyReconciliationResult }>(
        `/api/v1/accounting/operations/daily-reconciliation${qs}`,
      );
      return res.data;
    },
    enabled: !!locationId && !!businessDate,
    staleTime: 30_000,
  });
}

export function useOperationsSummary(
  startDate: string | null,
  endDate: string | null,
  locationId?: string | null,
) {
  return useQuery({
    queryKey: ['operations-summary', startDate, endDate, locationId],
    queryFn: async () => {
      const qs = buildQueryString({ startDate, endDate, locationId });
      const res = await apiFetch<{ data: OperationsSummaryResult }>(
        `/api/v1/accounting/operations/summary${qs}`,
      );
      return res.data;
    },
    enabled: !!startDate && !!endDate,
    staleTime: 30_000,
  });
}
