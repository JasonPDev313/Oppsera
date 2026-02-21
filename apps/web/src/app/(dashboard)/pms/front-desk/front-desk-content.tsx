'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  DoorOpen,
  LogIn,
  LogOut,
  Loader2,
  RefreshCw,
  User,
  BedDouble,
  CalendarDays,
} from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { apiFetch, ApiError } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

// ── Types ────────────────────────────────────────────────────────

interface PrimaryGuestJson {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
}

interface Reservation {
  id: string;
  propertyId: string;
  guestId: string | null;
  primaryGuestJson: PrimaryGuestJson | null;
  roomId: string | null;
  roomTypeId: string;
  ratePlanId: string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children: number;
  nights: number;
  nightlyRateCents: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  status: string;
  sourceType: string;
  version: number;
  createdAt: string;
  roomNumber: string | null;
  roomTypeName: string | null;
}

interface Property {
  id: string;
  name: string;
}

// ── Helpers ──────────────────────────────────────────────────────

function guestName(r: Reservation): string {
  if (r.primaryGuestJson) {
    return `${r.primaryGuestJson.firstName} ${r.primaryGuestJson.lastName}`;
  }
  return 'Unknown Guest';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// ── Component ────────────────────────────────────────────────────

export default function FrontDeskContent() {
  useAuthContext();

  // Property selection
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState('');

  // Data
  const [arrivals, setArrivals] = useState<Reservation[]>([]);
  const [inHouse, setInHouse] = useState<Reservation[]>([]);
  const [isLoadingArrivals, setIsLoadingArrivals] = useState(false);
  const [isLoadingInHouse, setIsLoadingInHouse] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Action state
  const [actionId, setActionId] = useState<string | null>(null);

  // Load properties
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ data: Property[] }>('/api/v1/pms/properties')
      .then((res) => {
        if (cancelled) return;
        setProperties(res.data);
        if (res.data.length > 0 && !propertyId) {
          setPropertyId(res.data[0]!.id);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load properties');
      });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line

  const fetchArrivals = useCallback(async () => {
    if (!propertyId) return;
    setIsLoadingArrivals(true);
    try {
      const qs = buildQueryString({ propertyId, status: 'CONFIRMED' });
      const res = await apiFetch<{ data: Reservation[] }>(`/api/v1/pms/reservations${qs}`);
      setArrivals(res.data);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError('Failed to load arrivals');
    } finally {
      setIsLoadingArrivals(false);
    }
  }, [propertyId]);

  const fetchInHouse = useCallback(async () => {
    if (!propertyId) return;
    setIsLoadingInHouse(true);
    try {
      const qs = buildQueryString({ propertyId, status: 'CHECKED_IN' });
      const res = await apiFetch<{ data: Reservation[] }>(`/api/v1/pms/reservations${qs}`);
      setInHouse(res.data);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError('Failed to load in-house guests');
    } finally {
      setIsLoadingInHouse(false);
    }
  }, [propertyId]);

  useEffect(() => {
    fetchArrivals();
    fetchInHouse();
  }, [fetchArrivals, fetchInHouse]);

  const refreshAll = useCallback(() => {
    setError(null);
    fetchArrivals();
    fetchInHouse();
  }, [fetchArrivals, fetchInHouse]);

  const handleCheckIn = useCallback(async (reservation: Reservation) => {
    if (!reservation.roomId) {
      setError('No room assigned. Assign a room before checking in.');
      return;
    }
    setActionId(reservation.id);
    setError(null);
    try {
      await apiFetch(`/api/v1/pms/reservations/${reservation.id}/check-in`, {
        method: 'POST',
        body: JSON.stringify({
          roomId: reservation.roomId,
          version: reservation.version,
        }),
      });
      // Refresh both lists
      await Promise.all([fetchArrivals(), fetchInHouse()]);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Check-in failed';
      setError(message);
    } finally {
      setActionId(null);
    }
  }, [fetchArrivals, fetchInHouse]);

  const handleCheckOut = useCallback(async (reservation: Reservation) => {
    setActionId(reservation.id);
    setError(null);
    try {
      await apiFetch(`/api/v1/pms/reservations/${reservation.id}/check-out`, {
        method: 'POST',
        body: JSON.stringify({
          version: reservation.version,
        }),
      });
      // Refresh both lists
      await Promise.all([fetchArrivals(), fetchInHouse()]);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Check-out failed';
      setError(message);
    } finally {
      setActionId(null);
    }
  }, [fetchArrivals, fetchInHouse]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <DoorOpen className="h-5 w-5 text-gray-500" />
          <h1 className="text-xl font-semibold text-gray-900">Front Desk</h1>
        </div>
        <div className="flex items-center gap-2">
          {properties.length > 1 && (
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="rounded-lg border border-gray-200 bg-surface px-3 py-1.5 text-sm text-gray-900"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={refreshAll}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200/50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Two-panel layout */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Arrivals panel */}
        <div className="rounded-lg border border-gray-200 bg-surface">
          <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
            <LogIn className="h-4 w-4 text-indigo-500" />
            <h2 className="text-sm font-semibold text-gray-900">Arrivals</h2>
            <span className="ml-auto rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
              {arrivals.length}
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {isLoadingArrivals ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : arrivals.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">
                No arrivals today.
              </div>
            ) : (
              arrivals.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {guestName(r)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <BedDouble className="h-3 w-3" />
                        {r.roomNumber ?? 'Unassigned'} {r.roomTypeName ? `(${r.roomTypeName})` : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {formatDate(r.checkInDate)} - {formatDate(r.checkOutDate)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCheckIn(r)}
                    disabled={actionId === r.id}
                    className="shrink-0 flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {actionId === r.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LogIn className="h-3.5 w-3.5" />
                    )}
                    Check In
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* In-House panel */}
        <div className="rounded-lg border border-gray-200 bg-surface">
          <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
            <LogOut className="h-4 w-4 text-blue-500" />
            <h2 className="text-sm font-semibold text-gray-900">In-House</h2>
            <span className="ml-auto rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
              {inHouse.length}
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {isLoadingInHouse ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : inHouse.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">
                No guests currently in-house.
              </div>
            ) : (
              inHouse.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {guestName(r)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <BedDouble className="h-3 w-3" />
                        {r.roomNumber ?? '-'} {r.roomTypeName ? `(${r.roomTypeName})` : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {formatDate(r.checkInDate)} - {formatDate(r.checkOutDate)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCheckOut(r)}
                    disabled={actionId === r.id}
                    className="shrink-0 flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {actionId === r.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LogOut className="h-3.5 w-3.5" />
                    )}
                    Check Out
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
