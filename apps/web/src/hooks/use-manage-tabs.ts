'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

// ── Types ───────────────────────────────────────────────────────

export interface ManageTabItem {
  id: string;
  tabNumber: number;
  guestName: string | null;
  status: string;
  serviceMode: string;
  tableId: string | null;
  tableLabel: string | null;
  serverUserId: string | null;
  serverName: string | null;
  partySize: number | null;
  courseCount: number;
  openedAt: string;
  updatedAt: string;
  closedAt: string | null;
  version: number;
  orderTotal: number | null;
  amountPaid: number | null;
  balance: number | null;
  openDurationMinutes: number | null;
  groupKey: string | null;
  groupLabel: string | null;
}

interface ManageTabsSettings {
  id: string;
  tenantId: string;
  locationId: string | null;
  showManageTabsButton: boolean;
  requirePinForTransfer: boolean;
  requirePinForVoid: boolean;
  allowBulkAllServers: boolean;
  readOnlyForNonManagers: boolean;
  maxBulkSelection: number;
}

interface BulkResult {
  succeeded: string[];
  failed: Array<{ tabId: string; error: string }>;
}

interface EmergencyCleanupResult {
  paidTabsClosed: number;
  locksReleased: number;
  staleTabsVoided: number;
  staleTabsAbandoned: number;
}

interface VerifyPinResult {
  verified: boolean;
  userId: string;
  userName: string;
}

interface ManagerOverrideItem {
  id: string;
  locationId: string;
  initiatorUserId: string;
  initiatorName: string | null;
  approverUserId: string;
  approverName: string | null;
  actionType: string;
  tabIds: string[];
  reasonCode: string | null;
  reasonText: string | null;
  metadata: Record<string, unknown>;
  resultSummary: Record<string, unknown>;
  createdAt: string;
}

export type ManageTabsViewMode = 'all' | 'open_only' | 'needs_attention';
export type ManageTabsGroupBy = 'server' | 'table' | 'status' | 'age';
export type ManageTabsSortBy = 'oldest' | 'newest' | 'highest_balance' | 'recently_updated';

export interface ManageTabsFilters {
  locationId?: string;
  businessDate?: string;
  serverUserId?: string;
  statuses?: string[];
  search?: string;
  sortBy?: ManageTabsSortBy;
  groupBy?: ManageTabsGroupBy;
  viewMode?: ManageTabsViewMode;
  includeAmounts?: boolean;
}

// ── Undo State ─────────────────────────────────────────────────

export interface UndoSnapshot {
  action: 'bulk_void' | 'bulk_transfer' | 'bulk_close' | 'emergency_cleanup';
  tabIds: string[];
  preActionTabs: ManageTabItem[];
  result: BulkResult | EmergencyCleanupResult;
  timestamp: number;
}

const POLL_INTERVAL_MS = 5000;
const UNDO_WINDOW_MS = 30_000;

// ── Hook ────────────────────────────────────────────────────────

