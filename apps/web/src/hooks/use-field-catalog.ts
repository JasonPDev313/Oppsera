'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { FieldCatalogEntry } from '@/types/custom-reports';

export function useFieldCatalog() {
  const [fields, setFields] = useState<FieldCatalogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchFields = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: FieldCatalogEntry[] }>(
        '/api/v1/reports/fields',
      );
      setFields(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load field catalog'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFields();
  }, [fetchFields]);

  const dimensions = useMemo(() => fields.filter((f) => !f.isMetric), [fields]);
  const metrics = useMemo(() => fields.filter((f) => f.isMetric), [fields]);

  const byDataset = useMemo(() => {
    const grouped: Record<string, FieldCatalogEntry[]> = {};
    for (const f of fields) {
      if (!grouped[f.dataset]) grouped[f.dataset] = [];
      grouped[f.dataset]!.push(f);
    }
    return grouped;
  }, [fields]);

  return { fields, dimensions, metrics, byDataset, isLoading, error, mutate: fetchFields };
}
