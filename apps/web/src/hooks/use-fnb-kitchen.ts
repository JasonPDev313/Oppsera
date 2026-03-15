'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { onChannelRefresh } from '@/hooks/use-fnb-realtime';
import type { KdsView, KdsHistoryView, ExpoView, ExpoHistory, FnbStation } from '@/types/fnb';

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
  lastRefreshedAt: number | null;
}

// Debounce delay (ms) before refreshing KDS after rapid item bumps
const BUMP_REFRESH_DEBOUNCE_MS = 600;

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
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const fetchingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const hasLoadedRef = useRef(false);
  const consecutiveFailuresRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track in-flight item bumps so we can allow concurrent item bumps
  // while still blocking ticket-level actions during mutations.
  const inFlightItemBumpsRef = useRef(new Set<string>());
  const bumpRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        {
          signal: controller.signal,
          headers: locationId ? { 'X-Location-Id': locationId } : undefined,
        },
      );
      // Guard: only apply state if this is still the current generation
      if (gen !== generationRef.current) return;
      // Preserve optimistic 'ready' status for items with in-flight bump POSTs.
      // Without this, a poll/realtime refetch that started before the POST committed
      // would overwrite the optimistic state with stale 'pending' data, causing the
      // item to visually revert and require a second tap.
      const inFlight = inFlightItemBumpsRef.current;
      const merged = inFlight.size > 0
        ? {
            ...json.data,
            tickets: json.data.tickets.map((ticket) => ({
              ...ticket,
              items: ticket.items.map((item) =>
                inFlight.has(item.itemId)
                  ? { ...item, itemStatus: 'ready' as const }
                  : item,
              ),
            })),
          }
        : json.data;
      setKdsView(merged);
      setError(null);
      setLastRefreshedAt(Date.now());
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

  // Compute next poll delay: backs off on consecutive failures to avoid
  // hammering a struggling server. Resets to base interval on success.
  // 5s → 10s → 20s → 40s → 60s (cap)
  const getNextPollDelay = useCallback(() => {
    const failures = consecutiveFailuresRef.current;
    if (failures === 0) return pollIntervalMs;
    return Math.min(pollIntervalMs * Math.pow(2, failures), 60_000);
  }, [pollIntervalMs]);

  // Schedule the next poll using setTimeout (not setInterval) so we can
  // vary the delay based on consecutive failures.
  const schedulePoll = useCallback(() => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    pollTimerRef.current = setTimeout(async () => {
      await fetchKds();
      schedulePoll();
    }, getNextPollDelay());
  }, [fetchKds, getNextPollDelay]);

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
    schedulePoll();

    // Pause polling when tab is hidden (KDS tablets that sleep, background tabs)
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        fetchKds();
        // Reset backoff on visibility restore — user is actively looking
        consecutiveFailuresRef.current = 0;
        schedulePoll();
      }
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
      abortRef.current?.abort();
      fetchingRef.current = false;
      if (bumpRefreshTimerRef.current) {
        clearTimeout(bumpRefreshTimerRef.current);
        bumpRefreshTimerRef.current = null;
      }
      inFlightItemBumpsRef.current.clear();
    };
  }, [stationId, fetchKds, pollIntervalMs, schedulePoll]);

  // Subscribe to realtime broadcast notifications
  useEffect(() => {
    if (!stationId) return;
    return onChannelRefresh('kds', () => {
      fetchKds();
      schedulePoll(); // Reset backoff — server just pushed a notification
    });
  }, [stationId, fetchKds, schedulePoll]);

  const refresh = useCallback(() => {
    fetchKds(true);
    schedulePoll(); // Reset backoff on manual refresh
  }, [fetchKds, schedulePoll]);

  const locQs = locationId ? `?locationId=${locationId}` : '';

  // Schedule a debounced KDS refresh after item bumps settle
  const scheduleBumpRefresh = useCallback(() => {
    if (bumpRefreshTimerRef.current) clearTimeout(bumpRefreshTimerRef.current);
    bumpRefreshTimerRef.current = setTimeout(() => {
      bumpRefreshTimerRef.current = null;
      fetchKds(true);
    }, BUMP_REFRESH_DEBOUNCE_MS);
  }, [fetchKds]);

  // Shared mutation helper for ticket-level & non-bump actions:
  // run mutation → force-refresh KDS view → report errors
  const runAction = useCallback(async (
    url: string,
    body: Record<string, unknown>,
  ) => {
    setIsActing(true);
    try {
      await apiFetch(url, {
        method: 'POST',
        body: JSON.stringify({ ...body, clientRequestId: crypto.randomUUID() }),
        headers: locationId ? { 'X-Location-Id': locationId } : undefined,
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
  }, [fetchKds, locationId]);

  // Item bump: concurrent-safe, optimistic UI, debounced refresh.
  // Does NOT block on `isActing` — each item has its own DB-level optimistic lock.
  const bumpItem = useCallback(async (ticketItemId: string) => {
    if (!stationId) return;
    // Prevent double-bumping the same item
    if (inFlightItemBumpsRef.current.has(ticketItemId)) return;
    inFlightItemBumpsRef.current.add(ticketItemId);

    // Optimistic UI: immediately mark item as ready in local state
    setKdsView((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tickets: prev.tickets.map((ticket) => ({
          ...ticket,
          items: ticket.items.map((item) =>
            item.itemId === ticketItemId
              ? { ...item, itemStatus: 'ready' as const }
              : item,
          ),
        })),
      };
    });

    try {
      await apiFetch(`/api/v1/fnb/stations/${stationId}/bump-item${locQs}`, {
        method: 'POST',
        body: JSON.stringify({ ticketItemId, stationId, clientRequestId: crypto.randomUUID() }),
        headers: locationId ? { 'X-Location-Id': locationId } : undefined,
      });
    } catch (err: unknown) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : 'Item bump failed');
      }
      // On failure, force refresh to revert optimistic state
      fetchKds(true);
    } finally {
      inFlightItemBumpsRef.current.delete(ticketItemId);
      // Debounced refresh: after rapid item bumps settle, sync server state
      scheduleBumpRefresh();
    }
  }, [stationId, locQs, locationId, fetchKds, scheduleBumpRefresh]);

  const bumpTicket = useCallback(async (ticketId: string) => {
    if (!stationId || isActing) return;

    // Optimistic UI: remove ticket from view immediately
    setKdsView((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tickets: prev.tickets.filter((t) => t.ticketId !== ticketId),
      };
    });

    try {
      await runAction(`/api/v1/fnb/stations/${stationId}/bump-ticket${locQs}`, { ticketId });
    } catch {
      // runAction already sets error and force-refreshes on failure,
      // which will restore the ticket if the bump actually failed.
    }
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
        headers: locationId ? { 'X-Location-Id': locationId } : undefined,
      });
      await fetchKds(true);
    } catch (err: unknown) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : 'Failed to toggle rush mode');
      }
    } finally {
      setIsActing(false);
    }
  }, [stationId, locQs, locationId, kdsView?.rushMode, fetchKds, isActing]);

  return { kdsView, isLoading, error, bumpItem, bumpTicket, recallItem, callBack, refireItem, toggleRushMode, isActing, refresh, lastRefreshedAt };
}

