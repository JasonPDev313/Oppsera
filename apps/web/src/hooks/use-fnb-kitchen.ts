'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { KdsView, ExpoView, FnbStation } from '@/types/fnb';

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
  const refreshCounter = useRef(0);

  const today = businessDate ?? new Date().toISOString().slice(0, 10);

  const fetchKds = useCallback(async () => {
    if (!stationId) return;
    try {
      const params = new URLSearchParams({ businessDate: today });
      if (locationId) params.set('locationId', locationId);
      const json = await apiFetch<{ data: KdsView }>(
        `/api/v1/fnb/stations/${stationId}/kds?${params}`,
      );
      setKdsView(json.data);
      setError(null);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setError(err?.message ?? 'Failed to load KDS view');
      }
    } finally {
      setIsLoading(false);
    }
  }, [stationId, locationId, today]);

  useEffect(() => {
    if (!stationId) {
      setKdsView(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    fetchKds();
    const interval = setInterval(fetchKds, pollIntervalMs);
    return () => clearInterval(interval);
  }, [stationId, fetchKds, pollIntervalMs, refreshCounter.current]);

  const refresh = useCallback(() => {
    refreshCounter.current += 1;
    fetchKds();
  }, [fetchKds]);

  const bumpItem = useCallback(async (ticketItemId: string) => {
    if (!stationId) return;
    setIsActing(true);
    try {
      await apiFetch(`/api/v1/fnb/stations/${stationId}/bump-item`, {
        method: 'POST',
        body: JSON.stringify({ ticketItemId, stationId }),
      });
      await fetchKds();
    } finally {
      setIsActing(false);
    }
  }, [stationId, fetchKds]);

  const bumpTicket = useCallback(async (ticketId: string) => {
    if (!stationId) return;
    setIsActing(true);
    try {
      await apiFetch(`/api/v1/fnb/stations/${stationId}/bump-ticket`, {
        method: 'POST',
        body: JSON.stringify({ ticketId }),
      });
      await fetchKds();
    } finally {
      setIsActing(false);
    }
  }, [stationId, fetchKds]);

  const recallItem = useCallback(async (ticketItemId: string) => {
    if (!stationId) return;
    setIsActing(true);
    try {
      await apiFetch(`/api/v1/fnb/stations/${stationId}/recall`, {
        method: 'POST',
        body: JSON.stringify({ ticketItemId, stationId }),
      });
      await fetchKds();
    } finally {
      setIsActing(false);
    }
  }, [stationId, fetchKds]);

  const callBack = useCallback(async (ticketItemId: string, reason?: string) => {
    if (!stationId) return;
    setIsActing(true);
    try {
      await apiFetch(`/api/v1/fnb/stations/${stationId}/callback`, {
        method: 'POST',
        body: JSON.stringify({ ticketItemId, stationId, reason }),
      });
      await fetchKds();
    } finally {
      setIsActing(false);
    }
  }, [stationId, fetchKds]);

  return { kdsView, isLoading, error, bumpItem, bumpTicket, recallItem, callBack, isActing, refresh };
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

  const today = businessDate ?? new Date().toISOString().slice(0, 10);

  const fetchExpo = useCallback(async () => {
    try {
      const params = new URLSearchParams({ businessDate: today });
      if (locationId) params.set('locationId', locationId);
      const json = await apiFetch<{ data: ExpoView }>(
        `/api/v1/fnb/stations/expo?${params}`,
      );
      setExpoView(json.data);
      setError(null);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setError(err?.message ?? 'Failed to load expo view');
      }
    } finally {
      setIsLoading(false);
    }
  }, [locationId, today]);

  useEffect(() => {
    setIsLoading(true);
    fetchExpo();
    const interval = setInterval(fetchExpo, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchExpo, pollIntervalMs]);

  const refresh = useCallback(() => {
    fetchExpo();
  }, [fetchExpo]);

  const bumpTicket = useCallback(async (ticketId: string) => {
    setIsActing(true);
    try {
      // For expo, use the first station's bump-ticket endpoint
      // The bumpTicket command doesn't need stationId in the body
      await apiFetch(`/api/v1/fnb/stations/expo`, {
        method: 'POST',
        body: JSON.stringify({ ticketId }),
      });
      await fetchExpo();
    } catch {
      // Fallback: try kitchen tickets endpoint
      await apiFetch(`/api/v1/fnb/kitchen/tickets/${ticketId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'served' }),
      });
      await fetchExpo();
    } finally {
      setIsActing(false);
    }
  }, [fetchExpo]);

  return { expoView, isLoading, error, bumpTicket, isActing, refresh };
}

// ── Stations List Hook ──────────────────────────────────────────

interface UseStationsOptions {
  locationId?: string;
}

export function useStations({ locationId }: UseStationsOptions) {
  const [stations, setStations] = useState<FnbStation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const params = locationId ? `?locationId=${locationId}` : '';
        const json = await apiFetch<{ data: FnbStation[] }>(
          `/api/v1/fnb/stations${params}`,
        );
        setStations(json.data ?? []);
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    })();
  }, [locationId]);

  return { stations, isLoading };
}
