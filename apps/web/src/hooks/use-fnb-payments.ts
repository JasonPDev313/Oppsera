'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

// ── Payment Sessions ────────────────────────────────────────────

interface PaymentSession {
  id: string;
  tabId: string;
  orderId: string;
  status: string;
  splitStrategy: string | null;
  totalAmountCents: number;
  paidAmountCents: number;
  remainingAmountCents: number;
  completedAt: string | null;
  createdAt: string;
}

interface UsePaymentSessionOptions {
  tabId: string;
  locationId?: string;
}

export function usePaymentSession({ tabId, locationId }: UsePaymentSessionOptions) {
  const locHeaders = locationId ? { 'X-Location-Id': locationId } : undefined;
  const [sessions, setSessions] = useState<PaymentSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!tabId) return;
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: PaymentSession[] }>(
        `/api/v1/fnb/payments/sessions?tabId=${tabId}`,
      );
      setSessions(res.data);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [tabId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const startSession = useCallback(
    async (input: Record<string, unknown>) => {
      const res = await apiFetch<{ data: PaymentSession }>('/api/v1/fnb/payments/sessions', {
        method: 'POST',
        body: JSON.stringify(input),
        headers: locHeaders,
      });
      await refresh();
      return res.data;
    },
    [refresh, locHeaders],
  );

  const completeSession = useCallback(
    async (sessionId: string, input: Record<string, unknown>) => {
      const res = await apiFetch<{ data: PaymentSession }>(
        `/api/v1/fnb/payments/sessions/${sessionId}/complete`,
        { method: 'POST', body: JSON.stringify(input), headers: locHeaders },
      );
      await refresh();
      return res.data;
    },
    [refresh, locHeaders],
  );

  const failSession = useCallback(
    async (sessionId: string, input: Record<string, unknown>) => {
      const res = await apiFetch<{ data: PaymentSession }>(
        `/api/v1/fnb/payments/sessions/${sessionId}/fail`,
        { method: 'POST', body: JSON.stringify(input), headers: locHeaders },
      );
      await refresh();
      return res.data;
    },
    [refresh, locHeaders],
  );

  const recordTender = useCallback(
    async (input: Record<string, unknown>) => {
      const res = await apiFetch<{ data: unknown }>('/api/v1/fnb/payments/tender', {
        method: 'POST',
        body: JSON.stringify(input),
        headers: locHeaders,
      });
      await refresh();
      return res.data;
    },
    [refresh, locHeaders],
  );

  const voidLastTender = useCallback(
    async (sessionId: string) => {
      const res = await apiFetch<{ data: unknown }>(
        `/api/v1/fnb/payments/sessions/${sessionId}/void-last-tender`,
        { method: 'POST', headers: locHeaders },
      );
      await refresh();
      return res.data;
    },
    [refresh, locHeaders],
  );

  const processCardPayment = useCallback(
    async (input: {
      sessionId: string;
      amountCents: number;
      tipCents?: number;
      token?: string;
      paymentMethodId?: string;
      orderId?: string;
      customerId?: string;
      clientRequestId: string;
    }) => {
      const res = await apiFetch<{ data: unknown }>('/api/v1/fnb/payments/card', {
        method: 'POST',
        body: JSON.stringify(input),
        headers: locHeaders,
      });
      await refresh();
      return res.data;
    },
    [refresh, locHeaders],
  );

  return {
    sessions,
    isLoading,
    refresh,
    startSession,
    completeSession,
    failSession,
    recordTender,
    voidLastTender,
    processCardPayment,
  };
}

// ── Pre-Auth ─────────────────────────────────────────────────────

interface PreauthItem {
  id: string;
  tabId: string;
  status: string;
  authAmountCents: number;
  capturedAmountCents?: number;
  tipAmountCents?: number;
  finalAmountCents?: number;
  cardLast4: string;
  cardBrand: string | null;
  authorizedAt: string;
  expiresAt: string | null;
}

interface UsePreAuthOptions {
  tabId?: string;
  locationId?: string;
}

