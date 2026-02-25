'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { ProfitCenter, Terminal } from '@oppsera/core/profit-centers';

interface LocationForSettings {
  id: string;
  name: string;
  locationType: 'site' | 'venue';
  parentLocationId: string | null;
}

interface SettingsData {
  locations: LocationForSettings[];
  profitCenters: ProfitCenter[];
  terminals: Terminal[];
}

/**
 * Single hook that fetches all profit center settings data in one API call.
 * Locations, profit centers, and terminals are filtered locally.
 */
export function useProfitCenterSettings() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch<{ data: SettingsData }>(
        '/api/v1/profit-centers/settings-data',
      );
      setData(res.data);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ProfitCenterSettings] Failed to load:', msg);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, isLoading, error, refetch: fetch };
}

/**
 * Filters profit centers by locationId from the full dataset (client-side).
 */
export function filterProfitCenters(
  allPCs: ProfitCenter[] | undefined,
  locationId: string | null,
): ProfitCenter[] {
  if (!allPCs || !locationId) return [];
  return allPCs.filter((pc) => pc.locationId === locationId);
}

/**
 * Filters terminals by locationId (simple mode) — matches via
 * the terminal's profit center's locationId.
 */
export function filterTerminalsByLocation(
  allTerminals: Terminal[] | undefined,
  allPCs: ProfitCenter[] | undefined,
  locationId: string | null,
): Terminal[] {
  if (!allTerminals || !allPCs || !locationId) return [];
  const pcIdsAtLocation = new Set(
    allPCs.filter((pc) => pc.locationId === locationId).map((pc) => pc.id),
  );
  return allTerminals.filter((t) => pcIdsAtLocation.has(t.profitCenterId));
}

/**
 * Filters terminals by profitCenterId (advanced mode).
 */
export function filterTerminalsByPC(
  allTerminals: Terminal[] | undefined,
  profitCenterId: string | null,
): Terminal[] {
  if (!allTerminals || !profitCenterId) return [];
  return allTerminals.filter((t) => t.profitCenterId === profitCenterId);
}

/** Builds a Map of siteId → venue[] for the location tree. */
export function useVenuesBySite(locations: LocationForSettings[]) {
  return useMemo(() => {
    const map = new Map<string, LocationForSettings[]>();
    for (const loc of locations) {
      if (loc.locationType === 'venue' && loc.parentLocationId) {
        const list = map.get(loc.parentLocationId) ?? [];
        list.push(loc);
        map.set(loc.parentLocationId, list);
      }
    }
    return map;
  }, [locations]);
}
