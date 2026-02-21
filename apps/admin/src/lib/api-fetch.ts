// ── Admin API fetch client ───────────────────────────────────────
// Similar to apps/web's apiFetch but scoped to the admin app.
// Credentials: 'include' ensures the HttpOnly session cookie is sent.

export class AdminApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

export async function adminFetch<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorBody: { error?: { code?: string; message?: string } } = {};
    try {
      errorBody = await response.json();
    } catch {
      // ignore parse errors
    }
    throw new AdminApiError(
      response.status,
      errorBody.error?.code ?? 'UNKNOWN_ERROR',
      errorBody.error?.message ?? `HTTP ${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}
