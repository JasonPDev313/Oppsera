'use client';

import { useEffect, useRef } from 'react';
import { useEditorStore } from '@/stores/room-layout-editor';
import { saveDraftApi } from '@/hooks/use-room-layouts';

const AUTOSAVE_DELAY = 3000;

export function useRoomLayoutAutosave() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);

  const { roomId, isDirty, isSaving, getSnapshot, setSaving, setLastSavedAt, setDirty } =
    useEditorStore();

  useEffect(() => {
    if (!roomId || !isDirty || isSaving) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(async () => {
      if (isSavingRef.current) return;
      isSavingRef.current = true;
      setSaving(true);

      try {
        const snapshot = getSnapshot();
        await saveDraftApi(roomId, snapshot as unknown as Record<string, unknown>);
        setLastSavedAt(new Date().toISOString());
      } catch {
        // Silently fail — user can manually save
      } finally {
        setSaving(false);
        isSavingRef.current = false;
      }
    }, AUTOSAVE_DELAY);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [roomId, isDirty, isSaving, getSnapshot, setSaving, setLastSavedAt, setDirty]);
}
