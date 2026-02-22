'use client';

import { useState, useEffect, useCallback } from 'react';

interface DeadLetterEntry {
  id: string;
  tenantId: string | null;
  eventId: string;
  eventType: string;
  eventData: Record<string, unknown>;
  consumerName: string;
  errorMessage: string | null;
  errorStack: string | null;
  attemptCount: number;
  maxRetries: number;
  firstFailedAt: string;
  lastFailedAt: string;
  status: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNotes: string | null;
  createdAt: string;
}

interface DeadLetterStats {
  totalFailed: number;
  totalRetrying: number;
  totalResolved: number;
  totalDiscarded: number;
  byEventType: Array<{ eventType: string; count: number }>;
  byConsumer: Array<{ consumerName: string; count: number }>;
}

interface ListFilters {
  status?: string;
  eventType?: string;
  consumerName?: string;
  tenantId?: string;
}

async function adminFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, {
    ...opts,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export function useDeadLetters(filters: ListFilters = {}) {
  const [items, setItems] = useState<DeadLetterEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async (cursorVal?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.eventType) params.set('eventType', filters.eventType);
      if (filters.consumerName) params.set('consumerName', filters.consumerName);
      if (filters.tenantId) params.set('tenantId', filters.tenantId);
      if (cursorVal) params.set('cursor', cursorVal);
      params.set('limit', '50');

      const qs = params.toString() ? `?${params.toString()}` : '';
      const json = await adminFetch(`/api/v1/events${qs}`);
      if (cursorVal) {
        setItems((prev) => [...prev, ...json.data]);
      } else {
        setItems(json.data);
      }
      setCursor(json.meta?.cursor ?? null);
      setHasMore(json.meta?.hasMore ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dead letters');
    } finally {
      setIsLoading(false);
    }
  }, [filters.status, filters.eventType, filters.consumerName, filters.tenantId]);

  useEffect(() => { fetchPage(); }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (cursor && hasMore) fetchPage(cursor);
  }, [cursor, hasMore, fetchPage]);

  const refresh = useCallback(() => {
    setCursor(null);
    fetchPage();
  }, [fetchPage]);

  return { items, isLoading, error, hasMore, loadMore, refresh };
}

export function useDeadLetterStats() {
  const [stats, setStats] = useState<DeadLetterStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const json = await adminFetch('/api/v1/events?view=stats');
      setStats(json.data);
    } catch {
      // silently fail stats
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return { stats, isLoading, refresh: fetch };
}

export function useDeadLetterDetail(id: string) {
  const [entry, setEntry] = useState<DeadLetterEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const json = await adminFetch(`/api/v1/events/${id}`);
      setEntry(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entry');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => { fetch(); }, [fetch]);

  return { entry, isLoading, error, refresh: fetch };
}

export function useDeadLetterActions() {
  const [isActing, setIsActing] = useState(false);

  const retry = useCallback(async (id: string) => {
    setIsActing(true);
    try {
      await adminFetch('/api/v1/events', {
        method: 'POST',
        body: JSON.stringify({ action: 'retry', id }),
      });
      return true;
    } catch {
      return false;
    } finally {
      setIsActing(false);
    }
  }, []);

  const resolve = useCallback(async (id: string, notes?: string) => {
    setIsActing(true);
    try {
      await adminFetch('/api/v1/events', {
        method: 'POST',
        body: JSON.stringify({ action: 'resolve', id, notes }),
      });
      return true;
    } catch {
      return false;
    } finally {
      setIsActing(false);
    }
  }, []);

  const discard = useCallback(async (id: string, notes?: string) => {
    setIsActing(true);
    try {
      await adminFetch('/api/v1/events', {
        method: 'POST',
        body: JSON.stringify({ action: 'discard', id, notes }),
      });
      return true;
    } catch {
      return false;
    } finally {
      setIsActing(false);
    }
  }, []);

  return { retry, resolve, discard, isActing };
}
