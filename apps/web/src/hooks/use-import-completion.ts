'use client';

import { useCallback } from 'react';

const CACHE_STORAGE_KEY = 'oppsera_onboarding_cache';

/**
 * Minimal bridge that invalidates the onboarding sessionStorage cache
 * when a data import completes successfully. The next time the onboarding
 * page loads, `useOnboardingStatus` will re-fetch fresh data from APIs
 * and detect the newly imported records.
 */
export function useImportCompletion() {
  const notifyImportComplete = useCallback(() => {
    try {
      sessionStorage.removeItem(CACHE_STORAGE_KEY);
    } catch {
      /* ignore — SSR or storage quota */
    }
  }, []);

  return { notifyImportComplete };
}
