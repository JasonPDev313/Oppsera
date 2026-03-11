'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { onChannelRefresh } from '@/hooks/use-fnb-realtime';
import type { KdsView, ExpoView, ExpoHistory, FnbStation } from '@/types/fnb';

// ── KDS View Hook ───────────────────────────────────────────────

interface UseKdsViewOptions {
  stationId: string | null;
  locationId?: string;
  businessDate?: string;
  pollIntervalMs?: number;
}

interface UseKdsViewReturn {
  kdsView: KdsView | null;
  isLoading: boolean;
  error: string | null;
  bumpItem: (ticketItemId: string) => Promise<void>;
  bumpTicket: (ticketId: string) => Promise<void>;
  recallItem: (ticketItemId: string) => Promise<void>;
  callBack: (ticketItemId: string, reason?: string) => Promise<void>;
  refireItem: (ticketItemId: string, reason?: string) => Promise<void>;
  toggleRushMode: () => Promise<void>;
  isActing: boolean;
  refresh: () => void;
}

export function useKdsView({
  stationId,
  locationId,
  businessDate,
  pollIntervalMs = 5000,
}: UseKdsViewOptions): UseKdsViewReturn {
  const [kdsView, setKdsView] = useState<KdsView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);
  const fetchingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const hasLoadedRef = useRef(false);
  const consecutiveFailuresRef = useRef(0);
  // Generation counter: incremented on each effect cycle so stale promises from
  // aborted fetches don't clobber state (e.g., setting isLoading=false after cleanup).
  const generationRef = useRef(0);

  const today = businessDate ?? new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local timezone

  const fetchKds = useCallback(async (force = false) => {
    if (!stationId) return;
    // Dedup: skip if a fetch is already in-flight (prevents concurrent poll + broadcast fetches).
    // force=true bypasses this for post-mutation refreshes.
    if (fetchingRef.current && !force) return;
    fetchingRef.current = true;

    const gen = generationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const params = new URLSearchParams({ businessDate: today });
      if (locationId) params.set('locationId', locationId);
      const json = await apiFetch<{ data: KdsView }>(
        `/api/v1/fnb/stations/${stationId}/kds?${params}`,
        { signal: controller.signal },
      );
      // Guard: only apply state if this is still the current generation
      if (gen !== generationRef.current) return;
      setKdsView(json.data);
      setError(null);
      hasLoadedRef.current = true;
      consecutiveFailuresRef.current = 0;
    } catch (err: unknown) {
      if (gen !== generationRef.current) return;
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        consecutiveFailuresRef.current += 1;
        // On initial load or after 3+ consecutive failures, show error to user.
        // Transient poll failures (network blip, dev server recompile) are silently
        // retried — the next poll will succeed and clear the counter.
        if (!hasLoadedRef.current || consecutiveFailuresRef.current >= 3) {
          setError(err instanceof Error ? err.message : 'Failed to load KDS view');
        }
      }
    } finally {
      if (gen === generationRef.current) {
        fetchingRef.current = false;
        setIsLoading(false);
      }
    }
  }, [stationId, locationId, today]);

  // Main polling effect
  useEffect(() => {
    if (!stationId) {
      setKdsView(null);
      setIsLoading(false);
      return;
    }
    generationRef.current += 1;
    fetchingRef.current = false; // Reset so new cycle can start immediately
    hasLoadedRef.current = false;
    consecutiveFailuresRef.current = 0;
    setIsLoading(true);
    fetchKds();
    const interval = setInterval(fetchKds, pollIntervalMs);

    // Pause polling when tab is hidden (KDS tablets that sleep, background tabs)
    function onVisibility() {
      if (document.visibilityState === 'visible') fetchKds();
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      abortRef.current?.abort();
      fetchingRef.current = false;
    };
  }, [stationId, fetchKds, pollIntervalMs]);

  // Subscribe to realtime broadcast notifications
  useEffect(() => {
    if (!stationId) return;
    return onChannelRefresh('kds', () => { fetchKds(); });
  }, [stationId, fetchKds]);

  const refresh = useCallback(() => {
    fetchKds(true);
  }, [fetchKds]);

  const locQs = locationId ? `?locationId=${locationId}` : '';

  // Shared mutation helper: run mutation → force-refresh KDS view → report errors
  const runAction = useCallback(async (
    url: string,
    body: Record<string, unknown>,
  ) => {
    setIsActing(true);
    try {
      await apiFetch(url, {
        method: 'POST',
        body: JSON.stringify({ ...body, clientRequestId: crypto.randomUUID() }),
      });
      await fetchKds(true);
    } catch (err: unknown) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : 'Action failed');
      }
      throw err;
    } finally {
      setIsActing(false);
    }
  }, [fetchKds]);

  const bumpItem = useCallback(async (ticketItemId: string) => {
    if (!stationId || isActing) return;
    await runAction(`/api/v1/fnb/stations/${stationId}/bump-item${locQs}`, { ticketItemId, stationId });
  }, [stationId, locQs, runAction, isActing]);

  const bumpTicket = useCallback(async (ticketId: string) => {
    if (!stationId || isActing) return;
    await runAction(`/api/v1/fnb/stations/${stationId}/bump-ticket${locQs}`, { ticketId });
  }, [stationId, locQs, runAction, isActing]);

  const recallItem = useCallback(async (ticketItemId: string) => {
    if (!stationId || isActing) return;
    await runAction(`/api/v1/fnb/stations/${stationId}/recall${locQs}`, { ticketItemId, stationId });
  }, [stationId, locQs, runAction, isActing]);

  const callBack = useCallback(async (ticketItemId: string, reason?: string) => {
    if (!stationId || isActing) return;
    await runAction(`/api/v1/fnb/stations/${stationId}/callback${locQs}`, { ticketItemId, stationId, reason });
  }, [stationId, locQs, runAction, isActing]);

  const refireItem = useCallback(async (ticketItemId: string, reason?: string) => {
    if (!stationId || isActing) return;
    await runAction(`/api/v1/fnb/stations/${stationId}/refire${locQs}`, { ticketItemId, stationId, reason });
  }, [stationId, locQs, runAction, isActing]);

  const toggleRushMode = useCallback(async () => {
    if (!stationId || isActing) return;
    const newVal = !(kdsView?.rushMode ?? false);
    setIsActing(true);
    try {
      await apiFetch(`/api/v1/fnb/stations/${stationId}${locQs}`, {
        method: 'PATCH',
        body: JSON.stringify({ rushMode: newVal }),
      });
      await fetchKds(true);
    } catch (err: unknown) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : 'Failed to toggle rush mode');
      }
    } finally {
      setIsActing(false);
    }
  }, [stationId, locQs, kdsView?.rushMode, fetchKds, isActing]);

  return { kdsView, isLoading, error, bumpItem, bumpTicket, recallItem, callBack, refireItem, toggleRushMode, isActing, refresh };
}

