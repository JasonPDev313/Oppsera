'use client';

import { useState, useEffect, useMemo } from 'react';
import { Monitor } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useKdsStationCounts } from '@/hooks/use-fnb-kitchen';
import type { FnbStation } from '@/types/fnb';
import type { SubNavItem } from '@/lib/navigation';

/**
 * Fetches KDS stations for the given location and returns them as
 * SubNavItem[] for sidebar injection. Each active station becomes a
 * clickable nav link under Kitchen Display with a live ticket count badge.
 * Includes locationId in links so the KDS page doesn't fall back to the
 * wrong default location.
 */
export function useKdsStationsForNav(locationId?: string): SubNavItem[] {
  const [stations, setStations] = useState<FnbStation[]>([]);
  const stationCounts = useKdsStationCounts(locationId ?? '');

  useEffect(() => {
    if (!locationId) return;
    const controller = new AbortController();
    (async () => {
      try {
        const json = await apiFetch<{ data: FnbStation[] }>(
          `/api/v1/fnb/stations?locationId=${locationId}`,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) setStations(json.data ?? []);
      } catch {
        // Silently fail — stations will just not appear in nav
      }
    })();
    return () => { controller.abort(); };
  }, [locationId]);

  return useMemo(() => {
    return stations
      .filter((s) => s.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({
        name: s.displayName || s.name,
        href: s.stationType === 'expo'
          ? (locationId ? `/expo?locationId=${locationId}` : '/expo')
          : `/kds/${s.id}${locationId ? `?locationId=${locationId}` : ''}`,
        icon: Monitor,
        requiredPermission: 'kds.view',
        badge: stationCounts.get(s.id) ?? 0,
      }));
  }, [stations, stationCounts]);
}
