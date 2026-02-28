'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

interface Location {
  id: string;
  name: string;
  locationType: 'site' | 'venue';
  parentLocationId: string | null;
}

interface SettingsData {
  locations: Location[];
  profitCenters: unknown[];
  terminals: unknown[];
}

/**
 * Lightweight hook that fetches all locations.
 * Re-uses the settings-data endpoint and returns just the locations array.
 */
export function useLocations() {
  const result = useQuery({
    queryKey: ['locations-list'],
    queryFn: () =>
      apiFetch<{ data: SettingsData }>(
        '/api/v1/profit-centers/settings-data',
      ).then((r) => r.data.locations),
    staleTime: 60_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
  };
}
