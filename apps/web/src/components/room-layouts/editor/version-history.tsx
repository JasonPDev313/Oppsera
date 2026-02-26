'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Clock, RotateCcw } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

interface VersionEntry {
  id: string;
  versionNumber: number;
  status: string;
  publishNote: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
  objectCount: number;
  totalCapacity: number;
}

interface VersionHistoryProps {
  roomId: string;
  open: boolean;
  onClose: () => void;
  onRevert: (versionId: string, versionNumber: number) => void;
}

export function VersionHistory({ roomId, open, onClose, onRevert }: VersionHistoryProps) {
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [confirmRevert, setConfirmRevert] = useState<{ id: string; number: number } | null>(null);

  const fetchVersions = useCallback(async (reset = false) => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (!reset && cursor) params.set('cursor', cursor);
      const res = await apiFetch<{
        data: VersionEntry[];
        meta: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/room-layouts/${roomId}/versions?${params}`);
      if (reset) {
        setVersions(res.data);
      } else {
        setVersions((prev) => [...prev, ...res.data]);
      }
      setCursor(res.meta.cursor);
      setHasMore(res.meta.hasMore);
    } catch {
      // Silently handle
    } finally {
      setIsLoading(false);
    }
  }, [roomId, cursor]);

  useEffect(() => {
    if (open) {
      setCursor(null);
      fetchVersions(true);
    }
  }, [open]); // eslint-disable-line

  const handleRevertConfirm = () => {
    if (confirmRevert) {
      onRevert(confirmRevert.id, confirmRevert.number);
      setConfirmRevert(null);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 flex w-96 flex-col bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Version History</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Version List */}
        <div className="flex-1 overflow-y-auto p-3">
          {versions.length === 0 && !isLoading && (
            <p className="py-8 text-center text-sm text-muted-foreground">No published versions yet</p>
          )}
          <div className="space-y-2">
            {versions.map((v) => (
              <div
                key={v.id}
                className="rounded-lg border border-border p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      v{v.versionNumber}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      v.status === 'published'
                        ? 'bg-green-500/15 text-green-500'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {v.status}
                    </span>
                  </div>
                  <button
                    onClick={() => setConfirmRevert({ id: v.id, number: v.versionNumber })}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                    title="Revert to this version"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Revert
                  </button>
                </div>
                {v.publishNote && (
                  <p className="mt-1 text-xs text-muted-foreground">{v.publishNote}</p>
                )}
                <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                  <span>{v.objectCount} objects</span>
                  <span>{v.totalCapacity} seats</span>
                  {v.publishedAt && (
                    <span>{new Date(v.publishedAt).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {hasMore && (
            <button
              onClick={() => fetchVersions(false)}
              disabled={isLoading}
              className="mt-3 w-full rounded bg-muted py-2 text-xs text-muted-foreground hover:bg-accent"
            >
              {isLoading ? 'Loading...' : 'Load More'}
            </button>
          )}
          {isLoading && versions.length === 0 && (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-indigo-600" />
            </div>
          )}
        </div>
      </div>

      {/* Revert Confirmation */}
      {confirmRevert && (
        <div className="fixed inset-0 z-60 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmRevert(null)} />
          <div className="relative z-10 w-96 rounded-lg bg-surface p-6 shadow-xl">
            <h3 className="text-sm font-semibold text-foreground">
              Revert to Version {confirmRevert.number}?
            </h3>
            <p className="mt-2 text-xs text-muted-foreground">
              This will create a new draft from Version {confirmRevert.number}. Your current draft will be overwritten.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmRevert(null)}
                className="rounded px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleRevertConfirm}
                className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500"
              >
                Revert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
