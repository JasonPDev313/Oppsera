'use client';

import { memo, useEffect, useCallback, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface POSSlidePanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: number;
  children: React.ReactNode;
}

export const POSSlidePanel = memo(function POSSlidePanel({
  open,
  onClose,
  title,
  width = 400,
  children,
}: POSSlidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 slide-panel-backdrop"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        ref={panelRef}
        className="relative flex h-full flex-col bg-surface shadow-2xl slide-panel-enter"
        style={{ width }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 id={titleId} className="text-base font-semibold text-foreground">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
});
