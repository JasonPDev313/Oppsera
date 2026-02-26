'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Grid3X3,
  Magnet,
  Save,
  Upload,
  Clock,
  LayoutTemplate,
  BookmarkPlus,
  Image,
  FileJson,
} from 'lucide-react';
import { useEditorStore } from '@/stores/room-layout-editor';

interface ToolbarProps {
  onSave: () => void;
  onPublish: () => void;
  onOpenHistory?: () => void;
  onSaveAsTemplate?: () => void;
  onApplyTemplate?: () => void;
  onExportPNG?: () => void;
  onExportJSON?: () => void;
  modes?: string[];
  currentMode?: string;
  onModeChange?: (mode: string) => void;
  onManageModes?: () => void;
}

export function Toolbar({ onSave, onPublish, onOpenHistory, onSaveAsTemplate, onApplyTemplate, onExportPNG, onExportJSON, modes, currentMode, onModeChange, onManageModes }: ToolbarProps) {
  const router = useRouter();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');

  const {
    roomName,
    setRoomName,
    zoom,
    zoomIn,
    zoomOut,
    zoomToFit,
    showGrid,
    snapToGrid,
    toggleGrid,
    toggleSnap,
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty,
    isSaving,
    isPublishing,
    lastSavedAt,
  } = useEditorStore();

  const handleNameClick = useCallback(() => {
    setNameValue(roomName);
    setEditingName(true);
  }, [roomName]);

  const handleNameBlur = useCallback(() => {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== roomName) {
      setRoomName(trimmed);
    }
    setEditingName(false);
  }, [nameValue, roomName, setRoomName]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleNameBlur();
      } else if (e.key === 'Escape') {
        setEditingName(false);
      }
    },
    [handleNameBlur],
  );

  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className="flex h-12 items-center justify-between border-b border-border bg-surface px-3">
      {/* Left: Back + Room name */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => router.push('/settings/room-layouts')}
          className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Back to Room Layouts"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        {editingName ? (
          <input
            type="text"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={handleNameKeyDown}
            autoFocus
            className="rounded border border-indigo-500/30 px-2 py-0.5 text-sm font-medium text-foreground focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        ) : (
          <button
            onClick={handleNameClick}
            className="rounded px-2 py-0.5 text-sm font-medium text-foreground hover:bg-accent"
            title="Click to rename"
          >
            {roomName}
          </button>
        )}

        {/* Mode selector */}
        {modes && modes.length > 0 && onModeChange && (
          <>
            <div className="mx-1 h-5 w-px bg-muted" />
            <select
              value={currentMode ?? ''}
              onChange={(e) => onModeChange(e.target.value)}
              className="rounded border border-border bg-transparent px-2 py-0.5 text-xs font-medium text-muted-foreground focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 focus:outline-none"
              title="Room mode"
            >
              {modes.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            {onManageModes && (
              <button
                onClick={onManageModes}
                className="text-[10px] text-indigo-500 hover:text-indigo-400"
              >
                Manage
              </button>
            )}
          </>
        )}
      </div>

      {/* Center: Undo/Redo + Zoom */}
      <div className="flex items-center gap-1">
        <button
          onClick={undo}
          disabled={!canUndo()}
          className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo()}
          className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="h-4 w-4" />
        </button>

        <div className="mx-2 h-5 w-px bg-muted" />

        <button
          onClick={zoomOut}
          className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Zoom Out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="w-12 text-center text-xs font-medium text-muted-foreground tabular-nums">
          {zoomPercent}%
        </span>
        <button
          onClick={zoomIn}
          className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Zoom In"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={zoomToFit}
          className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Zoom to Fit"
        >
          <Maximize className="h-4 w-4" />
        </button>
      </div>

      {/* Right: Grid/Snap + Save/Publish */}
      <div className="flex items-center gap-1">
        <button
          onClick={toggleGrid}
          className={`rounded p-1.5 transition-colors ${
            showGrid
              ? 'bg-indigo-500/10 text-indigo-600'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
          title={showGrid ? 'Hide Grid' : 'Show Grid'}
        >
          <Grid3X3 className="h-4 w-4" />
        </button>
        <button
          onClick={toggleSnap}
          className={`rounded p-1.5 transition-colors ${
            snapToGrid
              ? 'bg-indigo-500/10 text-indigo-600'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
          title={snapToGrid ? 'Disable Snap' : 'Enable Snap'}
        >
          <Magnet className="h-4 w-4" />
        </button>

        <div className="mx-2 h-5 w-px bg-muted" />

        {onSaveAsTemplate && (
          <button
            onClick={onSaveAsTemplate}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Save as Template"
          >
            <BookmarkPlus className="h-4 w-4" />
          </button>
        )}
        {onApplyTemplate && (
          <button
            onClick={onApplyTemplate}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Apply Template"
          >
            <LayoutTemplate className="h-4 w-4" />
          </button>
        )}
        {onExportPNG && (
          <button
            onClick={onExportPNG}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Export as PNG"
          >
            <Image className="h-4 w-4" />
          </button>
        )}
        {onExportJSON && (
          <button
            onClick={onExportJSON}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Export as JSON"
          >
            <FileJson className="h-4 w-4" />
          </button>
        )}
        {onOpenHistory && (
          <button
            onClick={onOpenHistory}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Version History (Ctrl+H)"
          >
            <Clock className="h-4 w-4" />
          </button>
        )}

        {lastSavedAt && !isDirty && !isSaving && (
          <span className="mr-2 text-xs text-green-500">Saved</span>
        )}

        <button
          onClick={onSave}
          disabled={isSaving || !isDirty}
          className={`inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors ${
            isSaving || !isDirty
              ? 'cursor-not-allowed opacity-50 text-muted-foreground'
              : 'text-foreground hover:bg-accent'
          }`}
        >
          <Save className="h-3.5 w-3.5" />
          {isSaving ? 'Saving...' : 'Save Draft'}
        </button>

        <button
          onClick={onPublish}
          disabled={isPublishing}
          className={`inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 ${
            isPublishing ? 'cursor-not-allowed opacity-50' : ''
          }`}
        >
          <Upload className="h-3.5 w-3.5" />
          {isPublishing ? 'Publishing...' : 'Publish'}
        </button>
      </div>
    </div>
  );
}
