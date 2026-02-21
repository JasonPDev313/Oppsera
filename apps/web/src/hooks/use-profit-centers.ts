'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { ProfitCenter } from '@oppsera/core/profit-centers';

interface UseProfitCentersOptions {
  locationId?: string;
}

export function useProfitCenters(options?: UseProfitCentersOptions) {
  const [data, setData] = useState<ProfitCenter[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = options?.locationId
        ? `?locationId=${options.locationId}`
        : '';
      const res = await apiFetch<{ data: ProfitCenter[] }>(
        `/api/v1/profit-centers${params}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch'));
    } finally {
      setIsLoading(false);
    }
  }, [options?.locationId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, isLoading, error, refetch: fetch };
}

export function useProfitCenterMutations() {
  const create = async (input: Record<string, unknown>) => {
    return apiFetch<{ data: ProfitCenter }>('/api/v1/profit-centers', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  };

  const update = async (id: string, input: Record<string, unknown>) => {
    return apiFetch<{ data: ProfitCenter }>(`/api/v1/profit-centers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  };

  const deactivate = async (id: string) => {
    return apiFetch(`/api/v1/profit-centers/${id}`, { method: 'DELETE' });
  };

  return { create, update, deactivate };
}
