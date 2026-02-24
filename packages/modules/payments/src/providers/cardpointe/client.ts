import type {
  CardPointeAuthRequest,
  CardPointeAuthResponse,
  CardPointeCaptureRequest,
  CardPointeCaptureResponse,
  CardPointeVoidRequest,
  CardPointeVoidResponse,
  CardPointeRefundRequest,
  CardPointeRefundResponse,
  CardPointeInquireResponse,
  CardPointeVoidByOrderIdRequest,
  CardPointeVoidByOrderIdResponse,
  CardPointeProfileRequest,
  CardPointeProfileResponse,
  CardPointeProfileGetResponse,
  CardPointeSettlementResponse,
  CardPointeSigCapRequest,
  CardPointeFundingResponse,
} from './types';

// Fields that must never be logged
const REDACTED_FIELDS = new Set(['account', 'cvv2', 'token', 'expiry', 'password']);

function redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (REDACTED_FIELDS.has(key)) {
      result[key] = '***REDACTED***';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = redactSensitive(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export class CardPointeTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CardPointeTimeoutError';
  }
}

export class CardPointeNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CardPointeNetworkError';
  }
}

export interface CardPointeClientConfig {
  site: string;
  merchantId: string;
  username: string;
  password: string;
  sandbox?: boolean;
}

/**
 * Low-level HTTP client for CardPointe REST API.
 * Handles authentication, retries for network errors, and timeout recovery.
 */
export class CardPointeClient {
  private baseUrl: string;
  private authHeader: string;
  private readonly AUTH_TIMEOUT_MS = 30_000;
  private readonly DEFAULT_TIMEOUT_MS = 15_000;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAYS = [1000, 2000, 4000]; // exponential backoff

  constructor(private config: CardPointeClientConfig) {
    this.baseUrl = `https://${config.site}.cardconnect.com/cardconnect/rest/`;
    const credentials = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    this.authHeader = `Basic ${credentials}`;
  }

  // ── Core API Methods ─────────────────────────────────────────

  async authorize(request: CardPointeAuthRequest): Promise<CardPointeAuthResponse> {
    return this.put<CardPointeAuthResponse>('auth', request, this.AUTH_TIMEOUT_MS);
  }

  async capture(request: CardPointeCaptureRequest): Promise<CardPointeCaptureResponse> {
    return this.put<CardPointeCaptureResponse>('capture', request);
  }

  async voidTransaction(request: CardPointeVoidRequest): Promise<CardPointeVoidResponse> {
    return this.put<CardPointeVoidResponse>('void', request);
  }

  async refund(request: CardPointeRefundRequest): Promise<CardPointeRefundResponse> {
    return this.put<CardPointeRefundResponse>('refund', request);
  }

  async inquire(retref: string, merchid: string): Promise<CardPointeInquireResponse> {
    return this.get<CardPointeInquireResponse>(`inquire/${retref}/${merchid}`);
  }

  async inquireByOrderId(orderid: string, merchid: string): Promise<CardPointeInquireResponse | null> {
    try {
      return await this.get<CardPointeInquireResponse>(`inquireByOrderid/${orderid}/${merchid}`);
    } catch {
      // 404 or not found — return null
      return null;
    }
  }

  async voidByOrderId(request: CardPointeVoidByOrderIdRequest): Promise<CardPointeVoidByOrderIdResponse> {
    return this.put<CardPointeVoidByOrderIdResponse>('voidByOrderId', request);
  }

  // ── Profile Methods ──────────────────────────────────────────

  async createProfile(request: CardPointeProfileRequest): Promise<CardPointeProfileResponse> {
    return this.put<CardPointeProfileResponse>('profile', request);
  }

  async getProfile(profileid: string, merchid: string, acctid?: string): Promise<CardPointeProfileGetResponse> {
    const path = acctid
      ? `profile/${profileid}/${acctid}/${merchid}`
      : `profile/${profileid}//${merchid}`;
    return this.get<CardPointeProfileGetResponse>(path);
  }

  async deleteProfile(profileid: string, merchid: string, acctid?: string): Promise<void> {
    const path = acctid
      ? `profile/${profileid}/${acctid}/${merchid}`
      : `profile/${profileid}//${merchid}`;
    await this.del(path);
  }

  // ── Settlement Methods ───────────────────────────────────────

  async getSettlementStatus(merchid: string, date: string): Promise<CardPointeSettlementResponse> {
    return this.get<CardPointeSettlementResponse>(`settlestat?merchid=${merchid}&date=${date}`);
  }

