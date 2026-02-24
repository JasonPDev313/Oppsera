'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

// ── Business Date Helper ─────────────────────────────────────────
// Before 4AM, consider it the previous day's business date.
// This handles overnight shifts: a server working past midnight
// keeps their section until 4AM when the new day starts.

export function getBusinessDate(): string {
  const now = new Date();
  if (now.getHours() < 4) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().slice(0, 10);
  }
  return now.toISOString().slice(0, 10);
}

// ── Types ────────────────────────────────────────────────────────

interface RoomAssignment {
  serverUserId: string;
  serverName: string | null;
  tableIds: string[];
}

interface UseMySectionOptions {
  roomId: string | null;
  userId: string;
}

export interface UseMySectionReturn {
  /** The server's selected table IDs for today */
  myTableIds: Set<string>;
  /** All server→table assignments for this room today */
  allAssignments: RoomAssignment[];
  /** Map of tableId → serverName for tables claimed by OTHER servers */
  claimedByOthers: Map<string, string>;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  /** Toggle a single table in/out of selection (local only — call saveSelection to persist) */
  toggleTable: (tableId: string) => void;
  /** Replace entire selection (local only — call saveSelection to persist) */
  setTableIds: (ids: string[]) => void;
  /** Persist current selection to server */
  saveSelection: () => Promise<{ savedCount: number; conflicts: Array<{ tableId: string; claimedByName: string | null }> }>;
  /** Clear all selections (persists immediately) */
  clearSelection: () => Promise<void>;
  /** Refresh data from server */
  refresh: () => Promise<void>;
  hasSelection: boolean;
  selectedCount: number;
}

// ── Hook ─────────────────────────────────────────────────────────

export function useMySection({ roomId, userId }: UseMySectionOptions): UseMySectionReturn {
  const queryClient = useQueryClient();
  const businessDate = getBusinessDate();

  // Local selection state (optimistic UI)
  const [localIds, setLocalIds] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const initializedRef = useRef(false);

  // Fetch the server's current selection
  const { data: myData, isLoading: myLoading, error: myError } = useQuery({
    queryKey: ['fnb-my-section', roomId, businessDate],
    queryFn: async ({ signal }) => {
      const json = await apiFetch<{ data: { tableIds: string[] } }>(
        `/api/v1/fnb/my-section?roomId=${roomId}&businessDate=${businessDate}`,
        { signal },
      );
      return json.data;
    },
    enabled: !!roomId,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  // Fetch all room assignments (for "claimed by others" display)
  const { data: roomData, isLoading: roomLoading } = useQuery({
    queryKey: ['fnb-my-section-room', roomId, businessDate],
    queryFn: async ({ signal }) => {
      const json = await apiFetch<{ data: RoomAssignment[] }>(
        `/api/v1/fnb/my-section/room?roomId=${roomId}&businessDate=${businessDate}`,
        { signal },
      );
      return json.data;
    },
    enabled: !!roomId,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  // Sync server data → local state on first load and when server data changes
  useEffect(() => {
    if (myData && !initializedRef.current) {
      setLocalIds(new Set(myData.tableIds));
      initializedRef.current = true;
    }
  }, [myData]);

  // Reset when room changes
  useEffect(() => {
    initializedRef.current = false;
    setLocalIds(new Set());
  }, [roomId]);

  // When we get fresh data from server, sync to local if not currently saving
  useEffect(() => {
    if (myData && initializedRef.current && !isSaving) {
      setLocalIds(new Set(myData.tableIds));
    }
  }, [myData, isSaving]);

  // Build "claimed by others" map
  const claimedByOthers = useMemo(() => {
    const map = new Map<string, string>();
    if (!roomData) return map;
    for (const assignment of roomData) {
      if (assignment.serverUserId === userId) continue;
      for (const tableId of assignment.tableIds) {
        map.set(tableId, assignment.serverName ?? 'Another server');
      }
    }
    return map;
  }, [roomData, userId]);

  const toggleTable = useCallback((tableId: string) => {
    setLocalIds((prev) => {
      const next = new Set(prev);
      if (next.has(tableId)) {
        next.delete(tableId);
      } else {
        next.add(tableId);
      }
      return next;
    });
  }, []);

  const setTableIds = useCallback((ids: string[]) => {
    setLocalIds(new Set(ids));
  }, []);

  const saveSelection = useCallback(async () => {
    if (!roomId) return { savedCount: 0, conflicts: [] };
    setIsSaving(true);
    try {
      const json = await apiFetch<{
        data: { savedCount: number; conflicts: Array<{ tableId: string; claimedByUserId: string; claimedByName: string | null }> };
      }>('/api/v1/fnb/my-section', {
        method: 'PUT',
        body: JSON.stringify({
          roomId,
          tableIds: Array.from(localIds),
          businessDate,
        }),
      });

      // Refresh both queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['fnb-my-section', roomId, businessDate] }),
        queryClient.invalidateQueries({ queryKey: ['fnb-my-section-room', roomId, businessDate] }),
      ]);

      return json.data;
    } finally {
      setIsSaving(false);
    }
  }, [roomId, localIds, businessDate, queryClient]);

  const clearSelection = useCallback(async () => {
    if (!roomId) return;
    setLocalIds(new Set());
    setIsSaving(true);
    try {
      await apiFetch('/api/v1/fnb/my-section', {
        method: 'PUT',
        body: JSON.stringify({
          roomId,
          tableIds: [],
          businessDate,
        }),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['fnb-my-section', roomId, businessDate] }),
        queryClient.invalidateQueries({ queryKey: ['fnb-my-section-room', roomId, businessDate] }),
      ]);
    } finally {
      setIsSaving(false);
    }
  }, [roomId, businessDate, queryClient]);

  const refresh = useCallback(async () => {
    if (!roomId) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['fnb-my-section', roomId, businessDate] }),
      queryClient.invalidateQueries({ queryKey: ['fnb-my-section-room', roomId, businessDate] }),
    ]);
  }, [roomId, businessDate, queryClient]);

  return {
    myTableIds: localIds,
    allAssignments: roomData ?? [],
    claimedByOthers,
    isLoading: myLoading || roomLoading,
    isSaving,
    error: myError ? (myError instanceof Error ? myError.message : 'Unknown error') : null,
    toggleTable,
    setTableIds,
    saveSelection,
    clearSelection,
    refresh,
    hasSelection: localIds.size > 0,
    selectedCount: localIds.size,
  };
}
