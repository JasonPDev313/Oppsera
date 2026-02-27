'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import type { TerminalSession } from '@oppsera/core/profit-centers';
import { apiFetch } from '@/lib/api-client';

interface TerminalSessionContextValue {
  session: TerminalSession | null;
  isLoading: boolean;
  setSession: (session: TerminalSession) => void;
  clearSession: () => void;
}

const TerminalSessionContext = createContext<TerminalSessionContextValue | null>(null);

const STORAGE_KEY = 'oppsera:terminal-session';

/**
 * Session-scoped confirmation flag (sessionStorage).
 * Set when user actively selects a terminal in the current browser session.
 * If this is missing, the TerminalSessionGate forces re-selection even if
 * localStorage has a terminal session from a previous browser session.
 * This prevents stale sessions from auto-auth (valid token + old localStorage).
 */
export const TERMINAL_CONFIRMED_KEY = 'oppsera:terminal-session-confirmed';

/**
 * Session-scoped skip flag (sessionStorage, NOT localStorage).
 * Only valid for the current browser session — closing the browser clears it.
 * This prevents the "skip once, bypass forever" bug that occurred when the
 * skip flag was persisted in localStorage across logins.
 */
export const TERMINAL_SKIP_KEY = 'oppsera:terminal-session-skipped';

/** All terminal session keys that should be cleared on login/logout. */
export const ALL_TERMINAL_KEYS = [STORAGE_KEY, TERMINAL_CONFIRMED_KEY, TERMINAL_SKIP_KEY] as const;

export function TerminalSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<TerminalSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load from localStorage on mount, but only trust it if confirmed this session
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const confirmed = sessionStorage.getItem(TERMINAL_CONFIRMED_KEY) === 'true';
      if (stored && confirmed) {
        setSessionState(JSON.parse(stored));
      }
      // If stored but NOT confirmed, we intentionally leave session as null.
      // The TerminalSessionGate will force the user to re-select.
    } catch {
      /* ignore parse errors */
    }
    setIsLoading(false);
  }, []);

  const setSession = useCallback((s: TerminalSession) => {
    setSessionState(s);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    // Mark as confirmed for this browser session
    sessionStorage.setItem(TERMINAL_CONFIRMED_KEY, 'true');
    // Clear the skip flag — user has a real session now
    sessionStorage.removeItem(TERMINAL_SKIP_KEY);

    // Fire-and-forget: stamp the terminal on the user's most recent login record
    apiFetch('/api/v1/login-records/stamp-terminal', {
      method: 'POST',
      body: JSON.stringify({
        terminalId: s.terminalId,
        terminalName: s.terminalName ?? null,
      }),
    }).catch(() => {});
  }, []);

  const clearSession = useCallback(() => {
    setSessionState(null);
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(TERMINAL_CONFIRMED_KEY);
  }, []);

  return (
    <TerminalSessionContext.Provider value={{ session, isLoading, setSession, clearSession }}>
      {children}
    </TerminalSessionContext.Provider>
  );
}

export function useTerminalSession() {
  const ctx = useContext(TerminalSessionContext);
  if (!ctx) throw new Error('useTerminalSession must be used within TerminalSessionProvider');
  return ctx;
}
