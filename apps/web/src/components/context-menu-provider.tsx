/**
 * Global Context Menu Control
 *
 * This system suppresses the browser's default context menu when users are
 * authenticated and replaces it with OppsEra-branded menus. This is purely
 * a UX/branding control — it is NOT a security mechanism. Users can still
 * access browser DevTools via F12, keyboard shortcuts, or browser settings.
 */
'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { useAuthContext } from '@/components/auth-provider';
import { ContextMenuPortal } from '@/components/ui/context-menu-portal';
import type { ContextMenuItem } from '@/components/ui/context-menu-portal';

// ── Context ──────────────────────────────────────────────────────────

interface ContextMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  items: ContextMenuItem[];
}

interface ContextMenuContextValue {
  show: (position: { x: number; y: number }, items: ContextMenuItem[]) => void;
  close: () => void;
}

const ContextMenuContext = createContext<ContextMenuContextValue | null>(null);

// ── Hook ─────────────────────────────────────────────────────────────

export function useContextMenu(): ContextMenuContextValue {
  const ctx = useContext(ContextMenuContext);
  if (!ctx) {
    throw new Error('useContextMenu must be used within a ContextMenuProvider');
  }
  return ctx;
}

// ── Provider ─────────────────────────────────────────────────────────

interface ContextMenuProviderProps {
  children: React.ReactNode;
  /** Allow the native browser context menu inside text inputs for copy/paste. Default: true */
  allowNativeInInputs?: boolean;
}

export function ContextMenuProvider({
  children,
  allowNativeInInputs = true,
}: ContextMenuProviderProps) {
  const { isAuthenticated } = useAuthContext();
  const [state, setState] = useState<ContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [],
  });

  // Refs for the capture-phase handler to read latest values without re-registering
  const authRef = useRef(isAuthenticated);
  const allowInputsRef = useRef(allowNativeInInputs);
  useEffect(() => {
    authRef.current = isAuthenticated;
  }, [isAuthenticated]);
  useEffect(() => {
    allowInputsRef.current = allowNativeInInputs;
  }, [allowNativeInInputs]);

  // ── Global Suppression Layer ─────────────────────────────────────
  // Capture-phase listener blocks the browser context menu everywhere.
  // Does NOT call stopPropagation — existing component-level handlers
  // (RegisterTabs, ItemButton) still receive the event and show their
  // own menus as before.
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!authRef.current) return;

      const target = e.target as HTMLElement;

      // Allow components with their own context menu handlers to receive the event
      if (target.closest('[data-contextmenu]')) return;

      if (allowInputsRef.current) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('[contenteditable="true"]')
        ) {
          return;
        }
      }

      e.preventDefault();
    }

    document.addEventListener('contextmenu', handler, true);
    return () => document.removeEventListener('contextmenu', handler, true);
  }, []);

  // ── Context API ──────────────────────────────────────────────────

  const show = useCallback(
    (position: { x: number; y: number }, items: ContextMenuItem[]) => {
      setState({ isOpen: true, position, items });
    },
    [],
  );

  const close = useCallback(() => {
    setState((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
  }, []);

  return (
    <ContextMenuContext.Provider value={{ show, close }}>
      {children}
      {state.isOpen && (
        <ContextMenuPortal
          position={state.position}
          items={state.items}
          onClose={close}
        />
      )}
    </ContextMenuContext.Provider>
  );
}

// ── ContextMenuArea ──────────────────────────────────────────────────
// Wrapper component for declaring context menus on any region.
// Wrap children and provide menu items — the right-click event is handled
// automatically without per-component listeners.

interface ContextMenuAreaProps {
  children: React.ReactNode;
  /** Static array or function returning items (for dynamic menus). */
  items: ContextMenuItem[] | ((e: React.MouseEvent) => ContextMenuItem[]);
  /** When true, right-click passes through to the browser/global layer. */
  disabled?: boolean;
}

export function ContextMenuArea({ children, items, disabled }: ContextMenuAreaProps) {
  const { show } = useContextMenu();

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      const resolved = typeof items === 'function' ? items(e) : items;
      show({ x: e.clientX, y: e.clientY }, resolved);
    },
    [items, disabled, show],
  );

  return <div onContextMenu={handleContextMenu}>{children}</div>;
}

// Re-export ContextMenuItem type for consumers
export type { ContextMenuItem } from '@/components/ui/context-menu-portal';
