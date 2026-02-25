'use client';

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type {
  FloorPlanWithLiveStatus,
  FnbTableWithStatus,
} from '@/types/fnb';

// ── Module-level snapshot cache ─────────────────────────────────
// Survives React Query garbage collection. Provides instant data on
// cold mounts (e.g. after navigating away for > gcTime).

const _snapshotCache = new Map<string, { data: FloorPlanWithLiveStatus; ts: number }>();
const SNAPSHOT_TTL_MS = 30 * 60_000; // 30 minutes

function getSnapshot(roomId: string): FloorPlanWithLiveStatus | undefined {
  const entry = _snapshotCache.get(roomId);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > SNAPSHOT_TTL_MS) {
    _snapshotCache.delete(roomId);
    return undefined;
  }
  return entry.data;
}

function setSnapshot(roomId: string, data: FloorPlanWithLiveStatus): void {
  _snapshotCache.set(roomId, { data, ts: Date.now() });
}

// Also cache the room list
let _roomsSnapshot: { data: Room[]; ts: number } | null = null;
const ROOMS_SNAPSHOT_TTL_MS = 30 * 60_000;

// ── Floor Plan Hook ─────────────────────────────────────────────

interface UseFnbFloorOptions {
  roomId: string | null;
  pollIntervalMs?: number;
}

interface UseFnbFloorReturn {
  data: FloorPlanWithLiveStatus | null;
  tables: FnbTableWithStatus[];
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useFnbFloor({ roomId, pollIntervalMs = 20 * 60_000 }: UseFnbFloorOptions): UseFnbFloorReturn {
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['fnb-floor', roomId],
    queryFn: async ({ signal }) => {
      const json = await apiFetch<{ data: FloorPlanWithLiveStatus }>(
        `/api/v1/fnb/tables/floor-plan?roomId=${roomId}`,
        { signal },
      );
      // Persist to module-level cache for instant cold starts
      if (roomId) setSnapshot(roomId, json.data);
      return json.data;
    },
    enabled: !!roomId,
    // Data is considered fresh for 5 minutes. The poll interval handles
    // background updates — staleTime prevents flash-of-spinner on revisit.
    staleTime: 5 * 60_000,
    // Keep data in RQ cache for 30 minutes after last subscriber unmounts.
    gcTime: 30 * 60_000,
    // Floor plan layout is essentially static during a shift.
    refetchInterval: pollIntervalMs,
    refetchOnWindowFocus: false,
    // When switching rooms, keep showing the previous room's tables
    // while the new room loads (prevents full-screen spinner).
    placeholderData: keepPreviousData,
    // Use module-level snapshot as initialData for instant cold starts.
    // Only if React Query cache is empty (no gcTime-surviving entry).
    initialData: roomId ? getSnapshot(roomId) : undefined,
    // If initialData came from snapshot, treat it as potentially stale
    initialDataUpdatedAt: roomId && getSnapshot(roomId)
      ? (_snapshotCache.get(roomId)?.ts ?? 0)
      : undefined,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['fnb-floor', roomId] });
  }, [queryClient, roomId]);

  // Listen for POS visibility resume
  useEffect(() => {
    const handler = () => { refresh(); };
    window.addEventListener('pos-visibility-resume', handler);
    return () => window.removeEventListener('pos-visibility-resume', handler);
  }, [refresh]);

  return {
    data: data ?? null,
    tables: data?.tables ?? [],
    isLoading,
    isFetching,
    error: error ? (error instanceof Error ? error.message : 'Unknown error') : null,
    refresh,
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
  const { data, isLoading, error } = useQuery({
    queryKey: ['fnb-rooms'],
    queryFn: async () => {
      const json = await apiFetch<{ data: Room[] }>('/api/v1/room-layouts?isActive=true');
      const rooms = json.data ?? [];
      // Cache for instant cold starts
      _roomsSnapshot = { data: rooms, ts: Date.now() };
      return rooms;
    },
    // Room list almost never changes during a shift
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    // Use snapshot for instant cold mount
    initialData: () => {
      if (!_roomsSnapshot) return undefined;
      if (Date.now() - _roomsSnapshot.ts > ROOMS_SNAPSHOT_TTL_MS) {
        _roomsSnapshot = null;
        return undefined;
      }
      return _roomsSnapshot.data;
    },
    initialDataUpdatedAt: _roomsSnapshot?.ts,
  });

  return {
    rooms: data ?? [],
    isLoading,
    error: error ? (error instanceof Error ? error.message : 'Unknown error') : null,
  };
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
