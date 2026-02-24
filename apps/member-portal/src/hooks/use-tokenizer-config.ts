'use client';

import { useState, useEffect } from 'react';
import { portalFetch } from '@/lib/api-client';
import type { TokenizerClientConfig } from '@oppsera/shared';

interface UseTokenizerConfigOptions {
  /** Skip fetch entirely (e.g. when dialog is not open). */
  enabled?: boolean;
}

interface UseTokenizerConfigResult {
  config: TokenizerClientConfig | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Fetch the tokenizer configuration for the member's tenant.
 * Uses the member portal's own API route.
 */
export function useTokenizerConfig(options: UseTokenizerConfigOptions = {}): UseTokenizerConfigResult {
  const { enabled = true } = options;

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
        const res = await portalFetch<{ data: TokenizerClientConfig }>(
          '/api/v1/tokenizer-config',
        );
        if (!cancelled) setConfig(res.data);
      } catch {
        if (!cancelled) setError('Card payments are not configured.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [enabled]);

  return { config, isLoading, error };
}
