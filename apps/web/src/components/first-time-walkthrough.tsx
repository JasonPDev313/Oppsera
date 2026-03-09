'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X } from 'lucide-react';

const WALKTHROUGH_KEY = 'oppsera:walkthrough-completed';

/**
 * Inline help tooltip for the "Change Register" sidebar button.
 * - First visit: auto-opens with a pulsing `?` icon (3 cycles) to draw attention.
 * - After dismiss: `?` stays visible for on-demand help, no pulse.
 * - Popover portaled to document.body, positioned to the right of the `?` button
 *   with a leftward arrow, so it never clips inside the narrow sidebar.
 * - Closes on outside click or Escape.
 */
export function RegisterHelpTip() {
  const [open, setOpen] = useState(false);
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    try {
      const completed = localStorage.getItem(WALKTHROUGH_KEY);
      if (!completed) {
        setIsFirstVisit(true);
        setOpen(true);
      }
    } catch { /* ignore */ }
  }, []);

  // Compute portal position from button bounding rect
  const updatePosition = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({
      top: rect.top + rect.height / 2,
      left: rect.right + 8,
    });
  }, []);

  // Reposition on open and on scroll/resize
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

  const dismiss = useCallback(() => {
    setOpen(false);
    setIsFirstVisit(false);
    try { localStorage.setItem(WALKTHROUGH_KEY, 'true'); } catch { /* ignore */ }
  }, []);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      if (prev) {
        // Closing — mark as seen
        try { localStorage.setItem(WALKTHROUGH_KEY, 'true'); } catch { /* ignore */ }
        setIsFirstVisit(false);
        return false;
      }
      return true;
    });
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current && !popoverRef.current.contains(target) &&
        btnRef.current && !btnRef.current.contains(target)
      ) {
        dismiss();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, dismiss]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, dismiss]);

  return (
    <>
      {/* ? button */}
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-foreground/40 transition-colors hover:text-foreground/70"
        style={isFirstVisit ? { animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) 3' } : undefined}
        aria-label="Help: how to change register"
        title="How does this work?"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>

      {/* Portaled popover — appears to the right of the ? button with a left-pointing arrow */}
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-50"
          style={{ top: pos.top, left: pos.left, transform: 'translateY(-50%)' }}
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
            <p className="pr-4 text-xs font-medium text-foreground">
              Switch registers
            </p>
            <p className="mt-1 text-xs leading-relaxed text-foreground/60">
              Pick a different register without logging out. Your current selection is remembered for next time.
            </p>

            {/* Left-pointing arrow */}
            <div
              className="absolute top-1/2 right-full -translate-y-1/2"
              style={{ marginRight: '-4px' }}
            >
              <div className="h-2 w-2 rotate-45 border-b border-l border-border bg-surface" />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
