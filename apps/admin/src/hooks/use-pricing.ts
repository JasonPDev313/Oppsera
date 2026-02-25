'use client';

import { useState, useCallback } from 'react';
import { adminFetch } from '@/lib/api-fetch';
import type {
  PricingPlan,
  ModulePricingItem,
  TenantSubscription,
  SubscriptionChangeLogEntry,
  UpdatePlanInput,
  ChangeTenantSubscriptionInput,
} from '@/types/pricing';

// ── Plans ──────────────────────────────────────────────────────────

export function usePricingPlans() {
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: PricingPlan[] }>('/api/v1/pricing');
      setPlans(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pricing plans');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updatePlan = useCallback(async (planId: string, input: UpdatePlanInput) => {
    const res = await adminFetch<{ data: PricingPlan }>(`/api/v1/pricing/${planId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    setPlans((prev) => prev.map((p) => (p.id === planId ? res.data : p)));
    return res.data;
  }, []);

  return { plans, isLoading, error, load, updatePlan };
}

// ── Module Pricing ──────────────────────────────────────────────────

export function useModulePricing() {
  const [modules, setModules] = useState<ModulePricingItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: ModulePricingItem[] }>('/api/v1/pricing/modules');
      setModules(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load module pricing');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateModule = useCallback(
    async (moduleId: string, input: Partial<ModulePricingItem>) => {
      const res = await adminFetch<{ data: ModulePricingItem }>(
        `/api/v1/pricing/modules/${moduleId}`,
        { method: 'PATCH', body: JSON.stringify(input) },
      );
      setModules((prev) => prev.map((m) => (m.id === moduleId ? res.data : m)));
      return res.data;
    },
    [],
  );

  return { modules, isLoading, error, load, updateModule };
}

// ── Tenant Subscription ─────────────────────────────────────────────

export function useTenantSubscription(tenantId: string) {
  const [subscription, setSubscription] = useState<TenantSubscription | null>(null);
  const [changeLog, setChangeLog] = useState<SubscriptionChangeLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{
        data: { subscription: TenantSubscription | null; changeLog: SubscriptionChangeLogEntry[] };
      }>(`/api/v1/pricing/tenants/${tenantId}/subscription`);
      setSubscription(res.data.subscription);
      setChangeLog(res.data.changeLog);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load subscription');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  const changeSubscription = useCallback(
    async (input: ChangeTenantSubscriptionInput) => {
      const res = await adminFetch<{ data: TenantSubscription }>(
        `/api/v1/pricing/tenants/${tenantId}/subscription`,
        { method: 'PATCH', body: JSON.stringify(input) },
      );
      setSubscription(res.data);
      // Reload change log
      try {
        const logRes = await adminFetch<{
          data: { subscription: TenantSubscription | null; changeLog: SubscriptionChangeLogEntry[] };
        }>(`/api/v1/pricing/tenants/${tenantId}/subscription`);
        setChangeLog(logRes.data.changeLog);
      } catch {
        // non-critical
      }
      return res.data;
    },
    [tenantId],
  );

  const createSubscription = useCallback(
    async (pricingPlanId: string, seatCount: number, reason: string) => {
      const res = await adminFetch<{ data: TenantSubscription }>(
        `/api/v1/pricing/tenants/${tenantId}/subscription`,
        {
          method: 'POST',
          body: JSON.stringify({ pricingPlanId, seatCount, reason }),
        },
      );
      setSubscription(res.data);
      return res.data;
    },
    [tenantId],
  );

  return { subscription, changeLog, isLoading, error, load, changeSubscription, createSubscription };
}
