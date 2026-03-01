/**
 * Phase 2A: BroadcastChannel for same-browser tab sync.
 *
 * Provides instant cross-tab synchronization within the same browser.
 * Zero server cost — pure browser API.
 */

// ── Types ───────────────────────────────────────────────────────────

export type TabSyncAction =
  | 'tab_created'
  | 'tab_updated'
  | 'tab_closed'
  | 'tab_transferred'
  | 'tab_auto_cleared';

export interface TabSyncMessage {
  type: 'tab_changed';
  tabId: string;
  action: TabSyncAction;
  version: number;
  terminalId: string;
  /** Sending device — ignore messages from self */
  deviceId: string;
  timestamp: number;
}

// ── Device ID ───────────────────────────────────────────────────────

const DEVICE_ID_KEY = 'oppsera:device-id';

let _deviceId: string | null = null;

export function getDeviceId(): string {
  if (_deviceId) return _deviceId;
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    _deviceId = id;
    return id;
  } catch {
    _deviceId = `dev-${Date.now().toString(36)}`;
    return _deviceId;
  }
}

// ── Channel ─────────────────────────────────────────────────────────

type Listener = (msg: TabSyncMessage) => void;

let _channel: BroadcastChannel | null = null;
const _listeners = new Set<Listener>();

function channelName(locationId: string): string {
  return `oppsera:tab-sync:${locationId}`;
}

/**
 * Initialize the BroadcastChannel for a given location.
 * Safe to call multiple times — closes the old channel first.
 */
export function initTabSyncChannel(locationId: string): void {
  if (typeof BroadcastChannel === 'undefined') return; // SSR or unsupported browser

  closeTabSyncChannel();

  _channel = new BroadcastChannel(channelName(locationId));
  _channel.onmessage = (event: MessageEvent<TabSyncMessage>) => {
    const msg = event.data;
    // Ignore messages from self
    if (msg.deviceId === getDeviceId()) return;
    for (const listener of _listeners) {
      try {
        listener(msg);
      } catch (err) {
        console.error('[tab-sync-channel] Listener error:', err);
      }
    }
  };
}

/**
 * Broadcast a tab change event to all other browser tabs.
 */
export function broadcastTabChange(
  tabId: string,
  action: TabSyncAction,
  version: number,
  terminalId: string,
): void {
  if (!_channel) return;

  const msg: TabSyncMessage = {
    type: 'tab_changed',
    tabId,
    action,
    version,
    terminalId,
    deviceId: getDeviceId(),
    timestamp: Date.now(),
  };

  try {
    _channel.postMessage(msg);
  } catch {
    // Channel may be closed
  }
}

/**
 * Subscribe to tab sync messages from other browser tabs.
 * Returns an unsubscribe function.
 */
export function onTabSyncMessage(listener: Listener): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

/**
 * Close the BroadcastChannel and remove all listeners.
 */
export function closeTabSyncChannel(): void {
  if (_channel) {
    try {
      _channel.close();
    } catch {
      // Ignore
    }
    _channel = null;
  }
}
