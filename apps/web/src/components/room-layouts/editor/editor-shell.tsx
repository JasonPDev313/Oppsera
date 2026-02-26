'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useEditorStore } from '@/stores/room-layout-editor';
import { Toolbar } from './toolbar';
import { PalettePanel } from './palette-panel';
import { InspectorPanel } from './inspector-panel';
import { LayersPanel } from './layers-panel';
import { CanvasArea } from './canvas-area';
import { CanvasErrorBoundary } from './canvas-error-boundary';
import { AlignTools } from './align-tools';
import { StatusBar } from './status-bar';
import { VersionHistory } from './version-history';
import { SaveAsTemplateDialog } from '@/components/room-layouts/templates/save-as-template-dialog';
import { ApplyTemplateDialog } from '@/components/room-layouts/templates/apply-template-dialog';
import { getEditorStageRef } from '@/stores/room-layout-editor';
import type { CanvasObject } from '@oppsera/shared';

interface EditorShellProps {
  onSave: () => void;
  onPublish: () => void;
  onRevert?: (versionId: string, versionNumber: number) => void;
  onApplyTemplate?: () => void;
}

export function EditorShell({ onSave, onPublish, onRevert, onApplyTemplate }: EditorShellProps) {
  const {
    isPalettePanelOpen,
    isInspectorPanelOpen,
    isLayersPanelOpen,
    isDirty,
    undo,
    redo,
    removeObjects,
    selectedIds,
    selectAll,
    clearSelection,
    objects,
    addObject,
    setSelection,
    updateObjects,
    commitToHistory,
    gridSizeFt,
    widthFt,
    heightFt,
    scalePxPerFt,
    updateObject,
    toggleGrid,
    toggleSnap,
    zoomIn,
    zoomOut,
    zoomToFit,
  } = useEditorStore();

  const clipboardRef = useRef<CanvasObject[]>([]);
  const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [showApplyTemplate, setShowApplyTemplate] = useState(false);
  const roomId = useEditorStore((s) => s.roomId);

  const handleExportPNG = useCallback(() => {
    const stage = getEditorStageRef();
    if (!stage) return;
    const dataUrl = stage.toDataURL({ pixelRatio: 2 });
    const link = document.createElement('a');
    link.download = `${useEditorStore.getState().roomName || 'room-layout'}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const handleExportJSON = useCallback(() => {
    const state = useEditorStore.getState();
    const snapshot = state.getSnapshot();
    const json = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `${state.roomName || 'room-layout'}.json`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  const handleCopy = useCallback(() => {
    const selected = objects.filter((o) => selectedIds.includes(o.id));
    clipboardRef.current = JSON.parse(JSON.stringify(selected));
  }, [objects, selectedIds]);

  const handlePaste = useCallback(() => {
    const items = clipboardRef.current;
    if (items.length === 0) return;

    commitToHistory();
    for (const item of items) {
      let newX = item.x + 1;
      let newY = item.y + 1;
      const objWFt = item.width / scalePxPerFt;
      const objHFt = item.height / scalePxPerFt;
      newX = Math.max(0, Math.min(newX, widthFt - objWFt));
      newY = Math.max(0, Math.min(newY, heightFt - objHFt));
      addObject({ ...item, x: newX, y: newY });
    }
    const state = useEditorStore.getState();
    const pastedIds = state.objects.slice(-items.length).map((o) => o.id);
    setSelection(pastedIds);
  }, [addObject, commitToHistory, scalePxPerFt, widthFt, heightFt, setSelection]);

  const handleDuplicate = useCallback(() => {
    handleCopy();
    // Need to defer paste to next tick so clipboard is populated
    setTimeout(() => {
      const items = clipboardRef.current;
      if (items.length === 0) return;
      commitToHistory();
      for (const item of items) {
        let newX = item.x + 1;
        let newY = item.y + 1;
        const objWFt = item.width / scalePxPerFt;
        const objHFt = item.height / scalePxPerFt;
        newX = Math.max(0, Math.min(newX, widthFt - objWFt));
        newY = Math.max(0, Math.min(newY, heightFt - objHFt));
        addObject({ ...item, x: newX, y: newY });
      }
      const state = useEditorStore.getState();
      const pastedIds = state.objects.slice(-items.length).map((o) => o.id);
      setSelection(pastedIds);
    }, 0);
  }, [handleCopy, addObject, commitToHistory, scalePxPerFt, widthFt, heightFt, setSelection]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === 'h') {
        e.preventDefault();
        setHistoryOpen((v) => !v);
      } else if (ctrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (ctrl && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      } else if (ctrl && e.key === 'y') {
        e.preventDefault();
        redo();
      } else if (ctrl && e.key === 's') {
        e.preventDefault();
        onSave();
      } else if (ctrl && e.key === 'p') {
        e.preventDefault();
        onPublish();
      } else if (ctrl && e.key === 'a') {
        e.preventDefault();
        selectAll();
      } else if (ctrl && e.key === 'c') {
        e.preventDefault();
        handleCopy();
      } else if (ctrl && e.key === 'v') {
        e.preventDefault();
        handlePaste();
      } else if (ctrl && e.key === 'd') {
        e.preventDefault();
        handleDuplicate();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length > 0) {
          e.preventDefault();
          removeObjects(selectedIds);
          commitToHistory();
        }
      } else if (e.key === 'Escape') {
        clearSelection();
      } else if (e.key === ']' && ctrl) {
        // Bring to front
        if (selectedIds.length === 1) {
          const maxZ = Math.max(0, ...objects.map((o) => o.zIndex));
          updateObject(selectedIds[0]!, { zIndex: maxZ + 1 });
          commitToHistory();
        }
      } else if (e.key === '[' && ctrl) {
        // Send to back
        if (selectedIds.length === 1) {
          const minZ = Math.min(0, ...objects.map((o) => o.zIndex));
          updateObject(selectedIds[0]!, { zIndex: minZ - 1 });
          commitToHistory();
        }
      } else if (e.key === ']' && !ctrl) {
        // Bring forward
        if (selectedIds.length === 1) {
          const obj = objects.find((o) => o.id === selectedIds[0]);
          if (obj) { updateObject(obj.id, { zIndex: obj.zIndex + 1 }); commitToHistory(); }
        }
      } else if (e.key === '[' && !ctrl) {
        // Send backward
        if (selectedIds.length === 1) {
          const obj = objects.find((o) => o.id === selectedIds[0]);
          if (obj) { updateObject(obj.id, { zIndex: obj.zIndex - 1 }); commitToHistory(); }
        }
      } else if (e.key === 'g' && !ctrl) {
        e.preventDefault();
        toggleGrid();
      } else if (ctrl && e.key === 'g') {
        e.preventDefault();
        toggleSnap();
      } else if (ctrl && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomIn();
      } else if (ctrl && e.key === '-') {
        e.preventDefault();
        zoomOut();
      } else if (ctrl && e.key === '0') {
        e.preventDefault();
        zoomToFit();
      } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (selectedIds.length === 0) return;
        e.preventDefault();

        const step = e.shiftKey ? 0.1 : gridSizeFt;
        const updates = selectedIds.map((id) => {
          const obj = objects.find((o) => o.id === id);
          if (!obj) return { id, changes: {} };

          let newX = obj.x;
          let newY = obj.y;
          if (e.key === 'ArrowLeft') newX -= step;
          if (e.key === 'ArrowRight') newX += step;
          if (e.key === 'ArrowUp') newY -= step;
          if (e.key === 'ArrowDown') newY += step;

          const objWFt = obj.width / scalePxPerFt;
          const objHFt = obj.height / scalePxPerFt;
          newX = Math.max(0, Math.min(newX, widthFt - objWFt));
          newY = Math.max(0, Math.min(newY, heightFt - objHFt));

          return { id, changes: { x: newX, y: newY } };
        });

        updateObjects(updates);

        if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
        nudgeTimerRef.current = setTimeout(() => {
          commitToHistory();
        }, 300);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    undo, redo, onSave, onPublish, selectAll, removeObjects, selectedIds, clearSelection,
    handleCopy, handlePaste, handleDuplicate, commitToHistory, objects, updateObjects, updateObject,
    gridSizeFt, widthFt, heightFt, scalePxPerFt, toggleGrid, toggleSnap, zoomIn, zoomOut, zoomToFit,
  ]);

  // beforeunload warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        onSave={onSave}
        onPublish={onPublish}
        onOpenHistory={() => setHistoryOpen(true)}
        onSaveAsTemplate={() => setShowSaveTemplate(true)}
        onApplyTemplate={() => setShowApplyTemplate(true)}
        onExportPNG={handleExportPNG}
        onExportJSON={handleExportJSON}
      />
      {selectedIds.length >= 2 && (
        <div className="flex items-center border-b border-border bg-surface px-3 py-1">
          <AlignTools />
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        {isPalettePanelOpen && <PalettePanel />}
        <div className="flex flex-1 flex-col overflow-hidden">
          <CanvasErrorBoundary>
            <CanvasArea />
          </CanvasErrorBoundary>
        </div>
        {isInspectorPanelOpen && (
          <div className="flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              <InspectorPanel />
            </div>
            {isLayersPanelOpen && <LayersPanel />}
          </div>
        )}
      </div>
      <StatusBar />
      {roomId && (
        <VersionHistory
          roomId={roomId}
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          onRevert={(versionId, versionNumber) => {
            setHistoryOpen(false);
            onRevert?.(versionId, versionNumber);
          }}
        />
      )}
      {showSaveTemplate && (
        <SaveAsTemplateDialog onClose={() => setShowSaveTemplate(false)} />
      )}
      {showApplyTemplate && roomId && (
        <ApplyTemplateDialog
          roomId={roomId}
          onClose={() => setShowApplyTemplate(false)}
          onApplied={() => {
            setShowApplyTemplate(false);
            onApplyTemplate?.();
          }}
        />
      )}
    </div>
  );
}
