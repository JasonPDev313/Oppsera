'use client';

import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';

export interface UnifiedImportLog {
  id: string;
  module: 'customers' | 'catalog' | 'accounting';
  moduleLabel: string;
  fileName: string;
  totalRows: number;
  successRows: number;
  errorRows: number;
  status: string;
  startedAt: string;
  completedAt: string | null;
}

export function useAllImportHistory() {
  const [items, setItems] = useState<UnifiedImportLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: UnifiedImportLog[] }>(
        '/api/v1/import/all-history',
      );
      setItems(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load import history');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { items, isLoading, error, refresh: fetchHistory };
}
