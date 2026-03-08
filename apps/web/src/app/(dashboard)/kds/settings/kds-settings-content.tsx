'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthContext } from '@/components/auth-provider';
import { KdsSettingsPanel } from '@/components/fnb/kds-settings-panel';
import { useStations } from '@/hooks/use-fnb-kitchen';
import Link from 'next/link';
import { Wand2, MapPin, Info } from 'lucide-react';

export default function KdsSettingsContent() {
  const searchParams = useSearchParams();
  const { locations } = useAuthContext();
  const [locationId, setLocationId] = useState(() => {
    const fromUrl = searchParams.get('locationId');
    if (fromUrl && locations?.some((l) => l.id === fromUrl)) return fromUrl;
    return locations?.[0]?.id;
  });
  const hasMultipleLocations = (locations?.length ?? 0) > 1;
  const locationName = locations?.find((l) => l.id === locationId)?.name ?? '';
  const { stations, isLoading: stationsLoading } = useStations({ locationId });
  const hasStations = stations.length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">KDS Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage kitchen stations, routing rules, bump bar profiles, and alert configurations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            {hasMultipleLocations ? (
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="rounded-lg border border-input bg-surface px-3 py-1.5 text-sm font-medium text-foreground focus:border-indigo-500 focus:outline-none"
              >
                {locations?.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            ) : (
              <span className="text-sm font-medium text-muted-foreground">
                {locations?.find((l) => l.id === locationId)?.name ?? 'No location'}
              </span>
            )}
          </div>
          <Link
            href="/kds/setup"
            className="inline-flex items-center gap-2 rounded-lg border border-input px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
          >
            <Wand2 className="h-4 w-4" />
            Setup Wizard
          </Link>
        </div>
      </div>
      {!stationsLoading && !hasStations && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
          <Info className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-300">
              No KDS stations at {locationName || 'this location'}
            </p>
            <p className="mt-1 text-xs text-amber-300/70 leading-relaxed">
              KDS stations are per-location — orders from POS only appear on stations at the same location.
              {hasMultipleLocations
                ? ' Switch the location above or run the setup wizard to create stations here.'
                : ' Run the setup wizard to create your first stations.'}
            </p>
            <Link
              href="/kds/setup"
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/30"
            >
              <Wand2 className="h-3.5 w-3.5" />
              Run Setup Wizard
            </Link>
          </div>
        </div>
      )}
      <KdsSettingsPanel locationId={locationId} />
    </div>
  );
}
