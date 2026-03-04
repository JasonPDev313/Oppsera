'use client';

import { useState, useEffect, useMemo } from 'react';
import { Monitor } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import type { FnbStation } from '@/types/fnb';
import type { SubNavItem } from '@/lib/navigation';

/**
 * Fetches KDS stations and returns them as SubNavItem[] for sidebar injection.
 * Each active non-expo station becomes a clickable nav link under Kitchen Display.
 */
export function useKdsStationsForNav(locationId?: string): SubNavItem[] {
  const [stations, setStations] = useState<FnbStation[]>([]);

  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;
    (async () => {
      try {
        const params = `?locationId=${locationId}`;
        const json = await apiFetch<{ data: FnbStation[] }>(`/api/v1/fnb/stations${params}`);
        if (!cancelled) setStations(json.data ?? []);
      } catch {
        // Silently fail — stations will just not appear in nav
      }
    })();
    return () => { cancelled = true; };
  }, [locationId]);

  return useMemo(() => {
    return stations
      .filter((s) => s.stationType !== 'expo' && s.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({
        name: s.displayName || s.name,
        href: `/kds/${s.id}`,
        icon: Monitor,
        requiredPermission: 'kds.view',
      }));
  }, [stations]);
}
