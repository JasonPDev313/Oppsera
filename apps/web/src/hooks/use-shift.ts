'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/components/ui/toast';
import { useAuthContext } from '@/components/auth-provider';
import { apiFetch } from '@/lib/api-client';
import type { Shift, ShiftSummary, DrawerEventType } from '@/types/pos';

// ── Constants ──────────────────────────────────────────────────────

const SHIFT_KEY_PREFIX = 'pos_shift_';

// ── localStorage helpers (offline fallback) ─────────────────────

function storageKey(locationId: string, terminalId: string): string {
  return `${SHIFT_KEY_PREFIX}${locationId}_${terminalId}`;
}

function loadShiftFromStorage(locationId: string, terminalId: string): Shift | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(locationId, terminalId));
    if (!raw) return null;
    return JSON.parse(raw) as Shift;
  } catch {
    return null;
  }
}

function saveShiftToStorage(locationId: string, terminalId: string, shift: Shift | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (shift) {
      localStorage.setItem(storageKey(locationId, terminalId), JSON.stringify(shift));
    } else {
      localStorage.removeItem(storageKey(locationId, terminalId));
    }
  } catch {
    // Storage unavailable
  }
}

// ── Server API helpers ──────────────────────────────────────────

interface ServerDrawerSession {
  id: string;
  tenantId: string;
  locationId: string;
  terminalId: string;
  profitCenterId: string | null;
  employeeId: string;
  businessDate: string;
  status: 'open' | 'closed';
  openingBalanceCents: number;
  changeFundCents: number;
  closingCountCents: number | null;
  expectedCashCents: number | null;
  varianceCents: number | null;
  openedAt: string;
  closedAt: string | null;
  closedBy: string | null;
  notes: string | null;
}

function serverToShift(s: ServerDrawerSession): Shift {
  return {
    id: s.id,
    tenantId: s.tenantId,
    terminalId: s.terminalId,
    employeeId: s.employeeId,
    locationId: s.locationId,
    profitCenterId: s.profitCenterId,
    businessDate: s.businessDate,
    openedAt: s.openedAt,
    closedAt: s.closedAt,
    closedBy: s.closedBy,
    openingBalance: s.openingBalanceCents,
    changeFundCents: s.changeFundCents,
    closingCount: s.closingCountCents,
    expectedCash: s.expectedCashCents,
    variance: s.varianceCents,
    notes: s.notes,
    status: s.status,
  };
}

// ── Hook ───────────────────────────────────────────────────────────

