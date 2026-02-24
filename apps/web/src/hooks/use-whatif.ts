'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────

export interface WhatIfResult {
  sessionId: string;
  message: string;
  narrative: string | null;
  sections: WhatIfSection[];
  data: {
    rows: Record<string, unknown>[];
    rowCount: number;
  } | null;
}

export interface WhatIfSection {
  type: string;
  content: string;
}

interface WhatIfApiResponse {
  data: WhatIfResult;
}

// ── Hook ───────────────────────────────────────────────────────────

export function useWhatIf() {
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const simulate = useCallback(async (scenario: string): Promise<WhatIfResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiFetch<WhatIfApiResponse>('/api/v1/semantic/ask', {
        method: 'POST',
        body: JSON.stringify({
          message: `What if ${scenario}`,
          sessionId: `whatif_${Date.now()}`,
          turnNumber: 1,
        }),
      });

      setResult(res.data);
      return res.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Simulation failed';
      setError(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, simulate, clear, isLoading, error };
}
