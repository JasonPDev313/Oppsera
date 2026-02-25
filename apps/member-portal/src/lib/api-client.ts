const DEFAULT_TIMEOUT_MS = 10_000; // 10 seconds

/**
 * Portal-specific API client.
 * All API calls go to the same Next.js app (member-portal) — no cross-origin.
 * Includes automatic timeout to prevent infinite hangs on slow responses.
 */
export async function portalFetch<T = any>(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...fetchOptions,
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
      },
      credentials: 'same-origin',
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const message =
        body?.error?.message ?? `Request failed (${res.status})`;
      throw new Error(message);
    }

    return res.json();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
