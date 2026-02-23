'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

interface GuestPayTipSettings {
  isActive: boolean;
  tipType: string;
  tipPresets: number[];
  allowCustomTip: boolean;
  allowNoTip: boolean;
  defaultTipIndex: number | null;
  tipCalculationBase: string;
  roundingMode: string;
  maxTipPercent: number;
  maxTipAmountCents: number;
  sessionExpiryMinutes: number;
}

export function useGuestPaySettings(locationId: string | null) {
  const [settings, setSettings] = useState<GuestPayTipSettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    if (!locationId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: GuestPayTipSettings }>('/api/v1/fnb/guest-pay/tip-settings');
      setSettings(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const update = useCallback(async (updates: Partial<GuestPayTipSettings>) => {
    if (!locationId) return;
    setError(null);
    try {
      const res = await apiFetch<{ data: GuestPayTipSettings }>('/api/v1/fnb/guest-pay/tip-settings', {
        method: 'PATCH',
        body: JSON.stringify({ locationId, ...updates }),
      });
      setSettings(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
      throw err;
    }
  }, [locationId]);

  return { settings, isLoading, error, update, refresh: fetchSettings };
}
