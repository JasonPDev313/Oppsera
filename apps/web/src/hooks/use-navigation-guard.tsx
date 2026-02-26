'use client';

import {
  createContext,
  useContext,
  useCallback,
  useRef,
  useState,
  useEffect,
  type ReactNode,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────

interface GuardRegistration {
  /** Called to check if there are unsaved changes. */
  isDirty: () => boolean;
  /** Called when the user picks "Save & Leave". Return true if save succeeded. */
  onSave: () => Promise<boolean>;
}

interface PendingNavigation {
  href: string;
  /** Extra callback to run after navigation (e.g. close mobile sidebar). */
  onAllowed?: () => void;
}

interface NavigationGuardContextValue {
  /** Register a guard. Returns an unregister function. */
  setGuard: (guard: GuardRegistration) => () => void;
  /** onClick handler for Link components — shows modal if dirty. */
  guardedClick: (e: MouseEvent, onAllowed?: () => void) => void;
  /** Programmatic navigation — shows modal if dirty. */
  guardedNavigate: (href: string) => void;
}

const NavigationGuardContext = createContext<NavigationGuardContextValue | null>(null);

// ── Provider ────────────────────────────────────────────────────

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const guardsRef = useRef<Set<GuardRegistration>>(new Set());
  const [pending, setPending] = useState<PendingNavigation | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Ref mirrors pending state — used by handlers to avoid stale-closure issues
  const pendingRef = useRef<PendingNavigation | null>(null);

  const getDirtyGuard = useCallback((): GuardRegistration | null => {
    for (const guard of guardsRef.current) {
      if (guard.isDirty()) return guard;
    }
    return null;
  }, []);

  const setGuard = useCallback((guard: GuardRegistration) => {
    guardsRef.current.add(guard);
    return () => {
      guardsRef.current.delete(guard);
    };
  }, []);

  const navigate = useCallback(
    (href: string, onAllowed?: () => void) => {
      onAllowed?.();
      router.push(href);
    },
    [router],
  );

  const guardedClick = useCallback(
    (e: MouseEvent, onAllowed?: () => void) => {
      const dirty = getDirtyGuard();
      if (!dirty) {
        onAllowed?.();
        return; // allow normal Link navigation
      }
      e.preventDefault();
      const anchor = (e.target as HTMLElement).closest('a');
      const href = anchor?.getAttribute('href') ?? '/';
      const nav = { href, onAllowed };
      pendingRef.current = nav;
      setPending(nav);
    },
    [getDirtyGuard],
  );

  const guardedNavigate = useCallback(
    (href: string) => {
      const dirty = getDirtyGuard();
      if (!dirty) {
        router.push(href);
        return;
      }
      const nav = { href };
      pendingRef.current = nav;
      setPending(nav);
    },
    [getDirtyGuard, router],
  );

  // ── Modal actions ───────────────────────────────────────────

  const handleStay = useCallback(() => {
    pendingRef.current = null;
    setPending(null);
    setIsSaving(false);
  }, []);

  const handleLeave = useCallback(() => {
    const nav = pendingRef.current;
    if (!nav) return;
    pendingRef.current = null;
    setPending(null);
    navigate(nav.href, nav.onAllowed);
  }, [navigate]);

  const handleSaveAndLeave = useCallback(async () => {
    const nav = pendingRef.current;
    if (!nav) return;
    const dirty = getDirtyGuard();
    if (!dirty) {
      pendingRef.current = null;
      setPending(null);
      navigate(nav.href, nav.onAllowed);
      return;
    }
    setIsSaving(true);
    try {
      const saved = await dirty.onSave();
      if (saved) {
        pendingRef.current = null;
        setPending(null);
        navigate(nav.href, nav.onAllowed);
      }
    } finally {
      setIsSaving(false);
    }
  }, [getDirtyGuard, navigate]);

  // Close on Escape
  useEffect(() => {
    if (!pending) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleStay();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [pending, handleStay]);

  return (
    <NavigationGuardContext.Provider value={{ setGuard, guardedClick, guardedNavigate }}>
      {children}
      {pending && typeof document !== 'undefined' && (
        <UnsavedChangesModal
          isSaving={isSaving}
          onStay={handleStay}
          onLeave={handleLeave}
          onSaveAndLeave={handleSaveAndLeave}
        />
      )}
    </NavigationGuardContext.Provider>
  );
}

// ── Hook ────────────────────────────────────────────────────────

export function useNavigationGuard() {
  const ctx = useContext(NavigationGuardContext);
  if (!ctx) {
    throw new Error('useNavigationGuard must be used within NavigationGuardProvider');
  }
  return ctx;
}

// ── Custom modal ────────────────────────────────────────────────

function UnsavedChangesModal({
  isSaving,
  onStay,
  onLeave,
  onSaveAndLeave,
}: {
  isSaving: boolean;
  onStay: () => void;
  onLeave: () => void;
  onSaveAndLeave: () => void;
}) {
  const saveRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    saveRef.current?.focus();
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={onStay} />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Unsaved Changes
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              You have unsaved changes to this report. What would you like to do?
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3">
          {/* Stay */}
          <button
            type="button"
            onClick={onStay}
            disabled={isSaving}
            className="order-3 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none sm:order-1"
          >
            Stay on Page
          </button>

          {/* Leave without saving */}
          <button
            type="button"
            onClick={onLeave}
            disabled={isSaving}
            className="order-2 rounded-lg border border-red-500/30 px-4 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Leave Without Saving
          </button>

          {/* Save & Leave */}
          <button
            ref={saveRef}
            type="button"
            onClick={onSaveAndLeave}
            disabled={isSaving}
            className={`order-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none sm:order-3 ${
              isSaving ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            {isSaving ? 'Saving...' : 'Save & Leave'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
