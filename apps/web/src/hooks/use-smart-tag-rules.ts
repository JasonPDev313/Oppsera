'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

export interface SmartTagRuleListItem {
  id: string;
  tagId: string;
  tagName: string;
  tagColor: string;
  name: string;
  description: string | null;
  isActive: boolean;
  evaluationMode: string;
  customersMatched: number;
  customersAdded: number;
  customersRemoved: number;
  lastEvaluatedAt: string | null;
  lastEvaluationDurationMs: number | null;
  version: number;
  createdAt: string;
}

export interface SmartTagRuleDetail extends SmartTagRuleListItem {
  tenantId: string;
  tagSlug: string;
  scheduleCron: string | null;
  conditions: unknown[];
  autoRemove: boolean;
  cooldownHours: number | null;
  priority: number;
  metadata: Record<string, unknown> | null;
  updatedAt: string;
  createdBy: string;
  recentEvaluations: SmartTagEvaluation[];
}

export interface SmartTagEvaluation {
  id: string;
  triggerType: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  customersEvaluated: number;
  tagsApplied: number;
  tagsRemoved: number;
  durationMs: number | null;
}

interface UseSmartTagRulesOptions {
  isActive?: boolean;
}

export function useSmartTagRules(options: UseSmartTagRulesOptions = {}) {
  const [data, setData] = useState<SmartTagRuleListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);

  const fetchData = useCallback(async (loadMore = false) => {
    try {
      if (!loadMore) setIsLoading(true);
      setError(null);
      const qs = buildQueryString({
        isActive: options.isActive,
        cursor: loadMore ? cursorRef.current : undefined,
      });
      const res = await apiFetch<{ data: SmartTagRuleListItem[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/customers/smart-tag-rules${qs}`,
      );
      if (loadMore) {
        setData((prev) => [...prev, ...res.data]);
      } else {
        setData(res.data);
      }
      cursorRef.current = res.meta.cursor;
      setHasMore(res.meta.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load smart tag rules'));
    } finally {
      setIsLoading(false);
    }
  }, [options.isActive]);

  useEffect(() => {
    cursorRef.current = null;
    fetchData();
  }, [fetchData]);

  const loadMore = useCallback(() => fetchData(true), [fetchData]);
  const mutate = useCallback(() => {
    cursorRef.current = null;
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, hasMore, loadMore, mutate };
}

export function useSmartTagRule(ruleId: string | null) {
  const [data, setData] = useState<SmartTagRuleDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!ruleId) { setData(null); return; }
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<{ data: SmartTagRuleDetail }>(`/api/v1/customers/smart-tag-rules/${ruleId}`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load smart tag rule'));
    } finally {
      setIsLoading(false);
    }
  }, [ruleId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

export function useSmartTagRuleMutations() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createRule = useCallback(async (input: {
    tagId: string;
    name: string;
    description?: string;
    evaluationMode?: string;
    scheduleCron?: string;
    conditions: unknown[];
    autoRemove?: boolean;
    cooldownHours?: number;
    priority?: number;
  }) => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch<{ data: SmartTagRuleListItem }>('/api/v1/customers/smart-tag-rules', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return res.data;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const updateRule = useCallback(async (ruleId: string, input: Record<string, unknown>) => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch<{ data: SmartTagRuleListItem }>(`/api/v1/customers/smart-tag-rules/${ruleId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
      return res.data;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const toggleRule = useCallback(async (ruleId: string) => {
    setIsSubmitting(true);
    try {
      await apiFetch(`/api/v1/customers/smart-tag-rules/${ruleId}/toggle`, { method: 'POST' });
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const evaluateRule = useCallback(async (ruleId: string) => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch<{ data: { evaluationId: string; customersEvaluated: number; tagsApplied: number; tagsRemoved: number; tagsUnchanged: number; durationMs: number; status: string } }>(
        `/api/v1/customers/smart-tag-rules/${ruleId}/evaluate`,
        { method: 'POST' },
      );
      return res.data;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return { createRule, updateRule, toggleRule, evaluateRule, isSubmitting };
}
