'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

// ── Types ─────────────────────────────────────────────────────────

export type SharedInsightVisibility = 'anyone_with_link' | 'tenant_only' | 'specific_users';

export interface SharedInsight {
  id: string;
  /** Unique share token used in the public URL */
  token: string;
  /** Title for the shared insight */
  title: string;
  description: string | null;
  /** The original chat session this was shared from */
  sessionId: string | null;
  /** The specific eval turn(s) being shared */
  evalTurnIds: string[];
  /** Snapshot of the narrative content at share time */
  narrativeSnapshot: string;
  /** Snapshot of query results at share time */
  dataSnapshot: Record<string, unknown>[] | null;
  /** Snapshot of the query plan */
  planSnapshot: Record<string, unknown> | null;
  visibility: SharedInsightVisibility;
  /** User IDs who can access (only for specific_users visibility) */
  allowedUserIds: string[] | null;
  /** Optional expiration date */
  expiresAt: string | null;
  /** Whether the shared link is active */
  isActive: boolean;
  /** Number of times the shared insight has been viewed */
  viewCount: number;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SharedInsightPublicView {
  title: string;
  description: string | null;
  narrative: string;
  data: Record<string, unknown>[] | null;
  plan: Record<string, unknown> | null;
  createdByName: string | null;
  createdAt: string;
  /** Whether the insight has expired */
  isExpired: boolean;
}

export interface CreateSharedInsightInput {
  title: string;
  description?: string;
  sessionId?: string;
  evalTurnIds?: string[];
  narrativeSnapshot: string;
  dataSnapshot?: Record<string, unknown>[];
  planSnapshot?: Record<string, unknown>;
  visibility?: SharedInsightVisibility;
  allowedUserIds?: string[];
  /** ISO date string for when the link should expire */
  expiresAt?: string;
}

// ── useSharedInsights ─────────────────────────────────────────────

interface UseSharedInsightsOptions {
  limit?: number;
}

export function useSharedInsights(opts: UseSharedInsightsOptions = {}) {
  const [insights, setInsights] = useState<SharedInsight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString({ limit: opts.limit });
      const res = await apiFetch<{ data: SharedInsight[] }>(
        `/api/v1/semantic/shared${qs}`,
      );
      setInsights(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load shared insights');
    } finally {
      setIsLoading(false);
    }
  }, [opts.limit]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const createSharedInsight = useCallback(async (input: CreateSharedInsightInput): Promise<SharedInsight | null> => {
    try {
      const res = await apiFetch<{ data: SharedInsight }>(
        '/api/v1/semantic/shared',
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      );
      await fetchInsights();
      return res.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create shared insight');
      return null;
    }
  }, [fetchInsights]);

  const deactivateSharedInsight = useCallback(async (insightId: string): Promise<boolean> => {
    try {
      await apiFetch(`/api/v1/semantic/shared/${insightId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: false }),
      });
      await fetchInsights();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate shared insight');
      return false;
    }
  }, [fetchInsights]);

  return {
    insights,
    isLoading,
    error,
    createSharedInsight,
    deactivateSharedInsight,
    refresh: fetchInsights,
  };
}

// ── useSharedInsightByToken ───────────────────────────────────────

export function useSharedInsightByToken(token: string) {
  const [insight, setInsight] = useState<SharedInsightPublicView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInsight = useCallback(async () => {
    if (!token) {
      setInsight(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: SharedInsightPublicView }>(
        `/api/v1/semantic/shared/view/${token}`,
      );
      setInsight(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load shared insight');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchInsight();
  }, [fetchInsight]);

  return { insight, isLoading, error, refresh: fetchInsight };
}
