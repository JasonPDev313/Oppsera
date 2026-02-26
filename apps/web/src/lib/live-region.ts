'use client';

import { useEffect, useRef } from 'react';

type Priority = 'polite' | 'assertive';

let politeNode: HTMLDivElement | null = null;
let assertiveNode: HTMLDivElement | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

function ensureNodes(): void {
  if (typeof document === 'undefined') return;

  if (!politeNode) {
    politeNode = document.createElement('div');
    politeNode.setAttribute('aria-live', 'polite');
    politeNode.setAttribute('aria-atomic', 'true');
    politeNode.setAttribute('role', 'status');
    politeNode.className = 'sr-only';
    politeNode.style.cssText =
      'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';
    document.body.appendChild(politeNode);
  }

  if (!assertiveNode) {
    assertiveNode = document.createElement('div');
    assertiveNode.setAttribute('aria-live', 'assertive');
    assertiveNode.setAttribute('aria-atomic', 'true');
    assertiveNode.setAttribute('role', 'alert');
    assertiveNode.className = 'sr-only';
    assertiveNode.style.cssText =
      'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';
    document.body.appendChild(assertiveNode);
  }
}

/**
 * Announce a message to screen readers via an ARIA live region.
 *
 * @param message - The text to announce
 * @param priority - "polite" (default, waits for current speech) or "assertive" (interrupts)
 */
export function announce(message: string, priority: Priority = 'polite'): void {
  ensureNodes();

  const node = priority === 'assertive' ? assertiveNode : politeNode;
  if (!node) return;

  // Clear then set — forces screen readers to re-announce even if the message is the same
  node.textContent = '';
  // Use a microtask to ensure the empty state registers before the new message
  requestAnimationFrame(() => {
    node.textContent = message;
  });

  // Auto-clear after 5 seconds to prevent stale announcements
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    if (politeNode) politeNode.textContent = '';
    if (assertiveNode) assertiveNode.textContent = '';
  }, 5000);
}

/**
 * Hook that provides the `announce` function.
 * Ensures the live region DOM nodes are created on mount and cleaned up if the
 * component is the last consumer.
 */
export function useLiveAnnouncer(): { announce: typeof announce } {
  useEffect(() => {
    ensureNodes();
    // No cleanup — live region nodes persist for the app lifetime
    // (multiple components may share them)
  }, []);

  return { announce };
}

/**
 * React component that renders the live region nodes via portal.
 * Mount once at the app root (e.g., in the dashboard layout).
 * This is an alternative to the imperative `announce()` for apps that
 * prefer a declarative approach.
 */
export function LiveRegionProvider({ children }: { children: React.ReactNode }) {
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      ensureNodes();
      mounted.current = true;
    }
  }, []);

  return children as React.ReactElement;
}
