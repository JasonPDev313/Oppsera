/**
 * Portal-specific API client.
 * All API calls go to the same Next.js app (member-portal) — no cross-origin.
 */
export async function portalFetch<T = any>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'same-origin',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message =
      body?.error?.message ?? `Request failed (${res.status})`;
    throw new Error(message);
  }

  return res.json();
}
