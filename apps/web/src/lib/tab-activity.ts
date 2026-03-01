/**
 * Phase 2C: Activity heartbeat for tab presence tracking.
 *
 * Periodically PATCHes `lastActivityAt` on the active tab so other
 * devices can show "in use on Terminal X" when within 60s.
 *
 * Uses `requestIdleCallback` to avoid blocking the POS UI.
 */

import { apiFetch } from '@/lib/api-client';

// ── Config ──────────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
const STALE_THRESHOLD_MS = 60_000; // 60 seconds — tabs older than this are "not in use"

// ── State ───────────────────────────────────────────────────────────

let _timer: ReturnType<typeof setInterval> | null = null;
let _activeTabId: string | null = null;

// ── Helpers ─────────────────────────────────────────────────────────

async function sendHeartbeat(tabId: string): Promise<void> {
  try {
    await apiFetch(`/api/v1/register-tabs/${tabId}`, {
      method: 'PATCH',
      body: JSON.stringify({ lastActivityAt: new Date().toISOString() }),
    });
  } catch {
    // Non-fatal — heartbeat is best-effort
  }
}

function scheduleHeartbeat(tabId: string): void {
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => {
      sendHeartbeat(tabId);
    });
  } else {
    // Fallback for browsers without requestIdleCallback
    setTimeout(() => {
      sendHeartbeat(tabId);
    }, 0);
  }
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Start the activity heartbeat for a given tab.
 * Call this when the user switches to a tab or on POS mount.
 */
export function startActivityHeartbeat(tabId: string): void {
  stopActivityHeartbeat();
  _activeTabId = tabId;

  // Send initial heartbeat immediately
  scheduleHeartbeat(tabId);

  // Then every 30s
  _timer = setInterval(() => {
    if (_activeTabId) {
      scheduleHeartbeat(_activeTabId);
    }
  }, HEARTBEAT_INTERVAL_MS);
}

/**
 * Stop the activity heartbeat.
 * Call on unmount or when leaving POS.
 */
export function stopActivityHeartbeat(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
  _activeTabId = null;
}

/**
 * Update which tab is receiving heartbeats without restarting the timer.
 */
export function setActiveHeartbeatTab(tabId: string): void {
  _activeTabId = tabId;
}

/**
 * Check if a tab is "in use" based on its lastActivityAt timestamp.
 */
export function isTabInUse(lastActivityAt: string | null | undefined): boolean {
  if (!lastActivityAt) return false;
  const lastSeen = new Date(lastActivityAt).getTime();
  return Date.now() - lastSeen < STALE_THRESHOLD_MS;
}

/**
 * Get the stale threshold for display purposes.
 */
export const ACTIVITY_STALE_THRESHOLD_MS = STALE_THRESHOLD_MS;
