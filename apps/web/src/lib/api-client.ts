const TOKEN_KEY = 'oppsera_access_token';
const REFRESH_KEY = 'oppsera_refresh_token';

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// ── Token expiry helpers ──────────────────────────────────────────

/** Decode JWT payload and return the `exp` claim as epoch milliseconds. */
function getTokenExpiryMs(): number | null {
  const token = getStoredToken();
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]!));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

let refreshPromise: Promise<boolean> | null = null;

/**
 * Proactively refresh the access token if it expires within 5 minutes.
 * Call this on visibility-change resume so the first user action after
 * idle never hits a 401 → refresh → retry chain.
 */
export async function refreshTokenIfNeeded(): Promise<boolean> {
  const expiryMs = getTokenExpiryMs();
  if (expiryMs === null) return false;

  const remainingMs = expiryMs - Date.now();
  if (remainingMs > 5 * 60 * 1000) return false; // >5 min left — no action needed

  if (!refreshPromise) {
    refreshPromise = attemptTokenRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function attemptTokenRefresh(): Promise<boolean> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) return false;
    const data = await response.json();
    const tokens = data.data ?? data;
    if (tokens.accessToken && tokens.refreshToken) {
      setTokens(tokens.accessToken, tokens.refreshToken);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function getActiveRoleId(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem('oppsera:terminal-session');
    if (!stored) return null;
    return JSON.parse(stored).roleId ?? null;
  } catch {
    return null;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getStoredToken();
  const method = (options.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  // Only set Content-Type for methods that have a body, but NOT for FormData
  // (browser must set multipart/form-data with boundary automatically)
  if (method !== 'GET' && method !== 'HEAD' && method !== 'DELETE') {
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Send active role ID so backend scopes permissions to selected role
  if (!headers['x-role-id']) {
    const activeRoleId = getActiveRoleId();
    if (activeRoleId) {
      headers['x-role-id'] = activeRoleId;
    }
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers,
    });
  } catch (fetchErr) {
    // AbortError = intentional cancellation (e.g., navigating away) — don't log
    if (fetchErr instanceof DOMException && fetchErr.name === 'AbortError') {
      throw fetchErr;
    }
    // "Failed to fetch" = network-level failure (server unreachable, CORS, CSP, etc.)
    console.error('[apiFetch] Network error:', {
      path,
      method,
      hasToken: !!token,
      tokenLength: token?.length,
      headerKeys: Object.keys(headers),
      bodyLength: typeof options.body === 'string' ? options.body.length : undefined,
      error: fetchErr,
    });
    throw fetchErr;
  }

  // On 401, attempt token refresh (deduplicated)
  if (response.status === 401 && !path.includes('/auth/')) {
    if (!refreshPromise) {
      refreshPromise = attemptTokenRefresh().finally(() => {
        refreshPromise = null;
      });
    }
    const refreshed = await refreshPromise;
    if (refreshed) {
      // Retry with new token
      const newToken = getStoredToken();
      if (newToken) headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(path, { ...options, headers });
    }

    if (response.status === 401) {
      clearTokens();
      // Let the auth context handle the redirect via its useEffect
      throw new ApiError('UNAUTHORIZED', 'Authentication required', 401);
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      'PARSE_ERROR',
      `Server error (${response.status})`,
      response.status,
    );
  }

  if (!response.ok) {
    const err = new ApiError(
      data.error?.code || 'UNKNOWN_ERROR',
      data.error?.message || 'An error occurred',
      response.status,
      data.error?.details,
    );
    // Carry through structured payment error fields if present
    if (data.error?.userMessage) err.userMessage = data.error.userMessage;
    if (data.error?.suggestedAction) err.suggestedAction = data.error.suggestedAction;
    if (typeof data.error?.retryable === 'boolean') err.retryable = data.error.retryable;
    throw err;
  }

  return data;
}

export class ApiError extends Error {
  /** Cardholder-safe message from gateway response interpreter */
  userMessage?: string;
  /** Suggested next action (try_different_card, retry_later, etc.) */
  suggestedAction?: string;
  /** Whether the transaction can be retried */
  retryable?: boolean;

  constructor(
    public code: string,
    message: string,
    public statusCode: number,
    public details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