// ── Expo View Hook ──────────────────────────────────────────────

interface UseExpoViewOptions {
  locationId?: string;
  businessDate?: string;
  pollIntervalMs?: number;
}

interface UseExpoViewReturn {
  expoView: ExpoView | null;
  isLoading: boolean;
  error: string | null;
  bumpTicket: (ticketId: string) => Promise<void>;
  isActing: boolean;
  refresh: () => void;
}

export function useExpoView({
  locationId,
  businessDate,
  pollIntervalMs = 5000,
}: UseExpoViewOptions): UseExpoViewReturn {
  const [expoView, setExpoView] = useState<ExpoView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);
  const fetchingExpoRef = useRef(false);
  const abortExpoRef = useRef<AbortController | null>(null);
  const hasLoadedExpoRef = useRef(false);
  const consecutiveExpoFailuresRef = useRef(0);
  const expoGenerationRef = useRef(0);

  const today = businessDate ?? new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local timezone

  const fetchExpo = useCallback(async (force = false) => {
    if (fetchingExpoRef.current && !force) return;
    fetchingExpoRef.current = true;

    const gen = expoGenerationRef.current;
    abortExpoRef.current?.abort();
    const controller = new AbortController();
    abortExpoRef.current = controller;

    try {
      const params = new URLSearchParams({ businessDate: today });
      if (locationId) params.set('locationId', locationId);
      const json = await apiFetch<{ data: ExpoView }>(
        `/api/v1/fnb/stations/expo?${params}`,
        { signal: controller.signal },
      );
      if (gen !== expoGenerationRef.current) return;
      setExpoView(json.data);
      setError(null);
      hasLoadedExpoRef.current = true;
      consecutiveExpoFailuresRef.current = 0;
    } catch (err: unknown) {
      if (gen !== expoGenerationRef.current) return;
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        consecutiveExpoFailuresRef.current += 1;
        if (!hasLoadedExpoRef.current || consecutiveExpoFailuresRef.current >= 3) {
          setError(err instanceof Error ? err.message : 'Failed to load expo view');
        }
      }
    } finally {
      if (gen === expoGenerationRef.current) {
        fetchingExpoRef.current = false;
        setIsLoading(false);
      }
    }
  }, [locationId, today]);

  useEffect(() => {
    expoGenerationRef.current += 1;
    fetchingExpoRef.current = false;
    hasLoadedExpoRef.current = false;
    consecutiveExpoFailuresRef.current = 0;
    setIsLoading(true);
    fetchExpo();
    const interval = setInterval(fetchExpo, pollIntervalMs);

    function onVisibility() {
      if (document.visibilityState === 'visible') fetchExpo();
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      abortExpoRef.current?.abort();
      fetchingExpoRef.current = false;
    };
  }, [fetchExpo, pollIntervalMs]);

  // Subscribe to realtime broadcast notifications
  useEffect(() => {
    return onChannelRefresh('expo', () => { fetchExpo(); });
  }, [fetchExpo]);

  const refresh = useCallback(() => {
    fetchExpo(true);
  }, [fetchExpo]);

  const bumpTicket = useCallback(async (ticketId: string) => {
    if (isActing) return;
    setIsActing(true);
    try {
      const qs = locationId ? `?locationId=${locationId}` : '';
      await apiFetch(`/api/v1/fnb/stations/expo${qs}`, {
        method: 'POST',
        body: JSON.stringify({ ticketId, clientRequestId: crypto.randomUUID() }),
      });
      await fetchExpo(true);
    } catch (err: unknown) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : 'Action failed');
      }
      throw err;
    } finally {
      setIsActing(false);
    }
  }, [locationId, fetchExpo, isActing]);

  return { expoView, isLoading, error, bumpTicket, isActing, refresh };
}