export function useManageTabs(locationId: string) {
  const locHeaders = locationId ? { 'X-Location-Id': locationId } : undefined;

  // ─── Tab listing ──────────────────────────────────────────────
  const [tabs, setTabs] = useState<ManageTabItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filters, setFilters] = useState<ManageTabsFilters>({
    includeAmounts: true,
    sortBy: 'oldest',
    viewMode: 'all',
  });
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // ─── Version tracking for conflict detection ──────────────────
  const versionMap = useRef<Map<string, number>>(new Map());
  const [staleIds, setStaleIds] = useState<Set<string>>(new Set());

  const refreshTabs = useCallback(async () => {
    setIsLoading(true);
    try {
      const qs = buildQueryString({
        ...filters,
        statuses: filters.statuses?.join(','),
        includeAmounts: filters.includeAmounts ? 'true' : undefined,
      });
      const res = await apiFetch<{ data: ManageTabItem[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/fnb/tabs/manage${qs}`,
        { headers: locHeaders },
      );

      // Track versions and detect stale tabs
      const newStale = new Set<string>();
      const newVersions = new Map<string, number>();
      for (const tab of res.data) {
        newVersions.set(tab.id, tab.version);
        const prev = versionMap.current.get(tab.id);
        if (prev != null && prev !== tab.version) {
          newStale.add(tab.id);
        }
      }
      versionMap.current = newVersions;
      setStaleIds(newStale);

      setTabs(res.data);
      setCursor(res.meta.cursor);
      setHasMore(res.meta.hasMore);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [filters, locationId]);

  // Initial fetch
  useEffect(() => {
    refreshTabs();
  }, [refreshTabs]);

  // ─── Polling (5s interval) ───────────────────────────────────
  const pollEnabled = useRef(true);

  useEffect(() => {
    const interval = setInterval(() => {
      if (pollEnabled.current) {
        refreshTabs();
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshTabs]);

  // Pause polling during mutations
  const pausePolling = useCallback(() => { pollEnabled.current = false; }, []);
  const resumePolling = useCallback(() => { pollEnabled.current = true; }, []);

  // Pause on visibility hidden
  useEffect(() => {
    const handler = () => {
      pollEnabled.current = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  // ─── Multi-select state ───────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Auto-deselect stale tabs
  useEffect(() => {
    if (staleIds.size > 0) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        let changed = false;
        for (const id of staleIds) {
          if (next.has(id)) {
            next.delete(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }, [staleIds]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(tabs.map((t) => t.id)));
  }, [tabs]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const invertSelection = useCallback(() => {
    setSelectedIds((prev) => {
      const all = new Set(tabs.map((t) => t.id));
      prev.forEach((id) => all.delete(id));
      return all;
    });
  }, [tabs]);

  const selectByIds = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  // ─── Selection summary ───────────────────────────────────────
  const selectionSummary = useMemo(() => {
    const selected = tabs.filter((t) => selectedIds.has(t.id));
    const servers = Array.from(new Set(selected.map((t) => t.serverUserId).filter(Boolean)));
    const statuses = Array.from(new Set(selected.map((t) => t.status)));
    const totalBalance = selected.reduce((sum, t) => sum + (t.balance ?? 0), 0);
    return {
      count: selectedIds.size,
      totalBalance,
      servers,
      serverCount: servers.length,
      statuses,
    };
  }, [selectedIds, tabs]);

  // ─── Grouped tabs ────────────────────────────────────────────
  const groupedTabs = useMemo(() => {
    if (!filters.groupBy) return null;
    const groups = new Map<string, { label: string; tabs: ManageTabItem[] }>();
    for (const tab of tabs) {
      const key = tab.groupKey ?? 'ungrouped';
      const label = tab.groupLabel ?? 'Other';
      let group = groups.get(key);
      if (!group) {
        group = { label, tabs: [] };
        groups.set(key, group);
      }
      group.tabs.push(tab);
    }
    return Array.from(groups.entries()).map(([key, g]) => ({
      key,
      label: g.label,
      tabs: g.tabs,
    }));
  }, [tabs, filters.groupBy]);

  // ─── Undo state ──────────────────────────────────────────────
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null);

  // Auto-expire undo after window
  useEffect(() => {
    if (!undoSnapshot) return;
    const remaining = UNDO_WINDOW_MS - (Date.now() - undoSnapshot.timestamp);
    if (remaining <= 0) {
      setUndoSnapshot(null);
      return;
    }
    const timer = setTimeout(() => setUndoSnapshot(null), remaining);
    return () => clearTimeout(timer);
  }, [undoSnapshot]);

  const capturePreActionSnapshot = useCallback((action: UndoSnapshot['action'], tabIds: string[]): ManageTabItem[] => {
    return tabs.filter((t) => tabIds.includes(t.id));
  }, [tabs]);

  // ─── Build expectedVersions for bulk commands ─────────────────
  const buildExpectedVersions = useCallback((ids: Iterable<string>): Record<string, number> => {
    const map: Record<string, number> = {};
    for (const id of ids) {
      const v = versionMap.current.get(id);
      if (v != null) map[id] = v;
    }
    return map;
  }, []);

  // ─── Bulk actions ─────────────────────────────────────────────
  const [isMutating, setIsMutating] = useState(false);

  const bulkVoid = useCallback(
    async (input: { reasonCode: string; reasonText?: string; approverUserId: string; clientRequestId: string }) => {
      const tabIds = Array.from(selectedIds);
      const preActionTabs = capturePreActionSnapshot('bulk_void', tabIds);
      pausePolling();
      setIsMutating(true);
      try {
        const res = await apiFetch<{ data: BulkResult }>('/api/v1/fnb/tabs/manage/bulk-void', {
          method: 'POST',
          body: JSON.stringify({
            ...input,
            tabIds,
            locationId,
            expectedVersions: buildExpectedVersions(selectedIds),
          }),
          headers: locHeaders,
        });
        setUndoSnapshot({ action: 'bulk_void', tabIds, preActionTabs, result: res.data, timestamp: Date.now() });
        clearSelection();
        await refreshTabs();
        return res.data;
      } finally {
        setIsMutating(false);
        resumePolling();
      }
    },
    [selectedIds, locationId, clearSelection, refreshTabs, capturePreActionSnapshot, buildExpectedVersions, pausePolling, resumePolling],
  );

  const bulkTransfer = useCallback(
    async (input: {
      toServerUserId: string;
      reasonCode: string;
      reasonText?: string;
      approverUserId?: string;
      clientRequestId: string;
    }) => {
      const tabIds = Array.from(selectedIds);
      const preActionTabs = capturePreActionSnapshot('bulk_transfer', tabIds);
      pausePolling();
      setIsMutating(true);
      try {
        const res = await apiFetch<{ data: BulkResult }>('/api/v1/fnb/tabs/manage/bulk-transfer', {
          method: 'POST',
          body: JSON.stringify({
            ...input,
            tabIds,
            locationId,
            expectedVersions: buildExpectedVersions(selectedIds),
          }),
          headers: locHeaders,
        });
        setUndoSnapshot({ action: 'bulk_transfer', tabIds, preActionTabs, result: res.data, timestamp: Date.now() });
        clearSelection();
        await refreshTabs();
        return res.data;
      } finally {
        setIsMutating(false);
        resumePolling();
      }
    },
    [selectedIds, locationId, clearSelection, refreshTabs, capturePreActionSnapshot, buildExpectedVersions, pausePolling, resumePolling],
  );

  const bulkClose = useCallback(
    async (input: { reasonCode: string; reasonText?: string; approverUserId: string; clientRequestId: string }) => {
      const tabIds = Array.from(selectedIds);
      const preActionTabs = capturePreActionSnapshot('bulk_close', tabIds);
      pausePolling();
      setIsMutating(true);
      try {
        const res = await apiFetch<{ data: BulkResult }>('/api/v1/fnb/tabs/manage/bulk-close', {
          method: 'POST',
          body: JSON.stringify({
            ...input,
            tabIds,
            locationId,
            expectedVersions: buildExpectedVersions(selectedIds),
          }),
          headers: locHeaders,
        });
        setUndoSnapshot({ action: 'bulk_close', tabIds, preActionTabs, result: res.data, timestamp: Date.now() });
        clearSelection();
        await refreshTabs();
        return res.data;
      } finally {
        setIsMutating(false);
        resumePolling();
      }
    },
    [selectedIds, locationId, clearSelection, refreshTabs, capturePreActionSnapshot, buildExpectedVersions, pausePolling, resumePolling],
  );

  const runEmergencyCleanup = useCallback(
    async (input: {
      actions: {
        closePaidTabs?: boolean;
        releaseLocks?: boolean;
        voidStaleTabs?: boolean;
        markAbandoned?: boolean;
        staleThresholdMinutes?: number;
        abandonedThresholdMinutes?: number;
      };
      approverUserId: string;
      clientRequestId: string;
    }) => {
      const preActionTabs = capturePreActionSnapshot('emergency_cleanup', tabs.map((t) => t.id));
      pausePolling();
      setIsMutating(true);
      try {
        const res = await apiFetch<{ data: EmergencyCleanupResult }>('/api/v1/fnb/tabs/manage/emergency-cleanup', {
          method: 'POST',
          body: JSON.stringify({ ...input, locationId }),
          headers: locHeaders,
        });
        setUndoSnapshot({
          action: 'emergency_cleanup',
          tabIds: tabs.map((t) => t.id),
          preActionTabs,
          result: res.data,
          timestamp: Date.now(),
        });
        await refreshTabs();
        return res.data;
      } finally {
        setIsMutating(false);
        resumePolling();
      }
    },
    [locationId, refreshTabs, tabs, capturePreActionSnapshot, pausePolling, resumePolling],
  );

  const dismissUndo = useCallback(() => {
    setUndoSnapshot(null);
  }, []);

  // ─── Manager PIN verification ─────────────────────────────────
  const verifyPin = useCallback(
    async (pin: string, actionType: string) => {
      const res = await apiFetch<{ data: VerifyPinResult }>('/api/v1/fnb/tabs/manage/verify-pin', {
        method: 'POST',
        body: JSON.stringify({ pin, actionType }),
        headers: locHeaders,
      });
      return res.data;
    },
    [locationId],
  );

  // ─── Settings ─────────────────────────────────────────────────
  const [settings, setSettings] = useState<ManageTabsSettings | null>(null);

  useEffect(() => {
    apiFetch<{ data: ManageTabsSettings }>('/api/v1/fnb/tabs/manage/settings', {
      headers: locHeaders,
    })
      .then((res) => setSettings(res.data))
      .catch(() => {});
  }, [locationId]);

  const updateSettings = useCallback(
    async (patch: Partial<ManageTabsSettings>) => {
      const res = await apiFetch<{ data: ManageTabsSettings }>('/api/v1/fnb/tabs/manage/settings', {
        method: 'PATCH',
        body: JSON.stringify(patch),
        headers: locHeaders,
      });
      setSettings(res.data);
      return res.data;
    },
    [locationId],
  );

  // ─── Audit log ────────────────────────────────────────────────
  const fetchAuditLog = useCallback(
    async (auditFilters?: { actionType?: string; startDate?: string; endDate?: string; cursor?: string; limit?: number }) => {
      const qs = buildQueryString(auditFilters ?? {});
      const res = await apiFetch<{ data: ManagerOverrideItem[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/fnb/tabs/manage/audit${qs}`,
        { headers: locHeaders },
      );
      return res;
    },
    [locationId],
  );

  return {
    // Tab listing
    tabs,
    isLoading,
    filters,
    setFilters,
    cursor,
    hasMore,
    refreshTabs,
    // Grouped tabs
    groupedTabs,
    // Multi-select
    selectedIds,
    toggleSelect,
    selectAll,
    clearSelection,
    invertSelection,
    selectByIds,
    selectionSummary,
    // Conflict detection
    staleIds,
    // Bulk actions
    isMutating,
    bulkVoid,
    bulkTransfer,
    bulkClose,
    runEmergencyCleanup,
    // Undo
    undoSnapshot,
    dismissUndo,
    // PIN
    verifyPin,
    // Settings
    settings,
    updateSettings,
    // Audit
    fetchAuditLog,
  };
}
