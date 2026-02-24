/**
 * Terminal session manager — in-memory cache for CardPointe Terminal API sessions.
 *
 * The Terminal API requires a connect() call that returns a sessionKey.
 * Sessions expire after inactivity. This manager caches sessions and
 * auto-reconnects on expiry or failure.
 *
 * Key format: {tenantId}:{hsn}
 */

import {
  CardPointeTerminalClient,
} from '../providers/cardpointe/terminal-client';
import type { TerminalClientConfig } from '../providers/cardpointe/terminal-client';

// ── Types ────────────────────────────────────────────────────

interface CachedSession {
  sessionKey: string;
  client: CardPointeTerminalClient;
  merchantId: string;
  expiresAt: number; // Unix ms
  lastUsedAt: number;
}

interface GetSessionInput {
  tenantId: string;
  hsn: string;
  merchantId: string;
  credentials: {
    site: string;
    username: string;
    password: string;
  };
}

// ── Constants ────────────────────────────────────────────────

/** Sessions expire after 5 minutes of inactivity (CardPointe default varies) */
const SESSION_TTL_MS = 5 * 60 * 1000;

/** Maximum sessions cached (prevents unbounded memory growth) */
const MAX_SESSIONS = 200;

// ── Session Cache ────────────────────────────────────────────

const sessions = new Map<string, CachedSession>();

function makeKey(tenantId: string, hsn: string): string {
  return `${tenantId}:${hsn}`;
}

function evictOldest(): void {
  if (sessions.size <= MAX_SESSIONS) return;
  // Find and remove the oldest session by lastUsedAt
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [key, session] of sessions) {
    if (session.lastUsedAt < oldestTime) {
      oldestTime = session.lastUsedAt;
      oldestKey = key;
    }
  }
  if (oldestKey) sessions.delete(oldestKey);
}

// ── Public API ───────────────────────────────────────────────

/**
 * Get or create a terminal session. Returns the session key and client.
 * If a cached session exists and is not expired, returns it.
 * Otherwise, creates a new session via connect().
 */
export async function getTerminalSession(
  input: GetSessionInput,
): Promise<{ sessionKey: string; client: CardPointeTerminalClient }> {
  const key = makeKey(input.tenantId, input.hsn);
  const now = Date.now();

  // Check cache
  const cached = sessions.get(key);
  if (cached && cached.expiresAt > now) {
    cached.lastUsedAt = now;
    return { sessionKey: cached.sessionKey, client: cached.client };
  }

  // Stale or missing — connect
  const config: TerminalClientConfig = {
    site: input.credentials.site,
    merchantId: input.merchantId,
    username: input.credentials.username,
    password: input.credentials.password,
  };

  const client = new CardPointeTerminalClient(config);

  try {
    const response = await client.connect({
      hsn: input.hsn,
      merchantId: input.merchantId,
      force: !!cached, // Force if we're replacing a stale session
    });

    const session: CachedSession = {
      sessionKey: response.sessionKey,
      client,
      merchantId: input.merchantId,
      expiresAt: now + SESSION_TTL_MS,
      lastUsedAt: now,
    };

    sessions.set(key, session);
    evictOldest();

    console.log(`[TerminalSession] Connected to HSN ${input.hsn} for tenant ${input.tenantId}`);
    return { sessionKey: response.sessionKey, client };
  } catch (err) {
    // Remove stale entry on connection failure
    sessions.delete(key);
    throw err;
  }
}

/**
 * Invalidate a cached session, forcing a reconnect on next use.
 * Call this after a session-related error (e.g., 401 from terminal).
 */
export function invalidateTerminalSession(tenantId: string, hsn: string): void {
  const key = makeKey(tenantId, hsn);
  const cached = sessions.get(key);
  if (cached) {
    // Best-effort disconnect
    cached.client
      .disconnect({ hsn, sessionKey: cached.sessionKey })
      .catch(() => { /* ignore disconnect errors */ });
  }
  sessions.delete(key);
  console.log(`[TerminalSession] Invalidated session for HSN ${hsn}, tenant ${tenantId}`);
}

/**
 * Check if a terminal has an active session (for status display).
 */
export function hasActiveSession(tenantId: string, hsn: string): boolean {
  const key = makeKey(tenantId, hsn);
  const cached = sessions.get(key);
  return !!cached && cached.expiresAt > Date.now();
}

/**
 * Clear all sessions (for testing or shutdown).
 */
export function clearAllSessions(): void {
  sessions.clear();
}
