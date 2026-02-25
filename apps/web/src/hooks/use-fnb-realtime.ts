'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

// ── Realtime Polling Transport (V1) ──────────────────────────────
// V1: simple polling at configurable intervals
// V2: WebSocket upgrade (same API surface, swap transport)

type ChannelName =
  | 'floor'
  | 'tab'
  | 'kds'
  | 'expo'
  | 'dashboard'
  | 'guest_pay';

interface RealtimeOptions {
  /** Channels to subscribe to */
  channels: ChannelName[];
  /** Polling interval in ms per channel type */
  intervals?: Partial<Record<ChannelName, number>>;
  /** Master enable/disable */
  enabled?: boolean;
}

const DEFAULT_INTERVALS: Record<ChannelName, number> = {
  floor: 5000,
  tab: 5000,
  kds: 3000,
  expo: 3000,
  dashboard: 15000,
  guest_pay: 5000,
};

type RefreshCallback = () => void | Promise<void>;

const channelListeners = new Map<ChannelName, Set<RefreshCallback>>();

/** Register a refresh callback for a channel */
export function onChannelRefresh(channel: ChannelName, callback: RefreshCallback) {
  if (!channelListeners.has(channel)) {
    channelListeners.set(channel, new Set());
  }
  channelListeners.get(channel)!.add(callback);
  return () => {
    channelListeners.get(channel)?.delete(callback);
  };
}

/** Notify all listeners on a channel */
function notifyChannel(channel: ChannelName) {
  const listeners = channelListeners.get(channel);
  if (!listeners) return;
  for (const cb of listeners) {
    try {
      cb();
    } catch {
      // ignore listener errors
    }
  }
}

export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline';

export function useFnbRealtime({
  channels,
  intervals,
  enabled = true,
}: RealtimeOptions) {
  const [status, setStatus] = useState<ConnectionStatus>('connected');
  const timersRef = useRef<Map<ChannelName, ReturnType<typeof setInterval>>>(new Map());

  const stopPolling = useCallback(() => {
    for (const timer of timersRef.current.values()) {
      clearInterval(timer);
    }
    timersRef.current.clear();
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();

    if (!enabled) return;

    for (const channel of channels) {
      const interval = intervals?.[channel] ?? DEFAULT_INTERVALS[channel];
      const timer = setInterval(() => {
        notifyChannel(channel);
      }, interval);
      timersRef.current.set(channel, timer);
    }
  }, [channels, intervals, enabled, stopPolling]);

  useEffect(() => {
    startPolling();
    return stopPolling;
  }, [startPolling, stopPolling]);

  // Pause polling when tab is hidden, resume when visible
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else if (enabled) {
        // 500ms delay: React Query fires a throttled refetch on visibilitychange.
        // Starting our polling immediately can cause duplicate requests. The delay
        // lets RQ's own handler settle first, preventing double-fetches.
        setTimeout(startPolling, 500);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [startPolling, stopPolling, enabled]);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      setStatus('connected');
      // Trigger immediate refresh on reconnect
      for (const channel of channels) {
        notifyChannel(channel);
      }
    };

    const handleOffline = () => {
      setStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check initial state
    if (!navigator.onLine) {
      setStatus('offline');
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [channels]);

  return { status };
}
