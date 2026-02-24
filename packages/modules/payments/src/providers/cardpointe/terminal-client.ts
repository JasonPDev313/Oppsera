/**
 * CardPointe Terminal API HTTP client.
 *
 * SEPARATE from CardPointeClient (Gateway REST API):
 * - Different base URL: /api/v3/  (not /cardconnect/rest/)
 * - Different auth: session-based via connect() → sessionKey
 * - Different timeouts: authCard = 120s (user interaction)
 *
 * The Terminal API communicates with physical payment hardware
 * (Ingenico, Clover) via CardPointe's Bolt service.
 */

import type {
  TerminalConnectRequest,
  TerminalConnectResponse,
  TerminalDisconnectRequest,
  TerminalAuthCardRequest,
  TerminalAuthCardResponse,
  TerminalReadCardRequest,
  TerminalReadCardResponse,
  TerminalReadManualRequest,
  TerminalReadManualResponse,
  TerminalDisplayRequest,
  TerminalClearDisplayRequest,
  TerminalCancelRequest,
  TerminalTipRequest,
  TerminalTipResponse,
  TerminalPanPadRequest,
  TerminalPanPadResponse,
  TerminalPingResponse,
  TerminalDateTimeResponse,
  TerminalListItem,
} from './terminal-types';

// ── Error Classes ────────────────────────────────────────────

export class TerminalTimeoutError extends Error {
  constructor(
    public readonly operation: string,
    public readonly timeoutMs: number,
  ) {
    super(`Terminal operation '${operation}' timed out after ${timeoutMs}ms`);
    this.name = 'TerminalTimeoutError';
  }
}

export class TerminalConnectionError extends Error {
  constructor(
    public readonly hsn: string,
    public readonly statusCode?: number,
    public readonly detail?: string,
  ) {
    super(`Terminal connection failed for HSN ${hsn}: ${detail ?? 'unknown error'}`);
    this.name = 'TerminalConnectionError';
  }
}

export class TerminalApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly responseBody: string,
  ) {
    super(`Terminal API error ${statusCode}: ${responseBody}`);
    this.name = 'TerminalApiError';
  }
}

// ── Config ───────────────────────────────────────────────────

export interface TerminalClientConfig {
  /** CardPointe site hostname segment (e.g. "fts" for fts.cardconnect.com) */
  site: string;
  /** Merchant ID for the terminal connect call */
  merchantId: string;
  /** Gateway username (used for Basic auth on connect) */
  username: string;
  /** Gateway password */
  password: string;
}

// ── Constants ────────────────────────────────────────────────

const TIMEOUT_CONNECT = 15_000; // 15s
const TIMEOUT_AUTH_CARD = 120_000; // 120s (waiting for user to dip/tap/swipe)
const TIMEOUT_READ_CARD = 60_000; // 60s
const TIMEOUT_DEFAULT = 30_000; // 30s for most operations
const TIMEOUT_CANCEL = 10_000; // 10s — cancel must be fast

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1_000, 2_000, 4_000];

/** Fields to redact in log output */
const REDACTED_FIELDS = new Set([
  'account', 'token', 'expiry', 'cvv', 'password', 'sessionKey', 'signature',
]);

// ── Helpers ──────────────────────────────────────────────────

function redactSensitive(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactSensitive);
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (REDACTED_FIELDS.has(key)) {
      redacted[key] = '***REDACTED***';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitive(value);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof TerminalTimeoutError) return true;
  if (err instanceof TerminalApiError && err.statusCode >= 500) return true;
  if (err instanceof TypeError && (err.message.includes('fetch') || err.message.includes('network'))) return true;
  return false;
}

// ── Client ───────────────────────────────────────────────────

export class CardPointeTerminalClient {
  private readonly baseUrl: string;
  private readonly basicAuth: string;

  constructor(private readonly config: TerminalClientConfig) {
    this.baseUrl = `https://${config.site}.cardconnect.com/api/v3`;
    this.basicAuth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
  }

  // ── Session Management ───────────────────────────────────

  /** Connect to a terminal device and obtain a session key */
  async connect(request: TerminalConnectRequest): Promise<TerminalConnectResponse> {
    const body = {
      merchantId: request.merchantId || this.config.merchantId,
      hsn: request.hsn,
      ...(request.force ? { force: 'true' } : {}),
    };
    const result = await this.post<TerminalConnectResponse>(
      '/connect',
      body,
      TIMEOUT_CONNECT,
      { useBasicAuth: true },
    );
    return result;
  }

  /** Disconnect from a terminal */
  async disconnect(request: TerminalDisconnectRequest): Promise<void> {
    await this.post(
      '/disconnect',
      { hsn: request.hsn },
      TIMEOUT_DEFAULT,
      { sessionKey: request.sessionKey },
    );
  }

  /** List available terminals for the merchant */
  async listTerminals(sessionKey: string): Promise<TerminalListItem[]> {
    return this.post<TerminalListItem[]>(
      '/listTerminals',
      {},
      TIMEOUT_DEFAULT,
      { sessionKey },
    );
  }

  /** Ping a terminal to check connectivity */
  async ping(sessionKey: string, hsn: string): Promise<TerminalPingResponse> {
    return this.post<TerminalPingResponse>(
      '/ping',
      { hsn },
      TIMEOUT_DEFAULT,
      { sessionKey },
    );
  }

  // ── Card Operations ──────────────────────────────────────

