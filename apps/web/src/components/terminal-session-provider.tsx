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

interface TerminalSessionContextValue {
  session: TerminalSession | null;
  isLoading: boolean;
  setSession: (session: TerminalSession) => void;
  clearSession: () => void;
}

const TerminalSessionContext = createContext<TerminalSessionContextValue | null>(null);

const STORAGE_KEY = 'oppsera:terminal-session';

export function TerminalSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<TerminalSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load from localStorage on mount (safe for SSR)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSessionState(JSON.parse(stored));
      }
    } catch {
      /* ignore parse errors */
    }
    setIsLoading(false);
  }, []);

  const setSession = useCallback((s: TerminalSession) => {
    setSessionState(s);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }, []);

  const clearSession = useCallback(() => {
    setSessionState(null);
    localStorage.removeItem(STORAGE_KEY);
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
