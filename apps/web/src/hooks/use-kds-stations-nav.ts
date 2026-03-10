'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Monitor } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import type { FnbStation } from '@/types/fnb';
import type { SubNavItem } from '@/lib/navigation';

/**
 * Fetches KDS stations across all user locations and returns them as
 * SubNavItem[] for sidebar injection. Each active station becomes a
 * clickable nav link under Kitchen Display.
 */
export function useKdsStationsForNav(locationIds: string[]): SubNavItem[] {
  const [stations, setStations] = useState<FnbStation[]>([]);
  // Stabilise the dependency — only re-fetch when the actual IDs change
  const idsKey = locationIds.join(',');
  const idsRef = useRef(locationIds);
  idsRef.current = locationIds;

  useEffect(() => {
    if (!idsRef.current.length) return;
    const controller = new AbortController();

    (async () => {
      try {
        const results = await Promise.all(
          idsRef.current.map((locId) =>
            apiFetch<{ data: FnbStation[] }>(
              `/api/v1/fnb/stations?locationId=${locId}`,
              { signal: controller.signal },
            ),
          ),
        );
        if (!controller.signal.aborted) {
          // Dedupe by station id in case of overlapping results
          const seen = new Set<string>();
          const all: FnbStation[] = [];
          for (const res of results) {
            for (const s of res.data ?? []) {
              if (!seen.has(s.id)) {
                seen.add(s.id);
                all.push(s);
              }
            }
          }
          setStations(all);
        }
      } catch {
        // Silently fail — stations will just not appear in nav
      }
    })();
    return () => { controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return useMemo(() => {
    return stations
      .filter((s) => s.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({
        name: s.displayName || s.name,
        href: s.stationType === 'expo' ? '/expo' : `/kds/${s.id}`,
        icon: Monitor,
        requiredPermission: 'kds.view',
      }));
  }, [stations]);
}
