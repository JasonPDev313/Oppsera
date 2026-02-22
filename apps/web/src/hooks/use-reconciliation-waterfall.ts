'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type { ReconciliationWaterfall } from '@/types/accounting';

interface WaterfallFilters {
  businessDate: string;
  locationId?: string;
}

export function useReconciliationWaterfall(filters: WaterfallFilters) {
  const qs = buildQueryString({
    businessDate: filters.businessDate,
    locationId: filters.locationId,
  });

  const result = useQuery({
    queryKey: ['reconciliation-waterfall', filters.businessDate, filters.locationId],
    queryFn: async () => {
      const res = await apiFetch<{ data: ReconciliationWaterfall }>(
        `/api/v1/accounting/reconciliation/waterfall${qs}`,
      );
      return res.data;
    },
    staleTime: 15_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}