export function useShift(locationId: string, terminalId: string) {
  const { user } = useAuthContext();
  const { toast } = useToast();

  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  // Load shift: try server first, fall back to localStorage
  useEffect(() => {
    mountedRef.current = true;
    if (!terminalId) {
      setCurrentShift(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchActive() {
      try {
        const resp = await apiFetch<{ data: ServerDrawerSession | null }>(
          `/api/v1/drawer-sessions?terminalId=${encodeURIComponent(terminalId)}&active=true`,
        );
        if (cancelled) return;

        if (resp.data) {
          const shift = serverToShift(resp.data);
          setCurrentShift(shift);
          saveShiftToStorage(locationId, terminalId, shift);
        } else {
          setCurrentShift(null);
          saveShiftToStorage(locationId, terminalId, null);
        }
      } catch {
        // Offline — fall back to localStorage
        if (cancelled) return;
        const stored = loadShiftFromStorage(locationId, terminalId);
        if (stored && stored.status === 'open') {
          setCurrentShift(stored);
        } else {
          setCurrentShift(null);
        }
      } finally {
        if (!cancelled && mountedRef.current) {
          setIsLoading(false);
        }
      }
    }

    fetchActive();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [locationId, terminalId]);

  const isOpen = currentShift !== null && currentShift.status === 'open';

  // ── Open Shift ─────────────────────────────────────────────────

  const openShift = useCallback(
    async (openingBalance: number, changeFundCents?: number): Promise<void> => {
      if (currentShift?.status === 'open') {
        toast.error('A shift is already open on this terminal');
        return;
      }

      try {
        const resp = await apiFetch<{ data: ServerDrawerSession }>('/api/v1/drawer-sessions', {
          method: 'POST',
          body: JSON.stringify({
            terminalId,
            locationId,
            openingBalanceCents: openingBalance,
            changeFundCents: changeFundCents ?? 0,
          }),
        });

        const shift = serverToShift(resp.data);
        saveShiftToStorage(locationId, terminalId, shift);
        setCurrentShift(shift);
        toast.success('Shift opened');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to open shift';
        toast.error(message);
      }
    },
    [currentShift, locationId, terminalId, toast],
  );

  // ── Close Shift ────────────────────────────────────────────────

  const closeShift = useCallback(
    async (closingCount: number, notes?: string): Promise<ShiftSummary | null> => {
      if (!currentShift || currentShift.status !== 'open') {
        toast.error('No open shift to close');
        return null;
      }

      try {
        // Close the session
        const closeResp = await apiFetch<{ data: ServerDrawerSession }>(
          `/api/v1/drawer-sessions/${currentShift.id}/close`,
          {
            method: 'POST',
            body: JSON.stringify({ closingCountCents: closingCount, notes }),
          },
        );

        // Fetch the full summary
        const summaryResp = await apiFetch<{ data: ShiftSummary }>(
          `/api/v1/drawer-sessions/${currentShift.id}`,
        );

        saveShiftToStorage(locationId, terminalId, null);
        setCurrentShift(null);

        const variance = closeResp.data.varianceCents ?? 0;
        if (variance === 0) {
          toast.success('Shift closed — cash balanced');
        } else {
          const direction = variance > 0 ? 'over' : 'short';
          const abs = Math.abs(variance);
          toast.info(`Shift closed — cash ${direction} by $${(abs / 100).toFixed(2)}`);
        }

        return summaryResp.data;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to close shift';
        toast.error(message);
        return null;
      }
    },
    [currentShift, locationId, terminalId, toast],
  );

  // ── Record Drawer Event (paid-in, paid-out, cash-drop, no-sale, drawer-open) ─

  const recordEvent = useCallback(
    async (eventType: DrawerEventType, amountCents: number, reason?: string): Promise<void> => {
      if (!currentShift || currentShift.status !== 'open') {
        toast.error('No open shift');
        return;
      }

      try {
        await apiFetch(`/api/v1/drawer-sessions/${currentShift.id}/events`, {
          method: 'POST',
          body: JSON.stringify({ eventType, amountCents, reason }),
        });

        const labels: Record<DrawerEventType, string> = {
          paid_in: `Paid in: $${(amountCents / 100).toFixed(2)}`,
          paid_out: `Paid out: $${(amountCents / 100).toFixed(2)}`,
          cash_drop: `Cash drop: $${(amountCents / 100).toFixed(2)}`,
          drawer_open: 'Cash drawer opened',
          no_sale: 'No sale recorded',
        };
        toast.success(labels[eventType]);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to record event';
        toast.error(message);
      }
    },
    [currentShift, toast],
  );

  // ── Convenience wrappers (backward compat) ────────────────────

  const recordPaidIn = useCallback(
    async (amount: number, reason: string): Promise<void> => {
      return recordEvent('paid_in', amount, reason);
    },
    [recordEvent],
  );

  const recordPaidOut = useCallback(
    async (amount: number, reason: string): Promise<void> => {
      return recordEvent('paid_out', amount, reason);
    },
    [recordEvent],
  );

  const recordCashDrop = useCallback(
    async (amount: number, notes?: string, bagId?: string, sealNumber?: string): Promise<void> => {
      if (!currentShift || currentShift.status !== 'open') {
        toast.error('No open shift');
        return;
      }

      try {
        await apiFetch(`/api/v1/drawer-sessions/${currentShift.id}/events`, {
          method: 'POST',
          body: JSON.stringify({
            eventType: 'cash_drop',
            amountCents: amount,
            reason: notes,
            bagId,
            sealNumber,
          }),
        });

        toast.success(`Cash drop: $${(amount / 100).toFixed(2)}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to record cash drop';
        toast.error(message);
      }
    },
    [currentShift, toast],
  );

  const verifyCashDrop = useCallback(
    async (eventId: string): Promise<void> => {
      if (!currentShift) {
        toast.error('No active shift');
        return;
      }

      try {
        await apiFetch(
          `/api/v1/drawer-sessions/${currentShift.id}/events/${eventId}/verify`,
          { method: 'POST' },
        );
        toast.success('Cash drop verified');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to verify cash drop';
        toast.error(message);
      }
    },
    [currentShift, toast],
  );

  const openDrawer = useCallback(async (): Promise<void> => {
    return recordEvent('drawer_open', 0, 'Manual drawer open');
  }, [recordEvent]);

  const recordNoSale = useCallback(async (): Promise<void> => {
    return recordEvent('no_sale', 0, 'No sale');
  }, [recordEvent]);

  // ── Get Session Summary ───────────────────────────────────────

  const getSummary = useCallback(async (): Promise<ShiftSummary | null> => {
    if (!currentShift) return null;
    try {
      const resp = await apiFetch<{ data: ShiftSummary }>(
        `/api/v1/drawer-sessions/${currentShift.id}`,
      );
      return resp.data;
    } catch {
      return null;
    }
  }, [currentShift]);

  return {
    currentShift,
    isOpen,
    isLoading,
    openShift,
    closeShift,
    recordPaidIn,
    recordPaidOut,
    recordCashDrop,
    verifyCashDrop,
    openDrawer,
    recordNoSale,
    recordEvent,
    getSummary,
  };
}
