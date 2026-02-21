'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────

export interface FeedbackPayload {
  thumbsUp?: boolean;
  rating?: number;        // 1–5 star rating
  tags?: string[];
  text?: string;
}

// ── Hook ───────────────────────────────────────────────────────────

export function useSubmitFeedback() {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (evalTurnId: string, payload: FeedbackPayload): Promise<void> => {
    setIsPending(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/semantic/eval/turns/${evalTurnId}/feedback`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to submit feedback';
      setError(msg);
      throw err;
    } finally {
      setIsPending(false);
    }
  }, []);

  return { submit, isPending, error };
}
