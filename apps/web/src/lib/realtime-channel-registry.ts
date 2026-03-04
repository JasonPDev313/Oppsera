/**
 * Realtime Channel Registry — module-level listener bus for F&B realtime events.
 *
 * Extracted from use-fnb-realtime.ts so non-React modules (tab-sync-service)
 * can import without pulling in React hook code.
 *
 * Consumers register callbacks via `onChannelRefresh(channel, cb)`.
 * Producers call `notifyChannel(channel)` to fire all listeners.
 */

export type ChannelName =
  | 'floor'
  | 'tab'
  | 'kds'
  | 'expo'
  | 'dashboard'
  | 'guest_pay';

export type RefreshCallback = () => void | Promise<void>;

// ── Listener registry ─────────────────────────────────────────────

const channelListeners = new Map<ChannelName, Set<RefreshCallback>>();

/** Register a refresh callback for a channel. Returns unsubscribe fn. */
export function onChannelRefresh(
  channel: ChannelName,
  callback: RefreshCallback,
): () => void {
  if (!channelListeners.has(channel)) {
    channelListeners.set(channel, new Set());
  }
  channelListeners.get(channel)!.add(callback);
  return () => {
    const set = channelListeners.get(channel);
    if (set) {
      set.delete(callback);
      if (set.size === 0) channelListeners.delete(channel);
    }
  };
}

/** Notify all listeners on a channel. Fire-and-forget, swallows all errors. */
export function notifyChannel(channel: ChannelName): void {
  const listeners = channelListeners.get(channel);
  if (!listeners || listeners.size === 0) return;
  // Snapshot to array — callbacks may trigger unsubscribe (Set.delete) of
  // other listeners during iteration, which would skip them.
  const snapshot = [...listeners];
  for (const cb of snapshot) {
    try {
      const result = cb();
      // Catch async rejections too — callbacks can return Promise<void>
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch(() => {});
      }
    } catch {
      // ignore sync listener errors
    }
  }
}

// ── Debounce coalescing ───────────────────────────────────────────
// Multiple broadcasts arriving within 150ms are coalesced into a
// single notifyChannel per channel. Prevents refetch storms.

const DEBOUNCE_MS = 150;

const pendingNotifications = new Map<
  ChannelName,
  ReturnType<typeof setTimeout>
>();

export function debouncedNotify(channel: ChannelName): void {
  const existing = pendingNotifications.get(channel);
  if (existing) clearTimeout(existing);
  pendingNotifications.set(
    channel,
    setTimeout(() => {
      pendingNotifications.delete(channel);
      notifyChannel(channel);
    }, DEBOUNCE_MS),
  );
}

/** Clear all pending debounce timers. Call on teardown. */
export function clearPendingNotifications(): void {
  for (const timer of pendingNotifications.values()) {
    clearTimeout(timer);
  }
  pendingNotifications.clear();
}
