'use client';

import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';

interface ConflictModalProps {
  open: boolean;
  onRefresh: () => void;
  onForceOverwrite: () => void;
  onCancel: () => void;
  message?: string;
}

export function ConflictModal({
  open,
  onRefresh,
  onForceOverwrite,
  onCancel,
  message,
}: ConflictModalProps) {
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 'var(--fnb-z-modal, 50)' }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        onClick={onCancel}
        onKeyDown={() => {}}
        role="presentation"
      />
      {/* Panel */}
      <div
        className="relative rounded-xl border p-6 w-[380px] max-w-[90vw]"
        style={{
          backgroundColor: 'var(--fnb-bg-surface)',
          borderColor: 'var(--fnb-status-check-presented)',
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="flex items-center justify-center rounded-full h-10 w-10 shrink-0"
            style={{ backgroundColor: 'color-mix(in srgb, var(--fnb-status-check-presented) 15%, transparent)' }}
          >
            <AlertTriangle className="h-5 w-5" style={{ color: 'var(--fnb-status-check-presented)' }} />
          </div>
          <div>
            <h3 className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
              Conflict Detected
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--fnb-text-muted)' }}>
              {message ?? 'This record was modified by another user while you were editing.'}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-bold text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: 'var(--fnb-status-seated)' }}
          >
            Refresh &amp; Keep Latest
          </button>
          <button
            type="button"
            onClick={onForceOverwrite}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-bold transition-colors hover:opacity-80"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--fnb-status-dirty) 15%, transparent)',
              color: 'var(--fnb-status-dirty)',
            }}
          >
            Overwrite with My Changes
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-bold transition-colors hover:opacity-80"
            style={{
              backgroundColor: 'var(--fnb-bg-elevated)',
              color: 'var(--fnb-text-secondary)',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