  /** Authorize a card-present transaction */
  async authCard(
    sessionKey: string,
    request: TerminalAuthCardRequest,
  ): Promise<TerminalAuthCardResponse> {
    return this.post<TerminalAuthCardResponse>(
      '/authCard',
      request,
      TIMEOUT_AUTH_CARD,
      { sessionKey },
    );
  }

  /** Read card data without authorizing */
  async readCard(
    sessionKey: string,
    request: TerminalReadCardRequest,
  ): Promise<TerminalReadCardResponse> {
    return this.post<TerminalReadCardResponse>(
      '/readCard',
      request,
      TIMEOUT_READ_CARD,
      { sessionKey },
    );
  }

  /** Manual card entry on the terminal */
  async readManual(
    sessionKey: string,
    request: TerminalReadManualRequest,
  ): Promise<TerminalReadManualResponse> {
    return this.post<TerminalReadManualResponse>(
      '/readManual',
      request,
      TIMEOUT_READ_CARD,
      { sessionKey },
    );
  }

  // ── Display / UI ─────────────────────────────────────────

  /** Show text on the terminal display */
  async display(sessionKey: string, request: TerminalDisplayRequest): Promise<void> {
    await this.post('/display', request, TIMEOUT_DEFAULT, { sessionKey });
  }

  /** Clear the terminal display */
  async clearDisplay(sessionKey: string, request: TerminalClearDisplayRequest): Promise<void> {
    await this.post('/clearDisplay', request, TIMEOUT_DEFAULT, { sessionKey });
  }

  /** Cancel any pending terminal operation */
  async cancel(sessionKey: string, request: TerminalCancelRequest): Promise<void> {
    // Cancel uses a short timeout and no retries — it must respond fast
    await this.post('/cancel', request, TIMEOUT_CANCEL, { sessionKey, retries: 0 });
  }

  /** Prompt for tip on the terminal */
  async tipPrompt(
    sessionKey: string,
    request: TerminalTipRequest,
  ): Promise<TerminalTipResponse> {
    return this.post<TerminalTipResponse>(
      '/tip',
      request,
      TIMEOUT_READ_CARD,
      { sessionKey },
    );
  }

  /** Prompt for amount entry on the terminal keypad */
  async panPad(
    sessionKey: string,
    request: TerminalPanPadRequest,
  ): Promise<TerminalPanPadResponse> {
    return this.post<TerminalPanPadResponse>(
      '/panPad',
      request,
      TIMEOUT_READ_CARD,
      { sessionKey },
    );
  }

  /** Get the terminal's current date/time */
  async getDateTime(sessionKey: string, hsn: string): Promise<TerminalDateTimeResponse> {
    return this.post<TerminalDateTimeResponse>(
      '/dateTime',
      { hsn },
      TIMEOUT_DEFAULT,
      { sessionKey },
    );
  }

  // ── Transport ────────────────────────────────────────────

  private async post<T>(
    path: string,
    body: Record<string, unknown>,
    timeoutMs: number,
    options?: {
      sessionKey?: string;
      useBasicAuth?: boolean;
      retries?: number;
    },
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const maxRetries = options?.retries ?? MAX_RETRIES;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (options?.useBasicAuth) {
      headers['Authorization'] = `Basic ${this.basicAuth}`;
    } else if (options?.sessionKey) {
      headers['X-CardConnect-SessionKey'] = options.sessionKey;
    }

    console.log(
      `[CardPointe Terminal] POST ${path}`,
      JSON.stringify(redactSensitive(body)),
    );

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          const responseText = await response.text().catch(() => '');

          // Connection-specific error
          if (path === '/connect' && response.status === 401) {
            throw new TerminalConnectionError(
              (body.hsn as string) ?? 'unknown',
              response.status,
              'Authentication failed — check API credentials',
            );
          }
          if (response.status === 409) {
            throw new TerminalConnectionError(
              (body.hsn as string) ?? 'unknown',
              response.status,
              'Terminal session conflict — another session may be active',
            );
          }

          throw new TerminalApiError(response.status, responseText);
        }

        // Some operations return no body (display, cancel, disconnect)
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('application/json')) {
          return undefined as unknown as T;
        }

        const data = await response.json() as T;
        console.log(
          `[CardPointe Terminal] Response ${path}:`,
          JSON.stringify(redactSensitive(data as Record<string, unknown>)),
        );
        return data;
      } catch (err) {
        clearTimeout(timer);

        // Convert AbortError to our timeout error
        if (err instanceof DOMException && err.name === 'AbortError') {
          const timeoutErr = new TerminalTimeoutError(path, timeoutMs);
          if (attempt < maxRetries && isRetryableError(timeoutErr)) {
            console.warn(
              `[CardPointe Terminal] Retry ${attempt + 1}/${maxRetries} after ${RETRY_DELAYS[attempt]}ms for POST ${path}`,
            );
            await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt] ?? 4_000));
            continue;
          }
          throw timeoutErr;
        }

        // Retry for retryable errors
        if (attempt < maxRetries && isRetryableError(err)) {
          console.warn(
            `[CardPointe Terminal] Retry ${attempt + 1}/${maxRetries} after ${RETRY_DELAYS[attempt]}ms for POST ${path}`,
          );
          await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt] ?? 4_000));
          continue;
        }

        throw err;
      }
    }

    // Should not reach here, but TypeScript needs it
    throw new TerminalTimeoutError(path, timeoutMs);
  }
}
