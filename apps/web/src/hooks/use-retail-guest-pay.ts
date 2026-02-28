'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';

interface GuestPaySession {
  id: string;
  token: string;
  status: string;
  totalCents: number;
  tipCents: number | null;
  expiresAt: string;
  createdAt: string;
}

interface UseRetailGuestPayOptions {
  orderId: string | null;
  pollEnabled?: boolean;
  pollIntervalMs?: number;
  onPaymentConfirmed?: (session: GuestPaySession) => void;
}

export function useRetailGuestPay({
  orderId,
  pollEnabled = true,
  pollIntervalMs = 5000,
  onPaymentConfirmed,
}: UseRetailGuestPayOptions) {
  const [session, setSession] = useState<GuestPaySession | null>(null);
  const [hasActive, setHasActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const prevStatusRef = useRef<string | null>(null);
  const onPaymentConfirmedRef = useRef(onPaymentConfirmed);
  onPaymentConfirmedRef.current = onPaymentConfirmed;

  const abortRef = useRef<AbortController | null>(null);
  const failureCountRef = useRef(0);
  const MAX_CONSECUTIVE_FAILURES = 3;

  const fetchActive = useCallback(async (signal?: AbortSignal) => {
    if (!orderId) {
      setSession(null);
      setHasActive(false);
      return;
    }

    // Stop polling after too many consecutive failures (endpoint likely unavailable)
    if (failureCountRef.current >= MAX_CONSECUTIVE_FAILURES) return;

    try {
      setIsLoading(true);
      const res = await apiFetch<{ data: { hasActive: boolean; session: GuestPaySession | null } }>(
        `/api/v1/orders/${orderId}/guest-pay/active`,
        { signal },
      );
      failureCountRef.current = 0;
      const data = res.data;
      setSession(data.session);
      setHasActive(data.hasActive);

      // Detect payment confirmed transition
      if (
        prevStatusRef.current === 'active' &&
        data.session?.status === 'paid' &&
        onPaymentConfirmedRef.current
      ) {
        onPaymentConfirmedRef.current(data.session);
      }
      prevStatusRef.current = data.session?.status ?? null;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      failureCountRef.current++;
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  // Initial fetch + polling
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    fetchActive(controller.signal);
    if (!pollEnabled || !orderId) return () => controller.abort();

    const interval = setInterval(() => fetchActive(controller.signal), pollIntervalMs);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchActive, pollEnabled, pollIntervalMs, orderId]);

  const createSession = useCallback(async () => {
    if (!orderId) return null;
    const res = await apiFetch<{ data: { sessionId: string; token: string; lookupCode: string | null; expiresAt: string } }>(
      `/api/v1/orders/${orderId}/guest-pay`,
      { method: 'POST', body: JSON.stringify({}) },
    );
    await fetchActive();
    return res.data;
  }, [orderId, fetchActive]);

  const copyLink = useCallback((token: string) => {
    const url = `${window.location.origin}/pay/${token}`;
    navigator.clipboard.writeText(url).catch(() => {});
    return url;
  }, []);

  return {
    session,
    hasActive,
    isLoading,
    refresh: fetchActive,
    createSession,
    copyLink,
  };
}
