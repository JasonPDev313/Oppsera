'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Undo2, X } from 'lucide-react';

interface UndoBannerProps {
  message: string;
  durationMs?: number;
  onUndo: () => Promise<void>;
  onDismiss: () => void;
}

export function UndoBanner({ message, durationMs = 10000, onUndo, onDismiss }: UndoBannerProps) {
  const [remaining, setRemaining] = useState(durationMs);
  const [undoing, setUndoing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 100) {
          clearInterval(timerRef.current);
          onDismiss();
          return 0;
        }
        return prev - 100;
      });
    }, 100);
    return () => clearInterval(timerRef.current);
  }, [durationMs, onDismiss]);

  const handleUndo = useCallback(async () => {
    clearInterval(timerRef.current);
    setUndoing(true);
    try {
      await onUndo();
    } finally {
      onDismiss();
    }
  }, [onUndo, onDismiss]);

  const progress = remaining / durationMs;

  return createPortal(
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 rounded-lg px-4 py-3 shadow-xl min-w-[320px] max-w-[480px]"
      style={{
        background: 'var(--fnb-bg-elevated)',
        border: '1px solid var(--fnb-border-subtle)',
      }}
    >
      {/* Progress bar */}
      <div
        className="absolute bottom-0 left-0 h-0.5 rounded-b-lg transition-all"
        style={{
          width: `${progress * 100}%`,
          background: 'var(--fnb-accent-primary)',
        }}
      />

      <span className="text-sm flex-1" style={{ color: 'var(--fnb-text-primary)' }}>
        {message}
      </span>

      <button
        onClick={handleUndo}
        disabled={undoing}
        className="flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium transition-colors"
        style={{
          background: 'var(--fnb-accent-primary)',
          color: '#fff',
          opacity: undoing ? 0.6 : 1,
        }}
      >
        <Undo2 size={14} />
        {undoing ? 'Undoing...' : 'Undo'}
      </button>

      <button
        onClick={() => {
          clearInterval(timerRef.current);
          onDismiss();
        }}
        className="p-1 rounded transition-colors"
        style={{ color: 'var(--fnb-text-muted)' }}
      >
        <X size={16} />
      </button>
    </div>,
    document.body,
  );
}
