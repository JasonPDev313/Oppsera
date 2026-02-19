'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { InventoryItem } from '@/types/inventory';

/**
 * Fetch the inventory item for a given catalog item ID + location.
 * Returns null (not an error) when no inventory record exists.
 */
export function useInventoryForCatalogItem(catalogItemId: string | null, locationId?: string) {
  const result = useQuery({
    queryKey: ['inventory-for-catalog', catalogItemId, locationId],
    queryFn: () => {
      const params = new URLSearchParams({ catalogItemId: catalogItemId! });
      if (locationId) params.set('locationId', locationId);
      return apiFetch<{ data: InventoryItem | null }>(
        `/api/v1/inventory/by-catalog-item?${params.toString()}`,
      ).then((r) => r.data);
    },
    enabled: !!catalogItemId,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}
