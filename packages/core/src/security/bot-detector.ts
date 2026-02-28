/**
 * Bot pattern detection engine.
 * Scores requests for bot-like behavior and throttles/blocks high-score IPs.
 *
 * Stage 1: single-instance (Vercel functions). Upgrade to Redis when Stage 2
 * via setBotDetectorStore().
 *
 * Scoring signals:
 *   - Request frequency (0.40): >60 requests in 60s sliding window
 *   - 4xx error ratio (0.30): >40% of last 20 responses are 4xx
 *   - Missing/suspicious UA (0.15): empty, "curl", "python-requests", single-word
 *   - Sequential path scanning (0.15): 3+ sequential numeric paths (/items/1, /items/2, /items/3)
 *
 * Actions by score:
 *   0.0–0.5: Pass
 *   0.5–0.7: Log warning
 *   0.7–0.9: Throttle (10 req/min via existing rate limiter)
 *   0.9+:    Block for 5 minutes
 */

// ── Interfaces ──────────────────────────────────────────────────

interface BotScoreEntry {
  requestTimestamps: number[];
  recentStatuses: number[];
  hasValidUserAgent: boolean;
  sequentialPathCount: number;
  lastPath: string;
  score: number;
  blockedUntil: number;
  lastAccess: number;
}

export interface BotCheckResult {
  blocked: boolean;
  score: number;
  retryAfterSec: number;
}

export interface BotDetectorStore {
  check(ip: string, request: Request, mode: 'standard' | 'strict'): BotCheckResult;
  recordStatus(ip: string, status: number): void;
}

// ── Configuration ───────────────────────────────────────────────

const MAX_ENTRIES = 5_000;
const ENTRY_TTL_MS = 10 * 60 * 1000; // 10 minutes per IP entry
const SLIDING_WINDOW_MS = 60_000;     // 60s request frequency window
const MAX_RECENT_STATUSES = 20;       // Track last 20 response statuses

const FREQUENCY_THRESHOLD = 60;       // requests per 60s to score 1.0
const ERROR_RATIO_THRESHOLD = 0.4;    // 40% 4xx rate to score 1.0
const SEQUENTIAL_PATH_THRESHOLD = 3;  // 3+ sequential numeric paths

const BLOCK_DURATION_MS = 5 * 60 * 1000; // 5-minute block

// Score thresholds
const SCORE_LOG = 0.5;
const SCORE_THROTTLE = 0.7;
const SCORE_BLOCK = 0.9;

// Signal weights
const WEIGHT_FREQUENCY = 0.40;
const WEIGHT_ERROR_RATIO = 0.30;
const WEIGHT_USER_AGENT = 0.15;
const WEIGHT_SEQUENTIAL = 0.15;

// Strict mode multiplier (public endpoints get harsher scoring)
const STRICT_MULTIPLIER = 1.3;

// Suspicious user agents
const SUSPICIOUS_UA_PATTERNS = [
  'curl', 'wget', 'python-requests', 'python-urllib', 'httpie',
  'postman', 'insomnia', 'go-http-client', 'java/', 'apache-httpclient',
  'okhttp', 'node-fetch', 'axios', 'got/',
];

// ── Helpers ─────────────────────────────────────────────────────

function isSuspiciousUserAgent(ua: string | null): boolean {
  if (!ua || ua.trim().length === 0) return true;
  const lower = ua.toLowerCase();
  // Single-word UAs are suspicious
  if (!lower.includes(' ') && !lower.includes('/')) return true;
  return SUSPICIOUS_UA_PATTERNS.some(p => lower.includes(p));
}

/** Extract numeric suffix from a URL path, e.g. /api/v1/items/123 → 123 */
function extractPathNumericSuffix(url: string): number | null {
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && /^\d+$/.test(last)) return parseInt(last, 10);
    return null;
  } catch {
    return null;
  }
}

/** Get path prefix without the last numeric segment */
function getPathPrefix(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && /^\d+$/.test(last)) {
      return segments.slice(0, -1).join('/');
    }
    return pathname;
  } catch {
    return '';
  }
}

// ── In-Memory Bot Detector Store ────────────────────────────────

class InMemoryBotDetectorStore implements BotDetectorStore {
  private store = new Map<string, BotScoreEntry>();

