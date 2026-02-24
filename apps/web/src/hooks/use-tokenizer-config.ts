'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { TokenizerClientConfig } from '@oppsera/shared';

interface UseTokenizerConfigOptions {
  /** Location ID to resolve location-specific credentials. */
  locationId?: string;
  /** Custom API base URL (for member portal or guest pay). */
  apiUrl?: string;
  /** Skip fetch entirely (e.g. when dialog is not open). */
  enabled?: boolean;
}

interface UseTokenizerConfigResult {
  config: TokenizerClientConfig | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Fetch the tokenizer configuration for the current tenant/location.
 *
 * Deduplicates the config-fetch pattern previously repeated in
 * AddPaymentMethodDialog and guest-pay-content.tsx.
 */
export function useTokenizerConfig(options: UseTokenizerConfigOptions = {}): UseTokenizerConfigResult {
  const { locationId, apiUrl, enabled = true } = options;

  const [config, setConfig] = useState<TokenizerClientConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        const base = apiUrl ?? '/api/v1/payments/tokenizer-config';
        const url = locationId ? `${base}?locationId=${encodeURIComponent(locationId)}` : base;
        const res = await apiFetch<{ data: TokenizerClientConfig }>(url);
        if (!cancelled) setConfig(res.data);
      } catch {
        if (!cancelled) setError('Card payments are not configured for this location.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [locationId, apiUrl, enabled]);

  return { config, isLoading, error };
}
