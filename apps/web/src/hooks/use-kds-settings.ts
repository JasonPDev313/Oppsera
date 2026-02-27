'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────

interface BumpBarProfile {
  id: string;
  profileName: string;
  buttonCount: number;
  keyMap: Record<string, string>;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
}

interface AlertProfile {
  id: string;
  profileName: string;
  newTicketAlert: { enabled: boolean; tone: string; volume: number } | null;
  warningAlert: { enabled: boolean; tone: string; volume: number } | null;
  criticalAlert: { enabled: boolean; tone: string; volume: number } | null;
  rushAlert: { enabled: boolean; tone: string; volume: number } | null;
  allergyAlert: { enabled: boolean; tone: string; volume: number } | null;
  modificationAlert: { enabled: boolean; tone: string; volume: number } | null;
  completeAlert: { enabled: boolean; tone: string; volume: number } | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
}

interface PerformanceTarget {
  id: string;
  stationId: string | null;
  stationName: string | null;
  orderType: string | null;
  targetPrepSeconds: number;
  warningPrepSeconds: number;
  criticalPrepSeconds: number;
  speedOfServiceGoalSeconds: number | null;
}

interface ItemPrepTime {
  id: string;
  catalogItemId: string;
  catalogItemName: string | null;
  stationId: string | null;
  stationName: string | null;
  estimatedPrepSeconds: number;
}

// ── Bump Bar Profiles Hook ─────────────────────────────────────

