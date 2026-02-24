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

interface UseFnbGuestPayOptions {
  tabId: string | null;
  pollEnabled?: boolean;
  pollIntervalMs?: number;
  onPaymentConfirmed?: (session: GuestPaySession) => void;
}

export function useFnbGuestPay({
  tabId,
  pollEnabled = true,
  pollIntervalMs = 5000,
  onPaymentConfirmed,
}: UseFnbGuestPayOptions) {
  const [session, setSession] = useState<GuestPaySession | null>(null);
  const [hasActive, setHasActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const prevStatusRef = useRef<string | null>(null);
  const onPaymentConfirmedRef = useRef(onPaymentConfirmed);
  onPaymentConfirmedRef.current = onPaymentConfirmed;

  const fetchActive = useCallback(async () => {
    if (!tabId) {
      setSession(null);
      setHasActive(false);
      return;
    }

    try {
      setIsLoading(true);
      const res = await apiFetch<{ data: { hasActive: boolean; session: GuestPaySession | null } }>(`/api/v1/fnb/guest-pay/sessions/tab/${tabId}/active`);
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
    } catch {
      // Silently fail on poll errors
    } finally {
      setIsLoading(false);
    }
  }, [tabId]);

  // Initial fetch + polling
  useEffect(() => {
    fetchActive();
    if (!pollEnabled || !tabId) return;

    const interval = setInterval(fetchActive, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchActive, pollEnabled, pollIntervalMs, tabId]);

  const invalidate = useCallback(async (sessionId: string, reason?: string) => {
    await apiFetch(`/api/v1/fnb/guest-pay/sessions/${sessionId}/invalidate`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    await fetchActive();
  }, [fetchActive]);

  const copyLink = useCallback((token: string) => {
    const url = `${window.location.origin}/pay/${token}`;
    navigator.clipboard.writeText(url).catch(() => {
      // Fallback: select text
    });
    return url;
  }, []);

  return {
    session,
    hasActive,
    isLoading,
    refresh: fetchActive,
    invalidate,
    copyLink,
  };
}
