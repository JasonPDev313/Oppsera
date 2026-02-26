'use client';

import { useEffect, useCallback } from 'react';
import { useFocusTrap } from './focus-trap';

export interface DialogA11yOptions {
  /** ID of the element that labels the dialog (the heading). */
  labelledBy?: string;
  /** ID of the element that describes the dialog (optional description). */
  describedBy?: string;
  /** Called when the user presses Escape. */
  onClose: () => void;
  /** Use "alertdialog" for destructive confirmations. Default: "dialog". */
  role?: 'dialog' | 'alertdialog';
}

/**
 * Makes a portal-based dialog accessible.
 *
 * - Sets `role`, `aria-modal`, `aria-labelledby`, `aria-describedby` on the ref element
 * - Activates focus trapping (via useFocusTrap)
 * - Handles Escape key to close
 * - Sets `aria-hidden="true"` on document.body's direct children that are NOT the dialog portal
 */
export function useDialogA11y(
  ref: React.RefObject<HTMLElement | null>,
  isOpen: boolean,
  options: DialogA11yOptions
): void {
  const { labelledBy, describedBy, onClose, role = 'dialog' } = options;

  // Activate focus trap
  useFocusTrap(ref, isOpen);

  // Set ARIA attributes on the dialog element
  useEffect(() => {
    const el = ref.current;
    if (!isOpen || !el) return;

    el.setAttribute('role', role);
    el.setAttribute('aria-modal', 'true');
    if (labelledBy) el.setAttribute('aria-labelledby', labelledBy);
    if (describedBy) el.setAttribute('aria-describedby', describedBy);

    return () => {
      el.removeAttribute('role');
      el.removeAttribute('aria-modal');
      el.removeAttribute('aria-labelledby');
      el.removeAttribute('aria-describedby');
    };
  }, [isOpen, ref, labelledBy, describedBy, role]);

  // Escape key handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  // Hide sibling elements from screen readers (inert tree)
  useEffect(() => {
    if (!isOpen) return;

    const hiddenSiblings: Element[] = [];
    const bodyChildren = document.body.children;

    for (let i = 0; i < bodyChildren.length; i++) {
      const child = bodyChildren[i]!;
      // Skip the portal container (the dialog's parent in the DOM)
      if (ref.current && child.contains(ref.current)) continue;
      // Skip elements already hidden
      if (child.getAttribute('aria-hidden') === 'true') continue;

      child.setAttribute('aria-hidden', 'true');
      hiddenSiblings.push(child);
    }

    return () => {
      for (const el of hiddenSiblings) {
        el.removeAttribute('aria-hidden');
      }
    };
  }, [isOpen, ref]);
}
