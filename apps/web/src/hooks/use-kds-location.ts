'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthContext } from '@/components/auth-provider';
import { useTerminalSession } from '@/components/terminal-session-provider';

interface UseKdsLocationOptions {
  /** Route path for URL replacement on location change (e.g. '/expo', '/kds/all') */
  basePath?: string;
  /** Fallback value when no location can be resolved. Defaults to '' */
  fallback?: string;
}

interface UseKdsLocationResult {
  locationId: string;
  resolvedLocationName: string | undefined;
  /** True when URL had a locationId that didn't match any known location */
  locationFellBack: boolean;
  /** True when no URL param, no terminal session, and tenant has multiple locations */
  locationDefaulted: boolean;
  hasMultipleLocations: boolean;
  /** Update locationId state + replace URL. Only works when basePath is provided. */
  changeLocation: (newId: string) => void;
}

// ── Pure helpers (exported for testing) ──────────────────────────

interface LocationLike { id: string; name?: string }

/** Resolve locationId: URL param (validated) → terminal session → first location → fallback */
export function resolveLocationId(
  urlLocationId: string | null,
  locations: LocationLike[] | undefined,
  terminalSessionLocationId: string | undefined,
  fallback: string,
): string {
  if (urlLocationId && locations?.some((l) => l.id === urlLocationId)) return urlLocationId;
  return terminalSessionLocationId ?? locations?.[0]?.id ?? fallback;
}

/** True when URL had a locationId that didn't match any known location */
export function computeLocationFellBack(
  urlLocationId: string | null,
  locations: LocationLike[] | undefined,
): boolean {
  return urlLocationId !== null && !locations?.some((l) => l.id === urlLocationId);
}

/** True when no URL param, no terminal session, and tenant has multiple locations */
export function computeLocationDefaulted(
  urlLocationId: string | null,
  locations: LocationLike[] | undefined,
  terminalSessionLocationId: string | undefined,
): boolean {
  if (urlLocationId && locations?.some((l) => l.id === urlLocationId)) return false;
  if (terminalSessionLocationId) return false;
  return (locations?.length ?? 0) > 1;
}

// ── Hook ─────────────────────────────────────────────────────────

/**
 * Shared location resolution for KDS/expo screens.
 * Resolves: URL param (validated) → terminal session → first location → fallback.
 * Detects mismatch (invalid URL) and silent default (no explicit source, multi-location).
 */
export function useKdsLocation(options: UseKdsLocationOptions = {}): UseKdsLocationResult {
  const { basePath, fallback = '' } = options;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locations } = useAuthContext();
  const { session: terminalSession } = useTerminalSession();

  const [locationId, setLocationId] = useState(() => {
    return resolveLocationId(searchParams.get('locationId'), locations, terminalSession?.locationId, fallback);
  });

  // Re-sync guard: if locations load after initial render and locationId is still empty
  useEffect(() => {
    if (locationId) return;
    const match = resolveLocationId(searchParams.get('locationId'), locations, terminalSession?.locationId, fallback);
    if (match) setLocationId(match);
  }, [locationId, locations, searchParams, terminalSession?.locationId, fallback]);

  const locationFellBack = useMemo(() => {
    return computeLocationFellBack(searchParams.get('locationId'), locations);
  }, [searchParams, locations]);

  const locationDefaulted = useMemo(() => {
    return computeLocationDefaulted(searchParams.get('locationId'), locations, terminalSession?.locationId);
  }, [searchParams, locations, terminalSession]);

  const resolvedLocationName = locations?.find((l) => l.id === locationId)?.name;
  const hasMultipleLocations = (locations?.length ?? 0) > 1;

  const changeLocation = useCallback((newId: string) => {
    setLocationId(newId);
    if (basePath) {
      router.replace(`${basePath}?locationId=${newId}`, { scroll: false });
    }
  }, [router, basePath]);

  return {
    locationId,
    resolvedLocationName,
    locationFellBack,
    locationDefaulted,
    hasMultipleLocations,
    changeLocation,
  };
}
