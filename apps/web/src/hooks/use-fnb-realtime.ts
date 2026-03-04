'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import {
  notifyChannel,
  debouncedNotify,
  type ChannelName,
} from '@/lib/realtime-channel-registry';

// Re-export from the registry so existing imports continue to work
export { onChannelRefresh } from '@/lib/realtime-channel-registry';
export type { ChannelName } from '@/lib/realtime-channel-registry';
export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline';

// ── Realtime Transport (V2) ────────────────────────────────────
// Server broadcasts via HTTP API → Supabase delivers over WebSocket → client debounces → refetch.
// Polling is a SAFETY NET for missed broadcasts. Realtime is a latency optimization.

// ── Types ──────────────────────────────────────────────────────

interface RealtimeOptions {
  /** Channels to subscribe to */
  channels: ChannelName[];
  /** Override polling interval per channel (ms) */
  intervals?: Partial<Record<ChannelName, number>>;
  /** Master enable/disable */
  enabled?: boolean;
  /** Required for Supabase Realtime subscription */
  tenantId: string;
  /** Required for Supabase Realtime subscription */
  locationId: string;
}

// ── Feature flag ───────────────────────────────────────────────

function isRealtimeEnabled(): boolean {
  return (
    typeof window !== 'undefined' &&
    process.env.NEXT_PUBLIC_FNB_REALTIME === 'true'
  );
}

// ── Broadcast topic → local channel mapping ────────────────────

const TOPIC_TO_CHANNELS: Record<string, ChannelName[]> = {
  tables: ['floor', 'dashboard'],
  waitlist: ['dashboard'],
  reservations: ['dashboard'],
  kds: ['kds', 'expo'],
  tabs: ['tab', 'dashboard'],
  guest_pay: ['guest_pay'],
};

// ── Polling intervals ──────────────────────────────────────────

const ORIGINAL_INTERVALS: Record<ChannelName, number> = {
  floor: 5_000,
  tab: 5_000,
  kds: 3_000,
  expo: 3_000,
  dashboard: 15_000,
  guest_pay: 5_000,
};

const FALLBACK_INTERVALS: Record<ChannelName, number> = {
  floor: 30_000,
  tab: 15_000,
  kds: 10_000,
  expo: 10_000,
  dashboard: 30_000,
  guest_pay: 15_000,
};

// ── Reconnect gap threshold ────────────────────────────────────
const RECONNECT_FULL_REFRESH_GAP_MS = 10_000;

// ── Hook ───────────────────────────────────────────────────────

