'use client';

import { useEffect, useRef, useCallback } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** Stack of active focus traps — only the top-most trap handles Tab events. */
const trapStack: Array<{ id: symbol; ref: React.RefObject<HTMLElement | null> }> = [];

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
  );
}

/**
 * Traps keyboard focus within a container element.
 *
 * When active:
 * - Records the previously focused element
 * - Focuses the first focusable child (or `[data-autofocus]` if present)
 * - Wraps Tab / Shift+Tab within the container
 * - On deactivation, restores focus to the previously focused element
 *
 * Supports nested traps via a stack — only the innermost trap is active.
 */
export function useFocusTrap(
  ref: React.RefObject<HTMLElement | null>,
  isActive: boolean
): void {
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const trapId = useRef(Symbol('focus-trap'));

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      // Only the top-most trap handles Tab
      const top = trapStack[trapStack.length - 1];
      if (!top || top.id !== trapId.current) return;

      const container = ref.current;
      if (!container) return;

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey) {
        if (document.activeElement === first || !container.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last || !container.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [ref]
  );

  useEffect(() => {
    if (!isActive || !ref.current) return;

    // Save the currently focused element
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    // Push onto the trap stack
    const entry = { id: trapId.current, ref };
    trapStack.push(entry);

    // Focus the first focusable element (prefer [data-autofocus])
    const container = ref.current;
    const autoFocusTarget = container.querySelector<HTMLElement>('[data-autofocus]');
    if (autoFocusTarget) {
      autoFocusTarget.focus();
    } else {
      const focusable = getFocusableElements(container);
      if (focusable.length > 0) {
        focusable[0]!.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);

      // Remove from stack
      const idx = trapStack.findIndex((t) => t.id === entry.id);
      if (idx !== -1) trapStack.splice(idx, 1);

      // Restore focus
      if (previouslyFocused.current && typeof previouslyFocused.current.focus === 'function') {
        previouslyFocused.current.focus();
      }
    };
  }, [isActive, ref, handleKeyDown]);
}
