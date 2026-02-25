'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export type ConnectionStatus = 'online' | 'slow' | 'offline';

interface ConnectionState {
  status: ConnectionStatus;
  latencyMs: number | null;
}

const PING_INTERVAL_MS = 30_000;
const SLOW_THRESHOLD_MS = 2000;

export function useConnectionStatus(): ConnectionState {
  const [state, setState] = useState<ConnectionState>({
    status: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online',
    latencyMs: null,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const checkConnection = useCallback(async () => {
    if (!navigator.onLine) {
      setState({ status: 'offline', latencyMs: null });
      return;
    }

    try {
      const start = performance.now();
      await fetch('/api/health', { method: 'HEAD', cache: 'no-store' });
      const latencyMs = Math.round(performance.now() - start);
      setState({
        status: latencyMs > SLOW_THRESHOLD_MS ? 'slow' : 'online',
        latencyMs,
      });
    } catch {
      setState({ status: 'offline', latencyMs: null });
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setState((prev) => ({ ...prev, status: 'online' }));
      checkConnection();
    };
    const handleOffline = () => {
      setState({ status: 'offline', latencyMs: null });
    };

    const startPing = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(checkConnection, PING_INTERVAL_MS);
    };

    const stopPing = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
      }
    };

    // Pause health pings when tab is hidden, resume when visible
    const handleVisibility = () => {
      if (document.hidden) {
        stopPing();
      } else {
        checkConnection(); // one immediate check on resume
        startPing();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);

    // Initial check + start periodic pings
    checkConnection();
    startPing();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
      stopPing();
    };
  }, [checkConnection]);

  return state;
}