export function useFnbRealtime({
  channels,
  intervals,
  enabled = true,
  tenantId,
  locationId,
}: RealtimeOptions) {
  const [status, setStatus] = useState<ConnectionStatus>('connected');
  const timersRef = useRef<Map<ChannelName, ReturnType<typeof setInterval>>>(
    new Map(),
  );
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastEventTsRef = useRef<number>(Date.now());
  const realtimeActiveRef = useRef(false);
  const visibilityTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mountedRef = useRef(true);

  // FIX: Stabilize `channels` array — arrays create new references every render
  // which would cause infinite useCallback/useEffect re-runs.
  const channelsKey = channels.join(',');
  const stableChannels = useMemo(
    () => channels,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channelsKey],
  );

  // Store latest values in refs so callbacks don't need them as deps
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const tenantIdRef = useRef(tenantId);
  tenantIdRef.current = tenantId;
  const locationIdRef = useRef(locationId);
  locationIdRef.current = locationId;
  const intervalsRef = useRef(intervals);
  intervalsRef.current = intervals;

  // ── Polling ────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    for (const timer of timersRef.current.values()) {
      clearInterval(timer);
    }
    timersRef.current.clear();
  }, []);

  const startPolling = useCallback(
    (useReducedIntervals: boolean) => {
      stopPolling();
      if (!enabledRef.current) return;

      const base = useReducedIntervals
        ? FALLBACK_INTERVALS
        : ORIGINAL_INTERVALS;

      for (const ch of stableChannels) {
        const ms = intervalsRef.current?.[ch] ?? base[ch];
        const timer = setInterval(() => {
          notifyChannel(ch);
        }, ms);
        timersRef.current.set(ch, timer);
      }
    },
    [stableChannels, stopPolling],
  );

  // ── Snapshot-on-reconnect ──────────────────────────────────

  const snapshotRefresh = useCallback(
    () => {
      const gap = Date.now() - lastEventTsRef.current;
      if (gap > RECONNECT_FULL_REFRESH_GAP_MS) {
        for (const ch of stableChannels) {
          notifyChannel(ch);
        }
      } else {
        for (const ch of stableChannels) {
          debouncedNotify(ch);
        }
      }
    },
    [stableChannels],
  );

  // ── Supabase Realtime subscription ─────────────────────────

  const connectRealtime = useCallback(() => {
    const tid = tenantIdRef.current;
    const lid = locationIdRef.current;
    if (!isRealtimeEnabled() || !tid || !lid) return;

    const supabase = getSupabaseBrowser();
    const channelName = `oppsera:fnb:${tid}:${lid}`;

    // Clean up any existing subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(channelName)
      .on('broadcast', { event: 'fnb_changed' }, (msg) => {
        const payload = msg.payload as
          | { topics?: string[]; ts?: number }
          | undefined;

        if (!payload?.topics || !Array.isArray(payload.topics)) return;

        // Update last event timestamp for reconnect gap detection
        if (typeof payload.ts === 'number') {
          lastEventTsRef.current = payload.ts;

          // E2E latency observability
          const latencyMs = Date.now() - payload.ts;
          if (latencyMs > 5_000) {
            console.warn('[realtime] high e2e latency:', latencyMs, 'ms');
          }
        }

        // Map broadcast topics → local channels, debounce-coalesce
        const notifiedChannels = new Set<ChannelName>();
        for (const topic of payload.topics) {
          const mapped = TOPIC_TO_CHANNELS[topic];
          if (!mapped) continue;
          for (const ch of mapped) {
            if (!notifiedChannels.has(ch)) {
              notifiedChannels.add(ch);
              debouncedNotify(ch);
            }
          }
        }
      })
      .subscribe((subscribeStatus) => {
        // Guard: Supabase callbacks are async — they can fire after the
        // component unmounts and cleanup runs. Starting timers here would leak.
        if (!mountedRef.current) return;

        switch (subscribeStatus) {
          case 'SUBSCRIBED':
            console.log('[realtime] channel SUBSCRIBED', {
              tenantId: tenantIdRef.current,
              locationId: locationIdRef.current,
            });
            realtimeActiveRef.current = true;
            setStatus('connected');
            startPolling(true);
            snapshotRefresh();
            break;

          case 'TIMED_OUT':
            console.warn('[realtime] channel TIMED_OUT');
            realtimeActiveRef.current = false;
            setStatus('reconnecting');
            startPolling(false);
            break;

          case 'CHANNEL_ERROR':
            console.error('[realtime] channel CHANNEL_ERROR');
            realtimeActiveRef.current = false;
            setStatus('reconnecting');
            startPolling(false);
            break;

          case 'CLOSED':
            realtimeActiveRef.current = false;
            break;
        }
      });

    channelRef.current = channel;
  }, [stableChannels, startPolling, snapshotRefresh]);

  const disconnectRealtime = useCallback(() => {
    if (channelRef.current) {
      try {
        const supabase = getSupabaseBrowser();
        supabase.removeChannel(channelRef.current);
      } catch {
        // Supabase client may not exist (SSR guard)
      }
      channelRef.current = null;
      realtimeActiveRef.current = false;
    }
  }, []);

  // ── Lifecycle ──────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      stopPolling();
      disconnectRealtime();
      return;
    }

    startPolling(false);
    if (isRealtimeEnabled() && tenantId && locationId) {
      try {
        connectRealtime();
      } catch (err) {
        // getSupabaseBrowser() can throw if env vars are missing.
        // Polling is already running as safety net — degrade gracefully.
        console.error('[realtime] connectRealtime failed, polling-only mode:', err);
      }
    }

    return () => {
      mountedRef.current = false;
      stopPolling();
      disconnectRealtime();
      // NOTE: Do NOT call clearPendingNotifications() here — it's a global
      // operation that would clear timers from other still-mounted useFnbRealtime
      // instances (e.g. POS layout + host content). Pending debounce timers are
      // harmless: notifyChannel() on an empty listener set is a no-op.
      clearTimeout(visibilityTimerRef.current);
    };
  }, [enabled, tenantId, locationId, connectRealtime, disconnectRealtime, startPolling, stopPolling]);

  // ── Visibility pause/resume ────────────────────────────────

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
        disconnectRealtime();
        // FIX: Cancel any pending visibility resume timer
        clearTimeout(visibilityTimerRef.current);
      } else if (enabledRef.current) {
        // FIX: Cancel previous timer to prevent duplicates on rapid tab-switch
        clearTimeout(visibilityTimerRef.current);
        visibilityTimerRef.current = setTimeout(() => {
          startPolling(false);
          if (isRealtimeEnabled() && tenantIdRef.current && locationIdRef.current) {
            try {
              connectRealtime();
            } catch (err) {
              console.error('[realtime] connectRealtime failed on visibility resume:', err);
            }
          }
        }, 500);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      clearTimeout(visibilityTimerRef.current);
    };
  }, [startPolling, stopPolling, connectRealtime, disconnectRealtime]);

  // ── Online/offline detection ───────────────────────────────

  useEffect(() => {
    const handleOnline = () => {
      setStatus('connected');
      // FIX: disconnectRealtime before reconnecting to prevent orphaned channels
      disconnectRealtime();
      startPolling(false);
      if (isRealtimeEnabled() && tenantIdRef.current && locationIdRef.current) {
        try {
          connectRealtime();
        } catch (err) {
          console.error('[realtime] connectRealtime failed on online resume:', err);
        }
      }
      // Always do a snapshot refresh when coming back online
      snapshotRefresh();
    };

    const handleOffline = () => {
      setStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (!navigator.onLine) {
      setStatus('offline');
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [stableChannels, connectRealtime, disconnectRealtime, startPolling, snapshotRefresh]);

  return { status };
}
