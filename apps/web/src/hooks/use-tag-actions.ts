'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

// ── Types ────────────────────────────────────────────────────────────────────

export type TagActionTrigger = 'on_apply' | 'on_remove' | 'on_expire';

export type TagActionType =
  | 'log_activity'
  | 'set_customer_field'
  | 'add_to_segment'
  | 'remove_from_segment'
  | 'set_service_flag'
  | 'remove_service_flag'
  | 'send_notification'
  | 'adjust_wallet'
  | 'set_preference'
  | 'create_alert';

export interface TagActionItem {
  id: string;
  tagId: string;
  trigger: TagActionTrigger;
  actionType: TagActionType;
  config: Record<string, unknown>;
  isActive: boolean;
  executionOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TagActionExecutionEntry {
  id: string;
  tagActionId: string;
  actionType: string;
  customerId: string;
  trigger: string;
  status: 'success' | 'failed' | 'skipped';
  resultSummary: Record<string, unknown> | null;
  errorMessage: string | null;
  durationMs: number | null;
  executedAt: string;
}

export interface CreateTagActionInput {
  trigger: TagActionTrigger;
  actionType: TagActionType;
  config?: Record<string, unknown>;
  isActive?: boolean;
  executionOrder?: number;
}

export interface UpdateTagActionInput {
  trigger?: TagActionTrigger;
  actionType?: TagActionType;
  config?: Record<string, unknown>;
  isActive?: boolean;
  executionOrder?: number;
}

// ── useTagActions ────────────────────────────────────────────────────────────

export function useTagActions(tagId: string | null) {
  const [data, setData] = useState<TagActionItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!tagId) { setData([]); return; }
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<{ data: TagActionItem[] }>(
        `/api/v1/customers/tags/${tagId}/actions`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load tag actions'));
    } finally {
      setIsLoading(false);
    }
  }, [tagId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

// ── useTagActionMutations ────────────────────────────────────────────────────

export function useTagActionMutations(tagId: string | null) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createAction = useCallback(async (input: CreateTagActionInput) => {
    if (!tagId) throw new Error('No tag selected');
    setIsSubmitting(true);
    try {
      const res = await apiFetch<{ data: TagActionItem }>(
        `/api/v1/customers/tags/${tagId}/actions`,
        { method: 'POST', body: JSON.stringify(input) },
      );
      return res.data;
    } finally {
      setIsSubmitting(false);
    }
  }, [tagId]);

  const updateAction = useCallback(async (actionId: string, input: UpdateTagActionInput) => {
    if (!tagId) throw new Error('No tag selected');
    setIsSubmitting(true);
    try {
      const res = await apiFetch<{ data: TagActionItem }>(
        `/api/v1/customers/tags/${tagId}/actions/${actionId}`,
        { method: 'PATCH', body: JSON.stringify(input) },
      );
      return res.data;
    } finally {
      setIsSubmitting(false);
    }
  }, [tagId]);

  const deleteAction = useCallback(async (actionId: string) => {
    if (!tagId) throw new Error('No tag selected');
    setIsSubmitting(true);
    try {
      await apiFetch(
        `/api/v1/customers/tags/${tagId}/actions/${actionId}`,
        { method: 'DELETE' },
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [tagId]);

  const reorderActions = useCallback(async (actionIds: string[]) => {
    if (!tagId) throw new Error('No tag selected');
    setIsSubmitting(true);
    try {
      const res = await apiFetch<{ data: TagActionItem[] }>(
        `/api/v1/customers/tags/${tagId}/actions/reorder`,
        { method: 'POST', body: JSON.stringify({ actionIds }) },
      );
      return res.data;
    } finally {
      setIsSubmitting(false);
    }
  }, [tagId]);

  return { createAction, updateAction, deleteAction, reorderActions, isSubmitting };
}

// ── useTagActionExecutions ───────────────────────────────────────────────────

interface ExecutionFilters {
  customerId?: string;
  status?: 'success' | 'failed' | 'skipped';
  from?: string;
  to?: string;
}

export function useTagActionExecutions(tagId: string | null, filters: ExecutionFilters = {}) {
  const [data, setData] = useState<TagActionExecutionEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);

  const fetchData = useCallback(async (loadMore = false) => {
    if (!tagId) { setData([]); return; }
    try {
      if (!loadMore) setIsLoading(true);
      setError(null);
      const qs = buildQueryString({
        executions: true,
        customerId: filters.customerId,
        status: filters.status,
        from: filters.from,
        to: filters.to,
        cursor: loadMore ? cursorRef.current : undefined,
        limit: 25,
      });
      const res = await apiFetch<{
        data: TagActionExecutionEntry[];
        meta: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/customers/tags/${tagId}/actions${qs}`);
      if (loadMore) {
        setData((prev) => [...prev, ...res.data]);
      } else {
        setData(res.data);
      }
      cursorRef.current = res.meta.cursor;
      setHasMore(res.meta.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load executions'));
    } finally {
      setIsLoading(false);
    }
  }, [tagId, filters.customerId, filters.status, filters.from, filters.to]);

  useEffect(() => {
    cursorRef.current = null;
    fetchData();
  }, [fetchData]);

  const loadMore = useCallback(() => fetchData(true), [fetchData]);
  const mutate = useCallback(() => { cursorRef.current = null; fetchData(); }, [fetchData]);

  return { data, isLoading, error, hasMore, loadMore, mutate };
}
