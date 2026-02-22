'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type { LocationCloseStatusResult } from '@/types/accounting';

export function useCloseStatus(locationId: string | null, businessDate: string | null) {
  const result = useQuery({
    queryKey: ['close-status', locationId, businessDate],
    queryFn: () => {
      const qs = buildQueryString({ locationId: locationId!, businessDate: businessDate! });
      return apiFetch<{ data: LocationCloseStatusResult }>(
        `/api/v1/accounting/close-status${qs}`,
      ).then((r) => r.data);
    },
    enabled: !!locationId && !!businessDate,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}
