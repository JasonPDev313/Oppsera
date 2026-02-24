'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { NavItemPreference } from '@oppsera/shared';

const CACHE_KEY = 'oppsera_nav_prefs';

interface NavPreferencesResponse {
  data: { itemOrder: NavItemPreference[] };
}

/**
 * Hook for reading and writing tenant navigation preferences.
 * Uses sessionStorage as a write-through cache for instant sidebar renders.
 */
export function useNavPreferences() {
  const [itemOrder, setItemOrder] = useState<NavItemPreference[] | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPrefs = useCallback(async () => {
    try {
      const res = await apiFetch<NavPreferencesResponse>('/api/v1/settings/navigation');
      const order = res.data.itemOrder;
      setItemOrder(order);
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(order));
      setError(null);
    } catch (e) {
      // Keep cached data if API fails
      if (!itemOrder) {
        setError(e instanceof Error ? e.message : 'Failed to load navigation preferences');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrefs();
  }, [fetchPrefs]);

  const save = useCallback(async (newOrder: NavItemPreference[]) => {
    setIsSaving(true);
    setError(null);
    try {
      await apiFetch<NavPreferencesResponse>('/api/v1/settings/navigation', {
        method: 'PATCH',
        body: JSON.stringify({ itemOrder: newOrder }),
      });
      setItemOrder(newOrder);
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(newOrder));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
      throw e;
    } finally {
      setIsSaving(false);
    }
  }, []);

  const reset = useCallback(async () => {
    await save([]);
  }, [save]);

  return { itemOrder, isLoading, isSaving, error, save, reset, refetch: fetchPrefs };
}
