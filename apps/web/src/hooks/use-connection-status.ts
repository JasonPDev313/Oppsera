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

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    checkConnection();

    // Periodic health ping
    intervalRef.current = setInterval(checkConnection, PING_INTERVAL_MS);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkConnection]);

  return state;
}
