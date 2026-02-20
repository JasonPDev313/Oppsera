'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import { useRoomEditor } from '@/hooks/use-room-layouts';
import { useRoomLayoutAutosave } from '@/hooks/use-room-layout-autosave';
import { saveDraftApi, publishVersionApi, revertToVersionApi } from '@/hooks/use-room-layouts';
import { useEditorStore } from '@/stores/room-layout-editor';
import { EditorShell } from '@/components/room-layouts/editor/editor-shell';
import { PublishDialog } from '@/components/room-layouts/dialogs/publish-dialog';
import type { CanvasSnapshot } from '@oppsera/shared';

export default function EditorContent() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;
  const { toast } = useToast();
  const { data: editorData, isLoading, error, mutate: fetchEditor } = useRoomEditor(roomId);
  const [showPublish, setShowPublish] = useState(false);

  const {
    loadFromSnapshot,
    getSnapshot,
    setSaving,
    setLastSavedAt,
    setPublishing,
    isPublishing,
    isDirty,
  } = useEditorStore();

  // Fetch on mount
  useEffect(() => {
    fetchEditor();
  }, [fetchEditor]);

  // Load data into store
  useEffect(() => {
    if (editorData) {
      loadFromSnapshot(editorData.snapshotJson as unknown as CanvasSnapshot, {
        roomId: editorData.id,
        roomName: editorData.name,
        widthFt: editorData.widthFt,
        heightFt: editorData.heightFt,
        gridSizeFt: editorData.gridSizeFt,
        scalePxPerFt: editorData.scalePxPerFt,
        unit: editorData.unit,
      });
    }
  }, [editorData, loadFromSnapshot]);

  // Autosave
  useRoomLayoutAutosave();

  // Manual save
  const handleSave = useCallback(async () => {
    if (!roomId) return;
    setSaving(true);
    try {
      const snapshot = getSnapshot();
      await saveDraftApi(roomId, snapshot as unknown as Record<string, unknown>);
      setLastSavedAt(new Date().toISOString());
      toast.success('Draft saved');
    } catch {
      toast.error('Failed to save draft');
    } finally {
      setSaving(false);
    }
  }, [roomId, getSnapshot, setSaving, setLastSavedAt, toast]);

  // Publish
  const handlePublish = useCallback(
    async (note: string) => {
      if (!roomId) return;

      // Always save the current canvas as a draft before publishing.
      // This ensures a draft version exists even if autosave already ran
      // (which clears isDirty) or after a previous publish (which clears draftVersionId).
      setSaving(true);
      try {
        const snapshot = getSnapshot();
        await saveDraftApi(roomId, snapshot as unknown as Record<string, unknown>);
        setLastSavedAt(new Date().toISOString());
      } catch {
        toast.error('Failed to save before publishing');
        setSaving(false);
        return;
      }
      setSaving(false);

      setPublishing(true);
      try {
        await publishVersionApi(roomId, note || undefined);
        toast.success('Version published');
        setShowPublish(false);
        fetchEditor(); // Reload editor data to reflect published state
      } catch {
        toast.error('Failed to publish version');
      } finally {
        setPublishing(false);
      }
    },
    [roomId, getSnapshot, setSaving, setLastSavedAt, setPublishing, toast, fetchEditor],
  );

  // Revert
  const handleRevert = useCallback(
    async (versionId: string, versionNumber: number) => {
      if (!roomId) return;
      try {
        await revertToVersionApi(roomId, versionId);
        toast.success(`Reverted to Version ${versionNumber}`);
        fetchEditor(); // Reload editor data
      } catch {
        toast.error('Failed to revert');
      }
    },
    [roomId, toast, fetchEditor],
  );

  if (isLoading || !editorData) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-red-600">
        <p>Failed to load editor data. Please try again.</p>
      </div>
    );
  }

  return (
    <>
      <EditorShell
        onSave={handleSave}
        onPublish={() => setShowPublish(true)}
        onRevert={handleRevert}
        onApplyTemplate={() => fetchEditor()}
      />
      {showPublish && (
        <PublishDialog
          onClose={() => setShowPublish(false)}
          onPublish={handlePublish}
          isPublishing={isPublishing}
        />
      )}
    </>
  );
}
