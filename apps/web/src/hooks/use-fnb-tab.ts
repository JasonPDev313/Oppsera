'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { FnbTabDetail, CheckSummary } from '@/types/fnb';

// ── Tab Detail Hook ─────────────────────────────────────────────

interface UseFnbTabOptions {
  tabId: string | null;
  pollIntervalMs?: number;
}

interface UseFnbTabReturn {
  tab: FnbTabDetail | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  // Actions
  closeTab: (expectedVersion: number) => Promise<void>;
  voidTab: (reason: string, expectedVersion: number) => Promise<void>;
  transferTab: (input: { toServerUserId?: string; toTableId?: string; reason?: string; expectedVersion: number }) => Promise<void>;
  reopenTab: (expectedVersion: number) => Promise<void>;
  fireCourse: (courseNumber: number) => Promise<void>;
  sendCourse: (courseNumber: number) => Promise<void>;
  isActing: boolean;
}

export function useFnbTab({ tabId, pollIntervalMs = 5000 }: UseFnbTabOptions): UseFnbTabReturn {
  const [tab, setTab] = useState<FnbTabDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchTab = useCallback(async () => {
    if (!tabId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setIsLoading(true);
      const json = await apiFetch<{ data: FnbTabDetail }>(`/api/v1/fnb/tabs/${tabId}`, {
        signal: controller.signal,
      });
      setTab(json.data);
      setError(null);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [tabId]);

  // Initial fetch
  useEffect(() => {
    fetchTab();
    return () => abortRef.current?.abort();
  }, [fetchTab]);

  // Polling
  useEffect(() => {
    if (!tabId || pollIntervalMs <= 0) return;
    const interval = setInterval(fetchTab, pollIntervalMs);
    return () => clearInterval(interval);
  }, [tabId, pollIntervalMs, fetchTab]);

  // ── Actions ──────────────────────────────────────────────────

  const act = useCallback(async (fn: () => Promise<unknown>) => {
    setIsActing(true);
    try {
      await fn();
      await fetchTab();
    } finally {
      setIsActing(false);
    }
  }, [fetchTab]);

  const closeTabFn = useCallback(async (expectedVersion: number) => {
    if (!tabId) return;
    await act(() => apiFetch(`/api/v1/fnb/tabs/${tabId}/close`, {
      method: 'POST',
      body: JSON.stringify({ expectedVersion }),
    }));
  }, [tabId, act]);

  const voidTabFn = useCallback(async (reason: string, expectedVersion: number) => {
    if (!tabId) return;
    await act(() => apiFetch(`/api/v1/fnb/tabs/${tabId}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason, expectedVersion }),
    }));
  }, [tabId, act]);

  const transferTabFn = useCallback(async (input: { toServerUserId?: string; toTableId?: string; reason?: string; expectedVersion: number }) => {
    if (!tabId) return;
    await act(() => apiFetch(`/api/v1/fnb/tabs/${tabId}/transfer`, {
      method: 'POST',
      body: JSON.stringify(input),
    }));
  }, [tabId, act]);

  const reopenTabFn = useCallback(async (expectedVersion: number) => {
    if (!tabId) return;
    await act(() => apiFetch(`/api/v1/fnb/tabs/${tabId}/reopen`, {
      method: 'POST',
      body: JSON.stringify({ expectedVersion }),
    }));
  }, [tabId, act]);

  const fireCourseFn = useCallback(async (courseNumber: number) => {
    if (!tabId) return;
    await act(() => apiFetch(`/api/v1/fnb/tabs/${tabId}/course/fire`, {
      method: 'POST',
      body: JSON.stringify({ courseNumber }),
    }));
  }, [tabId, act]);

  const sendCourseFn = useCallback(async (courseNumber: number) => {
    if (!tabId) return;
    await act(() => apiFetch(`/api/v1/fnb/tabs/${tabId}/course/send`, {
      method: 'POST',
      body: JSON.stringify({ courseNumber }),
    }));
  }, [tabId, act]);

  return {
    tab,
    isLoading,
    error,
    refresh: fetchTab,
    closeTab: closeTabFn,
    voidTab: voidTabFn,
    transferTab: transferTabFn,
    reopenTab: reopenTabFn,
    fireCourse: fireCourseFn,
    sendCourse: sendCourseFn,
    isActing,
  };
}

// ── Check Summary Hook ──────────────────────────────────────────

interface UseCheckSummaryReturn {
  summary: CheckSummary | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useCheckSummary(tabId: string | null, orderId: string | null): UseCheckSummaryReturn {
  const [summary, setSummary] = useState<CheckSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!tabId || !orderId) return;
    try {
      setIsLoading(true);
      const json = await apiFetch<{ data: CheckSummary }>(`/api/v1/fnb/tabs/${tabId}/check?orderId=${orderId}`);
      setSummary(json.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [tabId, orderId]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return { summary, isLoading, error, refresh: fetchSummary };
}

// ── Open Tab Helper ─────────────────────────────────────────────

export async function openTabApi(input: {
  serverUserId: string;
  businessDate: string;
  tableId?: string;
  tabType?: string;
  partySize?: number;
  guestName?: string;
  serviceType?: string;
}): Promise<{ id: string; tabNumber: number }> {
  const json = await apiFetch<{ data: { id: string; tabNumber: number } }>('/api/v1/fnb/tabs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return json.data;
}
