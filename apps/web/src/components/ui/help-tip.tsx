'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X } from 'lucide-react';

type Placement = 'right' | 'left' | 'top' | 'bottom';

interface HelpTipProps {
  /** localStorage key — one per tip, never shared */
  storageKey: string;
  /** Bold heading (1 line) */
  title: string;
  /** Body text (1-2 sentences) */
  description: string;
  /** Popover side relative to the ? trigger */
  placement?: Placement;
  /** aria-label for the trigger button */
  ariaLabel?: string;
}

const GAP = 8; // px between trigger and popover

function computePosition(rect: DOMRect, placement: Placement) {
  switch (placement) {
    case 'right':
      return { top: rect.top + rect.height / 2, left: rect.right + GAP, transform: 'translateY(-50%)' };
    case 'left':
      return { top: rect.top + rect.height / 2, left: rect.left - GAP, transform: 'translate(-100%, -50%)' };
    case 'top':
      return { top: rect.top - GAP, left: rect.left + rect.width / 2, transform: 'translate(-50%, -100%)' };
    case 'bottom':
      return { top: rect.bottom + GAP, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' };
  }
}

/** Arrow CSS per placement */
function arrowClasses(placement: Placement) {
  switch (placement) {
    case 'right':
      return { position: 'absolute top-1/2 right-full -translate-y-1/2', margin: { marginRight: '-4px' }, border: 'border-b border-l' };
    case 'left':
      return { position: 'absolute top-1/2 left-full -translate-y-1/2', margin: { marginLeft: '-4px' }, border: 'border-t border-r' };
    case 'top':
      return { position: 'absolute left-1/2 top-full -translate-x-1/2', margin: { marginTop: '-4px' }, border: 'border-b border-r' };
    case 'bottom':
      return { position: 'absolute left-1/2 bottom-full -translate-x-1/2', margin: { marginBottom: '-4px' }, border: 'border-t border-l' };
  }
}

export function HelpTip({ storageKey, title, description, placement = 'right', ariaLabel }: HelpTipProps) {
  const [open, setOpen] = useState(false);
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; transform: string } | null>(null);

  // Auto-open on first visit
  useEffect(() => {
    try {
      if (!localStorage.getItem(storageKey)) {
        setIsFirstVisit(true);
        setOpen(true);
      }
    } catch { /* ignore */ }
  }, [storageKey]);

  const updatePosition = useCallback(() => {
    if (!btnRef.current) return;
    setPos(computePosition(btnRef.current.getBoundingClientRect(), placement));
  }, [placement]);

  // Reposition on open + scroll/resize
  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  const markSeen = useCallback(() => {
    try { localStorage.setItem(storageKey, 'true'); } catch { /* ignore */ }
  }, [storageKey]);

  const dismiss = useCallback(() => {
    setOpen(false);
    setIsFirstVisit(false);
    markSeen();
  }, [markSeen]);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      if (prev) {
        markSeen();
        setIsFirstVisit(false);
        return false;
      }
      return true;
    });
  }, [markSeen]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        popoverRef.current && !popoverRef.current.contains(t) &&
        btnRef.current && !btnRef.current.contains(t)
      ) dismiss();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open, dismiss]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open, dismiss]);

  const arrow = arrowClasses(placement);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-foreground/40 transition-colors hover:text-foreground/70"
        style={isFirstVisit ? { animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) 3' } : undefined}
        aria-label={ariaLabel ?? `Help: ${title}`}
        title="How does this work?"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-50"
          style={{ top: pos.top, left: pos.left, transform: pos.transform }}
        >
          <div className="relative w-52 rounded-lg border border-border bg-surface p-3 shadow-lg">
            <button
              type="button"
              onClick={dismiss}
              className="absolute right-1.5 top-1.5 rounded p-0.5 text-foreground/40 hover:text-foreground transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <p className="pr-4 text-xs font-medium text-foreground">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-foreground/60">{description}</p>

            {/* Arrow */}
            <div className={arrow.position} style={arrow.margin}>
              <div className={`h-2 w-2 rotate-45 ${arrow.border} border-border bg-surface`} />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
