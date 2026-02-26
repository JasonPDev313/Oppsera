'use client';

import { useState, useEffect, useCallback } from 'react';
import { portalFetch } from '@/lib/api-client';

// ── Types ────────────────────────────────────────────────────────

export interface PortalPaymentMethod {
  id: string;
  paymentType: 'card' | 'bank_account';
  last4: string | null;
  brand: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  nickname: string | null;
  isDefault: boolean;
  createdAt: string;
  bankRoutingLast4: string | null;
  bankAccountType: 'checking' | 'savings' | null;
  bankName: string | null;
  verificationStatus: string | null;
}

export interface OneTimePaymentResult {
  id: string;
  status: string;
  amountCents: number;
  cardLast4: string | null;
  cardBrand: string | null;
  userMessage: string | null;
  suggestedAction: string | null;
  providerRef: string | null;
}

// ── Query hook ───────────────────────────────────────────────────

export function usePortalPaymentMethods() {
  const [data, setData] = useState<PortalPaymentMethod[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await portalFetch<{ data: PortalPaymentMethod[] }>('/api/v1/payment-methods');
      setData(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load payment methods');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, isLoading, error, refresh };
}

// ── Mutation hooks ───────────────────────────────────────────────

export function useAddCard() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addCard = useCallback(async (input: {
    clientRequestId: string;
    token: string;
    expiry?: string;
    nickname?: string;
    isDefault?: boolean;
  }) => {
    setIsSubmitting(true);
    try {
      const res = await portalFetch<{ data: any }>('/api/v1/payment-methods', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return res.data;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return { addCard, isSubmitting };
}

export function useRemovePaymentMethod() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const removePaymentMethod = useCallback(async (paymentMethodId: string) => {
    setIsSubmitting(true);
    try {
      await portalFetch(`/api/v1/payment-methods/${paymentMethodId}`, { method: 'DELETE' });
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return { removePaymentMethod, isSubmitting };
}

export function useSetDefaultPaymentMethod() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setDefault = useCallback(async (paymentMethodId: string) => {
    setIsSubmitting(true);
    try {
      await portalFetch(`/api/v1/payment-methods/${paymentMethodId}`, { method: 'PATCH' });
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return { setDefault, isSubmitting };
}

export function useOneTimePayment() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const makePayment = useCallback(async (input: {
    clientRequestId: string;
    amountCents: number;
    paymentMethodId?: string;
    token?: string;
    expiry?: string;
    paymentMethodType?: 'card' | 'ach';
  }) => {
    setIsSubmitting(true);
    try {
      const res = await portalFetch<{ data: OneTimePaymentResult }>('/api/v1/payments/one-time', {
        method: 'POST',
        body: JSON.stringify(input),
        timeoutMs: 30_000, // payments can take longer
      });
      return res.data;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return { makePayment, isSubmitting };
}
