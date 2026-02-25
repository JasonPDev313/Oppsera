'use client';

import { useState, useCallback } from 'react';
import { adminFetch } from '@/lib/api-fetch';
import type {
  TenantListItem,
  TenantDetail,
  LocationItem,
  ProfitCenterItem,
  TerminalItem,
  EntitlementItem,
  CreateTenantInput,
  OnboardingStep,
  SupportNote,
} from '@/types/tenant';

// ── Tenant List ──────────────────────────────────────────────────

export function useTenantList() {
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async (params: Record<string, string> = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams(params);
      const res = await adminFetch<{
        data: { items: TenantListItem[]; cursor: string | null; hasMore: boolean };
      }>(`/api/v1/tenants?${qs}`);
      setTenants(res.data.items);
      setCursor(res.data.cursor);
      setHasMore(res.data.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tenants');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadMore = useCallback(async (params: Record<string, string> = {}) => {
    if (!cursor) return;
    setIsLoading(true);
    try {
      const qs = new URLSearchParams({ ...params, cursor });
      const res = await adminFetch<{
        data: { items: TenantListItem[]; cursor: string | null; hasMore: boolean };
      }>(`/api/v1/tenants?${qs}`);
      setTenants((prev) => [...prev, ...res.data.items]);
      setCursor(res.data.cursor);
      setHasMore(res.data.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load more tenants');
    } finally {
      setIsLoading(false);
    }
  }, [cursor]);

  const create = useCallback(async (input: CreateTenantInput) => {
    const res = await adminFetch<{ data: { id: string } }>('/api/v1/tenants', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return res.data;
  }, []);

  return { tenants, isLoading, error, hasMore, load, loadMore, create };
}

// ── Tenant Detail ────────────────────────────────────────────────

export function useTenantDetail(id: string) {
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: TenantDetail }>(`/api/v1/tenants/${id}`);
      setTenant(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tenant');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const update = useCallback(async (body: Record<string, unknown>) => {
    await adminFetch(`/api/v1/tenants/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    await load();
  }, [id, load]);

  return { tenant, isLoading, error, load, update };
}

// ── Organization Hierarchy ───────────────────────────────────────

export function useOrgHierarchy(tenantId: string) {
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [profitCenters, setProfitCenters] = useState<ProfitCenterItem[]>([]);
  const [terminals, setTerminals] = useState<TerminalItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [locsRes, pcsRes, termsRes] = await Promise.all([
        adminFetch<{ data: LocationItem[] }>(`/api/v1/tenants/${tenantId}/locations?includeInactive=true`),
        adminFetch<{ data: ProfitCenterItem[] }>(`/api/v1/tenants/${tenantId}/profit-centers?includeInactive=true`),
        adminFetch<{ data: TerminalItem[] }>(`/api/v1/tenants/${tenantId}/terminals?includeInactive=true`),
      ]);
      setLocations(locsRes.data);
      setProfitCenters(pcsRes.data);
      setTerminals(termsRes.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load hierarchy');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  // ── Location mutations ────────────────────────────────────────
  const createLocation = useCallback(async (body: Record<string, unknown>) => {
    await adminFetch(`/api/v1/tenants/${tenantId}/locations`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    await load();
  }, [tenantId, load]);

  const updateLocation = useCallback(async (locId: string, body: Record<string, unknown>) => {
    await adminFetch(`/api/v1/tenants/${tenantId}/locations/${locId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    await load();
  }, [tenantId, load]);

  // ── Profit Center mutations ───────────────────────────────────
  const createProfitCenter = useCallback(async (body: Record<string, unknown>) => {
    await adminFetch(`/api/v1/tenants/${tenantId}/profit-centers`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    await load();
  }, [tenantId, load]);

  const updateProfitCenter = useCallback(async (pcId: string, body: Record<string, unknown>) => {
    await adminFetch(`/api/v1/tenants/${tenantId}/profit-centers/${pcId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    await load();
  }, [tenantId, load]);

  // ── Terminal mutations ────────────────────────────────────────
  const createTerminal = useCallback(async (body: Record<string, unknown>) => {
    await adminFetch(`/api/v1/tenants/${tenantId}/terminals`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    await load();
  }, [tenantId, load]);

  const updateTerminal = useCallback(async (tId: string, body: Record<string, unknown>) => {
    await adminFetch(`/api/v1/tenants/${tenantId}/terminals/${tId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    await load();
  }, [tenantId, load]);

  return {
    locations,
    profitCenters,
    terminals,
    isLoading,
    error,
    load,
    createLocation,
    updateLocation,
    createProfitCenter,
    updateProfitCenter,
    createTerminal,
    updateTerminal,
  };
}

// ── Entitlements ─────────────────────────────────────────────────

export function useTenantEntitlements(tenantId: string) {
  const [entitlements, setEntitlements] = useState<EntitlementItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: EntitlementItem[] }>(`/api/v1/tenants/${tenantId}/entitlements`);
      setEntitlements(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load entitlements');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  const toggle = useCallback(async (moduleKey: string, isEnabled: boolean, planTier?: string) => {
    await adminFetch(`/api/v1/tenants/${tenantId}/entitlements`, {
      method: 'POST',
      body: JSON.stringify({ moduleKey, isEnabled, planTier }),
    });
    await load();
  }, [tenantId, load]);

  return { entitlements, isLoading, error, load, toggle };
}

// ── Onboarding ──────────────────────────────────────────────────

interface OnboardingData {
  tenantId: string;
  onboardingStatus: string;
  industry: string | null;
  summary: { total: number; completed: number; blocked: number; skipped: number; progress: number };
  steps: OnboardingStep[];
}

export function useTenantOnboarding(tenantId: string) {
  const [data, setData] = useState<OnboardingData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: OnboardingData }>(`/api/v1/tenants/${tenantId}/onboarding`);
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load onboarding');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  const updateStep = useCallback(async (stepKey: string, status: string, blockerNotes?: string) => {
    await adminFetch(`/api/v1/tenants/${tenantId}/onboarding/${stepKey}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, blockerNotes }),
    });
    await load();
  }, [tenantId, load]);

  const initialize = useCallback(async (industry?: string) => {
    await adminFetch(`/api/v1/tenants/${tenantId}/onboarding/initialize`, {
      method: 'POST',
      body: JSON.stringify({ industry }),
    });
    await load();
  }, [tenantId, load]);

  return { data, isLoading, error, load, updateStep, initialize };
}

// ── Support Notes ───────────────────────────────────────────────

export function useTenantNotes(tenantId: string) {
  const [notes, setNotes] = useState<SupportNote[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: SupportNote[] }>(`/api/v1/tenants/${tenantId}/notes`);
      setNotes(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notes');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  const create = useCallback(async (content: string, noteType: string = 'general', isPinned = false) => {
    await adminFetch(`/api/v1/tenants/${tenantId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ content, noteType, isPinned }),
    });
    await load();
  }, [tenantId, load]);

  const update = useCallback(async (noteId: string, body: Record<string, unknown>) => {
    await adminFetch(`/api/v1/tenants/${tenantId}/notes/${noteId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    await load();
  }, [tenantId, load]);

  const remove = useCallback(async (noteId: string) => {
    await adminFetch(`/api/v1/tenants/${tenantId}/notes/${noteId}`, {
      method: 'DELETE',
    });
    await load();
  }, [tenantId, load]);

  return { notes, isLoading, error, load, create, update, remove };
}