  // ── ACH Funding Methods ─────────────────────────────────────

  async getFundingStatus(merchid: string, date: string): Promise<CardPointeFundingResponse> {
    return this.get<CardPointeFundingResponse>(`funding?merchid=${merchid}&date=${date}`);
  }

  // ── Signature Capture ────────────────────────────────────────

  async captureSignature(request: CardPointeSigCapRequest): Promise<void> {
    await this.put('sigcap', request);
  }

  // ── Apple Pay: Merchant Session Validation ─────────────────

  /**
   * Validate a merchant session with Apple Pay via CardPointe's proxy.
   * Called during `onvalidatemerchant` in the Apple Pay JS flow.
   */
  async getApplePaySession(
    validationUrl: string,
    domainName: string,
    displayName: string,
  ): Promise<Record<string, unknown>> {
    return this.put<Record<string, unknown>>('applepay/validate', {
      validationurl: validationUrl,
      domain: domainName,
      displayname: displayName,
      merchid: this.config.merchantId,
    }, this.AUTH_TIMEOUT_MS);
  }

  // ── Wallet Tokenization (CardSecure) ──────────────────────

  /**
   * Tokenize wallet payment data (Apple Pay / Google Pay) via CardSecure.
   * Uses a separate endpoint from the standard CardPointe REST API.
   *
   * @param devicedata - Base64-encoded wallet payment data
   * @param encryptionhandler - 'EC_GOOGLE_PAY' for Google Pay; omit for Apple Pay
   * @returns Token from CardSecure
   */
  async tokenizeWalletData(
    devicedata: string,
    encryptionhandler?: string,
  ): Promise<{ token: string }> {
    const cardSecureUrl = `https://${this.config.site}.cardconnect.com/cardsecure/api/v1/ccn/tokenize`;

    const body: Record<string, string> = { devicedata };
    if (encryptionhandler) {
      body.encryptionhandler = encryptionhandler;
    }

    console.log('[CardPointe] CardSecure tokenize wallet', { encryptionhandler: encryptionhandler ?? 'apple_pay' });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.AUTH_TIMEOUT_MS);

    try {
      const response = await fetch(cardSecureUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new CardPointeNetworkError(
          `CardSecure tokenize error: ${response.status} ${response.statusText} — ${text}`,
        );
      }

      const data = (await response.json()) as { token?: string; errorcode?: string; message?: string };

      if (data.errorcode || !data.token) {
        throw new CardPointeNetworkError(
          `CardSecure tokenize failed: ${data.message ?? data.errorcode ?? 'unknown error'}`,
        );
      }

      return { token: data.token };
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof CardPointeNetworkError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new CardPointeTimeoutError('CardSecure wallet tokenize request timed out');
      }
      throw err;
    }
  }

  // ── HTTP Transport Layer ─────────────────────────────────────

  private async put<T>(path: string, body: object, timeoutMs?: number): Promise<T> {
    return this.request<T>('PUT', path, body, timeoutMs);
  }

  private async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  private async del(path: string): Promise<void> {
    await this.request('DELETE', path);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: object,
    timeoutMs?: number,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const timeout = timeoutMs ?? this.DEFAULT_TIMEOUT_MS;

    // Log outgoing request (redacted)
    if (body) {
      console.log(`[CardPointe] ${method} ${path}`, redactSensitive(body as Record<string, unknown>));
    } else {
      console.log(`[CardPointe] ${method} ${path}`);
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          method,
          headers: {
            Authorization: this.authHeader,
            'Content-Type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new CardPointeNetworkError(
            `CardPointe API error: ${response.status} ${response.statusText} — ${text}`,
          );
        }

        if (method === 'DELETE') {
          return undefined as unknown as T;
        }

        const data = await response.json();
        console.log(`[CardPointe] Response ${path}:`, redactSensitive(data as Record<string, unknown>));
        return data as T;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // AbortController timeout
        if (lastError.name === 'AbortError') {
          lastError = new CardPointeTimeoutError(`CardPointe request timed out after ${timeout}ms: ${method} ${path}`);
        }

        // Only retry on network/timeout errors, not business declines
        const isRetriable =
          lastError instanceof CardPointeTimeoutError ||
          lastError instanceof CardPointeNetworkError;

        if (!isRetriable || attempt >= this.MAX_RETRIES) {
          break;
        }

        const delay = this.RETRY_DELAYS[attempt] ?? 4000;
        console.log(`[CardPointe] Retry ${attempt + 1}/${this.MAX_RETRIES} after ${delay}ms for ${method} ${path}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }
}
