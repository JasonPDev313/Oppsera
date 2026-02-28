'use client';

import { useState, useCallback, useRef } from 'react';
import { apiFetch, setStepUpToken, hasStepUpToken } from '@/lib/api-client';
import type { StepUpCategory } from '@oppsera/shared';

// ── Module-level token cache (survives unmounts, not page refreshes) ──

interface StepUpTokenEntry {
  token: string;
  expiresAt: number;
}

const _tokenCache = new Map<StepUpCategory, StepUpTokenEntry>();

function getCachedToken(category: StepUpCategory): string | null {
  const entry = _tokenCache.get(category);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt - 10_000) {
    // Expired or within 10s of expiry — discard
    _tokenCache.delete(category);
    return null;
  }
  return entry.token;
}

function cacheToken(category: StepUpCategory, token: string, expiresAt: number): void {
  _tokenCache.set(category, { token, expiresAt });
  // Also set in api-client for automatic header attachment
  setStepUpToken(category, token, expiresAt);
}

// ── Hook ────────────────────────────────────────────────────────

interface StepUpResult {
  success: boolean;
  verifiedBy?: string;
}

interface UseStepUpAuth {
  /** Attempt an API call; if 403 STEP_UP_REQUIRED, open PIN modal, get token, retry. */
  withStepUp: <T>(category: StepUpCategory, fn: () => Promise<T>) => Promise<T>;
  /** Manually request step-up before calling an API. */
  requestStepUp: (category: StepUpCategory) => Promise<StepUpResult>;
  /** Check if a valid cached token exists (for UI hints). */
  hasToken: (category: StepUpCategory) => boolean;
  /** Whether the PIN modal is currently shown. */
  showPinModal: boolean;
  /** Close the PIN modal. */
  closePinModal: () => void;
  /** Error message to display in PIN modal. */
  pinError: string | null;
  /** The category currently being requested. */
  pendingCategory: StepUpCategory | null;
  /** Verify a PIN (called by the PIN modal's onVerify). */
  verifyPin: (pin: string) => Promise<boolean>;
}

export function useStepUpAuth(): UseStepUpAuth {
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pendingCategory, setPendingCategory] = useState<StepUpCategory | null>(null);

  // Promise resolver for the PIN modal flow
  const resolveRef = useRef<((result: StepUpResult) => void) | null>(null);

  const closePinModal = useCallback(() => {
    setShowPinModal(false);
    setPinError(null);
    setPendingCategory(null);
    // Reject pending promise
    if (resolveRef.current) {
      resolveRef.current({ success: false });
      resolveRef.current = null;
    }
  }, []);

  const verifyPin = useCallback(async (pin: string): Promise<boolean> => {
    if (!pendingCategory) return false;

    try {
      const res = await apiFetch<{
        token: string;
        category: StepUpCategory;
        expiresAt: number;
        verifiedBy: string;
      }>('/api/v1/auth/step-up', {
        method: 'POST',
        body: JSON.stringify({ pin, category: pendingCategory }),
      });

      // Cache the token
      cacheToken(pendingCategory, res.token, res.expiresAt);

      setShowPinModal(false);
      setPinError(null);

      if (resolveRef.current) {
        resolveRef.current({ success: true, verifiedBy: res.verifiedBy });
        resolveRef.current = null;
      }

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid PIN or insufficient permissions.';
      setPinError(message);
      return false;
    }
  }, [pendingCategory]);

  const requestStepUp = useCallback((category: StepUpCategory): Promise<StepUpResult> => {
    // Check cache first
    const cached = getCachedToken(category);
    if (cached) {
      return Promise.resolve({ success: true });
    }

    // Open PIN modal and wait for result
    setPendingCategory(category);
    setPinError(null);
    setShowPinModal(true);

    return new Promise<StepUpResult>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const hasToken = useCallback((category: StepUpCategory): boolean => {
    return getCachedToken(category) !== null || hasStepUpToken(category);
  }, []);

  const withStepUp = useCallback(async <T>(
    category: StepUpCategory,
    fn: () => Promise<T>,
  ): Promise<T> => {
    // If we already have a valid token, try the call directly
    const cached = getCachedToken(category);
    if (cached) {
      try {
        return await fn();
      } catch (err: unknown) {
        // If it's a step-up error, fall through to request new token
        if (!isStepUpRequiredError(err)) throw err;
        _tokenCache.delete(category);
      }
    }

    // Request step-up auth
    const result = await requestStepUp(category);
    if (!result.success) {
      throw new Error('Step-up authentication cancelled');
    }

    // Retry the original call with the new token
    return fn();
  }, [requestStepUp]);

  return {
    withStepUp,
    requestStepUp,
    hasToken,
    showPinModal,
    closePinModal,
    pinError,
    pendingCategory,
    verifyPin,
  };
}

// ── Helpers ──────────────────────────────────────────────────────

function isStepUpRequiredError(err: unknown): boolean {
  if (err instanceof Error) {
    // apiFetch throws with the error message from the API response
    return err.message.includes('STEP_UP_REQUIRED') ||
      err.message.includes('Re-authentication required');
  }
  return false;
}
