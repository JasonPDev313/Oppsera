'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

export interface StoredPaymentMethod {
  id: string;
  customerId: string;
  paymentType: string;
  last4: string | null;
  brand: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  isDefault: boolean;
  nickname: string | null;
  providerProfileId: string | null;
  createdAt: string;
}

export interface AddPaymentMethodInput {
  clientRequestId: string;
  token: string;
  expiry: string;
  nickname?: string;
  isDefault?: boolean;
  name?: string;
  address?: string;
  postal?: string;
}

// ── List hook ────────────────────────────────────────────────────────

export function usePaymentMethods(customerId: string | null) {
  const [data, setData] = useState<StoredPaymentMethod[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!customerId) {
      setData(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: StoredPaymentMethod[] }>(
        `/api/v1/customers/${customerId}/payment-methods`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch payment methods'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

// ── Mutations hook ───────────────────────────────────────────────────

export function usePaymentMethodMutations() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const addMethod = useCallback(async (customerId: string, input: AddPaymentMethodInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: { paymentMethodId: string } }>(
        `/api/v1/customers/${customerId}/payment-methods`,
        { method: 'POST', body: JSON.stringify(input) },
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to add payment method');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setDefault = useCallback(async (customerId: string, methodId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await apiFetch(
        `/api/v1/customers/${customerId}/payment-methods/${methodId}`,
        { method: 'PATCH', body: JSON.stringify({ isDefault: true }) },
      );
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to set default');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const removeMethod = useCallback(async (customerId: string, methodId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await apiFetch(
        `/api/v1/customers/${customerId}/payment-methods/${methodId}`,
        { method: 'DELETE' },
      );
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to remove payment method');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { addMethod, setDefault, removeMethod, isLoading, error };
}