// ── Expo History Hook ───────────────────────────────────────────

interface UseExpoHistoryOptions {
  locationId?: string;
  businessDate?: string;
  enabled?: boolean;
}

export function useExpoHistory({
  locationId,
  businessDate,
  enabled = true,
}: UseExpoHistoryOptions) {
  const [history, setHistory] = useState<ExpoHistory | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = businessDate ?? new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local timezone

  const fetchHistory = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ businessDate: today });
      if (locationId) params.set('locationId', locationId);
      const json = await apiFetch<{ data: ExpoHistory }>(
        `/api/v1/fnb/stations/expo/history?${params}`,
      );
      setHistory(json.data);
      setError(null);
    } catch (err: unknown) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : 'Failed to load history');
      }
    } finally {
      setIsLoading(false);
    }
  }, [locationId, today, enabled]);

  useEffect(() => {
    if (enabled) fetchHistory();
  }, [fetchHistory, enabled]);

  return { history, isLoading, error, refresh: fetchHistory };
}

// ── Stations List Hook ──────────────────────────────────────────

interface UseStationsOptions {
  locationId?: string;
}

export function useStations({ locationId }: UseStationsOptions) {
  const [stations, setStations] = useState<FnbStation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!locationId) {
      setStations([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const controller = new AbortController();
    (async () => {
      try {
        const json = await apiFetch<{ data: FnbStation[] }>(
          `/api/v1/fnb/stations?locationId=${locationId}`,
          { signal: controller.signal },
        );
        setStations(json.data ?? []);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // ignore other errors
      } finally {
        setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [locationId]);

  return { stations, isLoading };
}

// ── Station Management Hook ─────────────────────────────────────

interface UseStationManagementOptions {
  locationId?: string;
}

export function useStationManagement({ locationId }: UseStationManagementOptions) {
  const [stations, setStations] = useState<FnbStation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);

  const fetchStations = useCallback(async () => {
    if (!locationId) return;
    try {
      const json = await apiFetch<{ data: FnbStation[] }>(
        `/api/v1/fnb/stations?locationId=${locationId}`,
      );
      setStations(json.data ?? []);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    if (!locationId) {
      setStations([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    fetchStations();
  }, [fetchStations, locationId]);

  const createStation = useCallback(async (input: {
    name: string;
    displayName: string;
    stationType?: string;
    color?: string;
    sortOrder?: number;
    warningThresholdSeconds?: number;
    criticalThresholdSeconds?: number;
  }) => {
    if (!locationId) throw new Error('No location selected — cannot create station');
    setIsActing(true);
    try {
      // Explicitly construct the payload with type coercion to prevent Zod validation mismatches
      const payload: Record<string, unknown> = {
        name: String(input.name).trim(),
        displayName: String(input.displayName || input.name).trim(),
        clientRequestId: `create-station-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      };
      if (input.stationType) payload.stationType = String(input.stationType);
      if (input.color) payload.color = String(input.color);
      if (input.sortOrder != null) payload.sortOrder = Number(input.sortOrder);
      if (input.warningThresholdSeconds != null) payload.warningThresholdSeconds = Math.round(Number(input.warningThresholdSeconds));
      if (input.criticalThresholdSeconds != null) payload.criticalThresholdSeconds = Math.round(Number(input.criticalThresholdSeconds));
      await apiFetch(`/api/v1/fnb/stations?locationId=${locationId}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await fetchStations();
    } finally {
      setIsActing(false);
    }
  }, [fetchStations, locationId]);

  const updateStation = useCallback(async (stationId: string, input: {
    displayName?: string;
    stationType?: string;
    color?: string | null;
    sortOrder?: number;
    warningThresholdSeconds?: number;
    criticalThresholdSeconds?: number;
    isActive?: boolean;
    autoBumpOnAllReady?: boolean;
  }) => {
    setIsActing(true);
    try {
      const params = locationId ? `?locationId=${locationId}` : '';
      await apiFetch(`/api/v1/fnb/stations/${stationId}${params}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...input,
          clientRequestId: `update-station-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        }),
      });
      await fetchStations();
    } finally {
      setIsActing(false);
    }
  }, [fetchStations, locationId]);

  const deactivateStation = useCallback(async (stationId: string) => {
    await updateStation(stationId, { isActive: false });
  }, [updateStation]);

  const deleteStation = useCallback(async (stationId: string) => {
    setIsActing(true);
    try {
      const params = locationId ? `?locationId=${locationId}` : '';
      await apiFetch(`/api/v1/fnb/stations/${stationId}${params}`, {
        method: 'DELETE',
      });
      await fetchStations();
    } finally {
      setIsActing(false);
    }
  }, [fetchStations, locationId]);

  return { stations, isLoading, isActing, createStation, updateStation, deactivateStation, deleteStation, refresh: fetchStations };
}

// ── KDS Location Counts Hook ─────────────────────────────────────

interface KdsLocationCount {
  locationId: string;
  activeTicketCount: number;
}

/**
 * Fetches active KDS ticket counts per location for selector badges.
 * Polls every 15s so counts stay fresh without hammering the API.
 */
export function useKdsLocationCounts(locationIds: string[]) {
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const idsKey = locationIds.join(',');

  const fetchCounts = useCallback(async (signal?: AbortSignal) => {
    if (locationIds.length === 0) return;
    try {
      const json = await apiFetch<{ data: KdsLocationCount[] }>(
        `/api/v1/fnb/kitchen/location-counts?locationIds=${idsKey}`,
        { signal },
      );
      const map = new Map<string, number>();
      for (const c of json.data) {
        map.set(c.locationId, c.activeTicketCount);
      }
      setCounts(map);
    } catch {
      // silent — badge counts are non-critical
    }
  }, [idsKey]);

  useEffect(() => {
    const controller = new AbortController();
    fetchCounts(controller.signal);
    const interval = setInterval(() => fetchCounts(controller.signal), 15_000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchCounts]);

  return counts;
}

// ── KDS Station Counts Hook ──────────────────────────────────────

interface KdsStationCount {
  stationId: string;
  activeTicketCount: number;
}

/**
 * Fetches active KDS ticket counts per station for station selector badges.
 * Polls every 15s.
 */
export function useKdsStationCounts(locationId: string) {
  const [counts, setCounts] = useState<Map<string, number>>(new Map());

  const fetchCounts = useCallback(async (signal?: AbortSignal) => {
    if (!locationId) return;
    try {
      const json = await apiFetch<{ data: KdsStationCount[] }>(
        `/api/v1/fnb/kitchen/station-counts?locationId=${locationId}`,
        { signal },
      );
      const map = new Map<string, number>();
      for (const c of json.data) {
        map.set(c.stationId, c.activeTicketCount);
      }
      setCounts(map);
    } catch {
      // silent — badge counts are non-critical
    }
  }, [locationId]);

  useEffect(() => {
    const controller = new AbortController();
    fetchCounts(controller.signal);
    const interval = setInterval(() => fetchCounts(controller.signal), 15_000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchCounts]);

  return counts;
}
