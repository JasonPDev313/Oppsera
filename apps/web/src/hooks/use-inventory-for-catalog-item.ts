'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { InventoryItem } from '@/types/inventory';

/**
 * Fetch the inventory item for a given catalog item ID + location.
 * Returns null (not an error) when no inventory record exists.
 */
export function useInventoryForCatalogItem(catalogItemId: string | null, locationId?: string) {
  const [data, setData] = useState<InventoryItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!catalogItemId) {
      setData(null);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const params = new URLSearchParams({ catalogItemId });
      if (locationId) params.set('locationId', locationId);

      const res = await apiFetch<{ data: InventoryItem | null }>(
        `/api/v1/inventory/by-catalog-item?${params.toString()}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load inventory item'));
    } finally {
      setIsLoading(false);
    }
  }, [catalogItemId, locationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const mutate = useCallback(() => fetchData(), [fetchData]);
  return { data, isLoading, error, mutate };
}
