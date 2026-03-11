'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthContext } from '@/components/auth-provider';
import { KdsSettingsPanel } from '@/components/fnb/kds-settings-panel';
import { useStations } from '@/hooks/use-fnb-kitchen';
import Link from 'next/link';
import { Wand2, MapPin, Info } from 'lucide-react';
import { getSiteLocations, resolveInitialKdsLocationId } from '@/lib/kds-location';

export default function KdsSettingsContent() {
  const searchParams = useSearchParams();
  const { locations } = useAuthContext();
  const siteLocations = getSiteLocations(locations);
  const [locationId, setLocationId] = useState(() => {
    const fromUrl = searchParams.get('locationId');
    if (fromUrl && siteLocations.some((l) => l.id === fromUrl)) return fromUrl;
    const candidate = locations?.[0]?.id;
    return candidate ? resolveInitialKdsLocationId(candidate, locations) : undefined;
  });

  // Sync locationId when locations load after initial render (race condition guard)
  useEffect(() => {
    if (!locationId && siteLocations.length > 0) {
      const fromUrl = searchParams.get('locationId');
      const match = fromUrl && siteLocations.some((l) => l.id === fromUrl) ? fromUrl : siteLocations[0]?.id;
      setLocationId(match);
    }
  }, [locationId, siteLocations, searchParams]);

  const hasMultipleLocations = siteLocations.length > 1;
  const locationName = siteLocations.find((l) => l.id === locationId)?.name ?? '';
  const { stations, isLoading: stationsLoading } = useStations({ locationId });
  const hasStations = stations.length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Kitchen Display Screens</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set up the screens in your kitchen that show incoming orders.
        </p>
      </div>

      {/* Location bar — prominent, full-width */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <MapPin className="h-5 w-5 text-indigo-400" />
          {hasMultipleLocations ? (
            <label className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Location:</span>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="rounded-lg border border-input bg-surface px-3 py-1.5 text-sm font-semibold text-foreground focus:border-indigo-500 focus:outline-none"
              >
                {siteLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </label>
          ) : (
            <span className="text-sm font-semibold text-foreground">
              {locationName || 'No location'}
            </span>
          )}
        </div>
        <Link
          href={`/kds/setup${locationId ? `?locationId=${locationId}` : ''}`}
          className="inline-flex items-center gap-2 rounded-lg border border-input px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
        >
          <Wand2 className="h-4 w-4" />
          Setup Wizard
        </Link>
      </div>
      {!stationsLoading && !hasStations && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Info className="h-5 w-5 shrink-0 text-amber-400" />
            <p className="text-sm font-semibold text-amber-300">
              No kitchen screens at {locationName || 'this location'}
            </p>
          </div>
          <ul className="ml-7 space-y-1">
            <li className="flex items-start gap-2 text-sm text-amber-300/90">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/60" />
              Orders from registers only show up on screens at the same location
            </li>
            <li className="flex items-start gap-2 text-sm text-amber-300/90">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/60" />
              {hasMultipleLocations
                ? 'Switch the location above, or run the setup wizard to get started'
                : 'Run the setup wizard to create your first kitchen screens'}
            </li>
          </ul>
          <Link
            href={`/kds/setup${locationId ? `?locationId=${locationId}` : ''}`}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/30"
            style={{ minHeight: '44px' }}
          >
            <Wand2 className="h-4 w-4" />
            Run Setup Wizard
          </Link>
        </div>
      )}
      <KdsSettingsPanel locationId={locationId} locationName={locationName} />
    </div>
  );
}
