'use client';

import { useState, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { RoomRow, RoomDetail, TemplateRow, RoomEditorData } from '@/types/room-layouts';

// ── Response types ──────────────────────────────────────────────

interface ListResponse<T> {
  data: T[];
  meta: { cursor: string | null; hasMore: boolean };
}

interface SingleResponse<T> {
  data: T;
}

// ── List rooms ──────────────────────────────────────────────────

interface UseRoomLayoutsOptions {
  locationId?: string;
  search?: string;
  isActive?: boolean;
}

export function useRoomLayouts(options: UseRoomLayoutsOptions = {}) {
  const [data, setData] = useState<RoomRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);

  const fetch = useCallback(async (reset = false) => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (options.locationId) params.set('locationId', options.locationId);
      if (options.search) params.set('search', options.search);
      if (options.isActive !== undefined) params.set('isActive', String(options.isActive));
      if (!reset && cursorRef.current) params.set('cursor', cursorRef.current);

      const res = await apiFetch<ListResponse<RoomRow>>(`/api/v1/room-layouts?${params}`);
      const items = res.data;

      if (reset) {
        setData(items);
      } else {
        setData((prev) => [...prev, ...items]);
      }

      cursorRef.current = res.meta.cursor;
      setHasMore(res.meta.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load rooms'));
    } finally {
      setIsLoading(false);
    }
  }, [options.locationId, options.search, options.isActive]);

  const mutate = useCallback(() => {
    cursorRef.current = null;
    return fetch(true);
  }, [fetch]);

  const loadMore = useCallback(() => fetch(false), [fetch]);

  return { data, isLoading, error, hasMore, loadMore, mutate };
}

// ── Single room ─────────────────────────────────────────────────

export function useRoom(roomId: string | null) {
  const [data, setData] = useState<RoomDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    if (!roomId) return;
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<SingleResponse<RoomDetail>>(`/api/v1/room-layouts/${roomId}`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load room'));
    } finally {
      setIsLoading(false);
    }
  }, [roomId]);

  const mutate = useCallback(() => fetch(), [fetch]);

  return { data, isLoading, error, mutate };
}

// ── Room editor data ────────────────────────────────────────────

export function useRoomEditor(roomId: string | null) {
  const [data, setData] = useState<RoomEditorData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    if (!roomId) return;
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<SingleResponse<RoomEditorData>>(`/api/v1/room-layouts/${roomId}/editor`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load editor data'));
    } finally {
      setIsLoading(false);
    }
  }, [roomId]);

  const mutate = useCallback(() => fetch(), [fetch]);

  return { data, isLoading, error, mutate };
}

// ── Templates ───────────────────────────────────────────────────

export function useRoomTemplates(filters?: { category?: string; search?: string }) {
  const [data, setData] = useState<TemplateRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (filters?.category) params.set('category', filters.category);
      if (filters?.search) params.set('search', filters.search);
      const res = await apiFetch<ListResponse<TemplateRow>>(`/api/v1/room-layouts/templates?${params}`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load templates'));
    } finally {
      setIsLoading(false);
    }
  }, [filters?.category, filters?.search]);

  const mutate = useCallback(() => fetch(), [fetch]);

  return { data, isLoading, error, mutate };
}

// ── Mutations ───────────────────────────────────────────────────

