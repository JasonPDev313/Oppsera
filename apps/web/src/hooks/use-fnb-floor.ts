'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import type {
  FloorPlanWithLiveStatus,
  FnbTableWithStatus,
} from '@/types/fnb';

// ── Floor Plan Hook ─────────────────────────────────────────────

interface UseFnbFloorOptions {
  roomId: string | null;
  pollIntervalMs?: number;
}

interface UseFnbFloorReturn {
  data: FloorPlanWithLiveStatus | null;
  tables: FnbTableWithStatus[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useFnbFloor({ roomId, pollIntervalMs = 5000 }: UseFnbFloorOptions): UseFnbFloorReturn {
  const [data, setData] = useState<FloorPlanWithLiveStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchFloor = useCallback(async () => {
    if (!roomId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setIsLoading(true);
      const json = await apiFetch<{ data: FloorPlanWithLiveStatus }>(`/api/v1/fnb/tables/floor-plan?roomId=${roomId}`, {
        signal: controller.signal,
      });
      setData(json.data);
      setError(null);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [roomId]);

  // Initial fetch
  useEffect(() => {
    fetchFloor();
    return () => abortRef.current?.abort();
  }, [fetchFloor]);

  // Polling
  useEffect(() => {
    if (!roomId || pollIntervalMs <= 0) return;
    const interval = setInterval(fetchFloor, pollIntervalMs);
    return () => clearInterval(interval);
  }, [roomId, pollIntervalMs, fetchFloor]);

  // Listen for POS visibility resume
  useEffect(() => {
    const handler = () => { fetchFloor(); };
    window.addEventListener('pos-visibility-resume', handler);
    return () => window.removeEventListener('pos-visibility-resume', handler);
  }, [fetchFloor]);

  return {
    data,
    tables: data?.tables ?? [],
    isLoading,
    error,
    refresh: fetchFloor,
  };
}

// ── Room List Hook ──────────────────────────────────────────────

interface Room {
  id: string;
  name: string;
  slug: string;
  locationId: string;
}

interface UseFnbRoomsReturn {
  rooms: Room[];
  isLoading: boolean;
  error: string | null;
}

export function useFnbRooms(): UseFnbRoomsReturn {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const json = await apiFetch<{ data: Room[] }>('/api/v1/room-layouts');
        if (!cancelled) {
          setRooms(json.data ?? []);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Unknown error');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return { rooms, isLoading, error };
}

// ── Table Actions Hook ──────────────────────────────────────────

interface UseTableActionsReturn {
  seatTable: (tableId: string, input: { partySize: number; serverUserId?: string }) => Promise<void>;
  clearTable: (tableId: string) => Promise<void>;
  updateStatus: (tableId: string, status: string) => Promise<void>;
  combineTables: (tableIds: string[], primaryTableId: string) => Promise<void>;
  uncombineTables: (combineGroupId: string) => Promise<void>;
  syncFromFloorPlan: (roomId: string) => Promise<void>;
  isActing: boolean;
}

export function useTableActions(onSuccess?: () => void): UseTableActionsReturn {
  const [isActing, setIsActing] = useState(false);

  const act = useCallback(async (fn: () => Promise<unknown>) => {
    setIsActing(true);
    try {
      await fn();
      onSuccess?.();
    } finally {
      setIsActing(false);
    }
  }, [onSuccess]);

  const seatTable = useCallback(async (tableId: string, input: { partySize: number; serverUserId?: string }) => {
    await act(() => apiFetch(`/api/v1/fnb/tables/${tableId}/seat`, {
      method: 'POST',
      body: JSON.stringify(input),
    }));
  }, [act]);

  const clearTableFn = useCallback(async (tableId: string) => {
    await act(() => apiFetch(`/api/v1/fnb/tables/${tableId}/clear`, {
      method: 'POST',
      body: JSON.stringify({}),
    }));
  }, [act]);

  const updateStatus = useCallback(async (tableId: string, status: string) => {
    await act(() => apiFetch(`/api/v1/fnb/tables/${tableId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }));
  }, [act]);

  const combineTablesFn = useCallback(async (tableIds: string[], primaryTableId: string) => {
    await act(() => apiFetch('/api/v1/fnb/tables/combine', {
      method: 'POST',
      body: JSON.stringify({ tableIds, primaryTableId }),
    }));
  }, [act]);

  const uncombineTablesFn = useCallback(async (combineGroupId: string) => {
    await act(() => apiFetch('/api/v1/fnb/tables/uncombine', {
      method: 'POST',
      body: JSON.stringify({ combineGroupId }),
    }));
  }, [act]);

  const syncFromFloorPlan = useCallback(async (roomId: string) => {
    await act(() => apiFetch('/api/v1/fnb/tables/sync', {
      method: 'POST',
      body: JSON.stringify({ roomId }),
    }));
  }, [act]);

  return {
    seatTable,
    clearTable: clearTableFn,
    updateStatus,
    combineTables: combineTablesFn,
    uncombineTables: uncombineTablesFn,
    syncFromFloorPlan,
    isActing,
  };
}
