'use client';

import { useState, useCallback } from 'react';
import { adminFetch } from '@/lib/api-fetch';
import type {
  Experiment,
  ExperimentListResponse,
  CreateExperimentPayload,
  RegressionRunDetail,
  RegressionListResponse,
  RegressionTrend,
  SafetyRule,
  SafetyViolationListResponse,
  CreateSafetyRulePayload,
  CostSummary,
  BatchReviewQueue,
  AssignReviewPayload,
  ConversationDetail,
  ConversationListResponse,
  PlaygroundRequest,
  PlaygroundResult,
  ComparativeAnalysis,
  CreateExamplePayload,
  UpdateExamplePayload,
  BulkImportPayload,
  ExampleEffectiveness,
  PromoteCorrectionPayload,
} from '@/types/eval';

// ── Experiments ─────────────────────────────────────────────────

export function useExperiments() {
  const [data, setData] = useState<ExperimentListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (params: Record<string, string> = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams(params);
      const res = await adminFetch<{ data: ExperimentListResponse }>(`/api/v1/eval/experiments?${qs}`);
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load experiments');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const create = useCallback(async (payload: CreateExperimentPayload): Promise<string> => {
    const res = await adminFetch<{ data: { id: string } }>('/api/v1/eval/experiments', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data.id;
  }, []);

  const start = useCallback(async (id: string) => {
    await adminFetch(`/api/v1/eval/experiments/${id}/start`, { method: 'POST' });
  }, []);

  const complete = useCallback(async (id: string, winner?: string, notes?: string) => {
    await adminFetch(`/api/v1/eval/experiments/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ winner, conclusionNotes: notes }),
    });
  }, []);

  return { data, isLoading, error, load, create, start, complete };
}

export function useExperiment(id: string) {
  const [data, setData] = useState<Experiment | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: Experiment }>(`/api/v1/eval/experiments/${id}`);
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load experiment');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  return { data, isLoading, error, load };
}

// ── Regression Testing ──────────────────────────────────────────

export function useRegressionRuns() {
  const [data, setData] = useState<RegressionListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (params: Record<string, string> = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams(params);
      const res = await adminFetch<{ data: RegressionListResponse }>(`/api/v1/eval/regression?${qs}`);
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load regression runs');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const startRun = useCallback(async (payload: { name?: string; categoryFilter?: string }): Promise<string> => {
    const res = await adminFetch<{ data: { id: string } }>('/api/v1/eval/regression', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data.id;
  }, []);

  return { data, isLoading, error, load, startRun };
}

export function useRegressionRun(id: string) {
  const [data, setData] = useState<RegressionRunDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: RegressionRunDetail }>(`/api/v1/eval/regression/${id}`);
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load regression run');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  return { data, isLoading, error, load };
}

export function useRegressionTrend() {
  const [data, setData] = useState<RegressionTrend[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: RegressionTrend[] }>('/api/v1/eval/regression/trend');
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load trend');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { data, isLoading, error, load };
}

// ── Safety Rules ────────────────────────────────────────────────

export function useSafetyRules() {
  const [data, setData] = useState<SafetyRule[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: SafetyRule[] }>('/api/v1/eval/safety/rules');
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load safety rules');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const create = useCallback(async (payload: CreateSafetyRulePayload): Promise<string> => {
    const res = await adminFetch<{ data: { id: string } }>('/api/v1/eval/safety/rules', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data.id;
  }, []);

  const update = useCallback(async (id: string, payload: Partial<CreateSafetyRulePayload & { isActive: boolean }>) => {
    await adminFetch(`/api/v1/eval/safety/rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }, []);

  const remove = useCallback(async (id: string) => {
    await adminFetch(`/api/v1/eval/safety/rules/${id}`, { method: 'DELETE' });
    setData((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return { data, isLoading, error, load, create, update, remove };
}

export function useSafetyViolations() {
  const [data, setData] = useState<SafetyViolationListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (params: Record<string, string> = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams(params);
      const res = await adminFetch<{ data: SafetyViolationListResponse }>(`/api/v1/eval/safety/violations?${qs}`);
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load violations');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const resolve = useCallback(async (id: string) => {
    await adminFetch(`/api/v1/eval/safety/violations/${id}/resolve`, { method: 'POST' });
  }, []);

  return { data, isLoading, error, load, resolve };
}

// ── Cost Analytics ──────────────────────────────────────────────

export function useCostAnalytics() {
  const [data, setData] = useState<CostSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (params: Record<string, string> = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams(params);
      const res = await adminFetch<{ data: CostSummary }>(`/api/v1/eval/cost?${qs}`);
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load cost data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { data, isLoading, error, load };
}

// ── Batch Review ────────────────────────────────────────────────

export function useBatchReview() {
  const [data, setData] = useState<BatchReviewQueue | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (params: Record<string, string> = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams(params);
      const res = await adminFetch<{ data: BatchReviewQueue }>(`/api/v1/eval/batch-review?${qs}`);
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load review queue');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const assign = useCallback(async (payload: AssignReviewPayload) => {
    await adminFetch('/api/v1/eval/batch-review', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }, []);

  const updateStatus = useCallback(async (id: string, status: 'in_progress' | 'completed' | 'skipped') => {
    await adminFetch(`/api/v1/eval/batch-review/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }, []);

  return { data, isLoading, error, load, assign, updateStatus };
}

// ── Conversations ───────────────────────────────────────────────

export function useConversations() {
  const [data, setData] = useState<ConversationListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (params: Record<string, string> = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams(params);
      const res = await adminFetch<{ data: ConversationListResponse }>(`/api/v1/eval/conversations?${qs}`);
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load conversations');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { data, isLoading, error, load };
}

export function useConversation(sessionId: string) {
  const [data, setData] = useState<ConversationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: ConversationDetail }>(`/api/v1/eval/conversations/${sessionId}`);
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load conversation');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  return { data, isLoading, error, load };
}

// ── Playground ──────────────────────────────────────────────────

export function usePlayground() {
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (payload: PlaygroundRequest) => {
    setIsRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await adminFetch<{ data: PlaygroundResult }>('/api/v1/eval/playground', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setResult(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Playground execution failed');
    } finally {
      setIsRunning(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, isRunning, error, run, clear };
}

// ── Comparative Analysis ────────────────────────────────────────

export function useComparativeAnalysis() {
  const [data, setData] = useState<ComparativeAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (params: Record<string, string> = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams(params);
      const res = await adminFetch<{ data: ComparativeAnalysis }>(`/api/v1/eval/compare?${qs}`);
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load comparative data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { data, isLoading, error, load };
}

// ── Enhanced Example CRUD ───────────────────────────────────────

export function useExampleCrud() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createExample = useCallback(async (payload: CreateExamplePayload): Promise<string> => {
    setIsSubmitting(true);
    try {
      const res = await adminFetch<{ data: { id: string } }>('/api/v1/eval/examples', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return res.data.id;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const updateExample = useCallback(async (id: string, payload: UpdateExamplePayload) => {
    setIsSubmitting(true);
    try {
      await adminFetch(`/api/v1/eval/examples/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const bulkImport = useCallback(async (payload: BulkImportPayload): Promise<{ imported: number; ids: string[] }> => {
    setIsSubmitting(true);
    try {
      const res = await adminFetch<{ data: { imported: number; ids: string[] } }>('/api/v1/eval/examples/bulk-import', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return res.data;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const exportExamples = useCallback(async (params: Record<string, string> = {}): Promise<unknown[]> => {
    const qs = new URLSearchParams(params);
    const res = await adminFetch<{ data: unknown[] }>(`/api/v1/eval/examples/export?${qs}`);
    return res.data;
  }, []);

  const getEffectiveness = useCallback(async (id: string): Promise<ExampleEffectiveness> => {
    const res = await adminFetch<{ data: ExampleEffectiveness }>(`/api/v1/eval/examples/${id}/effectiveness`);
    return res.data;
  }, []);

  const promoteCorrection = useCallback(async (turnId: string, payload: PromoteCorrectionPayload): Promise<string> => {
    const res = await adminFetch<{ data: { id: string } }>(`/api/v1/eval/turns/${turnId}/promote-correction`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data.id;
  }, []);

  return { isSubmitting, createExample, updateExample, bulkImport, exportExamples, getEffectiveness, promoteCorrection };
}