// ── KDS History Hook ────────────────────────────────────────────

interface UseKdsHistoryOptions {
  stationId: string | null;
  locationId?: string;
  businessDate?: string;
  /** Only fetch when history mode is active */
  enabled?: boolean;
}

interface UseKdsHistoryReturn {
  historyView: KdsHistoryView | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useKdsHistory({
  stationId,
  locationId,
  businessDate,
  enabled = true,
}: UseKdsHistoryOptions): UseKdsHistoryReturn {
  const [historyView, setHistoryView] = useState<KdsHistoryView | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Generation counter: prevents stale responses from overwriting current state
  // when user rapidly toggles history on/off.
  const generationRef = useRef(0);

  const today = businessDate ?? new Date().toLocaleDateString('en-CA');

  const fetchHistory = useCallback(async () => {
    if (!stationId || !enabled) return;
    abortRef.current?.abort();
    const gen = generationRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);

    try {
      const params = new URLSearchParams({ businessDate: today, view: 'history' });
      if (locationId) params.set('locationId', locationId);
      const json = await apiFetch<{ data: KdsHistoryView }>(
        `/api/v1/fnb/stations/${stationId}/kds?${params}`,
        {
          signal: controller.signal,
          headers: locationId ? { 'X-Location-Id': locationId } : undefined,
        },
      );
      // Guard: only apply if still the current generation
      if (gen !== generationRef.current) return;
      setHistoryView(json.data);
      setError(null);
    } catch (err: unknown) {
      if (gen !== generationRef.current) return;
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : 'Failed to load history');
      }
    } finally {
      if (gen === generationRef.current) {
        setIsLoading(false);
      }
    }
  }, [stationId, locationId, today, enabled]);

  // Fetch when enabled changes or inputs change. Bump generation on each
  // cycle so stale in-flight requests are ignored.
  useEffect(() => {
    generationRef.current += 1;
    if (!enabled || !stationId) {
      setHistoryView(null);
      setError(null);
      return;
    }
    fetchHistory();
    return () => { abortRef.current?.abort(); };
  }, [enabled, stationId, fetchHistory]);

  const refresh = useCallback(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { historyView, isLoading, error, refresh };
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
  lastRefreshedAt: number | null;
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
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const fetchingExpoRef = useRef(false);
  const abortExpoRef = useRef<AbortController | null>(null);
  const hasLoadedExpoRef = useRef(false);
  const consecutiveExpoFailuresRef = useRef(0);
  const expoGenerationRef = useRef(0);
  const expoPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const today = businessDate ?? new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local timezone

  const fetchExpo = useCallback(async (force = false) => {
    if (!locationId) return;
    if (fetchingExpoRef.current && !force) return;
    fetchingExpoRef.current = true;

    const gen = expoGenerationRef.current;
    abortExpoRef.current?.abort();
    const controller = new AbortController();
    abortExpoRef.current = controller;

    try {
      const params = new URLSearchParams({ businessDate: today, locationId });
      const json = await apiFetch<{ data: ExpoView }>(
        `/api/v1/fnb/stations/expo?${params}`,
        {
          signal: controller.signal,
          headers: { 'X-Location-Id': locationId },
        },
      );
      if (gen !== expoGenerationRef.current) return;
      setExpoView(json.data);
      setError(null);
      setLastRefreshedAt(Date.now());
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

  // Exponential backoff on consecutive failures: 5s → 10s → 20s → 40s → 60s (cap)
  const getNextExpoDelay = useCallback(() => {
    const failures = consecutiveExpoFailuresRef.current;
    if (failures === 0) return pollIntervalMs;
    return Math.min(pollIntervalMs * Math.pow(2, failures), 60_000);
  }, [pollIntervalMs]);

  // setTimeout chain (not setInterval) — allows variable delay for backoff
  const scheduleExpoPoll = useCallback(() => {
    if (expoPollTimerRef.current) clearTimeout(expoPollTimerRef.current);
    expoPollTimerRef.current = setTimeout(async () => {
      await fetchExpo();
      scheduleExpoPoll();
    }, getNextExpoDelay());
  }, [fetchExpo, getNextExpoDelay]);

  useEffect(() => {
    expoGenerationRef.current += 1;
    fetchingExpoRef.current = false;
    hasLoadedExpoRef.current = false;
    consecutiveExpoFailuresRef.current = 0;
    setIsLoading(true);
    fetchExpo();
    scheduleExpoPoll();

    function onVisibility() {
      if (document.visibilityState === 'visible') {
        fetchExpo();
        consecutiveExpoFailuresRef.current = 0;
        scheduleExpoPoll();
      }
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (expoPollTimerRef.current) clearTimeout(expoPollTimerRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
      abortExpoRef.current?.abort();
      fetchingExpoRef.current = false;
    };
  }, [fetchExpo, pollIntervalMs, scheduleExpoPoll]);

  // Subscribe to realtime broadcast notifications
  useEffect(() => {
    return onChannelRefresh('expo', () => {
      fetchExpo();
      scheduleExpoPoll(); // Reset backoff — server just pushed
    });
  }, [fetchExpo, scheduleExpoPoll]);

  const refresh = useCallback(() => {
    fetchExpo(true);
    scheduleExpoPoll(); // Reset backoff on manual refresh
  }, [fetchExpo, scheduleExpoPoll]);

  const bumpTicket = useCallback(async (ticketId: string) => {
    if (isActing) return;
    setIsActing(true);
    try {
      const qs = locationId ? `?locationId=${locationId}` : '';
      await apiFetch(`/api/v1/fnb/stations/expo${qs}`, {
        method: 'POST',
        body: JSON.stringify({ ticketId, clientRequestId: crypto.randomUUID() }),
        headers: locationId ? { 'X-Location-Id': locationId } : undefined,
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

  return { expoView, isLoading, error, bumpTicket, isActing, refresh, lastRefreshedAt };
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
    if (!enabled || !locationId) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ businessDate: today });
      params.set('locationId', locationId);
      const json = await apiFetch<{ data: ExpoHistory }>(
        `/api/v1/fnb/stations/expo/history?${params}`,
        { headers: { 'X-Location-Id': locationId } },
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
    if (enabled && locationId) fetchHistory();
  }, [fetchHistory, enabled, locationId]);

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
    const fetchStations = async (attempt: number): Promise<void> => {
      try {
        const json = await apiFetch<{ data: FnbStation[] }>(
          `/api/v1/fnb/stations?locationId=${locationId}`,
          {
            signal: controller.signal,
            headers: { 'X-Location-Id': locationId },
          },
        );
        setStations(json.data ?? []);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (attempt === 0) {
          // Retry once after a short delay — transient failures (401 refresh,
          // network blip) should not permanently show "KDS Not Set Up".
          await new Promise((r) => setTimeout(r, 1500));
          if (!controller.signal.aborted) return fetchStations(1);
        }
        // Second failure — leave stations empty, let server handle it on send.
      }
    };
    fetchStations(0).finally(() => setIsLoading(false));
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
        { headers: { 'X-Location-Id': locationId } },
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
    allowedOrderTypes?: string[];
    allowedChannels?: string[];
  }) => {
    if (!locationId) throw new Error('No location selected — cannot create station');
    setIsActing(true);
    try {
      // Explicitly construct the payload with type coercion to prevent Zod validation mismatches
      const payload: Record<string, unknown> = {
        name: String(input.name).trim(),
        displayName: String(input.displayName || input.name).trim(),
        clientRequestId: crypto.randomUUID(),
      };
      if (input.stationType) payload.stationType = String(input.stationType);
      if (input.color) payload.color = String(input.color);
      if (input.sortOrder != null) payload.sortOrder = Number(input.sortOrder);
      if (input.warningThresholdSeconds != null) payload.warningThresholdSeconds = Math.round(Number(input.warningThresholdSeconds));
      if (input.criticalThresholdSeconds != null) payload.criticalThresholdSeconds = Math.round(Number(input.criticalThresholdSeconds));
      if (input.allowedOrderTypes) payload.allowedOrderTypes = input.allowedOrderTypes;
      if (input.allowedChannels) payload.allowedChannels = input.allowedChannels;
      await apiFetch(`/api/v1/fnb/stations?locationId=${locationId}`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'X-Location-Id': locationId },
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
    allowedOrderTypes?: string[];
    allowedChannels?: string[];
  }) => {
    setIsActing(true);
    try {
      const params = locationId ? `?locationId=${locationId}` : '';
      await apiFetch(`/api/v1/fnb/stations/${stationId}${params}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...input,
          clientRequestId: crypto.randomUUID(),
        }),
        headers: locationId ? { 'X-Location-Id': locationId } : undefined,
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
        headers: locationId ? { 'X-Location-Id': locationId } : undefined,
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
        { signal, headers: { 'X-Location-Id': locationId } },
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
