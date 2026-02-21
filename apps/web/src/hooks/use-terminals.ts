'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { Terminal } from '@oppsera/core/profit-centers';

export function useTerminals(profitCenterId: string) {
  const [data, setData] = useState<Terminal[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    if (!profitCenterId) {
      setData(null);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const res = await apiFetch<{ data: Terminal[] }>(
        `/api/v1/profit-centers/${profitCenterId}/terminals`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch'));
    } finally {
      setIsLoading(false);
    }
  }, [profitCenterId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, isLoading, error, refetch: fetch };
}

export function useTerminalsByLocation(locationId: string | undefined) {
  const [data, setData] = useState<Terminal[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    if (!locationId) {
      setData(null);
      return;
    }
    try {
      setIsLoading(true);
      const res = await apiFetch<{ data: Terminal[] }>(
        `/api/v1/terminals/by-location?locationId=${locationId}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch'));
    } finally {
      setIsLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, isLoading, error, refetch: fetch };
}

export function useTerminalMutations(profitCenterId: string) {
  const create = async (input: Record<string, unknown>) => {
    return apiFetch<{ data: Terminal }>(
      `/api/v1/profit-centers/${profitCenterId}/terminals`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );
  };

  const update = async (id: string, input: Record<string, unknown>) => {
    return apiFetch<{ data: Terminal }>(`/api/v1/terminals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  };

  const deactivate = async (id: string) => {
    return apiFetch(`/api/v1/terminals/${id}`, { method: 'DELETE' });
  };

  return { create, update, deactivate };
}