export function usePreAuth({ tabId, locationId }: UsePreAuthOptions) {
  const [preauths, setPreauths] = useState<PreauthItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isActing, setIsActing] = useState(false);

  const refresh = useCallback(async () => {
    if (!tabId && !locationId) return;
    setIsLoading(true);
    try {
      const url = tabId
        ? `/api/v1/fnb/preauth/${tabId}`
        : `/api/v1/fnb/preauth?locationId=${locationId}`;
      const res = await apiFetch<{ data: PreauthItem[] }>(url);
      setPreauths(res.data);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [tabId, locationId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createPreauth = useCallback(
    async (input: Record<string, unknown>) => {
      setIsActing(true);
      try {
        const res = await apiFetch<{ data: PreauthItem }>('/api/v1/fnb/preauth', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        await refresh();
        return res.data;
      } finally {
        setIsActing(false);
      }
    },
    [refresh],
  );

  const capturePreauth = useCallback(
    async (preauthId: string, input: Record<string, unknown>) => {
      setIsActing(true);
      try {
        const res = await apiFetch<{ data: PreauthItem }>(
          `/api/v1/fnb/preauth/${preauthId}/capture`,
          { method: 'POST', body: JSON.stringify(input) },
        );
        await refresh();
        return res.data;
      } finally {
        setIsActing(false);
      }
    },
    [refresh],
  );

  const voidPreauth = useCallback(
    async (preauthId: string, input: Record<string, unknown>) => {
      setIsActing(true);
      try {
        const res = await apiFetch<{ data: PreauthItem }>(
          `/api/v1/fnb/preauth/${preauthId}/void`,
          { method: 'POST', body: JSON.stringify(input) },
        );
        await refresh();
        return res.data;
      } finally {
        setIsActing(false);
      }
    },
    [refresh],
  );

  return {
    preauths,
    isLoading,
    isActing,
    refresh,
    createPreauth,
    capturePreauth,
    voidPreauth,
  };
}

// ── Tips ─────────────────────────────────────────────────────────

export function useTipActions() {
  const [isActing, setIsActing] = useState(false);

  const adjustTip = useCallback(async (input: Record<string, unknown>) => {
    setIsActing(true);
    try {
      const res = await apiFetch<{ data: unknown }>('/api/v1/fnb/tips/adjust', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return res.data;
    } finally {
      setIsActing(false);
    }
  }, []);

  const finalizeTips = useCallback(async (input: Record<string, unknown>) => {
    setIsActing(true);
    try {
      const res = await apiFetch<{ data: unknown }>('/api/v1/fnb/tips/finalize', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return res.data;
    } finally {
      setIsActing(false);
    }
  }, []);

  const declareCashTips = useCallback(async (input: Record<string, unknown>) => {
    setIsActing(true);
    try {
      const res = await apiFetch<{ data: unknown }>('/api/v1/fnb/tips/declare', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return res.data;
    } finally {
      setIsActing(false);
    }
  }, []);

  const recordTipOut = useCallback(async (input: Record<string, unknown>) => {
    setIsActing(true);
    try {
      const res = await apiFetch<{ data: unknown }>('/api/v1/fnb/tips/tip-out', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return res.data;
    } finally {
      setIsActing(false);
    }
  }, []);

  return { adjustTip, finalizeTips, declareCashTips, recordTipOut, isActing };
}

// ── Tip Pools ────────────────────────────────────────────────────

interface TipPool {
  id: string;
  name: string;
  poolType: string;
  poolScope: string;
  distributionMethod: string;
  isActive: boolean;
  participantCount?: number;
}

interface UseTipPoolsOptions {
  locationId: string;
}

export function useTipPools({ locationId }: UseTipPoolsOptions) {
  const [pools, setPools] = useState<TipPool[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!locationId) return;
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: TipPool[] }>(
        `/api/v1/fnb/tips/pools?locationId=${locationId}`,
      );
      setPools(res.data);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { pools, isLoading, refresh };
}
