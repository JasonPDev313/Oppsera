/**
 * Unified Tab Sync Service.
 *
 * Single sync abstraction consumed by BOTH `use-register-tabs.ts` and
 * `use-fnb-tab.ts`. Wraps:
 *   - BroadcastChannel (same-browser, instant)
 *   - Supabase Realtime Broadcast (cross-device, sub-second via use-fnb-realtime)
 *   - Polling (safety net, 30s)
 */

import { apiFetch } from '@/lib/api-client';
import {
  initTabSyncChannel,
  closeTabSyncChannel,
  broadcastTabChange,
  onTabSyncMessage,
  getDeviceId,
  type TabSyncAction,
  type TabSyncMessage,
} from '@/lib/tab-sync-channel';
import { clearPresence } from '@/lib/tab-presence';
import { onChannelRefresh } from '@/lib/realtime-channel-registry';

// ── Types ───────────────────────────────────────────────────────────

export type TabSyncScope = 'retail' | 'fnb' | 'all';

export interface TabSyncEvent {
  tabId: string;
  action: TabSyncAction;
  version: number;
  terminalId: string;
  scope: TabSyncScope;
}

export type TabSyncCallback = (event: TabSyncEvent) => void;

interface Subscription {
  id: number;
  locationId: string;
  scope: TabSyncScope;
  callback: TabSyncCallback;
}

// ── State ───────────────────────────────────────────────────────────

let _nextSubId = 1;
const _subscriptions: Subscription[] = [];

let _pollTimer: ReturnType<typeof setInterval> | null = null;
let _lastPollTimestamp: string | null = null;
let _currentLocationId: string | null = null;
let _realtimeUnsub: (() => void) | null = null;
let _pollInFlight = false;

// Polling interval — safety net only (realtime handles sub-second)
const POLL_INTERVAL_MS = 30_000;

// ── Internal ────────────────────────────────────────────────────────

function notifySubscribers(event: TabSyncEvent): void {
  for (const sub of _subscriptions) {
    // Scope filtering — if sub wants 'retail' and event is 'fnb', skip
    if (sub.scope !== 'all' && event.scope !== 'all' && sub.scope !== event.scope) continue;
    try {
      sub.callback(event);
    } catch (err) {
      console.error('[tab-sync-service] Subscriber error:', err);
    }
  }
}

function handleBroadcastMessage(msg: TabSyncMessage): void {
  notifySubscribers({
    tabId: msg.tabId,
    action: msg.action,
    version: msg.version,
    terminalId: msg.terminalId,
    scope: 'retail', // BroadcastChannel is location-scoped, defaults to retail
  });
}

function handleRealtimeRefresh(): void {
  // Realtime broadcast received — notify all subscribers with a generic refresh
  notifySubscribers({
    tabId: '',
    action: 'tab_updated',
    version: 0,
    terminalId: '',
    scope: 'all',
  });
}

async function pollForChanges(locationId: string): Promise<void> {
  if (_pollInFlight) return; // Prevent stacking if previous fetch > interval
  _pollInFlight = true;
  try {
    const params = new URLSearchParams({ locationId });
    if (_lastPollTimestamp) {
      params.set('since', _lastPollTimestamp);
    }

    const resp = await apiFetch<{
      data: Array<Record<string, unknown>>;
      meta: { serverTimestamp: string };
    }>(`/api/v1/register-tabs?${params.toString()}`);

    _lastPollTimestamp = resp.meta.serverTimestamp;

    if (resp.data.length > 0) {
      for (const tab of resp.data) {
        notifySubscribers({
          tabId: (tab.id as string) ?? '',
          action: 'tab_updated',
          version: (tab.version as number) ?? 0,
          terminalId: (tab.terminalId as string) ?? '',
          scope: 'retail',
        });
      }
    }
  } catch {
    // Silent — polling failure is non-fatal
  } finally {
    _pollInFlight = false;
  }
}

function startPolling(locationId: string): void {
  stopPolling();
  _pollTimer = setInterval(() => {
    pollForChanges(locationId);
  }, POLL_INTERVAL_MS);
}

function stopPolling(): void {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
}

// ── Visibility handling ─────────────────────────────────────────────

function handleVisibilityChange(): void {
  if (document.visibilityState === 'visible' && _currentLocationId) {
    pollForChanges(_currentLocationId);
  }
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Subscribe to tab changes for a location.
 * Returns an unsubscribe function.
 */
export function subscribe(
  locationId: string,
  scope: TabSyncScope,
  callback: TabSyncCallback,
): () => void {
  const id = _nextSubId++;
  const sub: Subscription = { id, locationId, scope, callback };
  _subscriptions.push(sub);

  // Start transport if this is the first subscriber
  if (_subscriptions.length === 1) {
    _currentLocationId = locationId;
    _lastPollTimestamp = null;

    // BroadcastChannel — instant same-browser sync
    initTabSyncChannel(locationId);
    onTabSyncMessage(handleBroadcastMessage);

    // Supabase Realtime — sub-second cross-device via use-fnb-realtime
    _realtimeUnsub = onChannelRefresh('tab', handleRealtimeRefresh);

    // Polling — safety net at 30s
    startPolling(locationId);

    // Visibility resume
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
  }

  return () => {
    const idx = _subscriptions.findIndex((s) => s.id === id);
    if (idx >= 0) _subscriptions.splice(idx, 1);

    // Teardown if no subscribers
    if (_subscriptions.length === 0) {
      stopPolling();
      closeTabSyncChannel();
      if (_realtimeUnsub) {
        _realtimeUnsub();
        _realtimeUnsub = null;
      }
      clearPresence();
      _currentLocationId = null;

      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    }
  };
}

/**
 * Broadcast a change to all transports (BroadcastChannel).
 * Supabase Realtime broadcast is handled server-side via broadcastFnb().
 */
export function broadcastChange(event: TabSyncEvent): void {
  broadcastTabChange(event.tabId, event.action, event.version, event.terminalId);
}

/**
 * Get the current device ID for this browser.
 */
export { getDeviceId };
