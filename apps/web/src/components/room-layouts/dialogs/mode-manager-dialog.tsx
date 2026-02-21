'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Star, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import {
  listRoomModesApi,
  createModeApi,
  deleteModeApi,
  setDefaultModeApi,
  type RoomModeInfo,
} from '@/hooks/use-room-layouts';

interface ModeManagerDialogProps {
  roomId: string;
  currentMode: string;
  onClose: () => void;
  onModeChanged: (modeName: string) => void;
}

export function ModeManagerDialog({
  roomId,
  currentMode,
  onClose,
  onModeChanged,
}: ModeManagerDialogProps) {
  const { toast } = useToast();
  const [modes, setModes] = useState<RoomModeInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newModeName, setNewModeName] = useState('');
  const [copyFrom, setCopyFrom] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchModes = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await listRoomModesApi(roomId);
      setModes(res.data);
    } catch {
      toast.error('Failed to load modes');
    } finally {
      setIsLoading(false);
    }
  }, [roomId, toast]);

  useEffect(() => {
    fetchModes();
  }, [fetchModes]);

  const handleAddMode = useCallback(async () => {
    if (!newModeName.trim()) return;
    setIsSubmitting(true);
    try {
      await createModeApi(roomId, newModeName.trim(), copyFrom || undefined);
      toast.success(`Mode "${newModeName.trim()}" created`);
      setNewModeName('');
      setCopyFrom('');
      setShowAdd(false);
      fetchModes();
    } catch {
      toast.error('Failed to create mode');
    } finally {
      setIsSubmitting(false);
    }
  }, [roomId, newModeName, copyFrom, toast, fetchModes]);

  const handleDeleteMode = useCallback(
    async (modeName: string) => {
      if (!confirm(`Delete mode "${modeName}"? This will archive all its versions.`)) return;
      try {
        await deleteModeApi(roomId, modeName);
        toast.success(`Mode "${modeName}" deleted`);
        fetchModes();
        if (currentMode === modeName) {
          const defaultMode = modes.find((m) => m.isDefault && m.name !== modeName);
          if (defaultMode) onModeChanged(defaultMode.name);
        }
      } catch {
        toast.error('Failed to delete mode');
      }
    },
    [roomId, toast, fetchModes, currentMode, modes, onModeChanged],
  );

  const handleSetDefault = useCallback(
    async (modeName: string) => {
      try {
        await setDefaultModeApi(roomId, modeName);
        toast.success(`"${modeName}" set as default`);
        fetchModes();
      } catch {
        toast.error('Failed to set default mode');
      }
    },
    [roomId, toast, fetchModes],
  );

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Room Modes</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-200/50">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-4 text-sm text-gray-500">
          Modes let you save different layouts for the same room (e.g., Lunch, Dinner, Event).
        </p>

        {/* Mode list */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {modes.map((mode) => (
              <div
                key={mode.name}
                className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${
                  mode.name === currentMode
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-gray-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onModeChanged(mode.name)}
                    className="text-sm font-medium text-gray-900 hover:text-indigo-600"
                  >
                    {mode.name}
                  </button>
                  {mode.isDefault && (
                    <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] font-medium text-yellow-700">
                      Default
                    </span>
                  )}
                  {mode.hasPublished && (
                    <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                      Published
                    </span>
                  )}
                  {mode.hasDraft && !mode.hasPublished && (
                    <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] font-medium text-yellow-600">
                      Draft
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {!mode.isDefault && (
                    <button
                      onClick={() => handleSetDefault(mode.name)}
                      className="rounded p-1 text-gray-400 hover:bg-gray-200/50 hover:text-yellow-600"
                      title="Set as default"
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {modes.length > 1 && (
                    <button
                      onClick={() => handleDeleteMode(mode.name)}
                      className="rounded p-1 text-gray-400 hover:bg-red-500/10 hover:text-red-600"
                      title="Delete mode"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add mode */}
        {showAdd ? (
          <div className="mt-4 space-y-3 rounded-lg border border-gray-200 p-3">
            <input
              type="text"
              value={newModeName}
              onChange={(e) => setNewModeName(e.target.value)}
              placeholder="Mode name (e.g., Event)"
              className="w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              autoFocus
            />
            {modes.length > 0 && (
              <select
                value={copyFrom}
                onChange={(e) => setCopyFrom(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="">Start with blank canvas</option>
                {modes.map((m) => (
                  <option key={m.name} value={m.name}>
                    Copy from &ldquo;{m.name}&rdquo;
                  </option>
                ))}
              </select>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAdd(false)}
                className="rounded-md px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-200/50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddMode}
                disabled={isSubmitting || !newModeName.trim()}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? 'Creating...' : 'Add Mode'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 py-2.5 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-600"
          >
            <Plus className="h-4 w-4" />
            Add Mode
          </button>
        )}

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200/50"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
