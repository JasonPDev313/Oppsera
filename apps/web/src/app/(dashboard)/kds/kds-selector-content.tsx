'use client';

import { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthContext } from '@/components/auth-provider';
import { useTerminalSession } from '@/components/terminal-session-provider';
import { useStations, useKdsLocationCounts, useKdsStationCounts } from '@/hooks/use-fnb-kitchen';
import { ArrowLeft, MapPin, AlertTriangle, Settings2 } from 'lucide-react';

const STATION_TYPE_COLORS: Record<string, string> = {
  prep: '#6366f1',
  bar: '#f59e0b',
  grill: '#ef4444',
  fry: '#f97316',
  salad: '#22c55e',
  dessert: '#ec4899',
  pizza: '#e11d48',
  expo: '#14b8a6',
  custom: '#8b5cf6',
};

function getStationColor(stationType: string): string {
  return STATION_TYPE_COLORS[stationType] ?? '#6366f1';
}

export default function KdsSelectorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locations } = useAuthContext();
  const { session: terminalSession } = useTerminalSession();
  const [locationId, setLocationId] = useState(() => {
    const fromUrl = searchParams.get('locationId');
    if (fromUrl && locations?.some((l) => l.id === fromUrl)) return fromUrl;
    return terminalSession?.locationId ?? locations?.[0]?.id ?? '';
  });
  const { stations, isLoading } = useStations({ locationId });
  const locationCounts = useKdsLocationCounts(locations?.map((l) => l.id) ?? []);
  const stationCounts = useKdsStationCounts(locationId);

  // Count tickets at OTHER locations (for persistent badge + pulse)
  const otherLocationTickets = useMemo(() => {
    let total = 0;
    for (const [id, count] of locationCounts) {
      if (id !== locationId) total += count;
    }
    return total;
  }, [locationCounts, locationId]);

  // Total tickets at current location
  const currentLocationTickets = locationCounts.get(locationId) ?? 0;

  const locationName = locations?.find((l) => l.id === locationId)?.name ?? '';
  const hasMultipleLocations = (locations?.length ?? 0) > 1;

  const kdsStations = stations.filter(
    (s) => s.isActive && s.stationType !== 'expo',
  );
  const hasExpo = stations.some((s) => s.isActive && s.stationType === 'expo');

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b shrink-0"
        style={{ backgroundColor: 'var(--fnb-bg-surface)', borderColor: 'rgba(148, 163, 184, 0.15)' }}
      >
        <button
          type="button"
          onClick={() => router.push('/pos/fnb')}
          className="flex items-center justify-center rounded-lg h-10 w-10 transition-colors hover:opacity-80"
          style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
          Select KDS Station
        </h1>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4" style={{ color: 'var(--fnb-text-muted)' }} />
            {hasMultipleLocations ? (
              <>
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="rounded-lg border px-3 py-1.5 text-sm font-medium"
                  style={{
                    backgroundColor: 'var(--fnb-bg-elevated)',
                    borderColor: 'rgba(148, 163, 184, 0.15)',
                    color: 'var(--fnb-text-primary)',
                  }}
                >
                  {locations?.map((loc) => {
                    const cnt = locationCounts.get(loc.id) ?? 0;
                    return (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}{cnt > 0 ? ` (${cnt})` : ''}
                      </option>
                    );
                  })}
                </select>
                {currentLocationTickets > 0 && (
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-bold"
                    style={{ backgroundColor: 'rgba(99,102,241,0.15)', color: '#6366f1' }}
                  >
                    {currentLocationTickets}
                  </span>
                )}
                {otherLocationTickets > 0 && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-bold animate-pulse"
                    style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                  >
                    {otherLocationTickets} elsewhere
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm font-medium" style={{ color: 'var(--fnb-text-secondary)' }}>
                {locationName}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => router.push('/kds/settings')}
            className="flex items-center justify-center rounded-lg h-10 w-10 transition-colors hover:opacity-80"
            style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
            aria-label="KDS Settings"
          >
            <Settings2 className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Station grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 border-2 rounded-full animate-spin"
              style={{ borderColor: 'var(--fnb-text-muted)', borderTopColor: 'var(--fnb-status-seated)' }} />
          </div>
        ) : kdsStations.length === 0 && !hasExpo ? (
          <div className="flex flex-col items-center py-16 max-w-md mx-auto text-center">
            <div
              className="flex items-center justify-center rounded-full mb-4"
              style={{
                width: '56px',
                height: '56px',
                backgroundColor: 'rgba(234, 179, 8, 0.15)',
              }}
            >
              <AlertTriangle className="h-7 w-7" style={{ color: '#eab308' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--fnb-text-primary)' }}>
              No KDS stations at {locationName || 'this location'}
            </p>
            <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--fnb-text-muted)' }}>
              KDS stations are per-location. Orders sent from POS will only appear on stations
              configured for the same location.
            </p>
            <div className="flex flex-col gap-2 mt-5 w-full max-w-xs">
              <a
                href="/kds/setup"
                className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white"
                style={{ backgroundColor: '#6366f1' }}
              >
                Set Up KDS for {locationName || 'this location'}
              </a>
              {hasMultipleLocations && (
                <p className="text-xs mt-1" style={{ color: 'var(--fnb-text-muted)' }}>
                  Or switch locations above to see stations at another location.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {hasExpo && (() => {
              // Expo shows all tickets across all stations
              const expoCount = currentLocationTickets;
              return (
                <button
                  type="button"
                  onClick={() => router.push('/expo')}
                  className="relative flex flex-col items-center justify-center rounded-xl p-6 transition-colors hover:opacity-80"
                  style={{
                    backgroundColor: 'var(--fnb-bg-surface)',
                    border: '2px solid rgba(20, 184, 166, 0.4)',
                    minHeight: '140px',
                  }}
                >
                  {expoCount > 0 && (
                    <span
                      className="absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ backgroundColor: 'rgba(20, 184, 166, 0.15)', color: '#14b8a6' }}
                    >
                      {expoCount}
                    </span>
                  )}
                  <div
                    className="flex items-center justify-center rounded-full mb-3"
                    style={{
                      width: '48px',
                      height: '48px',
                      backgroundColor: '#14b8a6',
                      color: '#fff',
                    }}
                  >
                    <span className="text-lg font-bold">E</span>
                  </div>
                  <span className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
                    Expo
                  </span>
                  <span className="text-[10px] uppercase mt-1" style={{ color: '#14b8a6' }}>
                    All Stations
                  </span>
                </button>
              );
            })()}
            {kdsStations.map((station) => {
              const ticketCount = stationCounts.get(station.id) ?? 0;
              const stationColor = station.color ?? getStationColor(station.stationType);
              return (
                <button
                  key={station.id}
                  type="button"
                  onClick={() => router.push(`/kds/${station.id}`)}
                  className="relative flex flex-col items-center justify-center rounded-xl p-6 transition-colors hover:opacity-80"
                  style={{
                    backgroundColor: 'var(--fnb-bg-surface)',
                    border: ticketCount > 0
                      ? `2px solid ${stationColor}40`
                      : '1px solid rgba(148, 163, 184, 0.15)',
                    minHeight: '140px',
                  }}
                >
                  {ticketCount > 0 && (
                    <span
                      className="absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ backgroundColor: `${stationColor}20`, color: stationColor }}
                    >
                      {ticketCount}
                    </span>
                  )}
                  <div
                    className="flex items-center justify-center rounded-full mb-3"
                    style={{
                      width: '48px',
                      height: '48px',
                      backgroundColor: stationColor,
                      color: '#fff',
                    }}
                  >
                    <span className="text-lg font-bold">
                      {station.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
                    {station.name}
                  </span>
                  <span className="text-[10px] uppercase mt-1" style={{ color: 'var(--fnb-text-muted)' }}>
                    {station.stationType}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
