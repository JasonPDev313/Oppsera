'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

interface VerifyPinResult {
  verified: boolean;
  userId?: string;
  userName?: string;
}

interface ManagerOverrideState {
  /** Whether the PIN modal should be shown */
  showPinModal: boolean;
  /** Error message from last failed attempt */
  pinError: string | null;
  /** The action label being overridden (for display) */
  pendingAction: string | null;
}

interface UseManagerOverrideReturn extends ManagerOverrideState {
  /**
   * Request a manager override. Opens the PIN modal.
   * Returns a promise that resolves true when verified, false when cancelled.
   */
  requestOverride: (action: string, requiredPermission?: string) => Promise<{ verified: boolean; userName?: string }>;
  /** Close the PIN modal */
  closePinModal: () => void;
  /** Verify the PIN against the backend */
  verifyPin: (pin: string) => Promise<boolean>;
}

export function useManagerOverride(): UseManagerOverrideReturn {
  const [state, setState] = useState<ManagerOverrideState>({
    showPinModal: false,
    pinError: null,
    pendingAction: null,
  });

  // Store resolve/reject for the promise-based API
  const resolverRef = { current: null as ((result: { verified: boolean; userName?: string }) => void) | null };
  const permRef = { current: undefined as string | undefined };

  const requestOverride = useCallback((action: string, requiredPermission?: string) => {
    return new Promise<{ verified: boolean; userName?: string }>((resolve) => {
      resolverRef.current = resolve;
      permRef.current = requiredPermission;
      setState({ showPinModal: true, pinError: null, pendingAction: action });
    });
  }, []);

  const closePinModal = useCallback(() => {
    setState({ showPinModal: false, pinError: null, pendingAction: null });
    if (resolverRef.current) {
      resolverRef.current({ verified: false });
      resolverRef.current = null;
    }
  }, []);

  const verifyPin = useCallback(async (pin: string): Promise<boolean> => {
    try {
      const result = await apiFetch<VerifyPinResult>('/api/v1/auth/verify-pin', {
        method: 'POST',
        body: JSON.stringify({ pin, requiredPermission: permRef.current }),
      });

      if (result.verified) {
        setState({ showPinModal: false, pinError: null, pendingAction: null });
        if (resolverRef.current) {
          resolverRef.current({ verified: true, userName: result.userName });
          resolverRef.current = null;
        }
        return true;
      }

      setState((prev) => ({ ...prev, pinError: 'Invalid PIN or insufficient permissions' }));
      return false;
    } catch {
      setState((prev) => ({ ...prev, pinError: 'Verification failed. Please try again.' }));
      return false;
    }
  }, []);

  return {
    ...state,
    requestOverride,
    closePinModal,
    verifyPin,
  };
}
