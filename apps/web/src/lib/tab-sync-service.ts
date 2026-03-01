/**
 * Phase 4A + 5C: Unified Tab Sync Service.
 *
 * Single sync abstraction consumed by BOTH `use-register-tabs.ts` and
 * `use-fnb-tab.ts`. Wraps:
 *   - BroadcastChannel (same-browser, instant)
 *   - Polling (cross-device, 3s default)
 *   - SSE push (sub-second when available — Phase 5)
 *
 * Transport selection:
 *   SSE available && online → SSE (polling at 30s safety net)
 *   else → polling at 3s + BroadcastChannel
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
import { updatePresence, clearPresence, type PresenceInfo } from '@/lib/tab-presence';
import { connectTabSyncSSE, disconnectTabSyncSSE, type TabSyncSSEEvent } from '@/lib/tab-sync-sse';

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
let _sseActive = false;

// Polling intervals
const POLL_INTERVAL_FAST = 3_000; // 3s — no SSE
const POLL_INTERVAL_SLOW = 30_000; // 30s — SSE active, polling is safety net

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

function handleSSEEvent(event: TabSyncSSEEvent): void {
  if (event.type === 'presence_update' && event.data) {
    updatePresence(event.data as unknown as PresenceInfo);
    return;
  }

  if (event.data) {
    const d = event.data as Record<string, unknown>;
    notifySubscribers({
      tabId: (d.tabId as string) ?? '',
      action: event.type as TabSyncAction,
      version: (d.version as number) ?? 0,
      terminalId: (d.terminalId as string) ?? '',
      scope: (d.scope as TabSyncScope) ?? 'retail',
    });
  }
}

async function pollForChanges(locationId: string): Promise<void> {
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
      // Notify subscribers of each changed tab
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
  }
}

function startPolling(locationId: string): void {
  stopPolling();
  const interval = _sseActive ? POLL_INTERVAL_SLOW : POLL_INTERVAL_FAST;
  _pollTimer = setInterval(() => {
    pollForChanges(locationId);
  }, interval);
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
    // Immediate poll on resume
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

    // SSE — sub-second cross-device (if endpoint exists)
    connectTabSyncSSE(locationId, scope, handleSSEEvent)
      .then(() => {
        _sseActive = true;
        // Slow down polling now that SSE is active
        if (_pollTimer && _currentLocationId) {
          startPolling(_currentLocationId);
        }
      })
      .catch(() => {
        _sseActive = false;
      });

    // Polling — fallback
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
      disconnectTabSyncSSE();
      clearPresence();
      _currentLocationId = null;
      _sseActive = false;

      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    }
  };
}

/**
 * Broadcast a change to all transports (BroadcastChannel).
 * Polling and SSE will naturally pick it up.
 */
export function broadcastChange(event: TabSyncEvent): void {
  broadcastTabChange(event.tabId, event.action, event.version, event.terminalId);
}

/**
 * Get the current device ID for this browser.
 */
export { getDeviceId };
