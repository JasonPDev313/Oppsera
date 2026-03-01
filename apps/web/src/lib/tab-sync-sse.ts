/**
 * Phase 5B: SSE client wrapper for tab sync.
 *
 * EventSource wrapper with exponential backoff auto-reconnect.
 * Falls back to polling on connection failure.
 */

import type { TabSyncScope } from '@/lib/tab-sync-service';

// ── Auth Token ──────────────────────────────────────────────────────

/**
 * Extract the current Supabase auth access_token from localStorage.
 * EventSource cannot send custom headers, so we pass token as a URL param.
 */
function getAuthToken(): string {
  if (typeof localStorage === 'undefined') return '';
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          return parsed?.access_token ?? '';
        }
      }
    }
  } catch {
    // Ignore parse errors
  }
  return '';
}

function buildSSEUrl(locationId: string, scope: TabSyncScope): string {
  const base = `/api/v1/tab-sync/stream?locationId=${encodeURIComponent(locationId)}&scope=${scope}`;
  const token = getAuthToken();
  return token ? `${base}&token=${encodeURIComponent(token)}` : base;
}

// ── Types ───────────────────────────────────────────────────────────

export interface TabSyncSSEEvent {
  type: string;
  data: Record<string, unknown> | null;
}

type SSEEventHandler = (event: TabSyncSSEEvent) => void;

// ── State ───────────────────────────────────────────────────────────

let _eventSource: EventSource | null = null;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _reconnectAttempts = 0;
let _handler: SSEEventHandler | null = null;
let _locationId: string | null = null;
let _scope: TabSyncScope | null = null;

// ── Config ──────────────────────────────────────────────────────────

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;

// ── Internal ────────────────────────────────────────────────────────

function getReconnectDelay(): number {
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s, 30s...
  const delay = Math.min(
    BASE_RECONNECT_MS * Math.pow(2, _reconnectAttempts),
    MAX_RECONNECT_MS,
  );
  // Add jitter ± 20%
  const jitter = delay * (0.8 + Math.random() * 0.4);
  return Math.round(jitter);
}

function reconnect(): void {
  if (_reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.warn('[tab-sync-sse] Max reconnect attempts reached, falling back to polling');
    return;
  }

  const delay = getReconnectDelay();
  _reconnectAttempts++;

  _reconnectTimer = setTimeout(() => {
    if (_locationId && _scope && _handler) {
      connect(_locationId, _scope, _handler);
    }
  }, delay);
}

function connect(
  locationId: string,
  scope: TabSyncScope,
  handler: SSEEventHandler,
): void {
  if (typeof EventSource === 'undefined') return;

  cleanup();

  const url = buildSSEUrl(locationId, scope);

  try {
    _eventSource = new EventSource(url);
  } catch {
    // EventSource construction failed — browser doesn't support or URL invalid
    return;
  }

  _eventSource.onopen = () => {
    _reconnectAttempts = 0; // Reset on successful connection
  };

  // Listen to typed events
  const eventTypes = [
    'tab_created',
    'tab_updated',
    'tab_closed',
    'tab_transferred',
    'tab_auto_cleared',
    'presence_update',
    'heartbeat',
  ];

  for (const eventType of eventTypes) {
    _eventSource.addEventListener(eventType, (event: MessageEvent) => {
      if (eventType === 'heartbeat') return; // Ignore heartbeats

      try {
        const data = event.data ? JSON.parse(event.data) : null;
        handler({ type: eventType, data });
      } catch {
        // Malformed JSON — skip
      }
    });
  }

  // Also handle generic "message" events
  _eventSource.onmessage = (event: MessageEvent) => {
    try {
      const parsed = JSON.parse(event.data);
      handler({ type: parsed.type ?? 'unknown', data: parsed });
    } catch {
      // Skip
    }
  };

  _eventSource.onerror = () => {
    cleanup();
    reconnect();
  };
}

function cleanup(): void {
  if (_eventSource) {
    try {
      _eventSource.close();
    } catch {
      // Ignore
    }
    _eventSource = null;
  }

  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Connect to the SSE stream for tab sync.
 * Resolves when connected, rejects if SSE is not supported or fails to connect.
 */
export async function connectTabSyncSSE(
  locationId: string,
  scope: TabSyncScope,
  handler: SSEEventHandler,
): Promise<void> {
  if (typeof EventSource === 'undefined') {
    throw new Error('SSE not supported');
  }

  _locationId = locationId;
  _scope = scope;
  _handler = handler;

  return new Promise<void>((resolve, reject) => {
    const url = buildSSEUrl(locationId, scope);

    try {
      cleanup();
      _eventSource = new EventSource(url);
    } catch (err) {
      reject(err);
      return;
    }

    const connectTimeout = setTimeout(() => {
      // If we haven't connected in 5s, consider it a failure
      cleanup();
      reject(new Error('SSE connection timeout'));
    }, 5_000);

    _eventSource.onopen = () => {
      clearTimeout(connectTimeout);
      _reconnectAttempts = 0;

      // Re-register event listeners
      const eventTypes = [
        'tab_created', 'tab_updated', 'tab_closed',
        'tab_transferred', 'tab_auto_cleared', 'presence_update', 'heartbeat',
      ];

      for (const eventType of eventTypes) {
        _eventSource!.addEventListener(eventType, (event: MessageEvent) => {
          if (eventType === 'heartbeat') return;
          try {
            const data = event.data ? JSON.parse(event.data) : null;
            handler({ type: eventType, data });
          } catch {
            // Skip
          }
        });
      }

      _eventSource!.onmessage = (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data);
          handler({ type: parsed.type ?? 'unknown', data: parsed });
        } catch {
          // Skip
        }
      };

      _eventSource!.onerror = () => {
        cleanup();
        reconnect();
      };

      resolve();
    };

    _eventSource.onerror = () => {
      clearTimeout(connectTimeout);
      cleanup();
      reject(new Error('SSE connection failed'));
    };
  });
}

/**
 * Disconnect from the SSE stream.
 */
export function disconnectTabSyncSSE(): void {
  _handler = null;
  _locationId = null;
  _scope = null;
  _reconnectAttempts = 0;
  cleanup();
}

/**
 * Check if SSE is currently connected.
 */
export function isSSEConnected(): boolean {
  return _eventSource !== null && _eventSource.readyState === EventSource.OPEN;
}
