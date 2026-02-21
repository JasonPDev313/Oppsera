'use client';

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['fnb-floor', roomId],
    queryFn: async ({ signal }) => {
      const json = await apiFetch<{ data: FloorPlanWithLiveStatus }>(
        `/api/v1/fnb/tables/floor-plan?roomId=${roomId}&lite=true`,
        { signal },
      );
      return json.data;
    },
    enabled: !!roomId,
    staleTime: 3_000,
    refetchInterval: pollIntervalMs,
    refetchOnWindowFocus: true,
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
      const json = await apiFetch<{ data: Room[] }>('/api/v1/room-layouts');
      return json.data ?? [];
    },
    staleTime: 60_000,
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