export function useBumpBarProfiles(locationId?: string) {
  const [profiles, setProfiles] = useState<BumpBarProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const qs = locationId ? `?locationId=${locationId}` : '';
      const res = await apiFetch<{ data: BumpBarProfile[] }>(
        `/api/v1/fnb/kds-settings/bump-bar-profiles${qs}`,
      );
      setProfiles(res.data ?? []);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [locationId]);

  useEffect(() => { setIsLoading(true); refresh(); }, [refresh]);

  const createProfile = useCallback(async (input: {
    profileName: string;
    buttonCount: number;
    keyMap: Record<string, string>;
    isDefault?: boolean;
    clientRequestId: string;
  }) => {
    setIsActing(true);
    try {
      await apiFetch('/api/v1/fnb/kds-settings/bump-bar-profiles', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      await refresh();
    } finally {
      setIsActing(false);
    }
  }, [refresh]);

  const updateProfile = useCallback(async (profileId: string, input: {
    profileName?: string;
    buttonCount?: number;
    keyMap?: Record<string, string>;
    isDefault?: boolean;
    clientRequestId: string;
  }) => {
    setIsActing(true);
    try {
      await apiFetch(`/api/v1/fnb/kds-settings/bump-bar-profiles/${profileId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
      await refresh();
    } finally {
      setIsActing(false);
    }
  }, [refresh]);

  return { profiles, isLoading, isActing, createProfile, updateProfile, refresh };
}

// ── Alert Profiles Hook ────────────────────────────────────────

export function useAlertProfiles(locationId?: string) {
  const [profiles, setProfiles] = useState<AlertProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const qs = locationId ? `?locationId=${locationId}` : '';
      const res = await apiFetch<{ data: AlertProfile[] }>(
        `/api/v1/fnb/kds-settings/alert-profiles${qs}`,
      );
      setProfiles(res.data ?? []);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [locationId]);

  useEffect(() => { setIsLoading(true); refresh(); }, [refresh]);

  const createProfile = useCallback(async (input: {
    profileName: string;
    newTicketAlert?: { enabled: boolean; tone: string; volume: number };
    warningAlert?: { enabled: boolean; tone: string; volume: number };
    criticalAlert?: { enabled: boolean; tone: string; volume: number };
    rushAlert?: { enabled: boolean; tone: string; volume: number };
    allergyAlert?: { enabled: boolean; tone: string; volume: number };
    modificationAlert?: { enabled: boolean; tone: string; volume: number };
    completeAlert?: { enabled: boolean; tone: string; volume: number };
    isDefault?: boolean;
    clientRequestId: string;
  }) => {
    setIsActing(true);
    try {
      await apiFetch('/api/v1/fnb/kds-settings/alert-profiles', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      await refresh();
    } finally {
      setIsActing(false);
    }
  }, [refresh]);

  const updateProfile = useCallback(async (profileId: string, input: Record<string, unknown>) => {
    setIsActing(true);
    try {
      await apiFetch(`/api/v1/fnb/kds-settings/alert-profiles/${profileId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
      await refresh();
    } finally {
      setIsActing(false);
    }
  }, [refresh]);

  return { profiles, isLoading, isActing, createProfile, updateProfile, refresh };
}

// ── Performance Targets Hook ───────────────────────────────────

export function usePerformanceTargets(locationId?: string) {
  const [targets, setTargets] = useState<PerformanceTarget[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const qs = locationId ? `?locationId=${locationId}` : '';
      const res = await apiFetch<{ data: PerformanceTarget[] }>(
        `/api/v1/fnb/kds-settings/performance-targets${qs}`,
      );
      setTargets(res.data ?? []);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [locationId]);

  useEffect(() => { setIsLoading(true); refresh(); }, [refresh]);

  const upsertTarget = useCallback(async (input: {
    stationId?: string;
    orderType?: string;
    targetPrepSeconds: number;
    warningPrepSeconds: number;
    criticalPrepSeconds: number;
    speedOfServiceGoalSeconds?: number;
    clientRequestId: string;
  }) => {
    setIsActing(true);
    try {
      await apiFetch('/api/v1/fnb/kds-settings/performance-targets', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      await refresh();
    } finally {
      setIsActing(false);
    }
  }, [refresh]);

  return { targets, isLoading, isActing, upsertTarget, refresh };
}

// ── Item Prep Times Hook ───────────────────────────────────────

export function useItemPrepTimes(opts?: { catalogItemId?: string; stationId?: string }) {
  const [items, setItems] = useState<ItemPrepTime[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (opts?.catalogItemId) params.set('catalogItemId', opts.catalogItemId);
      if (opts?.stationId) params.set('stationId', opts.stationId);
      const qs = params.toString() ? `?${params}` : '';
      const res = await apiFetch<{ data: ItemPrepTime[]; meta?: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/fnb/kds-settings/item-prep-times${qs}`,
      );
      setItems(res.data ?? []);
      setCursor(res.meta?.cursor ?? null);
      setHasMore(res.meta?.hasMore ?? false);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [opts?.catalogItemId, opts?.stationId]);

  useEffect(() => { setIsLoading(true); refresh(); }, [refresh]);

  const upsertPrepTime = useCallback(async (input: {
    catalogItemId: string;
    stationId?: string;
    estimatedPrepSeconds: number;
    clientRequestId: string;
  }) => {
    setIsActing(true);
    try {
      await apiFetch('/api/v1/fnb/kds-settings/item-prep-times', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      await refresh();
    } finally {
      setIsActing(false);
    }
  }, [refresh]);

  const bulkUpsertPrepTimes = useCallback(async (input: {
    items: Array<{ catalogItemId: string; stationId?: string; estimatedPrepSeconds: number }>;
    clientRequestId: string;
  }) => {
    setIsActing(true);
    try {
      await apiFetch('/api/v1/fnb/kds-settings/item-prep-times/bulk', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      await refresh();
    } finally {
      setIsActing(false);
    }
  }, [refresh]);

  return { items, isLoading, isActing, cursor, hasMore, upsertPrepTime, bulkUpsertPrepTimes, refresh };
}

// ── Routing Rules Hook ────────────────────────────────────────

interface RoutingRule {
  id: string;
  ruleName: string | null;
  ruleType: string;
  catalogItemId: string | null;
  modifierId: string | null;
  departmentId: string | null;
  subDepartmentId: string | null;
  categoryId: string | null;
  stationId: string;
  stationName: string | null;
  priority: number;
  orderTypeCondition: string | null;
  channelCondition: string | null;
  timeConditionStart: string | null;
  timeConditionEnd: string | null;
  isActive: boolean;
}

export function useRoutingRules(locationId?: string) {
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [filterRuleType, setFilterRuleType] = useState<string | null>(null);
  const [filterStationId, setFilterStationId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (locationId) params.set('locationId', locationId);
      if (filterRuleType) params.set('ruleType', filterRuleType);
      if (filterStationId) params.set('stationId', filterStationId);
      const qs = params.toString() ? `?${params}` : '';
      const res = await apiFetch<{ data: RoutingRule[] }>(
        `/api/v1/fnb/kds-settings/routing-rules${qs}`,
      );
      setRules(res.data ?? []);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [locationId, filterRuleType, filterStationId]);

  useEffect(() => { setIsLoading(true); refresh(); }, [refresh]);

  const createRule = useCallback(async (input: {
    ruleName?: string;
    ruleType: string;
    catalogItemId?: string;
    modifierId?: string;
    departmentId?: string;
    subDepartmentId?: string;
    categoryId?: string;
    stationId: string;
    priority?: number;
    orderTypeCondition?: string;
    channelCondition?: string;
    timeConditionStart?: string;
    timeConditionEnd?: string;
    clientRequestId: string;
  }) => {
    setIsActing(true);
    try {
      await apiFetch('/api/v1/fnb/kds-settings/routing-rules', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      await refresh();
    } finally {
      setIsActing(false);
    }
  }, [refresh]);

  const updateRule = useCallback(async (ruleId: string, input: {
    ruleName?: string;
    stationId?: string;
    priority?: number;
    orderTypeCondition?: string | null;
    channelCondition?: string | null;
    timeConditionStart?: string | null;
    timeConditionEnd?: string | null;
    isActive?: boolean;
    clientRequestId?: string;
  }) => {
    setIsActing(true);
    try {
      await apiFetch(`/api/v1/fnb/kds-settings/routing-rules/${ruleId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
      await refresh();
    } finally {
      setIsActing(false);
    }
  }, [refresh]);

  const deleteRule = useCallback(async (ruleId: string) => {
    setIsActing(true);
    try {
      await apiFetch(`/api/v1/fnb/kds-settings/routing-rules/${ruleId}`, {
        method: 'DELETE',
      });
      await refresh();
    } finally {
      setIsActing(false);
    }
  }, [refresh]);

  return {
    rules, isLoading, isActing,
    filterRuleType, setFilterRuleType,
    filterStationId, setFilterStationId,
    createRule, updateRule, deleteRule, refresh,
  };
}

// ── Composite Station Settings Hook ────────────────────────────

export function useKdsStationSettings(stationId: string | null) {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!stationId) { setSettings(null); setIsLoading(false); return; }
    try {
      const res = await apiFetch<{ data: Record<string, unknown> }>(
        `/api/v1/fnb/kds-settings/stations/${stationId}/composite`,
      );
      setSettings(res.data);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [stationId]);

  useEffect(() => { setIsLoading(true); refresh(); }, [refresh]);

  return { settings, isLoading, refresh };
}
