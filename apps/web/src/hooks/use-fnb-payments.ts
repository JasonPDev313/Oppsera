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
  splitDetails: Record<string, unknown> | null;
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

  // ── Mutations: return server response directly (no redundant session list refetch) ──

  const startSession = useCallback(
    async (input: Record<string, unknown>) => {
      const res = await apiFetch<{ data: PaymentSession }>('/api/v1/fnb/payments/sessions', {
        method: 'POST',
        body: JSON.stringify(input),
        headers: locHeaders,
      });
      // Optimistic: prepend new session to local state
      if (res.data) setSessions((prev) => [res.data, ...prev]);
      return res.data;
    },
    [locHeaders],
  );

  const completeSession = useCallback(
    async (sessionId: string, input: Record<string, unknown>) => {
      const res = await apiFetch<{ data: PaymentSession }>(
        `/api/v1/fnb/payments/sessions/${sessionId}/complete`,
        { method: 'POST', body: JSON.stringify(input), headers: locHeaders },
      );
      // Optimistic: update the completed session in local state
      if (res.data) {
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? res.data : s)),
        );
      }
      return res.data;
    },
    [locHeaders],
  );

  const failSession = useCallback(
    async (sessionId: string, input: Record<string, unknown>) => {
      const res = await apiFetch<{ data: PaymentSession }>(
        `/api/v1/fnb/payments/sessions/${sessionId}/fail`,
        { method: 'POST', body: JSON.stringify(input), headers: locHeaders },
      );
      if (res.data) {
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? res.data : s)),
        );
      }
      return res.data;
    },
    [locHeaders],
  );

  const recordTender = useCallback(
    async (input: Record<string, unknown>) => {
      const res = await apiFetch<{ data: unknown }>('/api/v1/fnb/payments/tender', {
        method: 'POST',
        body: JSON.stringify(input),
        headers: locHeaders,
      });
      return res.data;
    },
    [locHeaders],
  );

  const voidLastTender = useCallback(
    async (sessionId: string) => {
      const res = await apiFetch<{ data: Record<string, unknown> }>(
        `/api/v1/fnb/payments/sessions/${sessionId}/void-last-tender`,
        { method: 'POST', headers: locHeaders },
      );
      // Optimistic: update local session with cleaned seat state from server
      if (res.data) {
        const d = res.data;
        setSessions((prev) =>
          prev.map((s) => {
            if (s.id !== sessionId) return s;
            const paidSeats = (d.paidSeats as number[]) ?? [];
            return {
              ...s,
              paidAmountCents: (d.paidAmountCents as number) ?? s.paidAmountCents,
              remainingAmountCents: (d.remainingAmountCents as number) ?? s.remainingAmountCents,
              status: (d.sessionStatus as string) ?? s.status,
              splitDetails: s.splitDetails
                ? { ...s.splitDetails, paidSeats }
                : paidSeats.length > 0 ? { paidSeats } : null,
              completedAt: null,
            };
          }),
        );
      }
      return res.data;
    },
    [locHeaders],
  );

  const quickCashPayment = useCallback(
    async (input: {
      tabId: string;
      orderId: string;
      amountCents: number;
      totalAmountCents: number;
      changeCents?: number;
      clientRequestId: string;
    }) => {
      const res = await apiFetch<{ data: Record<string, unknown> }>('/api/v1/fnb/payments/quick-cash', {
        method: 'POST',
        body: JSON.stringify(input),
        headers: locHeaders,
      });
      // Optimistic: mark session completed in local state
      if (res.data) {
        const sessionData: PaymentSession = {
          id: res.data.sessionId as string,
          tabId: input.tabId,
          orderId: input.orderId,
          status: 'completed',
          splitStrategy: null,
          splitDetails: null,
          totalAmountCents: input.totalAmountCents,
          paidAmountCents: input.amountCents,
          remainingAmountCents: 0,
          completedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        };
        setSessions((prev) => [sessionData, ...prev]);
      }
      return res.data;
    },
    [locHeaders],
  );

  const payTabUnified = useCallback(
    async (input: {
      tabId: string;
      orderId: string;
      amountCents: number;
      totalAmountCents: number;
      tenderType: string;
      sessionId?: string;
      tipCents?: number;
      changeCents?: number;
      clientRequestId: string;
      // Card-specific (gateway processes pre-transaction)
      token?: string;
      paymentMethodId?: string;
      customerId?: string;
      // House account metadata
      billingAccountId?: string;
      signatureData?: string;
      // Pay-by-seat tracking
      seatNumbers?: number[];
    }) => {
      const res = await apiFetch<{ data: Record<string, unknown> }>('/api/v1/fnb/payments/pay', {
        method: 'POST',
        body: JSON.stringify(input),
        headers: locHeaders,
      });
      // Optimistic: update local session state based on response
      if (res.data) {
        const resData = res.data;
        const isFullyPaid = resData.isFullyPaid as boolean;
        // Use server-provided cumulative paidSeats (authoritative)
        const serverPaidSeats = resData.paidSeats as number[] | undefined;

        setSessions((prev) => {
          const existingSession = prev.find((s) => s.id === (resData.sessionId as string));
          // Merge: prefer server paidSeats, fall back to merging client-side
          let mergedSplitDetails: Record<string, unknown> | null = existingSession?.splitDetails ?? null;
          if (input.seatNumbers) {
            if (serverPaidSeats) {
              mergedSplitDetails = { ...mergedSplitDetails, paidSeats: serverPaidSeats };
            } else {
              const priorPaid = (existingSession?.splitDetails?.paidSeats as number[]) ?? [];
              mergedSplitDetails = {
                ...mergedSplitDetails,
                paidSeats: [...new Set([...priorPaid, ...input.seatNumbers])],
              };
            }
          }

          const sessionData: PaymentSession = {
            id: resData.sessionId as string,
            tabId: input.tabId,
            orderId: input.orderId,
            status: isFullyPaid ? 'completed' : 'in_progress',
            splitStrategy: input.seatNumbers ? 'by_seat' : (existingSession?.splitStrategy ?? null),
            splitDetails: mergedSplitDetails,
            totalAmountCents: input.totalAmountCents,
            paidAmountCents: resData.paidAmountCents as number,
            remainingAmountCents: resData.remainingAmountCents as number,
            completedAt: isFullyPaid ? new Date().toISOString() : null,
            createdAt: existingSession?.createdAt ?? new Date().toISOString(),
          };

          if (existingSession) return prev.map((s) => (s.id === sessionData.id ? sessionData : s));
          return [sessionData, ...prev];
        });
      }
      return res.data;
    },
    [locHeaders],
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
      return res.data;
    },
    [locHeaders],
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
    quickCashPayment,
    payTabUnified,
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
