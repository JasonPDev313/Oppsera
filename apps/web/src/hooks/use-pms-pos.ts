'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';

// ── Types ────────────────────────────────────────────────────────

export interface PosGuestResult {
  guestId: string;
  firstName: string;
  lastName: string;
  roomNumber: string;
  reservationId: string;
  folioId: string;
  isVip: boolean;
  checkInDate: string;
  checkOutDate: string;
}

export interface PosFolioSummary {
  folioId: string;
  guestId: string;
  guestName: string;
  roomNumber: string;
  reservationId: string;
  balanceCents: number;
  totalCents: number;
  paymentCents: number;
  status: string;
  checkInDate: string;
  checkOutDate: string;
}

// ── Hook ─────────────────────────────────────────────────────────

export function usePmsPOS(locationId?: string) {
  const { toast } = useToast();
  const [isSearching, setIsSearching] = useState(false);
  const [guests, setGuests] = useState<PosGuestResult[]>([]);

  const searchGuests = useCallback(
    async (query: string): Promise<PosGuestResult[]> => {
      if (!query || query.length < 2) {
        setGuests([]);
        return [];
      }
      setIsSearching(true);
      try {
        const params = new URLSearchParams({ q: query });
        if (locationId) params.set('locationId', locationId);
        const res = await apiFetch<{ data: PosGuestResult[] }>(
          `/api/v1/pms/pos/guests?${params}`,
        );
        setGuests(res.data);
        return res.data;
      } catch (err) {
        const e = err instanceof Error ? err : new Error('Guest search failed');
        toast.error(e.message);
        return [];
      } finally {
        setIsSearching(false);
      }
    },
    [locationId, toast],
  );

  const lookupByRoom = useCallback(
    async (roomNumber: string): Promise<PosGuestResult | null> => {
      if (!roomNumber) return null;
      setIsSearching(true);
      try {
        const params = new URLSearchParams({ room: roomNumber });
        if (locationId) params.set('locationId', locationId);
        const res = await apiFetch<{ data: PosGuestResult }>(
          `/api/v1/pms/pos/guests/by-room?${params}`,
        );
        return res.data;
      } catch {
        return null;
      } finally {
        setIsSearching(false);
      }
    },
    [locationId],
  );

  const getFolio = useCallback(
    async (folioId: string): Promise<PosFolioSummary | null> => {
      try {
        const res = await apiFetch<{ data: PosFolioSummary }>(
          `/api/v1/pms/pos/folios/${folioId}`,
        );
        return res.data;
      } catch {
        return null;
      }
    },
    [],
  );

  const getGuestFolio = useCallback(
    async (guestId: string): Promise<PosFolioSummary | null> => {
      try {
        const res = await apiFetch<{ data: PosFolioSummary }>(
          `/api/v1/pms/pos/guests/${guestId}/folio`,
        );
        return res.data;
      } catch {
        return null;
      }
    },
    [],
  );

  return {
    // State
    guests,
    isSearching,
    // Actions
    searchGuests,
    lookupByRoom,
    getFolio,
    getGuestFolio,
  };
}
