'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { FnbTabDetail, CheckSummary } from '@/types/fnb';

// ── Module-level tab snapshot cache ─────────────────────────────
// Survives React unmounts. Provides instant data when switching
// between tabs (user taps Table A → Table B → back to Table A).

const _tabCache = new Map<string, { data: FnbTabDetail; ts: number }>();
const TAB_CACHE_TTL_MS = 60_000; // 60 seconds
const MAX_TAB_CACHE_ENTRIES = 50;

function getTabSnapshot(tabId: string): FnbTabDetail | undefined {
  const entry = _tabCache.get(tabId);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > TAB_CACHE_TTL_MS) {
    _tabCache.delete(tabId);
    return undefined;
  }
  return entry.data;
}

function setTabSnapshot(tabId: string, data: FnbTabDetail): void {
  if (_tabCache.size >= MAX_TAB_CACHE_ENTRIES && !_tabCache.has(tabId)) {
    const oldestKey = _tabCache.keys().next().value;
    if (oldestKey !== undefined) _tabCache.delete(oldestKey);
  }
  _tabCache.delete(tabId);
  _tabCache.set(tabId, { data, ts: Date.now() });
}

// ── Tab Detail Hook ─────────────────────────────────────────────

interface UseFnbTabOptions {
  tabId: string | null;
  pollIntervalMs?: number;
  /** Set to false to pause polling (e.g. when screen is hidden). Initial fetch always fires. */
  pollEnabled?: boolean;
}

interface AddTabItemInput {
  catalogItemId: string;
  catalogItemName: string;
  unitPriceCents: number;
  qty: number;
  seatNumber: number;
  courseNumber: number;
  modifiers: Array<{ modifierId: string; name: string; priceAdjustment: number }>;
  specialInstructions: string | null;
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
  addItems: (items: AddTabItemInput[]) => Promise<void>;
  updatePartySize: (newSize: number) => Promise<void>;
  isActing: boolean;
}

export function useFnbTab({ tabId, pollIntervalMs = 15_000, pollEnabled = true }: UseFnbTabOptions): UseFnbTabReturn {
  const [tab, setTab] = useState<FnbTabDetail | null>(() =>
    tabId ? getTabSnapshot(tabId) ?? null : null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const prevTabIdRef = useRef<string | null>(null);
  // Track latest tab in a ref so action callbacks (updatePartySize)
  // can read the current version without being in the dependency array.
  const tabRef = useRef<FnbTabDetail | null>(tab);
  tabRef.current = tab;

  // When switching tabs, show cached snapshot instantly (or null for skeleton)
  useEffect(() => {
    if (tabId !== prevTabIdRef.current) {
      if (prevTabIdRef.current !== null) {
        const cached = tabId ? getTabSnapshot(tabId) : null;
        setTab(cached ?? null);
        setError(null);
      }
      prevTabIdRef.current = tabId;
    }
  }, [tabId]);

  const fetchTab = useCallback(async () => {
    if (!tabId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Only show loading spinner when there's no cached data
      if (!tabRef.current) setIsLoading(true);
      const json = await apiFetch<{ data: FnbTabDetail }>(`/api/v1/fnb/tabs/${tabId}`, {
        signal: controller.signal,
      });
      setTab(json.data);
      setTabSnapshot(tabId, json.data);
      setError(null);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [tabId]);

  // Initial fetch (always fires when tabId changes)
  useEffect(() => {
    fetchTab();
    return () => abortRef.current?.abort();
  }, [fetchTab]);

  // Polling (paused when screen is hidden)
  useEffect(() => {
    if (!tabId || pollIntervalMs <= 0 || !pollEnabled) return;
    const interval = setInterval(fetchTab, pollIntervalMs);
    return () => clearInterval(interval);
  }, [tabId, pollIntervalMs, fetchTab, pollEnabled]);

  // Refresh on POS visibility resume (e.g. returning from idle)
  useEffect(() => {
    const handler = () => { fetchTab(); };
    window.addEventListener('pos-visibility-resume', handler);
    return () => window.removeEventListener('pos-visibility-resume', handler);
  }, [fetchTab]);

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

  const addItemsFn = useCallback(async (items: AddTabItemInput[]) => {
    if (!tabId || items.length === 0) return;
    await act(() => apiFetch(`/api/v1/fnb/tabs/${tabId}/items`, {
      method: 'POST',
      body: JSON.stringify({ tabId, items }),
    }));
  }, [tabId, act]);

  const updatePartySizeFn = useCallback(async (newSize: number) => {
    const currentTab = tabRef.current;
    if (!tabId || !currentTab) return;
    await act(() => apiFetch(`/api/v1/fnb/tabs/${tabId}`, {
      method: 'PATCH',
      body: JSON.stringify({ partySize: newSize, expectedVersion: currentTab.version }),
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
    addItems: addItemsFn,
    updatePartySize: updatePartySizeFn,
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
  locationId?: string;
}): Promise<{ id: string; tabNumber: number }> {
  const { locationId, ...body } = input;
  const headers: Record<string, string> = {};
  if (locationId) headers['x-location-id'] = locationId;

  const json = await apiFetch<{ data: { id: string; tabNumber: number } }>('/api/v1/fnb/tabs', {
    method: 'POST',
    body: JSON.stringify(body),
    headers,
  });
  return json.data;
}
