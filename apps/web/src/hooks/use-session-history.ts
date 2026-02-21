'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────

export interface SessionSummary {
  id: string;
  tenantId: string;
  sessionId: string | null;
  startedAt: string;
  endedAt: string | null;
  messageCount: number;
  avgUserRating: number | null;
  status: string;
  firstMessage: string | null;
}

interface SessionListResponse {
  data: {
    sessions: SessionSummary[];
    cursor: string | null;
    hasMore: boolean;
  };
}

export interface UseSessionHistoryReturn {
  sessions: SessionSummary[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────

export function useSessionHistory(opts?: { limit?: number }): UseSessionHistoryReturn {
  const limit = opts?.limit ?? 20;
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchSessions = useCallback(async (cursorParam?: string) => {
    const isMore = !!cursorParam;
    if (isMore) setIsLoadingMore(true);
    else setIsLoading(true);

    try {
      const url = cursorParam
        ? `/api/v1/semantic/sessions?limit=${limit}&cursor=${cursorParam}`
        : `/api/v1/semantic/sessions?limit=${limit}`;
      const res = await apiFetch<SessionListResponse>(url);

      if (!mountedRef.current) return;

      const { sessions: newSessions, cursor: newCursor, hasMore: more } = res.data;
      setSessions((prev) => (isMore ? [...prev, ...newSessions] : newSessions));
      setCursor(newCursor);
      setHasMore(more);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, [limit]);

  useEffect(() => {
    mountedRef.current = true;
    fetchSessions();
    return () => { mountedRef.current = false; };
  }, [fetchSessions]);

  const loadMore = useCallback(() => {
    if (cursor && !isLoadingMore) {
      fetchSessions(cursor);
    }
  }, [cursor, isLoadingMore, fetchSessions]);

  const refresh = useCallback(() => {
    // Re-fetch page 1 (replaces all sessions, resets cursor)
    setCursor(null);
    fetchSessions();
  }, [fetchSessions]);

  return { sessions, isLoading, isLoadingMore, error, hasMore, loadMore, refresh };
}

// ── Relative time formatter ───────────────────────────────────────

export function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    return new Date(isoDate).toLocaleDateString([], { weekday: 'short' });
  }
  return new Date(isoDate).toLocaleDateString([], { month: 'short', day: 'numeric' });
}
