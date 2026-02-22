import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type { PeriodicCogsCalculation, CogsComparison } from '@/types/accounting';

interface UsePeriodicCogsOptions {
  locationId?: string;
  status?: 'draft' | 'posted';
}

export function usePeriodicCogs(options: UsePeriodicCogsOptions = {}) {
  const [data, setData] = useState<PeriodicCogsCalculation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString(options);
      const res = await apiFetch<{ data: PeriodicCogsCalculation[] }>(`/api/v1/accounting/cogs${qs}`);
      setData(res.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load COGS calculations');
    } finally {
      setIsLoading(false);
    }
  }, [options.locationId, options.status]);

  useEffect(() => { fetch(); }, [fetch]);

  const calculate = useCallback(async (input: {
    periodStart: string;
    periodEnd: string;
    locationId?: string;
    endingInventoryOverride?: string;
  }): Promise<PeriodicCogsCalculation> => {
    const res = await apiFetch<{ data: PeriodicCogsCalculation }>('/api/v1/accounting/cogs', {
      method: 'POST',
      body: JSON.stringify({ action: 'calculate', ...input }),
    });
    await fetch();
    return res.data;
  }, [fetch]);

  const post = useCallback(async (calculationId: string): Promise<{ id: string; glJournalEntryId: string }> => {
    const res = await apiFetch<{ data: { id: string; glJournalEntryId: string } }>('/api/v1/accounting/cogs', {
      method: 'POST',
      body: JSON.stringify({ action: 'post', calculationId }),
    });
    await fetch();
    return res.data;
  }, [fetch]);

  return { data, isLoading, error, mutate: fetch, calculate, post };
}

export function useCogsComparison(periodStart: string, periodEnd: string, locationId?: string) {
  const [data, setData] = useState<CogsComparison | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!periodStart || !periodEnd) return;
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString({ periodStart, periodEnd, locationId });
      const res = await apiFetch<{ data: CogsComparison }>(`/api/v1/accounting/cogs/comparison${qs}`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comparison');
    } finally {
      setIsLoading(false);
    }
  }, [periodStart, periodEnd, locationId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, isLoading, error, mutate: fetch };
}
