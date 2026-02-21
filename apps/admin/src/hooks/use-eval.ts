'use client';

import { useState, useCallback } from 'react';
import { adminFetch } from '@/lib/api-fetch';
import type {
  EvalFeedResponse,
  EvalTurnDetail,
  EvalSession,
  QualityDashboard,
  EvalExample,
  ProblematicPattern,
  AdminReviewPayload,
  PromoteExamplePayload,
} from '@/types/eval';

// ── Feed ─────────────────────────────────────────────────────────

export function useEvalFeed(tenantId?: string) {
  const [data, setData] = useState<EvalFeedResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (params: Record<string, string> = {}) => {
      setIsLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams(params);
        if (tenantId) qs.set('tenantId', tenantId);
        const res = await adminFetch<{ data: EvalFeedResponse }>(`/api/v1/eval/feed?${qs}`);
        setData(res.data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load feed');
      } finally {
        setIsLoading(false);
      }
    },
    [tenantId],
  );

  return { data, isLoading, error, load };
}

// ── Turn detail ───────────────────────────────────────────────────

export function useEvalTurn(turnId: string) {
  const [data, setData] = useState<EvalTurnDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: EvalTurnDetail }>(`/api/v1/eval/turns/${turnId}`);
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load turn');
    } finally {
      setIsLoading(false);
    }
  }, [turnId]);

  const submitReview = useCallback(
    async (payload: AdminReviewPayload) => {
      await adminFetch(`/api/v1/eval/turns/${turnId}/review`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await load();
    },
    [turnId, load],
  );

  const promote = useCallback(
    async (payload: PromoteExamplePayload = {}) => {
      await adminFetch(`/api/v1/eval/turns/${turnId}/promote`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await load();
    },
    [turnId, load],
  );

  return { data, isLoading, error, load, submitReview, promote };
}

// ── Session detail ────────────────────────────────────────────────

export function useEvalSession(sessionId: string) {
  const [data, setData] = useState<EvalSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: EvalSession }>(`/api/v1/eval/sessions/${sessionId}`);
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load session');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  return { data, isLoading, error, load };
}

// ── Dashboard ─────────────────────────────────────────────────────

export function useEvalDashboard(tenantId?: string) {
  const [data, setData] = useState<QualityDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (dateRange?: { start: string; end: string }) => {
      setIsLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (tenantId) qs.set('tenantId', tenantId);
        if (dateRange) {
          qs.set('start', dateRange.start);
          qs.set('end', dateRange.end);
        }
        const res = await adminFetch<{ data: QualityDashboard }>(`/api/v1/eval/dashboard?${qs}`);
        setData(res.data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load dashboard');
      } finally {
        setIsLoading(false);
      }
    },
    [tenantId],
  );

  return { data, isLoading, error, load };
}

// ── Examples ──────────────────────────────────────────────────────

export function useEvalExamples() {
  const [data, setData] = useState<EvalExample[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (params: Record<string, string> = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams(params);
      const res = await adminFetch<{ data: EvalExample[] }>(`/api/v1/eval/examples?${qs}`);
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load examples');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const remove = useCallback(
    async (id: string) => {
      await adminFetch(`/api/v1/eval/examples/${id}`, { method: 'DELETE' });
      setData((prev) => prev.filter((ex) => ex.id !== id));
    },
    [],
  );

  return { data, isLoading, error, load, remove };
}

// ── Patterns ──────────────────────────────────────────────────────

export function useEvalPatterns(tenantId?: string) {
  const [data, setData] = useState<ProblematicPattern[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (tenantId) qs.set('tenantId', tenantId);
      const res = await adminFetch<{ data: ProblematicPattern[] }>(`/api/v1/eval/patterns?${qs}`);
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load patterns');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  return { data, isLoading, error, load };
}