  check(ip: string, request: Request, mode: 'standard' | 'strict'): BotCheckResult {
    // Check allowlist
    const allowlistStr = process.env.BOT_ALLOWLIST_IPS;
    if (allowlistStr) {
      const allowlist = allowlistStr.split(',').map(s => s.trim());
      if (allowlist.includes(ip)) {
        return { blocked: false, score: 0, retryAfterSec: 0 };
      }
    }

    const now = Date.now();
    this.evictIfNeeded(now);

    // Get or create entry (LRU touch via delete-then-set)
    let entry = this.store.get(ip);
    this.store.delete(ip);

    if (!entry || (now - entry.lastAccess) > ENTRY_TTL_MS) {
      entry = {
        requestTimestamps: [],
        recentStatuses: [],
        hasValidUserAgent: true,
        sequentialPathCount: 0,
        lastPath: '',
        score: 0,
        blockedUntil: 0,
        lastAccess: now,
      };
    }

    // Check if currently blocked
    if (entry.blockedUntil > now) {
      this.store.set(ip, entry);
      const retryAfterSec = Math.ceil((entry.blockedUntil - now) / 1000);
      return { blocked: true, score: entry.score, retryAfterSec };
    }

    // Update request timestamps (sliding window)
    const windowStart = now - SLIDING_WINDOW_MS;
    entry.requestTimestamps = entry.requestTimestamps.filter(t => t > windowStart);
    entry.requestTimestamps.push(now);
    entry.lastAccess = now;

    // Update user agent signal
    const ua = request.headers.get('user-agent');
    entry.hasValidUserAgent = !isSuspiciousUserAgent(ua);

    // Update sequential path scanning signal
    const currentPrefix = getPathPrefix(request.url);
    const currentNum = extractPathNumericSuffix(request.url);
    const lastPrefix = entry.lastPath ? getPathPrefix(entry.lastPath) : '';
    const lastNum = entry.lastPath ? extractPathNumericSuffix(entry.lastPath) : null;

    if (
      currentNum !== null &&
      lastNum !== null &&
      currentPrefix === lastPrefix &&
      Math.abs(currentNum - lastNum) === 1
    ) {
      entry.sequentialPathCount++;
    } else if (currentPrefix !== lastPrefix) {
      entry.sequentialPathCount = 0;
    }
    entry.lastPath = request.url;

    // Compute score
    const frequencyScore = Math.min(entry.requestTimestamps.length / FREQUENCY_THRESHOLD, 1.0);

    const errorCount = entry.recentStatuses.filter(s => s >= 400 && s < 500).length;
    const errorRatio = entry.recentStatuses.length > 0
      ? errorCount / entry.recentStatuses.length
      : 0;
    const errorScore = Math.min(errorRatio / ERROR_RATIO_THRESHOLD, 1.0);

    const uaScore = entry.hasValidUserAgent ? 0 : 1.0;

    const sequentialScore = Math.min(
      entry.sequentialPathCount / SEQUENTIAL_PATH_THRESHOLD,
      1.0,
    );

    let rawScore =
      frequencyScore * WEIGHT_FREQUENCY +
      errorScore * WEIGHT_ERROR_RATIO +
      uaScore * WEIGHT_USER_AGENT +
      sequentialScore * WEIGHT_SEQUENTIAL;

    // Apply strict mode multiplier
    if (mode === 'strict') {
      rawScore = Math.min(rawScore * STRICT_MULTIPLIER, 1.0);
    }

    entry.score = rawScore;

    // Determine action
    if (rawScore >= SCORE_BLOCK) {
      entry.blockedUntil = now + BLOCK_DURATION_MS;
      this.store.set(ip, entry);
      const retryAfterSec = Math.ceil(BLOCK_DURATION_MS / 1000);
      return { blocked: true, score: rawScore, retryAfterSec };
    }

    if (rawScore >= SCORE_THROTTLE) {
      // Throttle: allow max 10 requests per minute (beyond this, block)
      if (entry.requestTimestamps.length > 10) {
        this.store.set(ip, entry);
        return { blocked: true, score: rawScore, retryAfterSec: 60 };
      }
    }

    if (rawScore >= SCORE_LOG) {
      console.warn(`[bot-detector] Elevated bot score for IP ${ip}: ${rawScore.toFixed(2)} (mode=${mode})`);
    }

    this.store.set(ip, entry);
    return { blocked: false, score: rawScore, retryAfterSec: 0 };
  }

  recordStatus(ip: string, status: number): void {
    const entry = this.store.get(ip);
    if (!entry) return;

    entry.recentStatuses.push(status);
    if (entry.recentStatuses.length > MAX_RECENT_STATUSES) {
      entry.recentStatuses = entry.recentStatuses.slice(-MAX_RECENT_STATUSES);
    }
  }

  private evictIfNeeded(now: number): void {
    if (this.store.size <= MAX_ENTRIES) return;

    // Evict oldest 20% using Map insertion order
    const evictCount = Math.floor(this.store.size * 0.2);
    const keysIter = this.store.keys();
    for (let i = 0; i < evictCount; i++) {
      const { value, done } = keysIter.next();
      if (done) break;
      // Also evict expired entries opportunistically
      const entry = this.store.get(value);
      if (!entry || (now - entry.lastAccess) > ENTRY_TTL_MS) {
        this.store.delete(value);
      } else {
        this.store.delete(value);
      }
    }
  }
}

// ── Store Singleton ─────────────────────────────────────────────

let _botDetectorStore: BotDetectorStore = new InMemoryBotDetectorStore();

/** Replace the default in-memory store with a custom implementation (e.g. Redis). */
export function setBotDetectorStore(store: BotDetectorStore): void {
  _botDetectorStore = store;
}

export function getBotDetectorStore(): BotDetectorStore {
  return _botDetectorStore;
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Check bot score for a request. Returns `{ blocked, score, retryAfterSec }`.
 */
export function checkBotScore(
  request: Request,
  mode: 'standard' | 'strict' = 'standard',
): BotCheckResult {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return _botDetectorStore.check(ip, request, mode);
}

/**
 * Record a response status code for bot detection scoring.
 * Call this after the handler returns (fire-and-forget).
 */
export function recordBotResponseStatus(ip: string, status: number): void {
  _botDetectorStore.recordStatus(ip, status);
}
