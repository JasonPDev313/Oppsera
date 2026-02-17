'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/toast';
import { useAuthContext } from '@/components/auth-provider';
import type { Shift, ShiftSummary } from '@/types/pos';

// ── Constants ──────────────────────────────────────────────────────

const SHIFT_KEY_PREFIX = 'pos_shift_';
const SHIFT_EVENTS_KEY_PREFIX = 'pos_shift_events_';

// ── Shift event log (persisted in localStorage for V1) ───────────

interface ShiftEvent {
  type: 'paid_in' | 'paid_out' | 'drawer_open';
  amount: number;
  reason: string;
  timestamp: string;
}

function storageKey(locationId: string, terminalId: string): string {
  return `${SHIFT_KEY_PREFIX}${locationId}_${terminalId}`;
}

function eventsKey(locationId: string, terminalId: string): string {
  return `${SHIFT_EVENTS_KEY_PREFIX}${locationId}_${terminalId}`;
}

function loadShift(locationId: string, terminalId: string): Shift | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(locationId, terminalId));
    if (!raw) return null;
    return JSON.parse(raw) as Shift;
  } catch {
    return null;
  }
}

function saveShift(locationId: string, terminalId: string, shift: Shift | null): void {
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

function loadEvents(locationId: string, terminalId: string): ShiftEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(eventsKey(locationId, terminalId));
    if (!raw) return [];
    return JSON.parse(raw) as ShiftEvent[];
  } catch {
    return [];
  }
}

function saveEvents(locationId: string, terminalId: string, events: ShiftEvent[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(eventsKey(locationId, terminalId), JSON.stringify(events));
  } catch {
    // Storage unavailable
  }
}

function clearEvents(locationId: string, terminalId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(eventsKey(locationId, terminalId));
  } catch {
    // Ignore
  }
}

function todayBusinessDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Hook ───────────────────────────────────────────────────────────

export function useShift(locationId: string, terminalId: string) {
  const { user } = useAuthContext();
  const { toast } = useToast();

  const [currentShift, setCurrentShift] = useState<Shift | null>(null);

  // Load shift from localStorage on mount
  useEffect(() => {
    const stored = loadShift(locationId, terminalId);
    if (stored && stored.status === 'open') {
      setCurrentShift(stored);
    } else {
      setCurrentShift(null);
    }
  }, [locationId, terminalId]);

  const isOpen = currentShift !== null && currentShift.status === 'open';

  // ── Open Shift ─────────────────────────────────────────────────

  const openShift = useCallback(
    async (openingBalance: number): Promise<void> => {
      if (currentShift?.status === 'open') {
        toast.error('A shift is already open on this terminal');
        return;
      }

      const shift: Shift = {
        id: crypto.randomUUID(),
        terminalId,
        employeeId: user?.id ?? '',
        locationId,
        businessDate: todayBusinessDate(),
        openedAt: new Date().toISOString(),
        closedAt: null,
        openingBalance,
        status: 'open',
      };

      saveShift(locationId, terminalId, shift);
      clearEvents(locationId, terminalId);
      setCurrentShift(shift);
      toast.success('Shift opened');
    },
    [currentShift, locationId, terminalId, user?.id, toast],
  );

  // ── Close Shift ────────────────────────────────────────────────

  const closeShift = useCallback(
    async (closingCount: number): Promise<ShiftSummary> => {
      if (!currentShift || currentShift.status !== 'open') {
        throw new Error('No open shift to close');
      }

      const closedAt = new Date().toISOString();
      const events = loadEvents(locationId, terminalId);

      // Compute paid-in/paid-out totals from events
      let paidInTotal = 0;
      let paidOutTotal = 0;
      for (const evt of events) {
        if (evt.type === 'paid_in') paidInTotal += evt.amount;
        if (evt.type === 'paid_out') paidOutTotal += evt.amount;
      }

      // V1 mock summary — real values would come from order aggregation
      const expectedCash = currentShift.openingBalance + paidInTotal - paidOutTotal;
      const variance = closingCount - expectedCash;

      const summary: ShiftSummary = {
        shiftId: currentShift.id,
        employeeId: currentShift.employeeId,
        businessDate: currentShift.businessDate,
        terminalId: currentShift.terminalId,
        openedAt: currentShift.openedAt,
        closedAt,
        salesCount: 0,
        salesTotal: 0,
        voidCount: 0,
        voidTotal: 0,
        discountTotal: 0,
        taxCollected: 0,
        serviceChargeTotal: 0,
        cashReceived: 0,
        cardReceived: 0,
        changeGiven: 0,
        tipsCollected: 0,
        openingBalance: currentShift.openingBalance,
        closingBalance: closingCount,
        expectedCash,
        actualCash: closingCount,
        variance,
        salesByDepartment: [],
      };

      // Mark shift as closed
      const closedShift: Shift = {
        ...currentShift,
        closedAt,
        status: 'closed',
      };
      saveShift(locationId, terminalId, closedShift);
      clearEvents(locationId, terminalId);
      setCurrentShift(null);

      if (variance === 0) {
        toast.success('Shift closed — cash balanced');
      } else {
        const direction = variance > 0 ? 'over' : 'short';
        const abs = Math.abs(variance);
        toast.info(`Shift closed — cash ${direction} by ${(abs / 100).toFixed(2)}`);
      }

      return summary;
    },
    [currentShift, locationId, terminalId, toast],
  );

  // ── Paid In ────────────────────────────────────────────────────

  const recordPaidIn = useCallback(
    async (amount: number, reason: string): Promise<void> => {
      if (!currentShift || currentShift.status !== 'open') {
        toast.error('No open shift');
        return;
      }

      const events = loadEvents(locationId, terminalId);
      events.push({
        type: 'paid_in',
        amount,
        reason,
        timestamp: new Date().toISOString(),
      });
      saveEvents(locationId, terminalId, events);
      toast.success(`Paid in: ${(amount / 100).toFixed(2)}`);
    },
    [currentShift, locationId, terminalId, toast],
  );

  // ── Paid Out ───────────────────────────────────────────────────

  const recordPaidOut = useCallback(
    async (amount: number, reason: string): Promise<void> => {
      if (!currentShift || currentShift.status !== 'open') {
        toast.error('No open shift');
        return;
      }

      const events = loadEvents(locationId, terminalId);
      events.push({
        type: 'paid_out',
        amount,
        reason,
        timestamp: new Date().toISOString(),
      });
      saveEvents(locationId, terminalId, events);
      toast.success(`Paid out: ${(amount / 100).toFixed(2)}`);
    },
    [currentShift, locationId, terminalId, toast],
  );

  // ── Open Drawer ────────────────────────────────────────────────

  const openDrawer = useCallback(async (): Promise<void> => {
    // V1: No-op — just log as audit event
    if (!currentShift || currentShift.status !== 'open') {
      toast.error('No open shift');
      return;
    }

    const events = loadEvents(locationId, terminalId);
    events.push({
      type: 'drawer_open',
      amount: 0,
      reason: 'Manual drawer open',
      timestamp: new Date().toISOString(),
    });
    saveEvents(locationId, terminalId, events);
    toast.info('Cash drawer opened');
  }, [currentShift, locationId, terminalId, toast]);

  return {
    currentShift,
    isOpen,
    openShift,
    closeShift,
    recordPaidIn,
    recordPaidOut,
    openDrawer,
  };
}
