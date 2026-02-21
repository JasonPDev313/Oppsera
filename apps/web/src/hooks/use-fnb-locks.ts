'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';

interface LockInfo {
  lockId: string;
  entityType: string;
  entityId: string;
  lockedBy: string;
  terminalId: string | null;
  expiresAt: string;
}

interface UseSoftLockOptions {
  entityType: string;
  entityId: string | null;
  /** Automatically acquire lock on mount */
  autoAcquire?: boolean;
  /** TTL in seconds (default 30) */
  ttlSeconds?: number;
  /** Renew interval in ms (default 10000 = 10s, well within 30s TTL) */
  renewIntervalMs?: number;
}

interface UseSoftLockReturn {
  /** Current lock held by this user */
  myLock: LockInfo | null;
  /** Lock held by another user (if we failed to acquire) */
  otherLock: LockInfo | null;
  /** Whether this entity is locked by someone else */
  isLockedByOther: boolean;
  /** Acquire the lock */
  acquire: () => Promise<boolean>;
  /** Release the lock */
  release: () => Promise<void>;
  /** Force release (manager) */
  forceRelease: () => Promise<void>;
}

export function useSoftLock({
  entityType,
  entityId,
  autoAcquire = false,
  ttlSeconds = 30,
  renewIntervalMs = 10000,
}: UseSoftLockOptions): UseSoftLockReturn {
  const [myLock, setMyLock] = useState<LockInfo | null>(null);
  const [otherLock, setOtherLock] = useState<LockInfo | null>(null);
  const renewTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopRenewing = useCallback(() => {
    if (renewTimerRef.current) {
      clearInterval(renewTimerRef.current);
      renewTimerRef.current = null;
    }
  }, []);

  const startRenewing = useCallback(
    (lockId: string) => {
      stopRenewing();
      renewTimerRef.current = setInterval(async () => {
        try {
          await apiFetch(`/api/v1/fnb/locks/${lockId}/renew`, {
            method: 'POST',
            body: JSON.stringify({ ttlSeconds }),
          });
        } catch {
          // Lock may have expired or been force-released
          stopRenewing();
          setMyLock(null);
        }
      }, renewIntervalMs);
    },
    [ttlSeconds, renewIntervalMs, stopRenewing],
  );

  const acquire = useCallback(async (): Promise<boolean> => {
    if (!entityId) return false;
    try {
      const res = await apiFetch<{ data: LockInfo }>('/api/v1/fnb/locks', {
        method: 'POST',
        body: JSON.stringify({ entityType, entityId, ttlSeconds }),
      });
      setMyLock(res.data);
      setOtherLock(null);
      startRenewing(res.data.lockId);
      return true;
    } catch (err: unknown) {
      // Check if lock is held by another user (409)
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 409) {
        try {
          const lockRes = await apiFetch<{ data: LockInfo[] }>(
            `/api/v1/fnb/locks?entityType=${entityType}`,
          );
          const existing = lockRes.data.find((l) => l.entityId === entityId);
          if (existing) setOtherLock(existing);
        } catch {
          // ignore
        }
      }
      return false;
    }
  }, [entityType, entityId, ttlSeconds, startRenewing]);

  const release = useCallback(async () => {
    if (!myLock) return;
    stopRenewing();
    try {
      await apiFetch(`/api/v1/fnb/locks/${myLock.lockId}/release`, {
        method: 'POST',
      });
    } catch {
      // ignore — lock may have already expired
    }
    setMyLock(null);
  }, [myLock, stopRenewing]);

  const forceRelease = useCallback(async () => {
    if (!entityId) return;
    try {
      // Use force-release on any lock — pick the first lock ID matching
      const lockRes = await apiFetch<{ data: LockInfo[] }>(
        `/api/v1/fnb/locks?entityType=${entityType}`,
      );
      const existing = lockRes.data.find((l) => l.entityId === entityId);
      if (existing) {
        await apiFetch(`/api/v1/fnb/locks/${existing.lockId}/force-release`, {
          method: 'POST',
          body: JSON.stringify({ entityType, entityId }),
        });
      }
      setOtherLock(null);
    } catch {
      // ignore
    }
  }, [entityType, entityId]);

  // Auto-acquire on mount
  useEffect(() => {
    if (autoAcquire && entityId) {
      acquire();
    }
    return () => {
      stopRenewing();
    };
  }, [entityId, autoAcquire]); // eslint-disable-line

  // Release on unmount
  useEffect(() => {
    return () => {
      if (myLock) {
        // Fire-and-forget release on unmount
        apiFetch(`/api/v1/fnb/locks/${myLock.lockId}/release`, { method: 'POST' }).catch(() => {});
      }
    };
  }, [myLock?.lockId]); // eslint-disable-line

  return {
    myLock,
    otherLock,
    isLockedByOther: !!otherLock,
    acquire,
    release,
    forceRelease,
  };
}
