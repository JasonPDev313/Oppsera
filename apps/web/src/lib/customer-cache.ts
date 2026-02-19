/**
 * Shared customer cache for POS — loads up to 500 customers once,
 * filters client-side (instant), falls back to server search for
 * large customer bases where the cache may be incomplete.
 */
import { apiFetch } from '@/lib/api-client';

export interface CachedCustomer {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  type: 'person' | 'organization';
}

// ── Module-level singleton ──────────────────────────────────────────

const CACHE_LIMIT = 500;
const CACHE_TTL = 5 * 60_000; // 5 minutes

let _customers: CachedCustomer[] = [];
let _loadedAt = 0;
let _loadPromise: Promise<CachedCustomer[]> | null = null;
/** True when the DB had <= CACHE_LIMIT customers (cache is complete) */
let _isComplete = false;

// ── Cache warming ───────────────────────────────────────────────────

/** Pre-warm the cache. Safe to call multiple times — deduplicates. */
export function warmCustomerCache(): void {
  if (_loadPromise) return;
  if (_customers.length > 0 && Date.now() - _loadedAt < CACHE_TTL) return;
  _loadPromise = fetchAll();
  _loadPromise.catch(() => {}).finally(() => { _loadPromise = null; });
}

/** Returns the cached list, loading if needed. Callers can await this. */
export async function getCustomerCache(): Promise<CachedCustomer[]> {
  if (_customers.length > 0 && Date.now() - _loadedAt < CACHE_TTL) {
    return _customers;
  }
  if (_loadPromise) return _loadPromise;
  _loadPromise = fetchAll();
  const result = await _loadPromise;
  _loadPromise = null;
  return result;
}

/** Synchronous snapshot — may be empty before first load completes. */
export function getCustomerCacheSync(): CachedCustomer[] {
  return _customers;
}

export function isCacheComplete(): boolean {
  return _isComplete;
}

export function isCacheReady(): boolean {
  return _customers.length > 0 && Date.now() - _loadedAt < CACHE_TTL;
}

// ── Client-side search ──────────────────────────────────────────────

export function filterCustomersLocal(
  query: string,
  limit = 10,
): CachedCustomer[] {
  const q = query.toLowerCase();
  const results: CachedCustomer[] = [];
  for (const c of _customers) {
    if (
      c.displayName.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(q)
    ) {
      results.push(c);
      if (results.length >= limit) break;
    }
  }
  return results;
}

// ── Server-side fallback ────────────────────────────────────────────

let _serverAbort: AbortController | null = null;

/**
 * Calls the server search API. Cancels any in-flight server search
 * automatically (only one at a time).
 */
export async function searchCustomersServer(
  query: string,
): Promise<CachedCustomer[]> {
  _serverAbort?.abort();
  const controller = new AbortController();
  _serverAbort = controller;
  try {
    const res = await apiFetch<{ data: CachedCustomer[] }>(
      `/api/v1/customers/search?search=${encodeURIComponent(query)}`,
      { signal: controller.signal },
    );
    return res.data;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return [];
    throw err;
  } finally {
    if (_serverAbort === controller) _serverAbort = null;
  }
}

/** Cancel any pending server search (e.g., on unmount). */
export function cancelServerSearch(): void {
  _serverAbort?.abort();
  _serverAbort = null;
}

// ── Internals ───────────────────────────────────────────────────────

async function fetchAll(): Promise<CachedCustomer[]> {
  try {
    const res = await apiFetch<{ data: CachedCustomer[] }>(
      `/api/v1/customers/search?limit=${CACHE_LIMIT}`,
    );
    _customers = res.data;
    _loadedAt = Date.now();
    _isComplete = res.data.length < CACHE_LIMIT;
    return _customers;
  } catch {
    // Keep stale cache on failure
    return _customers;
  }
}
