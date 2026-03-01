/**
 * Phase 4B: Presence tracking for cross-device tab awareness.
 *
 * Module-level Map of deviceId → presence info.
 * Updated via sync events (BroadcastChannel, polling, SSE).
 * Shows "Editing on Terminal 3" in tab UI.
 */

// ── Types ───────────────────────────────────────────────────────────

export interface PresenceInfo {
  deviceId: string;
  tabId: string;
  employeeName: string | null;
  terminalId: string;
  locationId: string | null;
  lastSeen: number; // epoch ms
}

// ── State ───────────────────────────────────────────────────────────

const STALE_MS = 90_000; // 90 seconds — slightly longer than heartbeat threshold

/** deviceId → PresenceInfo */
const _presence = new Map<string, PresenceInfo>();

/** Listeners notified when presence changes */
const _listeners = new Set<() => void>();

// ── Cleanup ─────────────────────────────────────────────────────────

let _cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup(): void {
  if (_cleanupTimer) return;
  _cleanupTimer = setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [deviceId, info] of _presence) {
      if (now - info.lastSeen > STALE_MS) {
        _presence.delete(deviceId);
        changed = true;
      }
    }
    if (changed) notifyListeners();
  }, 30_000); // Clean every 30s
}

function notifyListeners(): void {
  for (const listener of _listeners) {
    try {
      listener();
    } catch {
      // ignore
    }
  }
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Update presence for a device.
 */
export function updatePresence(info: PresenceInfo): void {
  _presence.set(info.deviceId, { ...info, lastSeen: Date.now() });
  startCleanup();
  notifyListeners();
}

/**
 * Remove presence for a device.
 */
export function removePresence(deviceId: string): void {
  if (_presence.delete(deviceId)) {
    notifyListeners();
  }
}

/**
 * Get all active presence entries for a given location.
 * Returns only entries that are not stale.
 */
export function getPresenceForLocation(
  locationId: string,
): Map<string, PresenceInfo> {
  const now = Date.now();
  const result = new Map<string, PresenceInfo>();
  for (const [deviceId, info] of _presence) {
    if (now - info.lastSeen < STALE_MS && info.locationId === locationId) {
      result.set(deviceId, info);
    }
  }
  return result;
}

/**
 * Get presence info for a specific tab.
 * Returns the device currently editing this tab, or null.
 */
export function getPresenceForTab(
  tabId: string,
  excludeDeviceId?: string,
): PresenceInfo | null {
  const now = Date.now();
  for (const [, info] of _presence) {
    if (
      info.tabId === tabId &&
      now - info.lastSeen < STALE_MS &&
      info.deviceId !== excludeDeviceId
    ) {
      return info;
    }
  }
  return null;
}

/**
 * Subscribe to presence changes. Returns unsubscribe function.
 */
export function onPresenceChange(listener: () => void): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

/**
 * Clear all presence data. Used on unmount or location change.
 */
export function clearPresence(): void {
  _presence.clear();
  if (_cleanupTimer) {
    clearInterval(_cleanupTimer);
    _cleanupTimer = null;
  }
  notifyListeners();
}
