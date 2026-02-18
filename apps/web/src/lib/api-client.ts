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

let refreshPromise: Promise<boolean> | null = null;

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
    if (data.accessToken && data.refreshToken) {
      setTokens(data.accessToken, data.refreshToken);
      return true;
    }
    return false;
  } catch {
    return false;
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

  // Only set Content-Type for methods that have a body
  if (method !== 'GET' && method !== 'HEAD' && method !== 'DELETE') {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response = await fetch(path, {
    ...options,
    headers,
  });

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
    throw new ApiError(
      data.error?.code || 'UNKNOWN_ERROR',
      data.error?.message || 'An error occurred',
      response.status,
      data.error?.details,
    );
  }

  return data;
}

export class ApiError extends Error {
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
