'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

// ── Manager PIN Challenge ─────────────────────────────────────────

interface UsePinChallengeOptions {
  onSuccess: () => void;
  onFail?: () => void;
}

export function usePinChallenge({ onSuccess, onFail }: UsePinChallengeOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(() => {
    setIsOpen(true);
    setAttempts(0);
    setError(null);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setAttempts(0);
    setError(null);
  }, []);

  const verify = useCallback(
    async (pin: string) => {
      // V1: simple PIN validation (would call backend in production)
      // For now, accept any 4-digit PIN as valid for manager
      if (pin.length === 4) {
        setIsOpen(false);
        onSuccess();
        return true;
      }

      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setError(`Invalid PIN (${3 - newAttempts} attempts remaining)`);

      if (newAttempts >= 3) {
        setIsOpen(false);
        onFail?.();
      }
      return false;
    },
    [attempts, onSuccess, onFail],
  );

  return { isOpen, open, close, verify, attempts, error };
}

// ── Section Actions ───────────────────────────────────────────────

export function useSectionActions() {
  const [isActing, setIsActing] = useState(false);

  const cutServer = useCallback(async (assignmentId: string) => {
    setIsActing(true);
    try {
      const res = await apiFetch<{ data: unknown }>('/api/v1/fnb/sections/cut', {
        method: 'POST',
        body: JSON.stringify({ assignmentId }),
      });
      return res.data;
    } finally {
      setIsActing(false);
    }
  }, []);

  const pickupSection = useCallback(async (assignmentId: string, newServerUserId: string) => {
    setIsActing(true);
    try {
      const res = await apiFetch<{ data: unknown }>('/api/v1/fnb/sections/pickup', {
        method: 'POST',
        body: JSON.stringify({ assignmentId, newServerUserId }),
      });
      return res.data;
    } finally {
      setIsActing(false);
    }
  }, []);

  const advanceRotation = useCallback(async (locationId: string, businessDate: string) => {
    setIsActing(true);
    try {
      const res = await apiFetch<{ data: unknown }>('/api/v1/fnb/sections/rotation', {
        method: 'POST',
        body: JSON.stringify({ locationId, businessDate }),
      });
      return res.data;
    } finally {
      setIsActing(false);
    }
  }, []);

  return { cutServer, pickupSection, advanceRotation, isActing };
}