export async function createRoomApi(input: {
  name: string;
  locationId: string;
  description?: string;
  widthFt: number;
  heightFt: number;
  gridSizeFt?: number;
  scalePxPerFt?: number;
  unit?: string;
  defaultMode?: string;
}) {
  return apiFetch<SingleResponse<{ id: string }>>('/api/v1/room-layouts', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateRoomApi(roomId: string, input: Record<string, unknown>) {
  return apiFetch<SingleResponse<{ id: string }>>(`/api/v1/room-layouts/${roomId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function archiveRoomApi(roomId: string) {
  return apiFetch(`/api/v1/room-layouts/${roomId}`, { method: 'DELETE' });
}

export async function unarchiveRoomApi(roomId: string) {
  return apiFetch(`/api/v1/room-layouts/${roomId}?restore=true`, { method: 'DELETE' });
}

export async function duplicateRoomApi(roomId: string, name: string, locationId?: string) {
  return apiFetch<SingleResponse<{ id: string }>>(`/api/v1/room-layouts/${roomId}/duplicate`, {
    method: 'POST',
    body: JSON.stringify({ name, locationId }),
  });
}

export async function saveDraftApi(roomId: string, snapshotJson: Record<string, unknown>) {
  return apiFetch(`/api/v1/room-layouts/${roomId}/draft`, {
    method: 'PUT',
    body: JSON.stringify({ snapshotJson }),
  });
}

export async function publishVersionApi(roomId: string, publishNote?: string) {
  return apiFetch(`/api/v1/room-layouts/${roomId}/publish`, {
    method: 'POST',
    body: JSON.stringify({ publishNote }),
  });
}

export async function revertToVersionApi(roomId: string, versionId: string) {
  return apiFetch(`/api/v1/room-layouts/${roomId}/revert`, {
    method: 'POST',
    body: JSON.stringify({ versionId }),
  });
}

export async function saveAsTemplateApi(input: {
  name: string;
  description?: string;
  category: string;
  snapshotJson: Record<string, unknown>;
  widthFt: number;
  heightFt: number;
}) {
  return apiFetch<SingleResponse<{ id: string }>>('/api/v1/room-layouts/templates', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateTemplateApi(templateId: string, input: {
  name?: string;
  description?: string;
  category?: string;
}) {
  return apiFetch<SingleResponse<{ id: string }>>(`/api/v1/room-layouts/templates/${templateId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteTemplateApi(templateId: string) {
  return apiFetch(`/api/v1/room-layouts/templates/${templateId}`, { method: 'DELETE' });
}

export async function applyTemplateApi(roomId: string, templateId: string) {
  return apiFetch(`/api/v1/room-layouts/templates/${templateId}/apply`, {
    method: 'POST',
    body: JSON.stringify({ roomId }),
  });
}

export async function createRoomFromTemplateApi(input: {
  name: string;
  locationId: string;
  templateId: string;
  description?: string;
  widthFt: number;
  heightFt: number;
}) {
  // Step 1: Create the room with the template's dimensions
  const { templateId, ...roomInput } = input;
  const res = await apiFetch<SingleResponse<{ id: string }>>('/api/v1/room-layouts', {
    method: 'POST',
    body: JSON.stringify(roomInput),
  });

  // Step 2: Apply the template snapshot to the new room
  await applyTemplateApi(res.data.id, templateId);

  return res;
}

// ── Room Modes ─────────────────────────────────────────────────

export interface RoomModeInfo {
  name: string;
  isDefault: boolean;
  hasDraft: boolean;
  hasPublished: boolean;
}

export async function listRoomModesApi(roomId: string) {
  return apiFetch<{ data: RoomModeInfo[] }>(`/api/v1/room-layouts/${roomId}/modes`);
}

export async function createModeApi(roomId: string, modeName: string, copyFrom?: string) {
  return apiFetch(`/api/v1/room-layouts/${roomId}/modes`, {
    method: 'POST',
    body: JSON.stringify({ modeName, copyFrom }),
  });
}

export async function deleteModeApi(roomId: string, modeName: string) {
  return apiFetch(`/api/v1/room-layouts/${roomId}/modes/${encodeURIComponent(modeName)}`, {
    method: 'DELETE',
  });
}

export async function setDefaultModeApi(roomId: string, modeName: string) {
  return apiFetch(`/api/v1/room-layouts/${roomId}/modes/default`, {
    method: 'PATCH',
    body: JSON.stringify({ modeName }),
  });
}
